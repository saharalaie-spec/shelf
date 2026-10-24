import "server-only";
import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { db } from "./db";

/**
 * What people do, for the numbers page (lib/metrics.ts). Saves and moves are already in item_events and
 * thank-yous in thanks; this is the rest. Recording never fails the request it's part of.
 */
export type Action =
  | "visit" // opened Trove while signed in (at most once per half hour)
  | "link_open" // someone not signed in opened a friend's link; ref is the link (see Via)
  | "signup" // a new account; ref is the link that brought them, if any
  | "invite_share" // tapped Send or Copy on their invite link; ref is "share" or "copy"
  | "friend_added" // accepted an invite or a friend request; ref is the friend
  | "friend_trove" // looked through a friend's trove; ref is the friend
  | "next_open" // opened "Stuck on what's next?"; ref is the kind
  | "ideas" // asked for ideas there; ref is the kind
  | "ask"; // said what they're after, in their own words; ref is the kind

/** Actions the browser may record itself; the rest are recorded where they happen on the server. */
export const CLIENT_ACTIONS = new Set<Action>(["invite_share", "next_open"]);

/** A friend's link someone arrived on: "invite:<token>", "share:<slug>" or "profile:<handle or id>". */
export type Via = `${"invite" | "share" | "profile"}:${string}`;
export const isVia = (v: unknown): v is Via => typeof v === "string" && /^(invite|share|profile):[\w-]{1,64}$/.test(v);

const VISITOR_COOKIE = "trove_visitor";
const VIA_COOKIE = "trove_via";
const cookieOptions = (days: number) => ({
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: days * 24 * 60 * 60,
});

export async function track(action: Action, who: { userId?: string | null; visitor?: string | null; ref?: string | null }) {
  try {
    const client = await db();
    await client.execute({
      sql: "INSERT INTO activity (user_id, visitor, action, ref, at) VALUES (?, ?, ?, ?, ?)",
      args: [who.userId ?? null, who.visitor ?? null, action, who.ref ?? null, Date.now()],
    });
  } catch (err) {
    console.error(`Couldn’t record ${action}`, err);
  }
}

const VISIT_EVERY_MS = 30 * 60 * 1000;
const lastVisit = new Map<string, number>();

/** One "visit" per person per half hour, however many requests a page makes. */
export async function trackVisit(userId: string) {
  const now = Date.now();
  if (now - (lastVisit.get(userId) ?? 0) < VISIT_EVERY_MS) return;
  if (lastVisit.size > 10_000) lastVisit.clear();
  lastVisit.set(userId, now);
  try {
    const client = await db();
    // Other server instances keep their own memory; the database has the last word.
    await client.execute({
      sql: `INSERT INTO activity (user_id, action, at) SELECT ?1, 'visit', ?2
            WHERE NOT EXISTS (SELECT 1 FROM activity WHERE user_id = ?1 AND action = 'visit' AND at > ?3)`,
      args: [userId, now, now - VISIT_EVERY_MS],
    });
  } catch (err) {
    console.error("Couldn’t record a visit", err);
  }
}

/**
 * Someone not signed in opened a friend's link: remember it on this browser, so if they sign up (now or after
 * looking around) we know who brought them, and count the open once per browser and link.
 */
export async function arrivedVia(via: Via) {
  // Only real links count: this is open to anyone, so made-up ones mustn't pad the numbers.
  if (!(await linkOwner(via).catch(() => null))) return;
  const jar = await cookies();
  let visitor = jar.get(VISITOR_COOKIE)?.value;
  if (!visitor || !/^[\w-]{16,32}$/.test(visitor)) {
    visitor = randomBytes(12).toString("base64url");
    jar.set(VISITOR_COOKIE, visitor, cookieOptions(365));
  }
  jar.set(VIA_COOKIE, via, cookieOptions(30));
  try {
    const client = await db();
    await client.execute({
      sql: `INSERT INTO activity (visitor, action, ref, at) SELECT ?1, 'link_open', ?2, ?3
            WHERE NOT EXISTS (SELECT 1 FROM activity WHERE visitor = ?1 AND action = 'link_open' AND ref = ?2)`,
      args: [visitor, via, Date.now()],
    });
  } catch (err) {
    console.error("Couldn’t record a link open", err);
  }
}

/** Whose link a "via" points at. */
async function linkOwner(via: Via): Promise<string | null> {
  const [type, value] = [via.slice(0, via.indexOf(":")), via.slice(via.indexOf(":") + 1)];
  const client = await db();
  const sql =
    type === "invite"
      ? "SELECT id FROM users WHERE invite_token = ?"
      : type === "share"
        ? "SELECT user_id AS id FROM shares WHERE slug = ?"
        : /^[0-9a-f-]{36}$/i.test(value)
          ? "SELECT id FROM users WHERE id = ?"
          : "SELECT id FROM users WHERE handle = lower(?)";
  const row = (await client.execute({ sql, args: [value] })).rows[0];
  return row ? String(row.id) : null;
}

/** A new account: note the friend's link that brought them, if this browser arrived on one. */
export async function trackSignup(userId: string) {
  try {
    const jar = await cookies();
    const via = jar.get(VIA_COOKIE)?.value;
    const visitor = jar.get(VISITOR_COOKIE)?.value ?? null;
    const from = isVia(via) ? await linkOwner(via) : null;
    if (from && from !== userId) {
      const client = await db();
      await client.execute({
        sql: "UPDATE users SET invited_by = ?, came_via = ? WHERE id = ? AND invited_by IS NULL",
        args: [from, via!.slice(0, via!.indexOf(":")), userId],
      });
    }
    if (via) jar.delete(VIA_COOKIE);
    await track("signup", { userId, visitor, ref: isVia(via) ? via : null });
  } catch (err) {
    console.error("Couldn’t record a signup", err);
  }
}
