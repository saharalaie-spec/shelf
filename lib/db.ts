import "server-only";
import { mkdirSync } from "node:fs";
import { createClient, type Client } from "@libsql/client";
import { databaseToken, databaseUrl } from "./config";

/** Thrown when the app is deployed but no database is connected yet. */
export class SetupError extends Error {}

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE,
    phone TEXT UNIQUE,
    name TEXT,
    created_at INTEGER NOT NULL
  )`,
  // One live code per identifier; resending replaces it.
  `CREATE TABLE IF NOT EXISTS login_codes (
    identifier TEXT PRIMARY KEY,
    code_hash TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    sends INTEGER NOT NULL DEFAULT 1,
    window_start INTEGER NOT NULL,
    last_sent_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS books (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    work_key TEXT NOT NULL,
    title TEXT NOT NULL,
    author TEXT,
    year INTEGER,
    cover_url TEXT,
    categories TEXT NOT NULL DEFAULT '[]',
    added_at INTEGER NOT NULL,
    UNIQUE (user_id, work_key)
  )`,
  `CREATE INDEX IF NOT EXISTS books_by_user ON books (user_id, added_at DESC)`,
  // category '' means the whole shelf. One stable link per (user, category).
  `CREATE TABLE IF NOT EXISTS shares (
    slug TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL,
    views INTEGER NOT NULL DEFAULT 0,
    UNIQUE (user_id, category)
  )`,
  // Server-generated values that must stay stable across restarts (e.g. the code-signing secret).
  `CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`,
];

/**
 * Changes to the schema above, applied once each, in order. Never edit a shipped migration;
 * add a new one. Each runs in a transaction together with the row that records it.
 */
const MIGRATIONS: { id: string; statements: string[] }[] = [
  {
    id: "2026-10-12-reading-status",
    statements: [
      // Every existing book was added as "read".
      `ALTER TABLE books ADD COLUMN status TEXT NOT NULL DEFAULT 'read'`,
      `ALTER TABLE books ADD COLUMN status_at INTEGER NOT NULL DEFAULT 0`,
      `UPDATE books SET status_at = added_at`,
      `CREATE INDEX IF NOT EXISTS books_by_status ON books (user_id, status, status_at DESC)`,
      // Share links become one per (user, status, category); SQLite can't change a UNIQUE in place.
      `CREATE TABLE shares_v2 (
        slug TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        status TEXT NOT NULL DEFAULT 'read',
        category TEXT NOT NULL DEFAULT '',
        created_at INTEGER NOT NULL,
        views INTEGER NOT NULL DEFAULT 0,
        UNIQUE (user_id, status, category)
      )`,
      `INSERT INTO shares_v2 (slug, user_id, status, category, created_at, views)
        SELECT slug, user_id, 'read', category, created_at, views FROM shares`,
      `DROP TABLE shares`,
      `ALTER TABLE shares_v2 RENAME TO shares`,
    ],
  },
];

async function migrate(client: Client) {
  await client.execute("CREATE TABLE IF NOT EXISTS migrations (id TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)");
  const done = new Set((await client.execute("SELECT id FROM migrations")).rows.map((r) => String(r.id)));
  for (const m of MIGRATIONS) {
    if (done.has(m.id)) continue;
    try {
      await client.batch(
        [...m.statements, { sql: "INSERT INTO migrations (id, applied_at) VALUES (?, ?)", args: [m.id, Date.now()] }],
        "write",
      );
    } catch (err) {
      // Another server instance may have just applied it; that's fine. Anything else is real.
      const applied = await client.execute({ sql: "SELECT 1 FROM migrations WHERE id = ?", args: [m.id] });
      if (!applied.rows.length) throw err;
    }
  }
}

type DbState = { client: Client; ready: Promise<void> };
const globalForDb = globalThis as unknown as { __shelfDb?: DbState };

function init(url: string): DbState {
  if (url.startsWith("file:")) {
    const path = url.slice("file:".length);
    const dir = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
    if (dir) mkdirSync(dir, { recursive: true });
  }
  const client = createClient({ url, authToken: databaseToken() });
  const ready = (async () => {
    await client.execute("PRAGMA foreign_keys = ON");
    if (url.startsWith("file:")) await client.execute("PRAGMA journal_mode = WAL");
    await client.batch(SCHEMA, "write");
    await migrate(client);
  })();
  return { client, ready };
}

export async function db(): Promise<Client> {
  const url = databaseUrl();
  if (!url) throw new SetupError("This deployment has no database connected yet.");
  const state = (globalForDb.__shelfDb ??= init(url));
  try {
    await state.ready;
  } catch (err) {
    // Don't cache a failed connection (bad token, network blip); the next request retries.
    if (globalForDb.__shelfDb === state) globalForDb.__shelfDb = undefined;
    state.client.close();
    throw err;
  }
  return state.client;
}
