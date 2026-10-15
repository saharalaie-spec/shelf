import "server-only";
import { findBooks, matchCandidates as matchBooks, searchText } from "./books";
import { fixturePodcasts, fixtureScreen } from "./fixture-media";
import { fixtureAreas, fixtureBrowse, fixtureSpots } from "./fixture-places";
import { browseSpots, matchSpots, searchAreas, searchSpots } from "./places";
import { searchPodcasts } from "./podcasts";
import { searchScreen, type ScreenOpts } from "./screen";
import type { Area, AreaHit, Candidate, Hit, Kind, MatchResult } from "./types";

/** BOOKS_PROVIDER=fixture predates podcasts and movies; it now means "offline catalogs" for every collection. */
const offline = () => process.env.BOOKS_PROVIDER === "fixture";

const podcasts = (text: string, limit: number) =>
  offline() ? fixturePodcasts(text, limit) : searchPodcasts(text, limit);

const screen = (text: string, limit: number, opts?: ScreenOpts) =>
  offline() ? fixtureScreen(text, limit, opts) : searchScreen(text, limit, opts);

const spots = (text: string, area: Area, limit: number) =>
  offline() ? fixtureSpots(text, area, limit) : searchSpots(text, area, limit);

/** Spots only exist inside a destination: searching or matching them without one is a programming error. */
function needArea(area: Area | undefined): Area {
  if (!area) throw new Error("Spots are searched inside a destination: pass the area (city, region or country) to search in.");
  return area;
}

/**
 * Free-text search in one collection. Spots ("place") need the destination to search inside.
 * Throws if the catalog can't be reached.
 */
export async function searchCatalog(kind: Kind, text: string, limit = 8, area?: Area): Promise<Hit[]> {
  if (kind === "book") return searchText(text, limit);
  if (kind === "podcast") return podcasts(text, limit);
  if (kind === "place") return spots(text, needArea(area), limit);
  return screen(text, limit);
}

/** Cities, regions, islands and countries to group spots under. Throws if the map can't be reached. */
export async function searchAreasCatalog(text: string, limit = 8): Promise<AreaHit[]> {
  return offline() ? fixtureAreas(text, limit) : searchAreas(text, limit);
}

/**
 * The best-known spots of one category inside a destination ("Museums in Valencia"). Takes a
 * PLACE_CATEGORIES name or a quick-browse label; anything else is searched for as text.
 */
export async function browseCatalog(category: string, area: Area, limit = 12): Promise<Hit[]> {
  return offline() ? fixtureBrowse(category, area, limit) : browseSpots(category, area, limit);
}

/** Barcodes are books only. */
export function lookupIsbn(isbn: string): Promise<Hit[]> {
  return findBooks({ isbn }, 1);
}

/**
 * Best match plus a few alternatives for each candidate. A failed lookup gives `match: null`, never an error.
 * Spots are matched inside `area`, which they require.
 */
export async function matchCandidates(kind: Kind, items: Candidate[], area?: Area): Promise<MatchResult[]> {
  if (kind === "book") return matchBooks(items);
  if (kind === "place") {
    const where = needArea(area);
    return matchSpots(items, where, (text) => spots(text, where, 4));
  }
  const search = (text: string, input: Candidate) =>
    kind === "podcast" ? podcasts(text, 4) : screen(text, 4, { year: input.year, format: input.format });
  return mapLimit(items, 5, async (input) => {
    let hits: Hit[] = [];
    try {
      if (input.author) hits = await search(`${input.title} ${input.author}`, input);
      // Fuzzy sources answer almost anything; if the extra words led them astray, retry with the title alone.
      if (!hits.length || !mentions(hits[0], input.title)) {
        const plain = await search(input.title, input);
        if (plain.length || !hits.length) hits = plain;
      }
    } catch (err) {
      console.warn("Match failed for", input.title, (err as Error).message);
    }
    return { input, match: hits[0] ?? null, alternatives: hits.slice(1) };
  });
}

const squash = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[^a-z0-9]+/g, "");
const mentions = (hit: Hit, title: string) => squash(hit.title).includes(squash(title));

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>) {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}
