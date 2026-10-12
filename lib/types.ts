/** A book as found in the catalog, before it's on anyone's shelf. */
export type BookHit = {
  key: string;
  title: string;
  author: string | null;
  year: number | null;
  coverUrl: string | null;
  categories: string[];
};

/** Where a book sits: finished, in progress, or on the wish list. */
export const STATUSES = ["read", "reading", "want"] as const;
export type Status = (typeof STATUSES)[number];
export const isStatus = (s: unknown): s is Status => STATUSES.includes(s as Status);

/** A book on the signed-in user's shelf. `statusAt` is when it last changed section. */
export type Book = BookHit & { id: string; addedAt: number; status: Status; statusAt: number };

/** One line of a pasted list, dictation, photo or import, before matching. Imports know the status. */
export type Candidate = { title: string; author?: string; isbn?: string; status?: Status };

export type MatchResult = {
  input: Candidate;
  match: BookHit | null;
  alternatives: BookHit[];
};
