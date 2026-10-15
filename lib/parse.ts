import type { Candidate, Kind, Status } from "./types";

const BULLET = /^\s*(?:[-*•·▪◦>]+|\(?\d{1,4}[.)\]:]|\[[ xX]?\])\s*/;

/**
 * Turn whatever someone pastes or dictates into candidate titles.
 * One per line; a single long line is split on commas/semicolons instead.
 * "Title by Author" and "Title - Author" keep the author.
 */
export function parseList(text: string): Candidate[] {
  let lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 1 && /[,;]/.test(lines[0])) lines = lines[0].split(/[;,]/);

  const seen = new Set<string>();
  const out: Candidate[] = [];
  for (const line of lines) {
    const cleaned = line
      .replace(BULLET, "")
      .replace(/^["'“‘]+|["'”’.]+$/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (cleaned.length < 2) continue;
    const m = cleaned.match(/^(.+?)\s+(?:by|—|–|-)\s+(.+)$/i);
    const candidate: Candidate = m
      ? { title: m[1].replace(/["”’]+$/, "").trim(), author: m[2].trim() }
      : { title: cleaned };
    const key = `${candidate.title}|${candidate.author ?? ""}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(candidate);
  }
  return out.slice(0, 500);
}

/** Minimal RFC 4180 CSV parser (quotes, escaped quotes, newlines inside quotes). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((f) => f.trim()));
}

export type ImportResult = {
  items: Candidate[];
  source: "goodreads" | "storygraph" | "csv" | "opml" | "letterboxd" | "imdb" | "netflix" | "google-maps";
  /** Rows we don't map: shelves like "did-not-finish", unknown statuses, TV episodes. */
  skipped: number;
  counts: Record<Status, number>;
};

/** For "From …" lines under an import. */
export const SOURCE_LABEL: Record<ImportResult["source"], string> = {
  goodreads: "Goodreads",
  storygraph: "StoryGraph",
  csv: "your file",
  opml: "your podcast app",
  letterboxd: "Letterboxd",
  imdb: "IMDb",
  netflix: "Netflix",
  "google-maps": "Google Maps",
};

/** Goodreads "Exclusive Shelf" / StoryGraph "Read Status" → our sections. */
function shelfStatus(value: string): Status | null {
  const v = value.trim().toLowerCase().replace(/[\s_]+/g, "-");
  if (v === "read") return "read";
  if (v === "currently-reading" || v === "reading") return "reading";
  if (v === "to-read" || v === "want-to-read") return "want";
  return null;
}

/**
 * Read a Goodreads or StoryGraph library export (or any CSV with a Title column).
 * Read, currently-reading and to-read shelves map onto the three sections; other shelves are skipped.
 * Without a shelf column, items carry no status and land wherever the user is adding.
 */
export function parseLibraryExport(text: string): ImportResult | null {
  const rows = parseCsv(text.replace(/^﻿/, ""));
  if (rows.length < 2) return null;
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const col = (...names: string[]) => header.findIndex((h) => names.includes(h));

  const title = col("title", "book title", "name");
  if (title === -1) return null;
  const author = col("author", "authors", "author name");
  const isbn13 = col("isbn13", "isbn/uid", "isbn 13");
  const isbn = col("isbn", "isbn10");
  const shelf = col("exclusive shelf", "read status", "status", "shelf");
  const source = header.includes("exclusive shelf")
    ? "goodreads"
    : header.includes("read status")
      ? "storygraph"
      : "csv";

  let skipped = 0;
  const counts: Record<Status, number> = { read: 0, reading: 0, want: 0 };
  const items: Candidate[] = [];
  for (const r of rows.slice(1)) {
    const t = r[title]?.trim();
    if (!t) continue;
    const status = shelf !== -1 && r[shelf]?.trim() ? shelfStatus(r[shelf]) : undefined;
    if (status === null) {
      skipped++;
      continue;
    }
    if (status) counts[status]++;
    const isbnValue = cleanIsbn(r[isbn13]) ?? cleanIsbn(r[isbn]);
    items.push({
      // Goodreads appends series info: "The Hobbit (Middle-earth, #0)"
      title: t.replace(/\s*\([^)]*#\d+(?:\.\d+)?\)\s*$/, ""),
      author: author !== -1 ? r[author]?.split(",")[0].trim() || undefined : undefined,
      isbn: isbnValue,
      ...(status ? { status } : {}),
    });
  }
  return { items, source, skipped, counts };
}

function cleanIsbn(v?: string) {
  const digits = v?.replace(/[^0-9X]/gi, "");
  return digits && (digits.length === 10 || digits.length === 13) ? digits : undefined;
}

/** Imports stop here; nobody reviews more than this in one go. */
const MAX_IMPORT = 2000;

const stripBom = (text: string) => text.replace(/^﻿/, "");

/** Read an import file for the collection being added to. */
export function parseImport(kind: Kind, text: string, fileName?: string): ImportResult | null {
  const clean = stripBom(text);
  switch (kind) {
    case "book":
      return parseLibraryExport(clean);
    case "podcast":
      return parsePodcastExport(clean, fileName);
    case "screen":
      return parseScreenExport(clean, fileName);
    case "place":
      return parsePlacesExport(clean, fileName);
  }
}

/**
 * Saved places from Google Takeout: a saved list's CSV ("Title,Note,URL,…"), or "Saved Places.json"
 * (GeoJSON, old and new property names), or any CSV with a Title or Name column. Notes come along.
 * Google Maps' own "Want to go" list (the file is named after it) comes in as Want to go; anything else is
 * left to the "Add to" picker.
 */
export function parsePlacesExport(text: string, fileName = ""): ImportResult | null {
  const clean = stripBom(text).trim();
  const status: Status | undefined = /want[\s_-]*to[\s_-]*go/i.test(fileName) ? "want" : undefined;
  const base = collector("google-maps", (c) => c.title);
  const out = { ...base, add: (c: Candidate) => base.add({ ...c, status }) };
  if (clean.startsWith("{")) {
    let data: { features?: { properties?: Record<string, unknown> }[] };
    try {
      data = JSON.parse(clean);
    } catch {
      return null;
    }
    if (!Array.isArray(data.features)) return null;
    for (const f of data.features) {
      const p = f.properties ?? {};
      const loc = (p.location ?? p.Location ?? {}) as Record<string, unknown>;
      const title = String(loc.name ?? loc["Business Name"] ?? p.Title ?? p.name ?? "").trim();
      if (!title) {
        out.skip();
        continue;
      }
      const note = String(p.comment ?? p.Comment ?? "").trim();
      out.add({ title, note: note || undefined });
    }
    return out.result();
  }
  const rows = parseCsv(clean);
  if (rows.length < 2) return null;
  const { col } = headerOf(rows[0]);
  const title = col("title", "name", "place");
  if (title === -1) return null;
  const note = col("note", "comment", "notes");
  const comment = col("comment");
  for (const r of rows.slice(1)) {
    const t = cell(r, title);
    if (!t) continue;
    const n = [cell(r, note), comment !== note ? cell(r, comment) : ""].filter(Boolean).join(" · ");
    out.add({ title: t, note: n || undefined });
  }
  return out.result();
}

/** Header lookup, case-insensitive. The first name listed that exists wins. */
function headerOf(row: string[]) {
  const header = row.map((h) => h.trim().toLowerCase());
  const col = (...names: string[]) => {
    for (const name of names) {
      const i = header.indexOf(name);
      if (i !== -1) return i;
    }
    return -1;
  };
  return { header, col };
}

const cell = (row: string[], i: number) => (i === -1 ? "" : (row[i] ?? "").trim());

function yearOf(value: string) {
  const m = value.match(/^(\d{4})\b/);
  return m && Number(m[1]) > 1800 ? Number(m[1]) : undefined;
}

/** Status words from trackers and hand-made lists. Unknown words ("dropped", "on hold") are null. */
function statusWord(value: string): Status | null {
  const v = value.trim().toLowerCase().replace(/[\s_-]+/g, " ");
  if (/^(?:read|watched|seen|listened|done|finished|completed?)$/.test(v)) return "read";
  if (/^(?:reading|watching|listening|currently (?:reading|watching|listening)|in progress|started)$/.test(v)) return "reading";
  if (/^(?:want|want to (?:read|watch|see|listen)|to (?:read|watch|see|listen)|watch ?list|plan(?:ned)? to watch|queued?)$/.test(v)) {
    return "want";
  }
  return null;
}

// IMDb "Title Type" in its current ("TV Mini Series"), camelCase ("tvMiniSeries") and older ("Feature Film")
// spellings, plus the plain words people put in a Type column of their own.
const MOVIE_TYPES = new Set(["movie", "tvmovie", "short", "video", "film", "featurefilm", "shortfilm", "documentary"]);
const TV_TYPES = new Set(["tvseries", "tvminiseries", "miniseries", "limitedseries", "series", "tv", "tvshow", "show"]);
/** Not something you put on a movies & TV shelf (episodes belong to their show). */
const SKIP_TYPES = new Set(["tvepisode", "episode", "podcastseries", "podcastepisode", "videogame", "musicvideo"]);

function screenFormat(type: string): Candidate["format"] | "skip" {
  const t = type.toLowerCase().replace(/[^a-z]/g, "");
  if (MOVIE_TYPES.has(t)) return "movie";
  if (TV_TYPES.has(t)) return "tv";
  if (SKIP_TYPES.has(t)) return "skip";
  return undefined;
}

/** Dedupes (title + year + format, case-insensitive), caps and counts. Empty fields are dropped. */
function collector(source: ImportResult["source"], key = (c: Candidate) => [c.title, c.year, c.format].join("|")) {
  const seen = new Set<string>();
  const items: Candidate[] = [];
  let skipped = 0;
  return {
    add(c: Candidate) {
      const k = key(c).toLowerCase();
      if (seen.has(k)) return;
      seen.add(k);
      items.push(Object.fromEntries(Object.entries(c).filter(([, v]) => v !== undefined && v !== "")) as Candidate);
    },
    skip() {
      skipped++;
    },
    result(): ImportResult {
      const kept = items.slice(0, MAX_IMPORT);
      const counts: Record<Status, number> = { read: 0, reading: 0, want: 0 };
      for (const c of kept) if (c.status) counts[c.status]++;
      return { items: kept, source, skipped, counts };
    },
  };
}

const XML_ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

function decodeXml(s: string) {
  return s.replace(/&(?:#(\d+)|#x([0-9a-f]+)|(amp|lt|gt|quot|apos));/gi, (m, dec?: string, hex?: string, name?: string) => {
    if (name) return XML_ENTITIES[name.toLowerCase()];
    const code = dec ? parseInt(dec, 10) : parseInt(hex ?? "", 16);
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m;
  });
}

/** Attributes of one tag, names lowercased, values decoded. Either quote style. */
function xmlAttributes(tag: string) {
  const attrs: Record<string, string> = {};
  for (const m of tag.matchAll(/([^\s=/<>"']+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
    attrs[m[1].toLowerCase()] = decodeXml(m[2] ?? m[3]).replace(/\s+/g, " ").trim();
  }
  return attrs;
}

/**
 * Podcast subscriptions from an OPML export (Apple Podcasts, Overcast, Pocket Casts, Castro, AntennaPod…).
 * Every outline with an xmlUrl is a show, however deeply nested; episode and playlist outlines have none.
 * Subscriptions say nothing about listening, so items carry no status and land wherever the user is adding.
 */
export function parseOpml(text: string): ImportResult | null {
  if (!/<opml[\s>]/i.test(text)) return null;
  const out = collector("opml", (c) => c.title);
  const body = text.replace(/<!--[\s\S]*?-->/g, "");
  // Quoted values may contain ">" (only "<" must be escaped), so step over them.
  for (const m of body.matchAll(/<outline\b((?:[^>"']|"[^"]*"|'[^']*')*)>/gi)) {
    const attrs = xmlAttributes(m[1]);
    if (!attrs.xmlurl) continue;
    const title = attrs.title || attrs.text;
    if (title) out.add({ title });
    else out.skip();
  }
  const result = out.result();
  return result.items.length ? result : null;
}

/** OPML from a podcast app, or a CSV with a Podcast/Title/Name column (and maybe Author/Publisher, Status). */
export function parsePodcastExport(text: string, fileName = ""): ImportResult | null {
  const clean = stripBom(text);
  if (/^\s*</.test(clean) || /<opml[\s>]/i.test(clean) || /\.(?:opml|xml)$/i.test(fileName)) return parseOpml(clean);

  const rows = parseCsv(clean);
  if (!rows.length) return null;
  const { col } = headerOf(rows[0]);
  // A listening history may have both the show ("Podcast") and the episode ("Title"); the show wins.
  const title = col("podcast", "podcast name", "podcast title", "show", "show name", "title", "name");
  if (title === -1) return null;
  const author = col("author", "publisher", "artist", "host");
  const status = col("status");

  const out = collector("csv", (c) => c.title);
  for (const r of rows.slice(1)) {
    const t = cell(r, title);
    if (!t) continue;
    const word = cell(r, status);
    const s = word ? statusWord(word) : undefined;
    if (s === null) out.skip();
    else out.add({ title: t, author: cell(r, author), status: s });
  }
  return out.result();
}

/** Netflix names episodes "Show: Season 1: Episode"; these mark the part after the show. */
const NETFLIX_TV = /: (?:Season |Limited Series|Series |Part |Volume |Chapter |Episode |Collection)/;
/** …but "Dune: Part Two" and "John Wick: Chapter 4" are sequels, not episodes. */
const NETFLIX_SEQUEL = /^(?:Part|Chapter|Volume) [^\s:]+$/;

/** "Severance: Season 1: Good News About Hell" → Severance (tv); "Glass Onion: A Knives Out Mystery" stays whole. */
function netflixTitle(raw: string): Candidate {
  const title = raw.replace(/\s+/g, " ").trim();
  const parts = title.split(": ");
  const sequel = parts.length === 2 && NETFLIX_SEQUEL.test(parts[1]);
  if (!sequel && parts[0].trim() && (parts.length >= 3 || NETFLIX_TV.test(title))) {
    return { title: parts[0].trim(), format: "tv" };
  }
  return { title };
}

/**
 * Movies & TV from Letterboxd, IMDb or Netflix exports, or any CSV with a Title or Name column.
 * The format is told by the header; Letterboxd and IMDb also look for "watchlist" in the file name.
 */
export function parseScreenExport(text: string, fileName = ""): ImportResult | null {
  const rows = parseCsv(stripBom(text));
  if (!rows.length) return null;
  const { header, col } = headerOf(rows[0]);
  const body = rows.slice(1);
  const watchlist = /watchlist/i.test(fileName);

  // Netflix → Account → Viewing activity → Download all. Newest first; one item per show.
  if (header.length === 2 && header[0] === "title" && header[1] === "date") {
    const out = collector("netflix");
    for (const r of body) if (cell(r, 0)) out.add({ ...netflixTitle(cell(r, 0)), status: "read" });
    return out.result();
  }

  // Letterboxd: watched, watchlist, ratings, diary (rewatches repeat), reviews, likes/films.
  if (header.includes("letterboxd uri")) {
    const name = col("name");
    const year = col("year");
    const status: Status = watchlist ? "want" : "read";
    const out = collector("letterboxd");
    for (const r of body) {
      const t = cell(r, name);
      if (t) out.add({ title: t, year: yearOf(cell(r, year)), format: "movie", status });
    }
    return out.result();
  }

  // IMDb ratings, watchlist and list exports, current and older column names.
  if (header.includes("const") && col("title") !== -1) {
    const title = col("title");
    const type = col("title type");
    const year = col("year");
    const directors = col("directors", "director");
    const rating = col("your rating", "you rated");
    const list = col("position") !== -1 || watchlist;
    const out = collector("imdb");
    for (const r of body) {
      const t = cell(r, title);
      if (!t) continue;
      const format = screenFormat(cell(r, type));
      if (format === "skip") {
        out.skip();
        continue;
      }
      // Lists may carry a rating column too; a title you've rated is one you've seen.
      const status: Status | undefined = cell(r, rating) ? "read" : list ? "want" : rating !== -1 ? "read" : undefined;
      out.add({ title: t, author: cell(r, directors).split(",")[0].trim(), year: yearOf(cell(r, year)), format, status });
    }
    return out.result();
  }

  const title = col("title", "name", "movie", "film", "show");
  if (title === -1) return null;
  const year = col("year", "release year");
  const type = col("type", "title type", "format", "media type", "kind");
  const status = col("status", "watch status");
  const director = col("director", "directors");
  const out = collector("csv");
  for (const r of body) {
    const t = cell(r, title);
    if (!t) continue;
    const format = screenFormat(cell(r, type));
    const word = cell(r, status);
    const s = word ? statusWord(word) : undefined;
    if (format === "skip" || s === null) {
      out.skip();
      continue;
    }
    out.add({ title: t, author: cell(r, director).split(",")[0].trim(), year: yearOf(cell(r, year)), format, status: s });
  }
  return out.result();
}

/** EAN-13 barcodes on books start with 978/979 (Bookland). */
export function isBookBarcode(code: string) {
  return /^97[89]\d{10}$/.test(code);
}
