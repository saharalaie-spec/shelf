import "server-only";
import { friendsTable } from "./table";
import { listItems } from "./trove";
import type { Item, Kind, PlaceInfo, Status } from "./types";

/**
 * What "What are you in the mood for?" offers, per collection, best first, each with the reason it's there: picks
 * from people whose picks you finish, then whatever's waited longest, then what friends are on or just finished.
 * Nothing you're already in the middle of: you know what you're reading.
 */

export type TodayReason =
  | { type: "trusted"; from: string; finished: number }
  | { type: "from"; from: string; savedAt: number }
  | { type: "waiting"; savedAt: number }
  | { type: "friend"; from: string; status: Status };

export type TodayPick = {
  key: string;
  /** Your item, when it's on your lists. */
  itemId: string | null;
  kind: Kind;
  workKey: string;
  title: string;
  author: string | null;
  year: number | null;
  coverUrl: string | null;
  categories: string[];
  place?: PlaceInfo;
  /** Spots: the destination's name and id. */
  destination: string | null;
  destinationId?: string | null;
  tier: "want" | "friend";
  reason: TodayReason;
  /** Saving a friend's pick remembers them. */
  friendId: string | null;
};

export type TodayCandidates = Record<Kind, TodayPick[]>;

const PER_KIND = 12;
const PLACES = 40;

const fromItem = (i: Item, tier: TodayPick["tier"], reason: TodayReason, destination: string | null = null): TodayPick => ({
  key: `${i.kind}:${i.key}`,
  itemId: i.id,
  kind: i.kind,
  workKey: i.key,
  title: i.title,
  author: i.author,
  year: i.year,
  coverUrl: i.coverUrl,
  categories: i.categories,
  ...(i.place ? { place: i.place } : {}),
  destination,
  destinationId: i.destinationId,
  tier,
  reason,
  friendId: null,
});

export async function todayCandidates(
  userId: string,
  destinations: Map<string, string> = new Map(),
): Promise<TodayCandidates> {
  const [items, table] = await Promise.all([listItems(userId, { includePrivate: true }), friendsTable(userId)]);

  // Whose recommendations you actually get to: finished picks per recommender.
  const finishedFrom = new Map<string, number>();
  const who = (i: Item) => (i.recBy ? (i.recBy.id ?? `name:${i.recBy.name.toLowerCase()}`) : null);
  for (const i of items) {
    const w = who(i);
    if (w && i.status === "read") finishedFrom.set(w, (finishedFrom.get(w) ?? 0) + 1);
  }

  const out = { book: [], podcast: [], screen: [], place: [] } as TodayCandidates;
  const mineKeys = new Set(items.map((i) => i.key));

  for (const kind of ["book", "podcast", "screen"] as const) {
    const ofKind = items.filter((i) => i.kind === kind);
    const wants = ofKind
      .filter((i) => i.status === "want")
      .map((i) => {
        const w = who(i);
        const finished = w ? (finishedFrom.get(w) ?? 0) : 0;
        return { i, finished };
      })
      // Trusted recommenders first, then whatever's waited longest.
      .sort((a, b) => b.finished - a.finished || a.i.addedAt - b.i.addedAt)
      .map(({ i, finished }) =>
        fromItem(
          i,
          "want",
          i.recBy && finished > 0
            ? { type: "trusted", from: i.recBy.name, finished }
            : i.recBy
              ? { type: "from", from: i.recBy.name, savedAt: i.addedAt }
              : { type: "waiting", savedAt: i.addedAt },
        ),
      );
    // What friends are on or just finished, that isn't on your lists.
    const friends = [...table.reading, ...table.listening, ...table.watching, ...table.finished]
      .filter((t) => t.kind === kind && !t.mine && !mineKeys.has(t.workKey))
      .map(
        (t): TodayPick => ({
          key: `friend:${t.key}`,
          itemId: null,
          kind,
          workKey: t.workKey,
          title: t.title,
          author: t.author,
          year: t.year,
          coverUrl: t.coverUrl,
          categories: t.categories,
          destination: null,
          tier: "friend",
          reason: { type: "friend", from: t.friends[0]?.name ?? "A friend", status: t.friends[0]?.status ?? "read" },
          friendId: t.friends[0]?.id ?? null,
        }),
      );
    out[kind] = [...wants.slice(0, PER_KIND), ...friends.slice(0, PER_KIND)];
  }

  // Spots you want to go to, newest first (your latest trip leads).
  out.place = items
    .filter((i) => i.kind === "place" && i.status === "want")
    .sort((a, b) => b.addedAt - a.addedAt)
    .slice(0, PLACES)
    .map((i) =>
      fromItem(
        i,
        "want",
        i.recBy ? { type: "from", from: i.recBy.name, savedAt: i.addedAt } : { type: "waiting", savedAt: i.addedAt },
        destinations.get(i.destinationId ?? "") ?? null,
      ),
    );
  return out;
}
