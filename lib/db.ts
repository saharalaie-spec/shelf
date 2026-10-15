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
  {
    id: "2026-10-12-friends-and-privacy",
    statements: [
      // Private books are seen by their owner only: not friends, not public profiles, not share links.
      `ALTER TABLE books ADD COLUMN private INTEGER NOT NULL DEFAULT 0`,
      // Profiles are private (friends only) until their owner makes them public.
      `ALTER TABLE users ADD COLUMN is_public INTEGER NOT NULL DEFAULT 0`,
      `ALTER TABLE users ADD COLUMN handle TEXT`,
      `ALTER TABLE users ADD COLUMN invite_token TEXT`,
      `CREATE UNIQUE INDEX users_by_handle ON users (handle)`,
      `CREATE UNIQUE INDEX users_by_invite ON users (invite_token)`,
      // One row per direction, so "my friends" is a single indexed lookup.
      `CREATE TABLE friendships (
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        friend_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (user_id, friend_id)
      )`,
      // Requests are addressed to a phone number or email, so they can wait for people not on Shelf yet.
      `CREATE TABLE friend_requests (
        id TEXT PRIMARY KEY,
        from_user TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        to_identifier TEXT NOT NULL,
        to_display TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        UNIQUE (from_user, to_identifier)
      )`,
      `CREATE INDEX friend_requests_by_target ON friend_requests (to_identifier)`,
    ],
  },
  {
    id: "2026-10-14-collections",
    statements: [
      // The books table now holds every collection: books, podcasts, and movies & TV ("screen").
      // Work keys are namespaced by source, so UNIQUE (user_id, work_key) still holds across kinds.
      `ALTER TABLE books ADD COLUMN kind TEXT NOT NULL DEFAULT 'book'`,
      `CREATE INDEX IF NOT EXISTS books_by_kind ON books (user_id, kind, status, status_at DESC)`,
      // Share links become one per (user, collection, section, category).
      `CREATE TABLE shares_v3 (
        slug TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        kind TEXT NOT NULL DEFAULT 'book',
        status TEXT NOT NULL DEFAULT 'read',
        category TEXT NOT NULL DEFAULT '',
        created_at INTEGER NOT NULL,
        views INTEGER NOT NULL DEFAULT 0,
        UNIQUE (user_id, kind, status, category)
      )`,
      `INSERT INTO shares_v3 (slug, user_id, kind, status, category, created_at, views)
        SELECT slug, user_id, 'book', status, category, created_at, views FROM shares`,
      `DROP TABLE shares`,
      `ALTER TABLE shares_v3 RENAME TO shares`,
    ],
  },
  {
    id: "2026-10-15-places",
    statements: [
      // The cities, regions and countries someone groups their favorite spots under. They name them;
      // the map position and bounds (when the name came from the map) keep spot searches inside.
      `CREATE TABLE destinations (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        country TEXT,
        label TEXT,
        lat REAL,
        lon REAL,
        bbox TEXT,
        created_at INTEGER NOT NULL
      )`,
      `CREATE UNIQUE INDEX destinations_by_name ON destinations (user_id, lower(name))`,
      // Spots belong to a destination; deleting it deletes them.
      `ALTER TABLE books ADD COLUMN destination_id TEXT REFERENCES destinations(id) ON DELETE CASCADE`,
      `CREATE INDEX books_by_destination ON books (destination_id)`,
      // Where a spot is (JSON {lat, lon, type, address}), and the owner's note on any item.
      `ALTER TABLE books ADD COLUMN geo TEXT`,
      `ALTER TABLE books ADD COLUMN note TEXT`,
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
