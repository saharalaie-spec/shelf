import type { Hit, Kind } from "./types";

/** Small fetch wrapper for our JSON API. Throws with the server's friendly message. */
export async function api<T>(path: string, init?: { method?: string; body?: unknown; signal?: AbortSignal }): Promise<T> {
  const res = await fetch(path, {
    method: init?.method ?? (init?.body ? "POST" : "GET"),
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
    body: init?.body ? JSON.stringify(init.body) : undefined,
    signal: init?.signal,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && typeof window !== "undefined") window.location.reload();
  if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
  return data as T;
}

/** Notes something for the numbers page. Never in the way: failures are ignored. */
export function trackAction(action: "invite_share" | "next_open", ref?: string) {
  api("/api/activity", { body: { action, ref } }).catch(() => {});
}

export const possessive = (name: string) => (/s$/i.test(name) ? `${name}’` : `${name}’s`);

export const plural = (n: number, word: string) => `${n.toLocaleString()} ${word}${n === 1 ? "" : "s"}`;

/** Where to learn more about an item, or listen or watch: its catalog page plus a useful next stop. */
export function itemLinks(item: Pick<Hit, "key" | "title" | "author" | "place">, kind: Kind): { label: string; href: string }[] {
  const q = encodeURIComponent(item.title);
  const k = item.key;
  const id = k.slice(k.lastIndexOf(":") + 1);
  if (kind === "place") {
    const where = [item.title, item.place?.address ?? item.author].filter(Boolean).join(", ");
    const google = new URLSearchParams({ api: "1", query: where });
    if (k.startsWith("gplace:")) google.set("query_place_id", id);
    const apple = new URLSearchParams({ q: item.title });
    if (item.place) apple.set("ll", `${item.place.lat},${item.place.lon}`);
    else apple.set("address", where);
    return [
      { label: "Google Maps", href: `https://www.google.com/maps/search/?${google}` },
      { label: "Apple Maps", href: `https://maps.apple.com/?${apple}` },
    ];
  }
  if (kind === "podcast") {
    return [
      { label: "Open in Spotify", href: `https://open.spotify.com/search/${q}` },
      k.startsWith("itunes:pod:")
        ? { label: "Apple Podcasts", href: `https://podcasts.apple.com/podcast/id${id}` }
        : { label: "Apple Podcasts", href: `https://podcasts.apple.com/search?term=${q}` },
    ];
  }
  if (kind === "screen") {
    const page = k.startsWith("tmdb:movie:")
      ? `https://www.themoviedb.org/movie/${id}`
      : k.startsWith("tmdb:tv:")
        ? `https://www.themoviedb.org/tv/${id}`
        : k.startsWith("imdb:")
          ? `https://www.imdb.com/title/${id}/`
          : k.startsWith("tvmaze:")
            ? `https://www.tvmaze.com/shows/${id}`
            : `https://www.themoviedb.org/search?query=${q}`;
    return [
      { label: "Where to watch", href: `https://www.justwatch.com/us/search?q=${q}` },
      { label: "More about it", href: page },
    ];
  }
  if (k.startsWith("ol:/works/")) return [{ label: "More about this book", href: `https://openlibrary.org${k.slice(3)}` }];
  if (k.startsWith("gb:")) return [{ label: "More about this book", href: `https://books.google.com/books?id=${k.slice(3)}` }];
  const search = encodeURIComponent(`${item.title} ${item.author ?? ""}`.trim());
  return [{ label: "More about this book", href: `https://openlibrary.org/search?q=${search}` }];
}

/** "3 days ago", "last week": for dates only the browser should format (locale, clock). */
export function ago(ts: number) {
  const days = Math.round((ts - Date.now()) / 86_400_000);
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  if (Math.abs(days) < 7) return rtf.format(days, "day");
  if (Math.abs(days) < 60) return rtf.format(Math.round(days / 7), "week");
  return rtf.format(Math.round(days / 30), "month");
}
