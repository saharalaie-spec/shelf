import "server-only";
import { randomBytes, randomUUID } from "node:crypto";
import type { Row } from "@libsql/client";
import { db } from "./db";
import { isStatus, type Book, type BookHit, type Status } from "./types";

const toBook = (r: Row): Book => ({
  id: String(r.id),
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

/**
 * A user's books. Private books are only included when `includePrivate` is set, which only the
 * owner's own views should do: friends, public profiles and share links never see them.
 */
export async function listBooks(
  userId: string,
  filter: { status?: Status; category?: string; includePrivate?: boolean } = {},
): Promise<Book[]> {
  const client = await db();
  const where = ["user_id = ?"];
  const args: string[] = [userId];
  if (!filter.includePrivate) where.push("private = 0");
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
  return rows.map(toBook);
}

export type NewBook = BookHit & { status: Status; addedAt?: number; statusAt?: number; private?: boolean };

/** Adds books, skipping ones already on the shelf. Returns only the newly added. */
export async function addBooks(userId: string, hits: NewBook[]): Promise<Book[]> {
  const client = await db();
  const now = Date.now();
  // Newest first in the grid, so the first item of a batch gets the latest timestamp.
  const prepared = hits.map((h, i) => {
    const addedAt = h.addedAt ?? now - i;
    return { ...h, id: randomUUID(), addedAt, statusAt: h.statusAt ?? addedAt, private: Boolean(h.private) };
  });
  const results = await client.batch(
    prepared.map((b) => ({
      sql: `INSERT INTO books (id, user_id, work_key, title, author, year, cover_url, categories, added_at, status, status_at, private)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (user_id, work_key) DO NOTHING`,
      args: [b.id, userId, b.key, b.title, b.author, b.year, b.coverUrl, JSON.stringify(b.categories), b.addedAt, b.status, b.statusAt, b.private ? 1 : 0],
    })),
    "write",
  );
  return prepared
    .filter((_, i) => results[i].rowsAffected > 0)
    .map(({ id, key, title, author, year, coverUrl, categories, addedAt, status, statusAt, private: p }) => ({
      id, key, title, author, year, coverUrl, categories, addedAt, status, statusAt, private: p,
    }));
}

type BookPatch = { categories?: string[]; status?: Status; private?: boolean };

/** Changes a book's categories, section and/or privacy. Returns what was saved, or null if it isn't yours. */
export async function updateBook(
  userId: string,
  bookId: string,
  patch: BookPatch,
): Promise<(BookPatch & { statusAt?: number }) | null> {
  const client = await db();
  const sets: string[] = [];
  const args: (string | number)[] = [];
  const saved: BookPatch & { statusAt?: number } = {};
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
    args: [...args, bookId, userId],
  });
  if (!res.rows.length) return null;
  if (patch.status) saved.statusAt = Number(res.rows[0].status_at);
  return saved;
}

export async function removeBook(userId: string, bookId: string) {
  const client = await db();
  await client.execute({ sql: "DELETE FROM books WHERE id = ? AND user_id = ?", args: [bookId, userId] });
}

/** One stable, unguessable link per (user, section, category). Category '' = every category. */
export async function getOrCreateShare(userId: string, status: Status, category: string): Promise<string> {
  const client = await db();
  const existing = (
    await client.execute({
      sql: "SELECT slug FROM shares WHERE user_id = ? AND status = ? AND category = ?",
      args: [userId, status, category],
    })
  ).rows[0];
  if (existing) return String(existing.slug);
  const slug = randomBytes(6).toString("base64url");
  await client.execute({
    sql: "INSERT INTO shares (slug, user_id, status, category, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT DO NOTHING",
    args: [slug, userId, status, category, Date.now()],
  });
  return getOrCreateShare(userId, status, category);
}

export type SharedShelf = { ownerName: string | null; status: Status; category: string | null; books: Book[] };

export async function getSharedShelf(slug: string, { countView = false } = {}): Promise<SharedShelf | null> {
  const client = await db();
  const row = (
    await client.execute({
      sql: "SELECT s.user_id, s.status, s.category, u.name FROM shares s JOIN users u ON u.id = s.user_id WHERE s.slug = ?",
      args: [slug],
    })
  ).rows[0];
  if (!row) return null;
  if (countView) {
    client.execute({ sql: "UPDATE shares SET views = views + 1 WHERE slug = ?", args: [slug] }).catch(() => {});
  }
  const status = isStatus(row.status) ? row.status : "read";
  const category = row.category ? String(row.category) : null;
  return {
    ownerName: row.name ? String(row.name) : null,
    status,
    category,
    books: await listBooks(String(row.user_id), { status, category: category ?? undefined }),
  };
}
