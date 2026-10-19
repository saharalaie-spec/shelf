import "server-only";
import { randomUUID } from "node:crypto";
import { AuthError } from "./auth";
import { db } from "./db";
import { SAMPLE_FRIEND_ID } from "./sample";
import { areFriends } from "./social";
import { isKind, type Kind } from "./types";

/**
 * Closing the loop: when you finish something a friend recommended, you can tell them you loved it. They see it the
 * next time they open Trove. One per item, and only to friends (Juno, the sample friend, can't read it).
 */

export type Thanks = {
  id: string;
  from: { id: string; name: string };
  kind: Kind;
  title: string;
  coverUrl: string | null;
  message: string | null;
  at: number;
};

/** Who you'd be telling: the friend who recommended this item, if you can tell them. */
export async function thanksTarget(userId: string, itemId: string) {
  const client = await db();
  const row = (
    await client.execute({
      sql: `SELECT b.id, b.kind, b.title, b.cover_url, b.rec_user_id, u.name FROM books b JOIN users u ON u.id = b.rec_user_id
            WHERE b.id = ? AND b.user_id = ?`,
      args: [itemId, userId],
    })
  ).rows[0];
  if (!row) return null;
  const friendId = String(row.rec_user_id);
  if (friendId === SAMPLE_FRIEND_ID || !(await areFriends(userId, friendId))) return null;
  return { item: row, friend: { id: friendId, name: row.name ? String(row.name) : "your friend" } };
}

export async function sendThanks(userId: string, itemId: string, message?: string | null): Promise<{ to: string }> {
  const target = await thanksTarget(userId, itemId);
  if (!target) throw new AuthError("There’s no friend to tell for this one.", 404);
  const { item, friend } = target;
  const client = await db();
  await client.execute({
    sql: `INSERT INTO thanks (id, from_user, to_user, item_id, kind, title, cover_url, message, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (from_user, item_id) DO NOTHING`,
    args: [
      randomUUID(),
      userId,
      friend.id,
      itemId,
      String(item.kind),
      String(item.title),
      item.cover_url ? String(item.cover_url) : null,
      message?.trim().slice(0, 280) || null,
      Date.now(),
    ],
  });
  return { to: friend.name };
}

/** Notes friends sent you that you haven't put away yet, newest first. */
export async function unseenThanks(userId: string): Promise<Thanks[]> {
  const client = await db();
  const { rows } = await client.execute({
    sql: `SELECT t.*, u.name FROM thanks t JOIN users u ON u.id = t.from_user
          WHERE t.to_user = ? AND t.seen_at IS NULL ORDER BY t.created_at DESC LIMIT 10`,
    args: [userId],
  });
  return rows.map((r) => ({
    id: String(r.id),
    from: { id: String(r.from_user), name: r.name ? String(r.name) : "A friend" },
    kind: isKind(r.kind) ? r.kind : "book",
    title: String(r.title),
    coverUrl: r.cover_url ? String(r.cover_url) : null,
    message: r.message ? String(r.message) : null,
    at: Number(r.created_at),
  }));
}

export async function markThanksSeen(userId: string, ids: string[]) {
  const some = ids.slice(0, 50);
  if (!some.length) return;
  const client = await db();
  await client.execute({
    sql: `UPDATE thanks SET seen_at = ? WHERE to_user = ? AND seen_at IS NULL AND id IN (${some.map(() => "?").join(", ")})`,
    args: [Date.now(), userId, ...some],
  });
}
