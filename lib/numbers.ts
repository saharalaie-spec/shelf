import "server-only";
import { notCounted, timeZone } from "./config";
import { db } from "./db";
import { computeNumbers, type Numbers } from "./metrics";
import { SAMPLE_FRIEND_ID } from "./sample";

const LOOK_BACK_MS = 120 * 24 * 60 * 60 * 1000;

/** Everything the numbers page shows, from the database. */
export async function loadNumbers(now = Date.now()): Promise<Numbers> {
  const client = await db();
  const from = now - LOOK_BACK_MS;
  const [users, activity, itemEvents, thanks, friendships, saved, started] = await Promise.all([
    client.execute("SELECT id, name, phone, email, created_at, invited_by, came_via FROM users"),
    client.execute({ sql: "SELECT user_id, visitor, action, ref, at FROM activity WHERE at >= ?", args: [from] }),
    client.execute({ sql: "SELECT user_id, at FROM item_events WHERE at >= ?", args: [from] }),
    client.execute({ sql: "SELECT from_user, created_at FROM thanks WHERE created_at >= ?", args: [from] }),
    // Juno is there to show how it works: being her friend, or saving her picks, isn't the real thing.
    client.execute({ sql: "SELECT user_id, friend_id FROM friendships WHERE friend_id != ?", args: [SAMPLE_FRIEND_ID] }),
    client.execute({
      sql: "SELECT user_id, added_at FROM books WHERE rec_user_id IS NOT NULL AND rec_user_id != ? AND added_at >= ?",
      args: [SAMPLE_FRIEND_ID, from],
    }),
    client.execute("SELECT applied_at FROM migrations WHERE id = '2026-10-24-metrics'"),
  ]);
  const str = (v: unknown) => (v == null ? null : String(v));
  return computeNumbers({
    users: users.rows.map((r) => ({
      id: String(r.id),
      name: str(r.name),
      createdAt: Number(r.created_at),
      invitedBy: str(r.invited_by),
      cameVia: str(r.came_via),
      counted: r.id !== SAMPLE_FRIEND_ID && !notCounted({ phone: str(r.phone), email: str(r.email) }),
    })),
    activity: activity.rows.map((r) => ({
      userId: str(r.user_id),
      visitor: str(r.visitor),
      action: String(r.action),
      ref: str(r.ref),
      at: Number(r.at),
    })),
    itemEvents: itemEvents.rows.map((r) => ({ userId: String(r.user_id), at: Number(r.at) })),
    thanks: thanks.rows.map((r) => ({ userId: String(r.from_user), at: Number(r.created_at) })),
    friendships: friendships.rows.map((r) => ({ userId: String(r.user_id), friendId: String(r.friend_id) })),
    savedFromFriends: saved.rows.map((r) => ({ userId: String(r.user_id), at: Number(r.added_at) })),
    since: Number(started.rows[0]?.applied_at ?? now),
    now,
    timeZone: timeZone(),
  });
}
