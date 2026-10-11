import "server-only";
import { createHash, createHmac, randomBytes, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { db } from "./db";
import { deliverCode } from "./delivery";
import type { Identifier } from "./identifier";

export const SESSION_COOKIE = "shelf_session";
const SESSION_DAYS = 400; // the longest browsers allow: sign in once, stay signed in
const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const SEND_WINDOW_MS = 15 * 60 * 1000;
const MAX_SENDS_PER_WINDOW = 5;
const RESEND_COOLDOWN_MS = 20 * 1000;

export type User = { id: string; name: string | null; email: string | null; phone: string | null };

export class AuthError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

const secret = () => {
  const s = process.env.AUTH_SECRET;
  if (!s && process.env.NODE_ENV === "production") throw new Error("AUTH_SECRET must be set in production");
  return s ?? "dev-only-secret";
};

const hashCode = (identifier: string, code: string) =>
  createHmac("sha256", secret()).update(`${identifier}:${code}`).digest("hex");

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export async function startLogin(to: Identifier) {
  const client = await db();
  const now = Date.now();
  const existing = (
    await client.execute({ sql: "SELECT * FROM login_codes WHERE identifier = ?", args: [to.value] })
  ).rows[0];

  let sends = 1;
  let windowStart = now;
  if (existing) {
    if (now - Number(existing.last_sent_at) < RESEND_COOLDOWN_MS) {
      throw new AuthError("Hang on a few seconds before asking for another code.", 429);
    }
    if (now - Number(existing.window_start) < SEND_WINDOW_MS) {
      sends = Number(existing.sends) + 1;
      windowStart = Number(existing.window_start);
      if (sends > MAX_SENDS_PER_WINDOW) {
        throw new AuthError("Too many codes requested. Try again in a few minutes.", 429);
      }
    }
  }

  const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
  await client.execute({
    sql: `INSERT INTO login_codes (identifier, code_hash, expires_at, attempts, sends, window_start, last_sent_at)
          VALUES (?, ?, ?, 0, ?, ?, ?)
          ON CONFLICT (identifier) DO UPDATE SET
            code_hash = excluded.code_hash, expires_at = excluded.expires_at, attempts = 0,
            sends = excluded.sends, window_start = excluded.window_start, last_sent_at = excluded.last_sent_at`,
    args: [to.value, hashCode(to.value, code), now + CODE_TTL_MS, sends, windowStart, now],
  });

  try {
    return await deliverCode(to, code);
  } catch (err) {
    await client.execute({ sql: "DELETE FROM login_codes WHERE identifier = ?", args: [to.value] });
    throw new AuthError(err instanceof Error ? err.message : "Couldn’t send the code.", 502);
  }
}

export async function verifyLogin(to: Identifier, code: string) {
  const client = await db();
  const row = (
    await client.execute({ sql: "SELECT * FROM login_codes WHERE identifier = ?", args: [to.value] })
  ).rows[0];

  if (!row || Number(row.expires_at) < Date.now()) {
    throw new AuthError("That code expired. Tap “Send a new code”.");
  }
  if (Number(row.attempts) >= MAX_ATTEMPTS) {
    throw new AuthError("Too many tries. Tap “Send a new code”.", 429);
  }

  const expected = Buffer.from(String(row.code_hash), "hex");
  const actual = Buffer.from(hashCode(to.value, code.replace(/\D/g, "")), "hex");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    await client.execute({
      sql: "UPDATE login_codes SET attempts = attempts + 1 WHERE identifier = ?",
      args: [to.value],
    });
    throw new AuthError("That code didn’t match. Try again.");
  }

  await client.execute({ sql: "DELETE FROM login_codes WHERE identifier = ?", args: [to.value] });

  const column = to.kind === "email" ? "email" : "phone";
  const found = (
    await client.execute({ sql: `SELECT id FROM users WHERE ${column} = ?`, args: [to.value] })
  ).rows[0];
  const userId = found ? String(found.id) : randomUUID();
  if (!found) {
    await client.execute({
      sql: `INSERT INTO users (id, ${column}, created_at) VALUES (?, ?, ?)`,
      args: [userId, to.value, Date.now()],
    });
  }

  await createSession(userId);
  return { isNew: !found };
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
      sql: `SELECT u.id, u.name, u.email, u.phone FROM sessions s JOIN users u ON u.id = s.user_id
            WHERE s.token_hash = ? AND s.expires_at > ?`,
      args: [hashToken(token), Date.now()],
    })
  ).rows[0];
  if (!row) return null;
  return {
    id: String(row.id),
    name: row.name ? String(row.name) : null,
    email: row.email ? String(row.email) : null,
    phone: row.phone ? String(row.phone) : null,
  };
}

export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) throw new AuthError("Please sign in again.", 401);
  return user;
}

export async function signOut() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    const client = await db();
    await client.execute({ sql: "DELETE FROM sessions WHERE token_hash = ?", args: [hashToken(token)] });
  }
  jar.delete(SESSION_COOKIE);
}
