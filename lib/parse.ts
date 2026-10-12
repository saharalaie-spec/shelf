import type { Candidate, Status } from "./types";

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
  source: "goodreads" | "storygraph" | "csv";
  /** Books on shelves we don't map (e.g. "did-not-finish"). */
  skipped: number;
  counts: Record<Status, number>;
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

/** EAN-13 barcodes on books start with 978/979 (Bookland). */
export function isBookBarcode(code: string) {
  return /^97[89]\d{10}$/.test(code);
}
