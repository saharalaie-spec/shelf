import "server-only";
import { randomBytes, randomInt, randomUUID } from "node:crypto";
import type { Row } from "@libsql/client";
import { AuthError, type User } from "./auth";
import { db } from "./db";
import { parseIdentifier } from "./identifier";
import { isKind, type Kind } from "./types";

/** Someone else's account, as much of it as other people may see. */
export type Person = { id: string; name: string | null; handle: string | null; isPublic: boolean };

/** Profile URLs use the handle when there is one, otherwise the (unguessable) user id. */
export const profileRef = (p: { id: string; handle: string | null }) => p.handle ?? p.id;

const toPerson = (r: Row): Person => ({
  id: String(r.id),
  name: r.name ? String(r.name) : null,
  handle: r.handle ? String(r.handle) : null,
  isPublic: Boolean(r.is_public),
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function findPerson(ref: string): Promise<Person | null> {
  const client = await db();
  const row = (
    await client.execute({
      sql: `SELECT id, name, handle, is_public FROM users WHERE ${UUID_RE.test(ref) ? "id" : "handle"} = ?`,
      args: [UUID_RE.test(ref) ? ref : ref.toLowerCase()],
    })
  ).rows[0];
  return row ? toPerson(row) : null;
}

// ---------- Who can see what ----------

export type Access = "self" | "friend" | "public" | "none";

export async function areFriends(a: string, b: string) {
  const client = await db();
  const row = (
    await client.execute({ sql: "SELECT 1 FROM friendships WHERE user_id = ? AND friend_id = ?", args: [a, b] })
  ).rows[0];
  return Boolean(row);
}

/** Your own shelf; friends see every section; anyone sees a public profile; nobody else. */
export async function accessTo(viewerId: string | null, owner: Person): Promise<Access> {
  if (viewerId === owner.id) return "self";
  if (viewerId && (await areFriends(viewerId, owner.id))) return "friend";
  return owner.isPublic ? "public" : "none";
}

// ---------- Profile settings ----------

const HANDLE_RE = /^[a-z0-9][a-z0-9_.]{1,18}[a-z0-9]$/;
const RESERVED = new Set(["admin", "api", "f", "friends", "help", "invite", "login", "me", "s", "settings", "shelf", "u", "www"]);

export function checkHandle(raw: string): string {
  const handle = raw.trim().toLowerCase().replace(/^@/, "");
  if (!HANDLE_RE.test(handle)) {
    throw new AuthError("Use 3–20 letters, numbers, dots or underscores, starting and ending with a letter or number.");
  }
  if (RESERVED.has(handle)) throw new AuthError("That link is reserved. Try another.");
  return handle;
}

export async function updateProfile(
  userId: string,
  patch: { name?: string; isPublic?: boolean; handle?: string | null },
) {
  const client = await db();
  const sets: string[] = [];
  const args: (string | number | null)[] = [];
  const saved: { name?: string | null; isPublic?: boolean; handle?: string | null } = {};
  if (patch.name !== undefined) {
    saved.name = patch.name.trim().slice(0, 40) || null;
    sets.push("name = ?");
    args.push(saved.name);
  }
  if (patch.isPublic !== undefined) {
    saved.isPublic = patch.isPublic;
    sets.push("is_public = ?");
    args.push(patch.isPublic ? 1 : 0);
  }
  let handle = patch.handle;
  // Going public without a link name: pick a readable one from your name (sahar, sahar27…).
  if (patch.isPublic && handle === undefined) {
    const me = (await client.execute({ sql: "SELECT name, handle FROM users WHERE id = ?", args: [userId] })).rows[0];
    if (me && !me.handle) handle = (await freeHandle(String(patch.name ?? me.name ?? ""))) ?? undefined;
  }
  if (handle !== undefined) {
    saved.handle = handle ? checkHandle(handle) : null;
    if (saved.handle) {
      const taken = (
        await client.execute({ sql: "SELECT 1 FROM users WHERE handle = ? AND id != ?", args: [saved.handle, userId] })
      ).rows[0];
      if (taken) throw new AuthError("That link is taken. Try another.");
    }
    sets.push("handle = ?");
    args.push(saved.handle);
  }
  if (!sets.length) return saved;
  try {
    await client.execute({ sql: `UPDATE users SET ${sets.join(", ")} WHERE id = ?`, args: [...args, userId] });
  } catch (err) {
    // Someone claimed the same handle a moment ago.
    if (saved.handle && /UNIQUE/i.test(String(err))) throw new AuthError("That link is taken. Try another.");
    throw err;
  }
  return saved;
}

/** A free handle based on a name, or null if the name has nothing usable in it. */
async function freeHandle(name: string): Promise<string | null> {
  const base = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 16);
  if (!base) return null;
  const client = await db();
  const tries = [base, ...Array.from({ length: 4 }, () => `${base}${randomInt(10, 1000)}`)];
  for (const handle of tries) {
    if (!HANDLE_RE.test(handle) || RESERVED.has(handle)) continue;
    const taken = (await client.execute({ sql: "SELECT 1 FROM users WHERE handle = ?", args: [handle] })).rows[0];
    if (!taken) return handle;
  }
  return null;
}

// ---------- Friends ----------

/** A friend, with how much they share in each collection and what they're into right now. */
export type Friend = Person & { counts: Record<Kind, number>; now: { kind: Kind; title: string } | null };

export async function listFriends(userId: string): Promise<Friend[]> {
  const client = await db();
  const { rows } = await client.execute({
    sql: `SELECT u.id, u.name, u.handle, u.is_public,
            (SELECT COUNT(*) FROM books b WHERE b.user_id = u.id AND b.private = 0 AND b.kind = 'book') AS n_book,
            (SELECT COUNT(*) FROM books b WHERE b.user_id = u.id AND b.private = 0 AND b.kind = 'podcast') AS n_podcast,
            (SELECT COUNT(*) FROM books b WHERE b.user_id = u.id AND b.private = 0 AND b.kind = 'screen') AS n_screen,
            (SELECT b.kind || ':' || b.title FROM books b WHERE b.user_id = u.id AND b.private = 0 AND b.status = 'reading'
              ORDER BY b.status_at DESC LIMIT 1) AS now
          FROM friendships f JOIN users u ON u.id = f.friend_id
          WHERE f.user_id = ?
          ORDER BY lower(coalesce(u.name, '')), f.created_at`,
    args: [userId],
  });
  return rows.map((r) => {
    const now = r.now ? String(r.now) : null;
    const split = now ? now.indexOf(":") : -1;
    const kind = now ? now.slice(0, split) : null;
    return {
      ...toPerson(r),
      counts: { book: Number(r.n_book), podcast: Number(r.n_podcast), screen: Number(r.n_screen) },
      now: now && isKind(kind) ? { kind, title: now.slice(split + 1) } : null,
    };
  });
}

/** Makes two people friends (both directions) and clears any requests between them. */
async function befriend(a: string, b: string) {
  if (a === b) throw new AuthError("That’s you.");
  const client = await db();
  const now = Date.now();
  await client.batch(
    [
      { sql: "INSERT INTO friendships (user_id, friend_id, created_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING", args: [a, b, now] },
      { sql: "INSERT INTO friendships (user_id, friend_id, created_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING", args: [b, a, now] },
      {
        sql: `DELETE FROM friend_requests WHERE
                (from_user = ?1 AND to_identifier IN (SELECT phone FROM users WHERE id = ?2 UNION SELECT email FROM users WHERE id = ?2))
             OR (from_user = ?2 AND to_identifier IN (SELECT phone FROM users WHERE id = ?1 UNION SELECT email FROM users WHERE id = ?1))`,
        args: [a, b],
      },
    ],
    "write",
  );
}

export async function unfriend(userId: string, friendId: string) {
  const client = await db();
  await client.execute({
    sql: "DELETE FROM friendships WHERE (user_id = ?1 AND friend_id = ?2) OR (user_id = ?2 AND friend_id = ?1)",
    args: [userId, friendId],
  });
}

const MAX_REQUESTS_PER_DAY = 30;

/**
 * Asks to be friends with whoever owns a phone number or email. The answer never says whether
 * that person is on Shelf (so nobody can probe numbers); a request to someone not here yet waits
 * for them to sign up. If they had already asked you, you become friends straight away.
 */
export async function requestByIdentifier(from: User, input: string, country?: string) {
  const to = parseIdentifier(input, country as Parameters<typeof parseIdentifier>[1]);
  if (!to) throw new AuthError("That doesn’t look like a phone number or email.");
  if (to.value === from.phone || to.value === from.email) throw new AuthError("That’s you.");
  const client = await db();
  const target = (
    await client.execute({ sql: `SELECT id FROM users WHERE ${to.kind === "email" ? "email" : "phone"} = ?`, args: [to.value] })
  ).rows[0];
  return createRequest(from, to.value, to.display, target ? String(target.id) : null);
}

/** Same, from someone's profile page: we know who they are, but the requester never sees their contact. */
export async function requestByUserId(from: User, targetId: string) {
  const client = await db();
  const row = (await client.execute({ sql: "SELECT phone, email, name FROM users WHERE id = ?", args: [targetId] })).rows[0];
  if (!row) throw new AuthError("That person isn’t on Shelf.", 404);
  const identifier = String(row.phone ?? row.email);
  return createRequest(from, identifier, row.name ? String(row.name) : "Shelf reader", targetId);
}

async function createRequest(from: User, identifier: string, display: string, targetId: string | null) {
  const client = await db();
  if (targetId) {
    if (targetId === from.id) throw new AuthError("That’s you.");
    if (await areFriends(from.id, targetId)) return { status: "friends" as const };
    const theyAsked = (
      await client.execute({
        sql: "SELECT 1 FROM friend_requests WHERE from_user = ? AND to_identifier IN (?, ?)",
        args: [targetId, from.phone ?? "", from.email ?? ""],
      })
    ).rows[0];
    if (theyAsked) {
      await befriend(from.id, targetId);
      return { status: "friends" as const };
    }
  }
  const recent = (
    await client.execute({
      sql: "SELECT COUNT(*) AS n FROM friend_requests WHERE from_user = ? AND created_at > ?",
      args: [from.id, Date.now() - 24 * 60 * 60 * 1000],
    })
  ).rows[0];
  if (Number(recent.n) >= MAX_REQUESTS_PER_DAY) throw new AuthError("That’s a lot of requests for one day. Try again tomorrow.", 429);
  await client.execute({
    sql: `INSERT INTO friend_requests (id, from_user, to_identifier, to_display, created_at) VALUES (?, ?, ?, ?, ?)
          ON CONFLICT (from_user, to_identifier) DO NOTHING`,
    args: [randomUUID(), from.id, identifier, display, Date.now()],
  });
  return { status: "sent" as const };
}

export type IncomingRequest = { id: string; from: Person; hint: string; createdAt: number };
export type OutgoingRequest = { id: string; display: string; createdAt: number };

/** "+1 ••• 0132" / "s•••@gmail.com": enough to recognise who's asking, not enough to harvest. */
function mask(phone: string | null, email: string | null) {
  if (phone) return `${phone.slice(0, Math.max(2, phone.length - 10))} ••• ${phone.slice(-4)}`;
  if (email) {
    const [local, domain] = email.split("@");
    return `${local.slice(0, 1)}•••@${domain}`;
  }
  return "";
}

export async function incomingRequests(user: User): Promise<IncomingRequest[]> {
  const ids = [user.phone, user.email].filter((v): v is string => Boolean(v));
  if (!ids.length) return [];
  const client = await db();
  const { rows } = await client.execute({
    sql: `SELECT r.id AS request_id, r.created_at, u.id, u.name, u.handle, u.is_public, u.phone, u.email
          FROM friend_requests r JOIN users u ON u.id = r.from_user
          WHERE r.to_identifier IN (${ids.map(() => "?").join(", ")})
            AND NOT EXISTS (SELECT 1 FROM friendships f WHERE f.user_id = ? AND f.friend_id = u.id)
          ORDER BY r.created_at DESC`,
    args: [...ids, user.id],
  });
  return rows.map((r) => ({
    id: String(r.request_id),
    from: toPerson(r),
    hint: mask(r.phone ? String(r.phone) : null, r.email ? String(r.email) : null),
    createdAt: Number(r.created_at),
  }));
}

export async function outgoingRequests(userId: string): Promise<OutgoingRequest[]> {
  const client = await db();
  const { rows } = await client.execute({
    sql: "SELECT id, to_display, created_at FROM friend_requests WHERE from_user = ? ORDER BY created_at DESC",
    args: [userId],
  });
  return rows.map((r) => ({ id: String(r.id), display: String(r.to_display), createdAt: Number(r.created_at) }));
}

/** Requests waiting between a viewer and someone whose profile they're looking at. */
export async function pendingBetween(viewer: User, otherId: string) {
  const client = await db();
  const ids = [viewer.phone, viewer.email].filter((v): v is string => Boolean(v));
  const [sent, received] = await Promise.all([
    client.execute({
      sql: `SELECT id FROM friend_requests WHERE from_user = ?1
              AND to_identifier IN (SELECT phone FROM users WHERE id = ?2 UNION SELECT email FROM users WHERE id = ?2)`,
      args: [viewer.id, otherId],
    }),
    ids.length
      ? client.execute({
          sql: `SELECT id FROM friend_requests WHERE from_user = ? AND to_identifier IN (${ids.map(() => "?").join(", ")})`,
          args: [otherId, ...ids],
        })
      : Promise.resolve({ rows: [] as Row[] }),
  ]);
  return {
    sentId: sent.rows[0] ? String(sent.rows[0].id) : null,
    receivedId: received.rows[0] ? String(received.rows[0].id) : null,
  };
}

/** Accept or decline a request sent to you, or cancel one you sent. */
export async function respondToRequest(user: User, requestId: string, action: "accept" | "decline" | "cancel") {
  const client = await db();
  const req = (
    await client.execute({ sql: "SELECT from_user, to_identifier FROM friend_requests WHERE id = ?", args: [requestId] })
  ).rows[0];
  if (!req) throw new AuthError("That request is gone.", 404);
  const mine = action === "cancel" ? String(req.from_user) === user.id : [user.phone, user.email].includes(String(req.to_identifier));
  if (!mine) throw new AuthError("That request is gone.", 404);
  if (action === "accept") await befriend(String(req.from_user), user.id);
  else await client.execute({ sql: "DELETE FROM friend_requests WHERE id = ?", args: [requestId] });
}

// ---------- Invite links ----------

/** Each person has one invite link; whoever opens it can become their friend with one tap. */
export async function inviteToken(userId: string): Promise<string> {
  const client = await db();
  await client.execute({
    sql: "UPDATE users SET invite_token = ? WHERE id = ? AND invite_token IS NULL",
    args: [randomBytes(9).toString("base64url"), userId],
  });
  const row = (await client.execute({ sql: "SELECT invite_token FROM users WHERE id = ?", args: [userId] })).rows[0];
  return String(row.invite_token);
}

export async function findInviter(token: string): Promise<Person | null> {
  const client = await db();
  const row = (
    await client.execute({ sql: "SELECT id, name, handle, is_public FROM users WHERE invite_token = ?", args: [token] })
  ).rows[0];
  return row ? toPerson(row) : null;
}

export async function acceptInvite(user: User, token: string): Promise<Person> {
  const inviter = await findInviter(token);
  if (!inviter) throw new AuthError("That invite link doesn’t work anymore.", 404);
  await befriend(inviter.id, user.id);
  return inviter;
}
