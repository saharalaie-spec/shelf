import "server-only";
import { categorize } from "./categories";
import { fixtureSearch } from "./fixture-books";
import type { Hit, Candidate, MatchResult } from "./types";

const TIMEOUT_MS = 7000;
const cache = new Map<string, { at: number; hits: Hit[] }>();
const CACHE_TTL_MS = 60 * 60 * 1000;

type Query = { q?: string; title?: string; author?: string; isbn?: string };

async function cached(key: string, run: () => Promise<Hit[]>) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.hits;
  const hits = await run();
  cache.set(key, { at: Date.now(), hits });
  if (cache.size > 2000) cache.delete(cache.keys().next().value!);
  return hits;
}

/**
 * Search the catalog. Open Library is the default (free, no key, good subject data);
 * Google Books is the fallback. BOOKS_PROVIDER=fixture uses a small built-in list
 * for offline development and tests.
 */
export async function findBooks(query: Query, limit = 8): Promise<Hit[]> {
  const key = JSON.stringify([query, limit]);
  return cached(key, async () => {
    if (process.env.BOOKS_PROVIDER === "fixture") return fixtureSearch(query, limit);
    try {
      return await openLibrary(query, limit);
    } catch (err) {
      console.warn("Open Library failed, trying Google Books:", (err as Error).message);
      return googleBooks(query, limit);
    }
  });
}

/**
 * A real cover for a book saved without one: Open Library first, then Google Books, which has covers for many books
 * Open Library lists without one. Only a book with the same title counts. Null if neither has one.
 */
export async function bookCover(title: string, author: string | null): Promise<string | null> {
  if (process.env.BOOKS_PROVIDER === "fixture") {
    return fixtureSearch({ title, author: author ?? undefined }, 4).find((h) => h.coverUrl && sameTitle(h.title, title))?.coverUrl ?? null;
  }
  const query: Query = { title, author: author ?? undefined };
  for (const source of [openLibrary, googleBooks]) {
    const hits = await source(query, 5).catch(() => [] as Hit[]);
    const hit = hits.find((h) => h.coverUrl && sameTitle(h.title, title));
    if (hit) return hit.coverUrl;
  }
  return null;
}

const plain = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/^(the|a|an) /, "");
/** "Sapiens" and "Sapiens: A Brief History of Humankind" are the same book; "Dune" and "Dune Messiah" aren't. */
export function sameTitle(a: string, b: string) {
  const [x, y] = [plain(a.split(/[:(]/)[0]), plain(b.split(/[:(]/)[0])];
  return x.length > 0 && x === y;
}

/** Free-text search that understands "Title by Author" but falls back to a plain query. */
export async function searchText(text: string, limit = 8) {
  const split = splitTitleAuthor(text);
  if (split.q !== undefined) return findBooks(split, limit);
  const hits = await findBooks(split, limit);
  return hits.length ? hits : findBooks({ q: text.trim() }, limit);
}

/** "Meditations by Marcus Aurelius" → { title, author }; anything else is a free-text query. */
export function splitTitleAuthor(text: string): Query {
  const m = text.match(/^(.+?)\s+(?:by|—|–|-)\s+(.+)$/i);
  if (m && m[1].length > 1 && m[2].length > 1) return { title: m[1].trim(), author: m[2].trim() };
  return { q: text.trim() };
}

export async function matchCandidates(items: Candidate[]): Promise<MatchResult[]> {
  return mapLimit(items, 5, async (input) => {
    let hits: Hit[] = [];
    try {
      if (input.isbn) hits = await findBooks({ isbn: input.isbn }, 1);
      if (!hits.length && input.author) hits = await findBooks({ title: input.title, author: input.author }, 4);
      if (!hits.length) {
        hits = await searchText(input.author ? `${input.title} ${input.author}` : input.title, 4);
      }
      if (!hits.length && input.author) hits = await findBooks({ q: input.title }, 4);
    } catch (err) {
      console.warn("Match failed for", input.title, (err as Error).message);
    }
    return { input, match: hits[0] ?? null, alternatives: hits.slice(1) };
  });
}

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

// ---------- Open Library ----------

type OLDoc = {
  key: string;
  title: string;
  author_name?: string[];
  first_publish_year?: number;
  cover_i?: number;
  subject?: string[];
  edition_count?: number;
};

async function openLibrary(query: Query, limit: number): Promise<Hit[]> {
  const params = new URLSearchParams({
    fields: "key,title,author_name,first_publish_year,cover_i,subject,edition_count",
    limit: String(Math.max(limit * 2, 10)),
  });
  if (query.isbn) params.set("q", `isbn:${query.isbn}`);
  else if (query.title) {
    params.set("title", query.title);
    if (query.author) params.set("author", query.author);
  } else params.set("q", query.q ?? "");

  const res = await fetch(`https://openlibrary.org/search.json?${params}`, {
    headers: { "User-Agent": "Trove/0.1 (book list prototype)" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Open Library ${res.status}`);
  const data = (await res.json()) as { docs: OLDoc[] };
  const wanted = (query.title ?? query.q ?? "").toLowerCase();

  return data.docs
    .filter((d) => d.title)
    .map((d, i) => ({ d, score: rank(d, i, wanted) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ d }) => ({
      key: `ol:${d.key}`,
      title: d.title,
      author: d.author_name?.slice(0, 2).join(", ") ?? null,
      year: d.first_publish_year ?? null,
      coverUrl: d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-M.jpg` : null,
      categories: categorize(d.subject ?? []),
    }));
}

/** Open Library's order is decent but loves obscure editions; nudge famous, well-matched books up. */
function rank(d: OLDoc, index: number, wanted: string) {
  const title = d.title.toLowerCase();
  let score = -index;
  score += Math.log2((d.edition_count ?? 1) + 1) * 1.5;
  if (wanted && title === wanted) score += 6;
  else if (wanted && title.startsWith(wanted)) score += 2;
  if (d.cover_i) score += 1;
  return score;
}

// ---------- Google Books ----------

type GBItem = {
  id: string;
  volumeInfo: {
    title?: string;
    authors?: string[];
    publishedDate?: string;
    categories?: string[];
    imageLinks?: { thumbnail?: string };
  };
};

async function googleBooks(query: Query, limit: number): Promise<Hit[]> {
  let q = query.q ?? "";
  if (query.isbn) q = `isbn:${query.isbn}`;
  else if (query.title) q = `intitle:${query.title}${query.author ? ` inauthor:${query.author}` : ""}`;
  const params = new URLSearchParams({ q, maxResults: String(limit), printType: "books" });
  if (process.env.GOOGLE_BOOKS_API_KEY) params.set("key", process.env.GOOGLE_BOOKS_API_KEY);

  const res = await fetch(`https://www.googleapis.com/books/v1/volumes?${params}`, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Google Books ${res.status}`);
  const data = (await res.json()) as { items?: GBItem[] };
  return (data.items ?? [])
    .filter((i) => i.volumeInfo.title)
    .map(({ id, volumeInfo: v }) => ({
      key: `gb:${id}`,
      title: v.title!,
      author: v.authors?.slice(0, 2).join(", ") ?? null,
      year: v.publishedDate ? Number.parseInt(v.publishedDate, 10) || null : null,
      coverUrl: v.imageLinks?.thumbnail?.replace("http://", "https://").replace("&edge=curl", "") ?? null,
      categories: categorize(v.categories ?? []),
    }));
}
