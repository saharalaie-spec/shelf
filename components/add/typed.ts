import type { BookHit, Candidate } from "@/lib/types";

export const normalize = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

/** A book added exactly as typed, for when the catalog doesn't know it. */
export function typedHit(c: Candidate): BookHit {
  const title = c.title.trim().replace(/^./, (ch) => ch.toUpperCase());
  return {
    key: `typed:${normalize(title)}|${normalize(c.author ?? "")}`,
    title,
    author: c.author?.trim() || null,
    year: null,
    coverUrl: c.isbn ? `https://covers.openlibrary.org/b/isbn/${c.isbn}-M.jpg?default=false` : null,
    categories: [],
  };
}
