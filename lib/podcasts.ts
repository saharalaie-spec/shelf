import "server-only";
import { categorizePodcast } from "./genres";
import type { Hit } from "./types";

const TIMEOUT_MS = 7000;
const cache = new Map<string, { at: number; hits: Hit[] }>();
const CACHE_TTL_MS = 60 * 60 * 1000;

/** Search Apple's podcast directory (free, no key). Throws if iTunes can't be reached. */
export async function searchPodcasts(text: string, limit = 8): Promise<Hit[]> {
  const term = text.trim();
  if (!term) return [];
  const key = JSON.stringify([term.toLowerCase(), limit]);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.hits;
  const hits = await itunesPodcasts(term, limit);
  cache.set(key, { at: Date.now(), hits });
  if (cache.size > 2000) cache.delete(cache.keys().next().value!);
  return hits;
}

type ITunesPodcast = {
  collectionId?: number;
  collectionName?: string;
  artistName?: string;
  artworkUrl600?: string;
  artworkUrl100?: string;
  primaryGenreName?: string;
  genres?: string[];
  releaseDate?: string;
};

export async function itunesPodcasts(term: string, limit: number): Promise<Hit[]> {
  const params = new URLSearchParams({
    media: "podcast",
    entity: "podcast",
    limit: String(Math.min(Math.max(limit * 2, 10), 50)),
    term,
  });
  const res = await fetch(`https://itunes.apple.com/search?${params}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`iTunes ${res.status}`);
  const data = (await res.json()) as { results?: ITunesPodcast[] };
  const hits = (data.results ?? [])
    .filter((p) => p.collectionId && p.collectionName)
    .map((p) => ({
      key: `itunes:pod:${p.collectionId}`,
      title: p.collectionName!,
      author: p.artistName || null,
      year: null,
      coverUrl: artwork(p),
      categories: categorizePodcast([p.primaryGenreName ?? "", ...(p.genres ?? [])].filter(Boolean)),
    }));
  return rankPodcasts(hits, term).slice(0, limit);
}

function artwork(p: ITunesPodcast) {
  const url = p.artworkUrl600 ?? p.artworkUrl100?.replace("100x100bb", "600x600bb");
  return url ? url.replace(/^http:/, "https:") : null;
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f'’]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/^(the|a|an) /, "");

/** Exact title matches first, then titles starting with the query, then the source's order. Drops duplicate keys. */
export function rankPodcasts(hits: Hit[], text: string): Hit[] {
  const wanted = norm(text);
  const tier = (h: Hit) => {
    const title = norm(h.title);
    if (wanted && title === wanted) return 2;
    if (wanted && title.startsWith(`${wanted} `)) return 1;
    return 0;
  };
  const unique = [...new Map(hits.map((h) => [h.key, h])).values()];
  return unique
    .map((h, i) => ({ h, i, t: tier(h) }))
    .sort((a, b) => b.t - a.t || a.i - b.i)
    .map(({ h }) => h);
}
