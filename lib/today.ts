import "server-only";
import { friendsTable } from "./table";
import { listItems } from "./trove";
import type { Item, Kind, PlaceInfo, Status } from "./types";

/**
 * The Today card's raw material: for each collection, a short list of things worth doing today, best first,
 * each with the reason it's there. Picking one per collection (by the day, skipping "not today") happens on
 * the device, since "today" and "morning" are the viewer's.
 *
 * Nothing here is an algorithm: what you're in the middle of, then picks from people whose picks you finish,
 * then whatever's waited longest, then something a friend just finished when your own list is empty.
 */

export type TodayReason =
  | { type: "keep"; since: number }
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
  /** Spots: the destination's name. */
  destination: string | null;
  tier: "keep" | "want" | "friend";
  reason: TodayReason;
  /** Saving a friend's pick remembers them. */
  friendId: string | null;
};

export type TodayCandidates = Record<Kind, TodayPick[]>;

const PER_KIND = 12;
/** Places are chosen by distance on the device, so it gets more of them. */
const PLACES = 200;

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
    const keep = ofKind
      .filter((i) => i.status === "reading")
      .sort((a, b) => b.statusAt - a.statusAt)
      .map((i) => fromItem(i, "keep", { type: "keep", since: i.statusAt }));
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
    // When your own list runs dry: what friends are on or just finished.
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
    out[kind] = [...keep, ...wants, ...friends].slice(0, PER_KIND);
  }

  // Spots you want to go to; the device picks one near you, or from your latest place.
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
