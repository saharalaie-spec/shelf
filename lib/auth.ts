import "server-only";
import { createHash, createHmac, randomBytes, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { trackSignup, trackVisit } from "./activity";
import { db } from "./db";
import { deliverCode } from "./delivery";
import { photoUrl } from "./photos";
import type { Identifier } from "./identifier";

// Named when the app was called Shelf; renaming it would sign everyone out.
export const SESSION_COOKIE = "shelf_session";
const SESSION_DAYS = 400; // the longest browsers allow: sign in once, stay signed in
const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const SEND_WINDOW_MS = 15 * 60 * 1000;
const MAX_SENDS_PER_WINDOW = 5;
const RESEND_COOLDOWN_MS = 20 * 1000;

export type User = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  handle: string | null;
  isPublic: boolean;
  /** Whether what they're into shows on friends' Table. */
  shareActivity: boolean;
  /** Done with (or skipped) getting started. */
  started: boolean;
  /** Their profile photo's URL, if they've added one. */
  photo: string | null;
};

export class AuthError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

let storedSecret: Promise<string> | undefined;

/** AUTH_SECRET if set; otherwise a random secret created on first use and kept in the database. */
function secret(): Promise<string> {
  if (process.env.AUTH_SECRET) return Promise.resolve(process.env.AUTH_SECRET);
  storedSecret ??= (async () => {
    const client = await db();
    // Several server instances may race here; the first insert wins and everyone reads it back.
    await client.execute({
      sql: "INSERT INTO settings (key, value) VALUES ('auth_secret', ?) ON CONFLICT (key) DO NOTHING",
      args: [randomBytes(32).toString("hex")],
    });
    const row = (await client.execute("SELECT value FROM settings WHERE key = 'auth_secret'")).rows[0];
    return String(row.value);
  })().catch((err) => {
    storedSecret = undefined;
    throw err;
  });
  return storedSecret;
}

const hashCode = async (identifier: string, code: string) =>
  createHmac("sha256", await secret()).update(`${identifier}:${code}`).digest("hex");

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export async function startLogin(to: Identifier) {
  const client = await db();
  const now = Date.now();
  const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
  const windowOpen = now - SEND_WINDOW_MS;

  // One statement claims the send, so simultaneous requests can't slip past the limits:
  // a first code inserts the row; a later one only replaces it when the cooldown has passed
  // and this 15-minute window still has sends left.
  const claimed = await client.execute({
    sql: `INSERT INTO login_codes (identifier, code_hash, expires_at, attempts, sends, window_start, last_sent_at)
          VALUES (?1, ?2, ?3, 0, 1, ?4, ?4)
          ON CONFLICT (identifier) DO UPDATE SET
            code_hash = excluded.code_hash,
            expires_at = excluded.expires_at,
            attempts = 0,
            sends = CASE WHEN login_codes.window_start > ?5 THEN login_codes.sends + 1 ELSE 1 END,
            window_start = CASE WHEN login_codes.window_start > ?5 THEN login_codes.window_start ELSE excluded.window_start END,
            last_sent_at = excluded.last_sent_at
          WHERE login_codes.last_sent_at <= ?6
            AND (login_codes.window_start <= ?5 OR login_codes.sends < ?7)
          RETURNING identifier`,
    args: [to.value, await hashCode(to.value, code), now + CODE_TTL_MS, now, windowOpen, now - RESEND_COOLDOWN_MS, MAX_SENDS_PER_WINDOW],
  });
  if (!claimed.rows.length) {
    const row = (
      await client.execute({ sql: "SELECT last_sent_at FROM login_codes WHERE identifier = ?", args: [to.value] })
    ).rows[0];
    if (row && now - Number(row.last_sent_at) < RESEND_COOLDOWN_MS) {
      throw new AuthError("Hang on a few seconds before asking for another code.", 429);
    }
    throw new AuthError("Too many codes requested. Try again in a few minutes.", 429);
  }

  try {
    return await deliverCode(to, code);
  } catch (err) {
    // Void the code but keep the send count, so failed sends still count toward the limit.
    await client.execute({
      sql: "UPDATE login_codes SET expires_at = 0, last_sent_at = 0 WHERE identifier = ?",
      args: [to.value],
    });
    throw new AuthError(err instanceof Error ? err.message : "Couldn’t send the code.", 502);
  }
}

export async function verifyLogin(to: Identifier, code: string) {
  const client = await db();
  const now = Date.now();

  // Spend one of the 5 tries before comparing, in a single statement, so parallel guesses
  // can't all see "0 tries used".
  const claim = await client.execute({
    sql: `UPDATE login_codes SET attempts = attempts + 1
          WHERE identifier = ? AND attempts < ? AND expires_at > ?
          RETURNING code_hash`,
    args: [to.value, MAX_ATTEMPTS, now],
  });
  const row = claim.rows[0];
  if (!row) {
    const current = (
      await client.execute({ sql: "SELECT expires_at FROM login_codes WHERE identifier = ?", args: [to.value] })
    ).rows[0];
    if (current && Number(current.expires_at) > now) throw new AuthError("Too many tries. Tap “Send a new code”.", 429);
    throw new AuthError("That code expired. Tap “Send a new code”.");
  }

  const expected = Buffer.from(String(row.code_hash), "hex");
  const actual = Buffer.from(await hashCode(to.value, code.replace(/\D/g, "")), "hex");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    throw new AuthError("That code didn’t match. Try again.");
  }

  // A code signs in once: only the request that deletes it goes on.
  const used = await client.execute({
    sql: "DELETE FROM login_codes WHERE identifier = ? AND code_hash = ? RETURNING identifier",
    args: [to.value, String(row.code_hash)],
  });
  if (!used.rows.length) throw new AuthError("That code was already used. Tap “Send a new code”.");

  const column = to.kind === "email" ? "email" : "phone";
  const created = await client.execute({
    sql: `INSERT INTO users (id, ${column}, created_at) VALUES (?, ?, ?) ON CONFLICT (${column}) DO NOTHING RETURNING id`,
    args: [randomUUID(), to.value, now],
  });
  const userId = created.rows.length
    ? String(created.rows[0].id)
    : String((await client.execute({ sql: `SELECT id FROM users WHERE ${column} = ?`, args: [to.value] })).rows[0].id);

  await createSession(userId);
  if (created.rows.length) await trackSignup(userId);
  return { isNew: created.rows.length > 0 };
}

async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const now = Date.now();
  const maxAge = SESSION_DAYS * 24 * 60 * 60;
  const client = await db();
  await client.execute({
    sql: "INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
    args: [hashToken(token), userId, now, now + maxAge * 1000],
  });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  });
}

export async function getCurrentUser(): Promise<User | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const client = await db();
  const row = (
    await client.execute({
      sql: `SELECT u.id, u.name, u.email, u.phone, u.handle, u.is_public, u.share_activity, u.started_at, u.photo_at FROM sessions s JOIN users u ON u.id = s.user_id
            WHERE s.token_hash = ? AND s.expires_at > ?`,
      args: [hashToken(token), Date.now()],
    })
  ).rows[0];
  if (!row) return null;
  await trackVisit(String(row.id));
  return {
    id: String(row.id),
    name: row.name ? String(row.name) : null,
    email: row.email ? String(row.email) : null,
    phone: row.phone ? String(row.phone) : null,
    handle: row.handle ? String(row.handle) : null,
    isPublic: Boolean(row.is_public),
    shareActivity: row.share_activity == null ? true : Boolean(row.share_activity),
    started: row.started_at != null,
    photo: photoUrl(String(row.id), row.photo_at),
  };
}

export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) throw new AuthError("Please sign in again.", 401);
  return user;
}

/** Signs out this browser, or with `everywhere`, every device signed in to this account. */
export async function signOut({ everywhere = false } = {}) {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    const client = await db();
    await client.execute(
      everywhere
        ? {
            sql: "DELETE FROM sessions WHERE user_id = (SELECT user_id FROM sessions WHERE token_hash = ?)",
            args: [hashToken(token)],
          }
        : { sql: "DELETE FROM sessions WHERE token_hash = ?", args: [hashToken(token)] },
    );
  }
  jar.delete(SESSION_COOKIE);
}
