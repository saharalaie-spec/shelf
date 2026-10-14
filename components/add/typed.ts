import type { Candidate, Hit, Kind } from "@/lib/types";

export const normalize = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

/** Something added exactly as typed, for when the catalog doesn't know it. */
export function typedHit(kind: Kind, c: Candidate): Hit {
  const title = c.title.trim().replace(/^./, (ch) => ch.toUpperCase());
  // Book keys predate other collections, so they keep the original, un-prefixed form.
  const prefix = kind === "book" ? "typed:" : `typed:${kind}:`;
  return {
    key: `${prefix}${normalize(title)}|${normalize(c.author ?? "")}`,
    title,
    author: c.author?.trim() || null,
    year: c.year ?? null,
    coverUrl: kind === "book" && c.isbn ? `https://covers.openlibrary.org/b/isbn/${c.isbn}-M.jpg?default=false` : null,
    categories: kind === "screen" && c.format ? [c.format === "tv" ? "TV" : "Movies"] : [],
  };
}
