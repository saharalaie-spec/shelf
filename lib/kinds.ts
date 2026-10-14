import { possessive } from "./client";
import type { Kind, Status } from "./types";

/** How each collection talks about itself. One place, so every screen says the same thing. */
export type Vocab = {
  kind: Kind;
  /** URL segment: /books, /podcasts, /movies */
  slug: string;
  label: string;
  one: string;
  many: string;
  /** "1 book", "3 podcasts", "1 movie or show" */
  noun: (n: number) => string;
  /** The add button. */
  addLabel: string;
  /** Toast after moving something to the done section. */
  doneToast: (title: string) => string;
  /** Section tabs. */
  sections: Record<Status, string>;
  /** Under the big count: "12 books / you’ve read". */
  sectionSub: Record<Status, string>;
  /** Share-card counts: "12 books read". */
  countSuffix: Record<Status, string>;
  /** The one-tap button on in-progress cards. */
  finish: string;
  /** "Started 3 days ago" */
  started: string;
  /** Covers are 2:3 posters or square podcast art. */
  shape: "portrait" | "square";
  placeholder: string;
  pastePlaceholder: string;
  catalog: string;
  creatorFallback: string;
  /** A friend's in-progress item: "Reading Dune". */
  nowVerb: string;
  tint: string;
  empty: [title: string, body: string];
  sectionEmpty: Record<Status, [title: string, body: string]>;
};

const words = (one: string, many: string) => ({
  one,
  many,
  noun: (n: number) => `${n.toLocaleString()} ${n === 1 ? one : many}`,
});

export const VOCAB: Record<Kind, Vocab> = {
  book: {
    kind: "book",
    slug: "books",
    label: "Books",
    ...words("book", "books"),
    addLabel: "Add books",
    doneToast: (t) => `Finished “${t}”`,
    sections: { read: "Read", reading: "Reading", want: "Want to read" },
    sectionSub: { read: "you’ve read", reading: "you’re reading", want: "you want to read" },
    countSuffix: { read: "read", reading: "in progress", want: "to read" },
    finish: "Finished",
    started: "Started",
    shape: "portrait",
    placeholder: "Type a title, hit enter, repeat",
    pastePlaceholder: "Meditations\nSapiens by Yuval Noah Harari\nthe myth of sisyphus\n1984, Dune, The Stranger",
    catalog: "the book catalog",
    creatorFallback: "Unknown author",
    nowVerb: "Reading",
    tint: "#9c4a2a",
    empty: ["Your books", "Type the books you remember, paste a list, scan barcodes or import from Goodreads."],
    sectionEmpty: {
      read: ["Nothing finished yet", "Books you’ve read land here. Tap Finished on a book you’re reading, or add some."],
      reading: ["Not reading anything right now", "Start a book from Want to read, or add the one on your nightstand."],
      want: ["Your list is empty", "Save the books you’d like to read next, so they’re here when you need one."],
    },
  },
  podcast: {
    kind: "podcast",
    slug: "podcasts",
    label: "Podcasts",
    ...words("podcast", "podcasts"),
    addLabel: "Add podcasts",
    doneToast: (t) => `Moved “${t}” to Listened`,
    sections: { read: "Listened", reading: "Listening", want: "Up next" },
    sectionSub: { read: "you’ve listened to", reading: "you’re listening to", want: "you want to try" },
    countSuffix: { read: "listened to", reading: "on rotation", want: "to try" },
    finish: "Done",
    started: "Started",
    shape: "square",
    placeholder: "Type a show, hit enter, repeat",
    pastePlaceholder: "Huberman Lab\nThe Daily\nHardcore History by Dan Carlin\nSerial, Radiolab, 99% Invisible",
    catalog: "the podcast directory",
    creatorFallback: "Podcast",
    nowVerb: "Listening to",
    tint: "#5a3a62",
    empty: ["Your podcasts", "Type the shows you love, paste a list, screenshot your podcast app or import your subscriptions."],
    sectionEmpty: {
      read: ["No favorites yet", "Shows you’ve listened to land here. Add the ones you’d recommend."],
      reading: ["Nothing on rotation", "Add the shows you’re listening to these days."],
      want: ["Nothing queued", "Save shows friends recommend, so you remember to try them."],
    },
  },
  screen: {
    kind: "screen",
    slug: "movies",
    label: "Movies & TV",
    ...words("movie or show", "movies & shows"),
    addLabel: "Add movies & TV",
    doneToast: (t) => `Watched “${t}”`,
    sections: { read: "Watched", reading: "Watching", want: "Watchlist" },
    sectionSub: { read: "you’ve watched", reading: "you’re watching", want: "you want to watch" },
    countSuffix: { read: "watched", reading: "in progress", want: "to watch" },
    finish: "Watched",
    started: "Started",
    shape: "portrait",
    placeholder: "Type a movie or show, hit enter, repeat",
    pastePlaceholder: "Dune\nSeverance\nThe Bear\nParasite, Past Lives, Succession",
    catalog: "the movie & TV catalog",
    creatorFallback: "Movie or show",
    nowVerb: "Watching",
    tint: "#24485a",
    empty: ["Your movies & TV", "Type what you’ve watched, paste a list, screenshot a streaming app or import from Letterboxd, IMDb or Netflix."],
    sectionEmpty: {
      read: ["Nothing watched yet", "Movies and shows you’ve seen land here. Add your favorites."],
      reading: ["Not watching anything", "Add the show you’re halfway through."],
      want: ["Your watchlist is empty", "Save what you want to watch next, so movie night is easy."],
    },
  },
};

export const vocab = (kind: Kind) => VOCAB[kind];
export const kindFromSlug = (slug: string): Kind | null => Object.values(VOCAB).find((v) => v.slug === slug)?.kind ?? null;

/**
 * "Sahar’s Philosophy shelf", "What Sahar’s reading", "Sahar’s want-to-read list";
 * "Sahar’s podcasts", "What Sahar’s listening to", "Sahar’s podcast queue"; "Sahar’s movies & TV", "Sahar’s watchlist".
 */
export function shelfTitle(name: string | null, category: string | null, status: Status = "read", kind: Kind = "book") {
  if (status === "reading") {
    const doing = { book: "reading", podcast: "listening to", screen: "watching" }[kind];
    return `${name ? `What ${name}’s ${doing}` : `Currently ${doing}`}${category ? ` in ${category}` : ""}`;
  }
  const owner = name ? possessive(name) : "A";
  const cat = category ? `${category} ` : "";
  if (status === "want") {
    const list = { book: "want-to-read list", podcast: "podcast queue", screen: "watchlist" }[kind];
    return `${owner} ${cat}${list}`;
  }
  const done = { book: "shelf", podcast: "podcasts", screen: category ? "picks" : "movies & TV" }[kind];
  return `${owner} ${cat}${done}`;
}

/** "12 books read", "2 podcasts on rotation", "15 movies & shows to watch". */
export const shelfCount = (n: number, status: Status, kind: Kind = "book") =>
  `${VOCAB[kind].noun(n)} ${VOCAB[kind].countSuffix[status]}`;
