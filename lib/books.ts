import "server-only";
import { categorize } from "./categories";
import { fixtureSearch } from "./fixture-books";
import type { Hit, Candidate, MatchResult } from "./types";

const TIMEOUT_MS = 7000;
const cache = new Map<string, { at: number; hits: Hit[] }>();
const CACHE_TTL_MS = 60 * 60 * 1000;

type Query = {
  q?: string;
  title?: string;
  author?: string;
  isbn?: string;
  /** From the search box, as they type: the last word may be half done. */
  typing?: boolean;
};

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
    if (query.typing && query.q) return asTheyType(query.q, limit);
    try {
      return await openLibrary(query, limit);
    } catch (err) {
      console.warn("Open Library failed, trying Google Books:", (err as Error).message);
      return googleBooks(query, limit);
    }
  });
}

/**
 * The search box. Open Library first; if nothing there matches everything they've typed (it's thin on newer books, and
 * people keep typing the author when they can't see their book), Google Books too, with both lists ranked together.
 */
async function asTheyType(q: string, limit: number): Promise<Hit[]> {
  let failed: unknown = null;
  const ol = await openLibrary({ q, typing: true }, limit).catch((err) => {
    failed = err;
    return [] as Hit[];
  });
  const share = (h: Hit) => matchShare(q, h.title, h.author);
  if (ol.some((h) => share(h) === 1)) return ol;
  const gb = await googleBooks({ q }, limit).catch((err) => {
    console.warn("Google Books failed:", (err as Error).message);
    return [] as Hit[];
  });
  if (!ol.length && !gb.length && failed) throw failed;
  // The same book from both: keep Open Library's (it has better subjects).
  const id = (h: Hit) => `${plain(h.title.split(/[:(]/)[0])}|${plain(h.author?.split(",")[0] ?? "").split(" ").pop()}`;
  const seen = new Set<string>();
  const both = [...ol, ...gb].filter((h) => !seen.has(id(h)) && seen.add(id(h)));
  // Best match first; ties keep their place (Open Library's ranking, then Google's).
  return both
    .map((h, i) => ({ h, i, s: share(h) }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .slice(0, limit)
    .map(({ h }) => h);
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
export async function searchText(text: string, limit = 8, { typing = false } = {}) {
  const split = splitTitleAuthor(text);
  if (split.q !== undefined) return findBooks({ ...split, typing }, limit);
  const hits = await findBooks(split, limit);
  return hits.length ? hits : findBooks({ q: text.trim(), typing }, limit);
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
  const wanted = query.title ?? query.q ?? "";
  // Typing: the last word may be half done ("take the lea"), so also ask for words starting with it ("lea*"). Whichever
  // answers, the results are ranked together by how well they match.
  const prefix = query.typing && query.q && /[a-z0-9]{2,}$/i.test(query.q) ? `${query.q}*` : null;
  const [plain, partial] = await Promise.allSettled([
    openLibraryDocs(query, limit),
    prefix ? openLibraryDocs({ q: prefix }, limit) : Promise.resolve([]),
  ]);
  if (plain.status === "rejected" && (partial.status === "rejected" || !prefix)) throw plain.reason;
  const seen = new Set<string>();
  const docs = [...(plain.status === "fulfilled" ? plain.value : []), ...(partial.status === "fulfilled" ? partial.value : [])].filter(
    (d) => d.title && !seen.has(d.key) && seen.add(d.key),
  );
  // Each list's own order counts a little: interleave them so neither list's top results get pushed down.
  const order = new Map<string, number>();
  for (const list of [plain, partial]) if (list.status === "fulfilled") list.value.forEach((d, i) => order.set(d.key, Math.min(order.get(d.key) ?? i, i)));

  return docs
    .map((d) => ({ d, score: rank(d, order.get(d.key) ?? 0, wanted) }))
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

async function openLibraryDocs(query: Query, limit: number): Promise<OLDoc[]> {
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
  return ((await res.json()) as { docs: OLDoc[] }).docs;
}

const words = (s: string) => plain(s).split(" ").filter(Boolean);

/**
 * How much of what they typed the book matches, 0 to 1: each word found in its title or author, the last one as the
 * start of a word, since they may still be typing it ("take the lea" → Take the Lead).
 */
export function matchShare(typed: string, title: string, author: string | null = null) {
  const want = words(typed);
  if (!want.length) return 0;
  const have = [...words(title), ...words(author ?? "")];
  const found = want.filter((w, i) => have.some((h) => (i === want.length - 1 ? h.startsWith(w) : h === w)));
  return found.length / want.length;
}

/**
 * Matching what they typed comes first; how famous a book is only breaks ties, so a book with thousands of editions
 * (the Bible) can't outrank the one they're typing. Open Library's own order counts a little.
 */
function rank(d: OLDoc, index: number, wanted: string) {
  const title = plain(d.title);
  const typed = plain(wanted);
  let score = matchShare(wanted, d.title, d.author_name?.join(" ") ?? null) * 10;
  if (typed && title === typed) score += 3;
  if (typed && title.startsWith(typed)) score += 4;
  score += Math.min(Math.log2((d.edition_count ?? 1) + 1), 10) * 0.4;
  if (d.cover_i) score += 0.5;
  return score - index * 0.3;
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
