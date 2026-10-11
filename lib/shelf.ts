import "server-only";
import { randomBytes, randomUUID } from "node:crypto";
import type { Row } from "@libsql/client";
import { db } from "./db";
import type { Book, BookHit } from "./types";

const toBook = (r: Row): Book => ({
  id: String(r.id),
  key: String(r.work_key),
  title: String(r.title),
  author: r.author ? String(r.author) : null,
  year: r.year == null ? null : Number(r.year),
  coverUrl: r.cover_url ? String(r.cover_url) : null,
  categories: JSON.parse(String(r.categories)),
  addedAt: Number(r.added_at),
});

export async function listBooks(userId: string, category?: string): Promise<Book[]> {
  const client = await db();
  const { rows } = await client.execute(
    category
      ? {
          sql: `SELECT * FROM books WHERE user_id = ?
                AND EXISTS (SELECT 1 FROM json_each(books.categories) WHERE value = ?)
                ORDER BY added_at DESC`,
          args: [userId, category],
        }
      : { sql: "SELECT * FROM books WHERE user_id = ? ORDER BY added_at DESC", args: [userId] },
  );
  return rows.map(toBook);
}

/** Adds books, skipping ones already on the shelf. Returns only the newly added. */
export async function addBooks(
  userId: string,
  hits: (BookHit & { addedAt?: number })[],
): Promise<Book[]> {
  const client = await db();
  const now = Date.now();
  // Newest first in the grid, so the first item of a batch gets the latest timestamp.
  const prepared = hits.map((h, i) => ({ ...h, id: randomUUID(), addedAt: h.addedAt ?? now - i }));
  const results = await client.batch(
    prepared.map((b) => ({
      sql: `INSERT INTO books (id, user_id, work_key, title, author, year, cover_url, categories, added_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (user_id, work_key) DO NOTHING`,
      args: [b.id, userId, b.key, b.title, b.author, b.year, b.coverUrl, JSON.stringify(b.categories), b.addedAt],
    })),
    "write",
  );
  return prepared
    .filter((_, i) => results[i].rowsAffected > 0)
    .map(({ id, key, title, author, year, coverUrl, categories, addedAt }) => ({
      id, key, title, author, year, coverUrl, categories, addedAt,
    }));
}

export async function updateCategories(userId: string, bookId: string, categories: string[]) {
  const client = await db();
  const clean = [...new Set(categories.map((c) => c.trim()).filter(Boolean))].slice(0, 8);
  const res = await client.execute({
    sql: "UPDATE books SET categories = ? WHERE id = ? AND user_id = ?",
    args: [JSON.stringify(clean), bookId, userId],
  });
  return res.rowsAffected > 0 ? clean : null;
}

export async function removeBook(userId: string, bookId: string) {
  const client = await db();
  await client.execute({ sql: "DELETE FROM books WHERE id = ? AND user_id = ?", args: [bookId, userId] });
}

export async function setName(userId: string, name: string) {
  const client = await db();
  const clean = name.trim().slice(0, 40) || null;
  await client.execute({ sql: "UPDATE users SET name = ? WHERE id = ?", args: [clean, userId] });
  return clean;
}

/** One stable, unguessable link per (user, category). '' = the whole shelf. */
export async function getOrCreateShare(userId: string, category: string) {
  const client = await db();
  const existing = (
    await client.execute({
      sql: "SELECT slug FROM shares WHERE user_id = ? AND category = ?",
      args: [userId, category],
    })
  ).rows[0];
  if (existing) return String(existing.slug);
  const slug = randomBytes(6).toString("base64url");
  await client.execute({
    sql: "INSERT INTO shares (slug, user_id, category, created_at) VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING",
    args: [slug, userId, category, Date.now()],
  });
  return getOrCreateShare(userId, category);
}

export type SharedShelf = { ownerName: string | null; category: string | null; books: Book[] };

export async function getSharedShelf(slug: string, { countView = false } = {}): Promise<SharedShelf | null> {
  const client = await db();
  const row = (
    await client.execute({
      sql: "SELECT s.user_id, s.category, u.name FROM shares s JOIN users u ON u.id = s.user_id WHERE s.slug = ?",
      args: [slug],
    })
  ).rows[0];
  if (!row) return null;
  if (countView) {
    client.execute({ sql: "UPDATE shares SET views = views + 1 WHERE slug = ?", args: [slug] }).catch(() => {});
  }
  const category = row.category ? String(row.category) : null;
  return {
    ownerName: row.name ? String(row.name) : null,
    category,
    books: await listBooks(String(row.user_id), category ?? undefined),
  };
}
