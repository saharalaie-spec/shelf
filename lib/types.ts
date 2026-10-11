/** A book as found in the catalog, before it's on anyone's shelf. */
export type BookHit = {
  key: string;
  title: string;
  author: string | null;
  year: number | null;
  coverUrl: string | null;
  categories: string[];
};

/** A book on the signed-in user's shelf. */
export type Book = BookHit & { id: string; addedAt: number };

/** One line of a pasted list, dictation, photo or import, before matching. */
export type Candidate = { title: string; author?: string; isbn?: string };

export type MatchResult = {
  input: Candidate;
  match: BookHit | null;
  alternatives: BookHit[];
};
