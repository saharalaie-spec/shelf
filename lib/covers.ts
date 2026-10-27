import "server-only";
import { bookCover, sameTitle } from "./books";
import { searchCatalog } from "./catalog";
import { db } from "./db";
import type { Kind } from "./types";

/**
 * Real covers for things saved without one: a title typed in by hand, an idea that didn't match a catalog, a show
 * TVmaze has no poster for, or an ISBN cover Open Library doesn't have. Run after a page is sent (next/server's
 * `after`), a few at a time, so nothing waits on it; an item is looked at again at most once a month.
 */

const RECHECK_MS = 30 * 24 * 60 * 60 * 1000;
const PER_RUN = 12;

/** Open Library answers an ISBN it has no cover for with "not found" (`?default=false`); only those get checked. */
const doubtful = (url: string) => url.includes("covers.openlibrary.org") && url.includes("default=false");

async function reachable(url: string) {
  try {
    const res = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(5000) });
    return res.ok;
  } catch {
    return false;
  }
}

/** A cover from the collection's catalogs, for the same title. Null if none has one. */
export async function findCover(kind: Kind, item: { title: string; author: string | null; year: number | null }): Promise<string | null> {
  if (kind === "place") return null;
  if (kind === "book") return bookCover(item.title, item.author);
  const query = kind === "screen" && item.year ? `${item.title} ${item.year}` : item.title;
  const hits = await searchCatalog(kind, query, 6).catch(() => []);
  return hits.find((h) => h.coverUrl && sameTitle(h.title, item.title) && (!item.year || !h.year || Math.abs(h.year - item.year) <= 1))?.coverUrl ?? null;
}

const running = new Set<string>();

/** Fills in covers for one person's things that need one. Never throws. */
export async function fillCovers(userId: string, limit = PER_RUN) {
  // One run per person at a time: page loads come in bursts.
  if (running.has(userId)) return;
  running.add(userId);
  try {
    const client = await db();
    const now = Date.now();
    const { rows } = await client.execute({
      sql: `SELECT id, kind, title, author, year, cover_url FROM books
            WHERE user_id = ? AND kind != 'place'
              AND (cover_url IS NULL OR cover_url LIKE '%covers.openlibrary.org%default=false%')
              AND (cover_checked_at IS NULL OR cover_checked_at < ?)
            ORDER BY status_at DESC LIMIT ?`,
      args: [userId, now - RECHECK_MS, limit],
    });
    for (const r of rows) {
      const current = r.cover_url ? String(r.cover_url) : null;
      let cover = current && doubtful(current) && (await reachable(current)) ? current : null;
      if (!cover) {
        cover = await findCover(r.kind as Kind, {
          title: String(r.title),
          author: r.author ? String(r.author) : null,
          year: r.year ? Number(r.year) : null,
        }).catch(() => null);
      }
      await client.execute({
        sql: "UPDATE books SET cover_url = ?, cover_checked_at = ? WHERE id = ?",
        // A doubtful cover that's broken and has no replacement goes, so the typeset one shows without a failed load.
        args: [cover, now, String(r.id)],
      });
    }
  } catch (err) {
    console.warn("Couldn’t fill in covers:", (err as Error).message);
  } finally {
    running.delete(userId);
  }
}
