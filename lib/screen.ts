import "server-only";
import { categorizeScreen } from "./genres";
import type { Hit } from "./types";

const TIMEOUT_MS = 7000;
const cache = new Map<string, { at: number; hits: Hit[] }>();
const CACHE_TTL_MS = 60 * 60 * 1000;

export type ScreenFormat = "movie" | "tv";
export type ScreenOpts = { year?: number; format?: ScreenFormat };
/** A hit plus what ranking needs to know. The extra fields are stripped before results leave rankScreen. */
export type ScreenHit = Hit & { format: ScreenFormat; popularity?: number };
export type ScreenQuery = { title: string; full: string; year?: number; format?: ScreenFormat };

/**
 * Search movies and TV. TMDB when TMDB_API_KEY is set (a v4 read token or a v3 key); otherwise, or if
 * TMDB fails, iTunes movies and TVmaze shows together. Throws only if every source failed.
 */
export async function searchScreen(text: string, limit = 8, opts: ScreenOpts = {}): Promise<Hit[]> {
  const query = parseScreenQuery(text, opts);
  if (!query.title) return [];
  const tmdbKey = process.env.TMDB_API_KEY?.trim();
  const key = JSON.stringify([tmdbKey ? "tmdb" : "free", query, limit]);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.hits;

  // Results from a degraded search (a source down) aren't cached, so they don't stick for an hour.
  let complete = true;
  let lists: ScreenHit[][] | null = null;
  if (tmdbKey) {
    try {
      lists = [await tmdbSearch(query.title, tmdbKey)];
    } catch (err) {
      console.warn("TMDB failed, trying iTunes and TVmaze:", (err as Error).message);
      complete = false;
    }
  }
  if (!lists) {
    const settled = await Promise.allSettled([itunesMovies(query.title, limit), tvmazeShows(query.title)]);
    const failed = settled.filter((s): s is PromiseRejectedResult => s.status === "rejected");
    const reasons = failed.map((f) => (f.reason as Error).message);
    if (failed.length === settled.length) throw new Error(`Movie & TV search failed: ${reasons.join("; ")}`);
    if (failed.length) {
      console.warn("Movie & TV source failed:", reasons.join("; "));
      complete = false;
    }
    lists = settled.flatMap((s) => (s.status === "fulfilled" ? [s.value] : []));
  }

  const hits = rankScreen(lists, query, limit);
  if (complete) {
    cache.set(key, { at: Date.now(), hits });
    if (cache.size > 2000) cache.delete(cache.keys().next().value!);
  }
  return hits;
}

/** "Dune 2021" or "Dune (2021)" → title "Dune", year 2021. An explicit opts.year wins. */
export function parseScreenQuery(text: string, opts: ScreenOpts = {}): ScreenQuery {
  const full = text.trim();
  const m = full.match(/^(.+?)[\s,(–—-]+((?:18[89]|19\d|20\d)\d)\)?$/);
  const year = m ? Number(m[2]) : 0;
  if (m && year <= new Date().getFullYear() + 3) {
    return { title: m[1], full, year: opts.year ?? year, format: opts.format };
  }
  return { title: full, full, year: opts.year, format: opts.format };
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ'’]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/^(the|a|an) /, "");

const EXACT = 30;
const PREFIX = 12;
const WORDS = 6;
const YEAR = 40;
const NEAR_YEAR = 15;
const FORMAT = 30;

/**
 * Exact titles first; a wanted year outweighs that (so "Dune 2024" finds Part Two), and so does a wanted
 * format. Then popularity and each source's own order, which interleaves sources hit by hit.
 */
function score(h: ScreenHit, index: number, q: ScreenQuery) {
  const title = norm(h.title);
  const wanted = norm(q.title);
  const words = wanted.split(" ").filter(Boolean);
  const hay = norm(`${h.title} ${h.author ?? ""}`).split(" ");
  let text = 0;
  if (title === wanted) text = EXACT;
  else if (title.startsWith(`${wanted} `)) text = PREFIX;
  else if (words.length && words.every((w) => hay.some((t) => t.startsWith(w)))) text = WORDS; // "inception nolan"

  let s = text - index / 2 + Math.min(Math.log2((h.popularity ?? 0) + 1), 10) / 2;
  if (q.full !== q.title && title === norm(q.full)) {
    s += EXACT + YEAR; // The "year" was part of the title: "Wonder Woman 1984".
  } else if (q.year && h.year && text) {
    const off = Math.abs(h.year - q.year);
    if (off === 0) s += YEAR;
    else if (off === 1) s += NEAR_YEAR;
  }
  if (q.format && h.format === q.format) s += FORMAT;
  return s;
}

/** Rank one or more sources' results (each in its own order) together, drop duplicate keys, and keep `limit`. */
export function rankScreen(lists: ScreenHit[][], q: ScreenQuery, limit: number): Hit[] {
  const ranked = lists
    .flatMap((list) => list.map((h, i) => ({ h, i, s: score(h, i, q) })))
    .sort((a, b) => b.s - a.s || a.i - b.i);
  const seen = new Set<string>();
  const out: Hit[] = [];
  for (const { h } of ranked) {
    if (out.length === limit) break;
    if (seen.has(h.key)) continue;
    seen.add(h.key);
    const { format, popularity, ...hit } = h;
    out.push(hit);
  }
  return out;
}

const yearOf = (date?: string | null) => (date ? Number.parseInt(date, 10) || null : null);
const https = (url?: string) => (url ? url.replace(/^http:/, "https:") : null);

// ---------- TMDB ----------

/** TMDB's movie and TV genre lists, merged (shared ids mean the same genre). */
const TMDB_GENRES: Record<number, string> = {
  28: "Action",
  12: "Adventure",
  16: "Animation",
  35: "Comedy",
  80: "Crime",
  99: "Documentary",
  18: "Drama",
  10751: "Family",
  14: "Fantasy",
  36: "History",
  27: "Horror",
  10402: "Music",
  9648: "Mystery",
  10749: "Romance",
  878: "Science Fiction",
  10770: "TV Movie",
  53: "Thriller",
  10752: "War",
  37: "Western",
  10759: "Action & Adventure",
  10762: "Kids",
  10763: "News",
  10764: "Reality",
  10765: "Sci-Fi & Fantasy",
  10766: "Soap",
  10767: "Talk",
  10768: "War & Politics",
};

type TMDBResult = {
  id: number;
  media_type: string;
  title?: string;
  name?: string;
  release_date?: string;
  first_air_date?: string;
  poster_path?: string | null;
  genre_ids?: number[];
  popularity?: number;
};

export async function tmdbSearch(text: string, apiKey: string): Promise<ScreenHit[]> {
  const params = new URLSearchParams({ query: text, include_adult: "false" });
  const headers: Record<string, string> = { Accept: "application/json" };
  // v4 read-access tokens are JWTs; anything else is a v3 key.
  if (apiKey.startsWith("eyJ")) headers.Authorization = `Bearer ${apiKey}`;
  else params.set("api_key", apiKey);

  const res = await fetch(`https://api.themoviedb.org/3/search/multi?${params}`, {
    headers,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`TMDB ${res.status}`);
  const data = (await res.json()) as { results?: TMDBResult[] };
  return (data.results ?? []).flatMap((r): ScreenHit[] => {
    const format = r.media_type === "movie" || r.media_type === "tv" ? r.media_type : null;
    const title = format === "movie" ? r.title : r.name;
    if (!format || !title) return [];
    return [
      {
        key: `tmdb:${format}:${r.id}`,
        title,
        author: null,
        year: yearOf(format === "movie" ? r.release_date : r.first_air_date),
        coverUrl: r.poster_path ? `https://image.tmdb.org/t/p/w500${r.poster_path}` : null,
        categories: categorizeScreen(
          (r.genre_ids ?? []).flatMap((id) => TMDB_GENRES[id] ?? []),
          format,
        ),
        format,
        popularity: r.popularity,
      },
    ];
  });
}

// ---------- iTunes movies ----------

type ITunesMovie = {
  trackId?: number;
  trackName?: string;
  artistName?: string;
  releaseDate?: string;
  primaryGenreName?: string;
  artworkUrl100?: string;
};

export async function itunesMovies(text: string, limit: number): Promise<ScreenHit[]> {
  const params = new URLSearchParams({
    media: "movie",
    entity: "movie",
    limit: String(Math.min(Math.max(limit * 2, 10), 50)),
    term: text,
  });
  const res = await fetch(`https://itunes.apple.com/search?${params}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`iTunes ${res.status}`);
  const data = (await res.json()) as { results?: ITunesMovie[] };
  return (data.results ?? [])
    .filter((m) => m.trackId && m.trackName)
    .map((m) => ({
      key: `itunes:movie:${m.trackId}`,
      // Apple disambiguates remakes in the title ("Dune (2021)"); the year has its own field.
      title: m.trackName!.replace(/\s+\((?:18|19|20)\d{2}\)$/, ""),
      author: m.artistName || null,
      year: yearOf(m.releaseDate),
      coverUrl: https(m.artworkUrl100?.replace("100x100bb", "600x600bb")),
      categories: categorizeScreen(m.primaryGenreName ? [m.primaryGenreName] : [], "movie"),
      format: "movie" as const,
    }));
}

// ---------- TVmaze ----------

type TVmazeShow = {
  id?: number;
  name?: string;
  /** "Scripted", "Animation", "Documentary", "Reality", "Talk Show"… */
  type?: string;
  genres?: string[];
  premiered?: string | null;
  network?: { name?: string } | null;
  webChannel?: { name?: string } | null;
  image?: { medium?: string; original?: string } | null;
};

export async function tvmazeShows(text: string): Promise<ScreenHit[]> {
  const res = await fetch(`https://api.tvmaze.com/search/shows?${new URLSearchParams({ q: text })}`, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`TVmaze ${res.status}`);
  const data = (await res.json()) as { score?: number; show?: TVmazeShow }[];
  return (Array.isArray(data) ? data : [])
    .flatMap(({ show }) => (show?.id && show.name ? [show] : []))
    .map((s) => ({
      key: `tvmaze:${s.id}`,
      title: s.name!,
      author: s.network?.name || s.webChannel?.name || null,
      year: yearOf(s.premiered),
      coverUrl: https(s.image?.original ?? s.image?.medium),
      categories: categorizeScreen(
        [...(s.type && s.type !== "Scripted" ? [s.type] : []), ...(s.genres ?? [])],
        "tv",
      ),
      format: "tv" as const,
    }));
}
