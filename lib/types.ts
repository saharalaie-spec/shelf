/** The collections on a shelf. "screen" is movies and TV shows together. */
export const KINDS = ["book", "podcast", "screen"] as const;
export type Kind = (typeof KINDS)[number];
export const isKind = (k: unknown): k is Kind => KINDS.includes(k as Kind);

/**
 * Something found in a catalog (a book, a podcast, a movie or a show), before it's on anyone's shelf.
 * Keys are namespaced by source ("ol:", "itunes:pod:", "tmdb:movie:", "typed:podcast:"…), so they never
 * collide across collections.
 */
export type Hit = {
  key: string;
  title: string;
  /** The author of a book, the host or publisher of a podcast, the director or network of a movie or show. */
  author: string | null;
  year: number | null;
  coverUrl: string | null;
  categories: string[];
};

/**
 * Where an item sits: done, in progress, or queued. The values date from when Shelf only had books;
 * each collection labels them its own way (Read / Listened / Watched…, see lib/kinds.ts).
 */
export const STATUSES = ["read", "reading", "want"] as const;
export type Status = (typeof STATUSES)[number];
export const isStatus = (s: unknown): s is Status => STATUSES.includes(s as Status);

/** An item on someone's shelf. `statusAt` is when it last changed section; `private` items are owner-only. */
export type Item = Hit & {
  id: string;
  kind: Kind;
  addedAt: number;
  status: Status;
  statusAt: number;
  private: boolean;
};

/** One line of a pasted list, dictation, photo or import, before matching. Imports may know more. */
export type Candidate = {
  title: string;
  author?: string;
  isbn?: string;
  year?: number;
  /** Movies & TV imports often say which one it is. */
  format?: "movie" | "tv";
  status?: Status;
};

export type MatchResult = {
  input: Candidate;
  match: Hit | null;
  alternatives: Hit[];
};
