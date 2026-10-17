import "server-only";
import { AuthError } from "./auth";
import { db } from "./db";
import { listDestinations } from "./destinations";
import { areFriends, findPerson, type Person } from "./social";
import { listItems } from "./trove";
import type { Destination, Item } from "./types";

/**
 * Getting started without logging a life's worth of things: begin from a friend's trove (and the few things they
 * picked for new friends), name one thing you loved per collection, then a quick deck of ideas near your taste.
 */

export const STARTER_PICKS_MAX = 3;

export async function markStarted(userId: string) {
  const client = await db();
  await client.execute({ sql: "UPDATE users SET started_at = ? WHERE id = ? AND started_at IS NULL", args: [Date.now(), userId] });
}

/** Item ids someone picked for new friends, in order. */
export async function starterPickIds(userId: string): Promise<string[]> {
  const client = await db();
  const { rows } = await client.execute({
    sql: "SELECT item_id FROM starter_picks WHERE user_id = ? ORDER BY position",
    args: [userId],
  });
  return rows.map((r) => String(r.item_id));
}

/** Someone's picks for new friends, as items (the ones friends can see). */
export async function starterPicks(userId: string): Promise<Item[]> {
  const [ids, items] = await Promise.all([starterPickIds(userId), listItems(userId)]);
  const byId = new Map(items.map((i) => [i.id, i]));
  return ids.map((id) => byId.get(id)).filter((i): i is Item => Boolean(i));
}

/** Replaces someone's picks for new friends. Only their own items that friends can see. */
export async function setStarterPicks(userId: string, itemIds: string[]): Promise<string[]> {
  const ids = [...new Set(itemIds)].slice(0, STARTER_PICKS_MAX);
  const shareable = new Set((await listItems(userId)).map((i) => i.id));
  if (ids.some((id) => !shareable.has(id))) throw new AuthError("Pick from things on your lists that friends can see.");
  const client = await db();
  await client.batch(
    [
      { sql: "DELETE FROM starter_picks WHERE user_id = ?", args: [userId] },
      ...ids.map((id, i) => ({ sql: "INSERT INTO starter_picks (user_id, item_id, position) VALUES (?, ?, ?)", args: [userId, id, i] })),
    ],
    "write",
  );
  return ids;
}

export type StartFrom = {
  friend: Person;
  /** What they share, everything they picked for new friends first. */
  items: Item[];
  destinations: Destination[];
  /** The ones shown up top: what they picked, or else their favorites lately. */
  picks: Item[];
  /** They chose the picks themselves (rather than these being their favorites lately). */
  chosen: boolean;
};

/**
 * Whose trove to start from: the friend whose invite you came in on (`ref`), else the friend you made most recently.
 * Null when you have no friends yet.
 */
export async function startFrom(userId: string, ref?: string | null): Promise<StartFrom | null> {
  let friend: Person | null = null;
  if (ref) {
    const p = await findPerson(ref);
    if (p && p.id !== userId && (await areFriends(userId, p.id))) friend = p;
  }
  if (!friend) {
    const client = await db();
    const row = (
      await client.execute({
        sql: "SELECT friend_id FROM friendships WHERE user_id = ? ORDER BY created_at DESC LIMIT 1",
        args: [userId],
      })
    ).rows[0];
    friend = row ? await findPerson(String(row.friend_id)) : null;
  }
  if (!friend) return null;

  const [items, destinations, pickIds] = await Promise.all([
    listItems(friend.id),
    listDestinations(friend.id),
    starterPickIds(friend.id),
  ]);
  const byId = new Map(items.map((i) => [i.id, i]));
  const chosenPicks = pickIds.map((id) => byId.get(id)).filter((i): i is Item => Boolean(i));
  // Nothing picked: their favorites lately, the ones they wrote a note about first.
  const picks = chosenPicks.length
    ? chosenPicks
    : items
        .filter((i) => i.status === "read")
        .sort((a, b) => Number(Boolean(b.note)) - Number(Boolean(a.note)) || b.statusAt - a.statusAt)
        .slice(0, STARTER_PICKS_MAX);
  const top = new Set(picks.map((i) => i.id));
  return {
    friend,
    items: [...picks, ...items.filter((i) => !top.has(i.id))],
    destinations,
    picks,
    chosen: chosenPicks.length > 0,
  };
}
