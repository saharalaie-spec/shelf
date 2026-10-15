/** The collections on a shelf. "screen" is movies and TV shows together; "place" is favorite spots. */
export const KINDS = ["book", "podcast", "screen", "place"] as const;
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
  /**
   * The author of a book, the host or publisher of a podcast, the director or network of a movie or show,
   * the neighborhood or town of a spot.
   */
  author: string | null;
  year: number | null;
  coverUrl: string | null;
  categories: string[];
  /** Spots only: where it is on the map. */
  place?: PlaceInfo;
};

/** A spot's position and what kind of place it is ("Restaurant", "Museum", "Beach"…). */
export type PlaceInfo = { lat: number; lon: number; type: string | null; address: string | null };

/** [west, south, east, north] in degrees. */
export type BBox = [number, number, number, number];

/**
 * A city, region or country someone's spots are grouped under. They name it themselves; when it came from
 * the map it also has a position and bounds, which keep spot searches inside it.
 */
export type Area = { name: string; country: string | null; lat: number | null; lon: number | null; bbox: BBox | null };

/** An area as the map suggests it, before anyone has saved it. */
export type AreaHit = Area & { key: string; label: string | null };

/** A saved destination ("Valencia", "Spain"), one of a user's groups of spots. */
export type Destination = Area & { id: string; label: string | null; createdAt: number };

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
  /** Spots only: which destination it belongs to. */
  destinationId: string | null;
  /** The owner's own words about it ("order the horchata"). */
  note: string | null;
};

/** One line of a pasted list, dictation, photo or import, before matching. Imports may know more. */
export type Candidate = {
  title: string;
  author?: string;
  /** Spots only: a note that came with the import, kept with the spot. */
  note?: string;
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
