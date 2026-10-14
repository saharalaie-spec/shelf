import "server-only";
import { findBooks, matchCandidates as matchBooks, searchText } from "./books";
import { fixturePodcasts, fixtureScreen } from "./fixture-media";
import { searchPodcasts } from "./podcasts";
import { searchScreen, type ScreenOpts } from "./screen";
import type { Candidate, Hit, Kind, MatchResult } from "./types";

/** BOOKS_PROVIDER=fixture predates podcasts and movies; it now means "offline catalogs" for every collection. */
const offline = () => process.env.BOOKS_PROVIDER === "fixture";

const podcasts = (text: string, limit: number) =>
  offline() ? fixturePodcasts(text, limit) : searchPodcasts(text, limit);

const screen = (text: string, limit: number, opts?: ScreenOpts) =>
  offline() ? fixtureScreen(text, limit, opts) : searchScreen(text, limit, opts);

/** Free-text search in one collection. Throws if the catalog can't be reached. */
export async function searchCatalog(kind: Kind, text: string, limit = 8): Promise<Hit[]> {
  if (kind === "book") return searchText(text, limit);
  if (kind === "podcast") return podcasts(text, limit);
  return screen(text, limit);
}

/** Barcodes are books only. */
export function lookupIsbn(isbn: string): Promise<Hit[]> {
  return findBooks({ isbn }, 1);
}

/** Best match plus a few alternatives for each candidate. A failed lookup gives `match: null`, never an error. */
export async function matchCandidates(kind: Kind, items: Candidate[]): Promise<MatchResult[]> {
  if (kind === "book") return matchBooks(items);
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
