import "server-only";
import { listDestinations } from "./destinations";
import { VOCAB } from "./kinds";
import { friendsTable } from "./table";
import { listItems } from "./trove";
import { KINDS, type Item, type Kind } from "./types";

/**
 * Someone's taste across all four collections, written out for a model to read: what they loved, what they're on,
 * what they want, the kinds of things they keep choosing, their own notes, whose picks they finish, and what their
 * friends are into lately. Private items stay out of it; friends' items come only from what the Table may show.
 */
export type Taste = {
  text: string;
  /** Everything already on their lists, per collection (private included), so suggestions never repeat it. */
  saved: Record<Kind, string[]>;
  /** Their latest place, for suggesting spots when no place is given. */
  latestDestinationId: string | null;
};

const title = (i: Item) => (i.author && i.kind !== "place" ? `${i.title} (${i.author})` : i.title);

function topCategories(items: Item[], n = 5) {
  const tally = new Map<string, number>();
  for (const i of items) for (const c of i.categories) tally.set(c, (tally.get(c) ?? 0) + 1);
  return [...tally.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([c, k]) => `${c} ×${k}`);
}

export async function tasteMap(userId: string): Promise<Taste> {
  const [items, table, destinations] = await Promise.all([
    listItems(userId, { includePrivate: true }),
    friendsTable(userId),
    listDestinations(userId, { includePrivate: true, includeEmpty: true }),
  ]);
  const placeName = new Map(destinations.map((d) => [d.id, d.name]));
  const shared = items.filter((i) => !i.private);
  const lines: string[] = [];

  for (const kind of KINDS) {
    const v = VOCAB[kind];
    const mine = shared.filter((i) => i.kind === kind);
    if (!mine.length) continue;
    const by = (s: Item["status"]) => mine.filter((i) => i.status === s).sort((a, b) => b.statusAt - a.statusAt);
    const parts: string[] = [];
    if (kind === "place") {
      const fmt = (i: Item) =>
        `${i.title} (${[i.place?.type ?? i.categories[0], placeName.get(i.destinationId ?? "")].filter(Boolean).join(", ")})`;
      const been = by("read");
      const want = by("want");
      if (been.length) parts.push(`been and loved: ${been.slice(0, 12).map(fmt).join("; ")}`);
      if (want.length) parts.push(`wants to go: ${want.slice(0, 8).map(fmt).join("; ")}`);
    } else {
      const done = by("read");
      const now = by("reading");
      const want = by("want");
      if (done.length) parts.push(`${v.sections.read.toLowerCase()}: ${done.slice(0, 12).map(title).join("; ")}`);
      if (now.length) parts.push(`${v.sections.reading.toLowerCase()} now: ${now.slice(0, 5).map(title).join("; ")}`);
      if (want.length) parts.push(`${v.sections.want.toLowerCase()}: ${want.slice(0, 8).map(title).join("; ")}`);
    }
    const cats = topCategories(mine);
    if (cats.length) parts.push(`keeps choosing: ${cats.join(", ")}`);
    lines.push(`${v.label}: ${parts.join(". ")}.`);
  }

  const notes = shared.filter((i) => i.note).slice(0, 8);
  if (notes.length) lines.push(`Their own notes: ${notes.map((i) => `${i.title}: “${i.note}”`).join("; ")}.`);

  // Whose recommendations they actually get to.
  const finished = new Map<string, number>();
  for (const i of items) if (i.recBy && i.status === "read") finished.set(i.recBy.name, (finished.get(i.recBy.name) ?? 0) + 1);
  const trusted = [...finished.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  if (trusted.length) lines.push(`People whose recommendations they finish: ${trusted.map(([n, k]) => `${n} (${k})`).join(", ")}.`);

  const lately = [...table.finished, ...table.reading, ...table.watching, ...table.listening]
    .slice(0, 15)
    .map((t) => `${t.friends[0]?.name ?? "A friend"} ${t.friends[0]?.status === "read" ? "finished" : "is on"} ${t.title} (${VOCAB[t.kind].one})`);
  const places = table.places.slice(0, 5).map((p) => `${p.friends[0]?.name ?? "A friend"} saved spots in ${p.name}`);
  if (lately.length || places.length) lines.push(`Friends lately: ${[...lately, ...places].join("; ")}.`);

  const saved = Object.fromEntries(KINDS.map((k) => [k, items.filter((i) => i.kind === k).map((i) => i.title)])) as Record<
    Kind,
    string[]
  >;
  const latestPlace = items
    .filter((i) => i.kind === "place" && i.destinationId)
    .sort((a, b) => Math.max(b.addedAt, b.statusAt) - Math.max(a.addedAt, a.statusAt))[0];
  return { text: lines.join("\n"), saved, latestDestinationId: latestPlace?.destinationId ?? null };
}
