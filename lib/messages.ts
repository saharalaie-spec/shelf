import "server-only";
import { randomUUID } from "node:crypto";
import type { Row } from "@libsql/client";
import { track } from "./activity";
import { AuthError } from "./auth";
import { db } from "./db";
import { photoUrl } from "./photos";
import { isSampleId } from "./sample";
import { areFriends } from "./social";
import { isKind, type Kind } from "./types";

/**
 * Messages between two friends, inside Trove: mostly asking about something one of them has ("What did you think of
 * Severance?"), and the answer. Only friends can message each other. Nobody else, Trove included, shows them anywhere.
 */

/** What a message is about, as it was when it was sent. */
export type MessageItem = { kind: Kind; key: string; title: string; author: string | null; coverUrl: string | null };
export type Message = { id: string; mine: boolean; body: string; item: MessageItem | null; at: number };
export type Correspondent = { id: string; name: string | null; handle: string | null; photo: string | null };
export type Conversation = { friend: Correspondent; last: Message; unread: number };

const MAX_BODY = 1000;

const toItem = (r: Row): MessageItem | null =>
  r.item_title && isKind(String(r.item_kind))
    ? {
        kind: String(r.item_kind) as Kind,
        key: String(r.item_key ?? ""),
        title: String(r.item_title),
        author: r.item_author ? String(r.item_author) : null,
        coverUrl: r.item_cover ? String(r.item_cover) : null,
      }
    : null;

const toMessage = (r: Row, me: string): Message => ({
  id: String(r.id),
  mine: String(r.from_user) === me,
  body: String(r.body),
  item: toItem(r),
  at: Number(r.created_at),
});

/** Juno, an imaginary friend, can't write back, so she answers on her own, kindly and briefly. */
const JUNO_REPLY = (item: MessageItem | null) =>
  item
    ? `Oh, ${item.title}! I loved it, and I think you would too.`
    : "Hi! Ask me about anything on my lists.";

export async function sendMessage(fromId: string, toId: string, body: string, item: MessageItem | null = null) {
  const text = body.trim().slice(0, MAX_BODY);
  if (!text) throw new AuthError("Write something first.");
  if (fromId === toId || !(await areFriends(fromId, toId))) throw new AuthError("You can only message your friends.", 403);
  const client = await db();
  const now = Date.now();
  const insert = (from: string, to: string, b: string, at: number, it: MessageItem | null) => ({
    sql: `INSERT INTO messages (id, from_user, to_user, body, item_kind, item_key, item_title, item_author, item_cover, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [randomUUID(), from, to, b, it?.kind ?? null, it?.key ?? null, it?.title.slice(0, 200) ?? null, it?.author?.slice(0, 200) ?? null, it?.coverUrl ?? null, at],
  });
  // Juno answers questions about her things, and the first hello; a "thanks" back gets no canned reply.
  const juno =
    isSampleId(toId) &&
    (item !== null ||
      !(await client.execute({ sql: "SELECT 1 FROM messages WHERE from_user = ? AND to_user = ? LIMIT 1", args: [toId, fromId] })).rows.length);
  await client.batch([insert(fromId, toId, text, now, item), ...(juno ? [insert(toId, fromId, JUNO_REPLY(item), now + 1, null)] : [])], "write");
  await track("message", { userId: fromId, ref: toId });
}

/** Everyone you've written with, latest first, with what's waiting unread. */
export async function listConversations(userId: string): Promise<Conversation[]> {
  const client = await db();
  const { rows } = await client.execute({
    sql: `WITH mine AS (
            SELECT m.*, CASE WHEN m.from_user = ?1 THEN m.to_user ELSE m.from_user END AS other
            FROM messages m WHERE m.from_user = ?1 OR m.to_user = ?1
          ), latest AS (
            SELECT other, MAX(created_at) AS at FROM mine GROUP BY other
          )
          SELECT mine.*, u.name, u.handle, u.photo_at,
            (SELECT COUNT(*) FROM messages x WHERE x.from_user = mine.other AND x.to_user = ?1 AND x.read_at IS NULL) AS unread
          FROM mine JOIN latest ON latest.other = mine.other AND latest.at = mine.created_at
          JOIN users u ON u.id = mine.other
          ORDER BY mine.created_at DESC`,
    args: [userId],
  });
  const seen = new Set<string>();
  return rows.flatMap((r) => {
    const other = String(r.other);
    if (seen.has(other)) return [];
    seen.add(other);
    return [
      {
        friend: { id: other, name: r.name ? String(r.name) : null, handle: r.handle ? String(r.handle) : null, photo: photoUrl(other, r.photo_at) },
        last: toMessage(r, userId),
        unread: Number(r.unread),
      },
    ];
  });
}

/** Messages you haven't read yet, from anyone. */
export async function unreadCount(userId: string) {
  const client = await db();
  const row = (await client.execute({ sql: "SELECT COUNT(*) AS n FROM messages WHERE to_user = ? AND read_at IS NULL", args: [userId] })).rows[0];
  return Number(row?.n ?? 0);
}

/** Everything between you and one friend, oldest first; opening it marks theirs as read. */
export async function readThread(userId: string, friendId: string): Promise<Message[]> {
  const client = await db();
  const { rows } = await client.execute({
    sql: `SELECT * FROM messages WHERE (from_user = ?1 AND to_user = ?2) OR (from_user = ?2 AND to_user = ?1)
          ORDER BY created_at, id LIMIT 500`,
    args: [userId, friendId],
  });
  if (rows.some((r) => String(r.to_user) === userId && r.read_at == null)) {
    await client.execute({
      sql: "UPDATE messages SET read_at = ? WHERE to_user = ? AND from_user = ? AND read_at IS NULL",
      args: [Date.now(), userId, friendId],
    });
  }
  return rows.map((r) => toMessage(r, userId));
}
