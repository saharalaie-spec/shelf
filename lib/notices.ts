import "server-only";
import { randomUUID } from "node:crypto";
import { db } from "./db";
import { photoUrl } from "./photos";
import { SAMPLE_FRIEND_ID } from "./sample";

/**
 * News for you about the people you invited, shown on your home screen until you put it away:
 *
 * - joined_invite: someone opened your invite link, joined Trove, and you're friends now.
 * - added_invite: someone already on Trove used your invite link: you're friends now.
 * - joined_waiting: someone you asked by phone or email joined; your request is waiting for them.
 * - accepted: they said yes to your friend request.
 *
 * One at a time per friend: newer news about them replaces what you haven't seen yet.
 */
export type NoticeKind = "joined_invite" | "added_invite" | "joined_waiting" | "accepted";
export type Notice = {
  id: string;
  kind: NoticeKind;
  friend: { id: string; name: string | null; handle: string | null; photo: string | null };
  at: number;
};

const KINDS = new Set<NoticeKind>(["joined_invite", "added_invite", "joined_waiting", "accepted"]);
const FRESH_MS = 14 * 24 * 60 * 60 * 1000;
const NEW_ACCOUNT_MS = 24 * 60 * 60 * 1000;

async function notify(userId: string, kind: NoticeKind, friendId: string) {
  if (userId === friendId || userId === SAMPLE_FRIEND_ID || friendId === SAMPLE_FRIEND_ID) return;
  const client = await db();
  await client.batch(
    [
      { sql: "DELETE FROM notices WHERE user_id = ? AND friend_id = ? AND seen_at IS NULL", args: [userId, friendId] },
      {
        sql: "INSERT INTO notices (id, user_id, kind, friend_id, created_at) VALUES (?, ?, ?, ?, ?)",
        args: [randomUUID(), userId, kind, friendId, Date.now()],
      },
    ],
    "write",
  );
}

/** Someone used your invite link: they just joined, or were already here. */
export async function noteInviteUsed(inviterId: string, friendId: string) {
  const client = await db();
  const row = (await client.execute({ sql: "SELECT created_at FROM users WHERE id = ?", args: [friendId] })).rows[0];
  const isNew = row && Date.now() - Number(row.created_at) < NEW_ACCOUNT_MS;
  await notify(inviterId, isNew ? "joined_invite" : "added_invite", friendId);
}

/** They said yes to the request you sent them. */
export const noteAccepted = (requesterId: string, friendId: string) => notify(requesterId, "accepted", friendId);

/** A new account: everyone who'd asked them by phone or email hears they're here. */
export async function noteJoined(userId: string) {
  const client = await db();
  const { rows } = await client.execute({
    sql: `SELECT DISTINCT r.from_user FROM friend_requests r JOIN users u ON u.id = ?
          WHERE r.to_identifier IN (u.phone, u.email)`,
    args: [userId],
  });
  for (const r of rows) await notify(String(r.from_user), "joined_waiting", userId);
}

/** What you haven't put away yet, from the last two weeks, newest first. */
export async function unseenNotices(userId: string): Promise<Notice[]> {
  const client = await db();
  const { rows } = await client.execute({
    sql: `SELECT n.id, n.kind, n.friend_id, n.created_at, u.name, u.handle, u.photo_at
          FROM notices n JOIN users u ON u.id = n.friend_id
          WHERE n.user_id = ? AND n.seen_at IS NULL AND n.created_at > ?
          ORDER BY n.created_at DESC LIMIT 10`,
    args: [userId, Date.now() - FRESH_MS],
  });
  return rows.flatMap((r) => {
    const kind = String(r.kind) as NoticeKind;
    if (!KINDS.has(kind)) return [];
    const id = String(r.friend_id);
    return [
      {
        id: String(r.id),
        kind,
        friend: { id, name: r.name ? String(r.name) : null, handle: r.handle ? String(r.handle) : null, photo: photoUrl(id, r.photo_at) },
        at: Number(r.created_at),
      },
    ];
  });
}

export async function markNoticesSeen(userId: string, ids: string[]) {
  const some = ids.slice(0, 50);
  if (!some.length) return;
  const client = await db();
  await client.execute({
    sql: `UPDATE notices SET seen_at = ? WHERE user_id = ? AND seen_at IS NULL AND id IN (${some.map(() => "?").join(", ")})`,
    args: [Date.now(), userId, ...some],
  });
}
