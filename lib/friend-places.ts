import "server-only";
import { db } from "./db";
import { listDestinations } from "./destinations";
import { profileRef } from "./social";
import { listItems } from "./trove";
import type { Area, Destination, Item } from "./types";

/**
 * Friends who know the place you're looking at: their own place of the same name, or one inside it ("Spain" holds
 * their "Valencia"). Only what they share, and nothing you've saved already.
 */

export type FriendPlace = {
  friend: { id: string; name: string; ref: string };
  /** Their place, which may be named a little differently from yours. */
  place: { id: string; name: string };
  been: number;
  spots: Item[];
};

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

function sameArea(mine: Area, theirs: Destination) {
  if (fold(mine.name) === fold(theirs.name) && (!mine.country || !theirs.country || fold(mine.country) === fold(theirs.country))) {
    return true;
  }
  // Theirs sits inside yours.
  if (mine.bbox && theirs.lat != null && theirs.lon != null) {
    const [w, s, e, n] = mine.bbox;
    return theirs.lon >= w && theirs.lon <= e && theirs.lat >= s && theirs.lat <= n;
  }
  return false;
}

export async function friendsIn(userId: string, mine: Area): Promise<FriendPlace[]> {
  const client = await db();
  const [friends, own] = await Promise.all([
    client.execute({
      sql: "SELECT u.id, u.name, u.handle FROM friendships f JOIN users u ON u.id = f.friend_id WHERE f.user_id = ?",
      args: [userId],
    }),
    listItems(userId, { kind: "place", includePrivate: true }),
  ]);
  const saved = new Set(own.map((i) => i.key));

  const out: FriendPlace[] = [];
  for (const r of friends.rows) {
    const id = String(r.id);
    const places = (await listDestinations(id)).filter((d) => sameArea(mine, d));
    for (const place of places) {
      const spots = (await listItems(id, { kind: "place", destinationId: place.id }))
        .filter((i) => !saved.has(i.key))
        // Where they've been first, the ones with a note before the rest.
        .sort((a, b) => Number(b.status === "read") - Number(a.status === "read") || Number(Boolean(b.note)) - Number(Boolean(a.note)));
      if (!spots.length) continue;
      out.push({
        friend: { id, name: r.name ? String(r.name) : "A friend", ref: profileRef({ id, handle: r.handle ? String(r.handle) : null }) },
        place: { id: place.id, name: place.name },
        been: spots.filter((i) => i.status === "read").length,
        spots,
      });
    }
  }
  return out.sort((a, b) => b.been - a.been || b.spots.length - a.spots.length);
}
