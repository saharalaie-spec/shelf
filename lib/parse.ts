import type { Candidate } from "./types";

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

export type ImportResult = { items: Candidate[]; source: "goodreads" | "storygraph" | "csv"; skipped: number };

/**
 * Read a Goodreads or StoryGraph library export (or any CSV with a Title column).
 * Only books marked as read are kept when the export says what's been read.
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
  const items: Candidate[] = [];
  for (const r of rows.slice(1)) {
    const t = r[title]?.trim();
    if (!t) continue;
    if (shelf !== -1 && r[shelf] && !/^read$/i.test(r[shelf].trim())) {
      skipped++;
      continue;
    }
    const isbnValue = cleanIsbn(r[isbn13]) ?? cleanIsbn(r[isbn]);
    items.push({
      // Goodreads appends series info: "The Hobbit (Middle-earth, #0)"
      title: t.replace(/\s*\([^)]*#\d+(?:\.\d+)?\)\s*$/, ""),
      author: author !== -1 ? r[author]?.split(",")[0].trim() || undefined : undefined,
      isbn: isbnValue,
    });
  }
  return { items, source, skipped };
}

function cleanIsbn(v?: string) {
  const digits = v?.replace(/[^0-9X]/gi, "");
  return digits && (digits.length === 10 || digits.length === 13) ? digits : undefined;
}

/** EAN-13 barcodes on books start with 978/979 (Bookland). */
export function isBookBarcode(code: string) {
  return /^97[89]\d{10}$/.test(code);
}
