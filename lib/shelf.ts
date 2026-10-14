import "server-only";
import { randomBytes, randomUUID } from "node:crypto";
import type { Row } from "@libsql/client";
import { db } from "./db";
import { isKind, isStatus, KINDS, type Hit, type Item, type Kind, type Status } from "./types";

// Every collection lives in the `books` table (it predates podcasts and movies); `kind` tells them apart.

const toItem = (r: Row): Item => ({
  id: String(r.id),
  kind: isKind(r.kind) ? r.kind : "book",
  key: String(r.work_key),
  title: String(r.title),
  author: r.author ? String(r.author) : null,
  year: r.year == null ? null : Number(r.year),
  coverUrl: r.cover_url ? String(r.cover_url) : null,
  categories: JSON.parse(String(r.categories)),
  addedAt: Number(r.added_at),
  status: isStatus(r.status) ? r.status : "read",
  statusAt: Number(r.status_at),
  private: Boolean(r.private),
});

export type ItemFilter = { kind?: Kind; status?: Status; category?: string; includePrivate?: boolean };

/**
 * A user's items. Private ones are only included when `includePrivate` is set, which only the
 * owner's own views should do: friends, public profiles and share links never see them.
 */
export async function listItems(userId: string, filter: ItemFilter = {}): Promise<Item[]> {
  const client = await db();
  const where = ["user_id = ?"];
  const args: string[] = [userId];
  if (!filter.includePrivate) where.push("private = 0");
  if (filter.kind) {
    where.push("kind = ?");
    args.push(filter.kind);
  }
  if (filter.status) {
    where.push("status = ?");
    args.push(filter.status);
  }
  if (filter.category) {
    where.push("EXISTS (SELECT 1 FROM json_each(books.categories) WHERE value = ?)");
    args.push(filter.category);
  }
  const { rows } = await client.execute({
    sql: `SELECT * FROM books WHERE ${where.join(" AND ")} ORDER BY status_at DESC, added_at DESC`,
    args,
  });
  return rows.map(toItem);
}

export type NewItem = Hit & { status: Status; addedAt?: number; statusAt?: number; private?: boolean };

/** Adds items to one collection, skipping ones already there. Returns only the newly added. */
export async function addItems(userId: string, kind: Kind, hits: NewItem[]): Promise<Item[]> {
  const client = await db();
  const now = Date.now();
  // Newest first in the grid, so the first item of a batch gets the latest timestamp.
  const prepared: Item[] = hits.map((h, i) => {
    const addedAt = h.addedAt ?? now - i;
    return {
      id: randomUUID(),
      kind,
      key: h.key,
      title: h.title,
      author: h.author,
      year: h.year,
      coverUrl: h.coverUrl,
      categories: h.categories,
      addedAt,
      status: h.status,
      statusAt: h.statusAt ?? addedAt,
      private: Boolean(h.private),
    };
  });
  const results = await client.batch(
    prepared.map((b) => ({
      sql: `INSERT INTO books (id, user_id, kind, work_key, title, author, year, cover_url, categories, added_at, status, status_at, private)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (user_id, work_key) DO NOTHING`,
      args: [
        b.id, userId, kind, b.key, b.title, b.author, b.year, b.coverUrl, JSON.stringify(b.categories),
        b.addedAt, b.status, b.statusAt, b.private ? 1 : 0,
      ],
    })),
    "write",
  );
  return prepared.filter((_, i) => results[i].rowsAffected > 0);
}

type ItemPatch = { categories?: string[]; status?: Status; private?: boolean };

/** Changes an item's categories, section and/or privacy. Returns what was saved, or null if it isn't yours. */
export async function updateItem(
  userId: string,
  itemId: string,
  patch: ItemPatch,
): Promise<(ItemPatch & { statusAt?: number }) | null> {
  const client = await db();
  const sets: string[] = [];
  const args: (string | number)[] = [];
  const saved: ItemPatch & { statusAt?: number } = {};
  if (patch.private !== undefined) {
    saved.private = patch.private;
    sets.push("private = ?");
    args.push(patch.private ? 1 : 0);
  }
  if (patch.categories) {
    saved.categories = [...new Set(patch.categories.map((c) => c.trim()).filter(Boolean))].slice(0, 8);
    sets.push("categories = ?");
    args.push(JSON.stringify(saved.categories));
  }
  if (patch.status) {
    saved.status = patch.status;
    saved.statusAt = Date.now();
    // Only restamp when the section actually changes, so re-saving doesn't reorder a list.
    sets.push("status_at = CASE WHEN status = ? THEN status_at ELSE ? END", "status = ?");
    args.push(patch.status, saved.statusAt, patch.status);
  }
  if (!sets.length) return saved;
  const res = await client.execute({
    sql: `UPDATE books SET ${sets.join(", ")} WHERE id = ? AND user_id = ? RETURNING status_at`,
    args: [...args, itemId, userId],
  });
  if (!res.rows.length) return null;
  if (patch.status) saved.statusAt = Number(res.rows[0].status_at);
  return saved;
}

export async function removeItem(userId: string, itemId: string) {
  const client = await db();
  await client.execute({ sql: "DELETE FROM books WHERE id = ? AND user_id = ?", args: [itemId, userId] });
}

/** What the home screen shows for each collection: counts, a few recent covers, and what's in progress. */
export type Summary = {
  counts: Record<Status, number>;
  /** How many are private (only counted for the owner's own view). */
  hidden: number;
  covers: Pick<Item, "key" | "title" | "author" | "coverUrl">[];
  now: string | null;
};

export async function summarize(userId: string, { includePrivate = false } = {}): Promise<Record<Kind, Summary>> {
  const client = await db();
  const visible = includePrivate ? "" : "AND private = 0";
  const [counts, recent] = await Promise.all([
    client.execute({
      sql: `SELECT kind, status, COUNT(*) AS n, SUM(private) AS p FROM books WHERE user_id = ? ${visible}
            GROUP BY kind, status`,
      args: [userId],
    }),
    // The latest few per collection, in-progress first, then newest.
    client.execute({
      sql: `SELECT kind, status, work_key, title, author, cover_url FROM (
              SELECT *, ROW_NUMBER() OVER (
                PARTITION BY kind ORDER BY status = 'reading' DESC, status_at DESC, added_at DESC
              ) AS rn
              FROM books WHERE user_id = ? ${visible}
            ) WHERE rn <= 4`,
      args: [userId],
    }),
  ]);
  const out = Object.fromEntries(
    KINDS.map((k) => [k, { counts: { read: 0, reading: 0, want: 0 }, hidden: 0, covers: [], now: null }]),
  ) as unknown as Record<Kind, Summary>;
  for (const r of counts.rows) {
    if (!isKind(r.kind) || !isStatus(r.status)) continue;
    out[r.kind].counts[r.status] = Number(r.n);
    out[r.kind].hidden += Number(r.p ?? 0);
  }
  for (const r of recent.rows) {
    if (!isKind(r.kind)) continue;
    const s = out[r.kind];
    if (r.status === "reading" && !s.now) s.now = String(r.title);
    s.covers.push({
      key: String(r.work_key),
      title: String(r.title),
      author: r.author ? String(r.author) : null,
      coverUrl: r.cover_url ? String(r.cover_url) : null,
    });
  }
  return out;
}

/** One stable, unguessable link per (user, collection, section, category). Category '' = every category. */
export async function getOrCreateShare(userId: string, kind: Kind, status: Status, category: string): Promise<string> {
  const client = await db();
  const existing = (
    await client.execute({
      sql: "SELECT slug FROM shares WHERE user_id = ? AND kind = ? AND status = ? AND category = ?",
      args: [userId, kind, status, category],
    })
  ).rows[0];
  if (existing) return String(existing.slug);
  const slug = randomBytes(6).toString("base64url");
  await client.execute({
    sql: `INSERT INTO shares (slug, user_id, kind, status, category, created_at) VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT DO NOTHING`,
    args: [slug, userId, kind, status, category, Date.now()],
  });
  return getOrCreateShare(userId, kind, status, category);
}

export type SharedShelf = { ownerName: string | null; kind: Kind; status: Status; category: string | null; items: Item[] };

export async function getSharedShelf(slug: string, { countView = false } = {}): Promise<SharedShelf | null> {
  const client = await db();
  const row = (
    await client.execute({
      sql: `SELECT s.user_id, s.kind, s.status, s.category, u.name FROM shares s JOIN users u ON u.id = s.user_id
            WHERE s.slug = ?`,
      args: [slug],
    })
  ).rows[0];
  if (!row) return null;
  if (countView) {
    client.execute({ sql: "UPDATE shares SET views = views + 1 WHERE slug = ?", args: [slug] }).catch(() => {});
  }
  const kind = isKind(row.kind) ? row.kind : "book";
  const status = isStatus(row.status) ? row.status : "read";
  const category = row.category ? String(row.category) : null;
  return {
    ownerName: row.name ? String(row.name) : null,
    kind,
    status,
    category,
    items: await listItems(String(row.user_id), { kind, status, category: category ?? undefined }),
  };
}
