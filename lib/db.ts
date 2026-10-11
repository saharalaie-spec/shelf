import "server-only";
import { mkdirSync } from "node:fs";
import { createClient, type Client } from "@libsql/client";

// Local SQLite file by default; point DATABASE_URL at a Turso/libSQL URL to deploy.
const url = process.env.DATABASE_URL ?? "file:data/shelf.db";

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
];

type DbState = { client: Client; ready: Promise<void> };
const globalForDb = globalThis as unknown as { __shelfDb?: DbState };

function init(): DbState {
  if (url.startsWith("file:")) {
    const path = url.slice("file:".length);
    const dir = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
    if (dir) mkdirSync(dir, { recursive: true });
  }
  const client = createClient({ url, authToken: process.env.DATABASE_AUTH_TOKEN });
  const ready = (async () => {
    await client.execute("PRAGMA foreign_keys = ON");
    if (url.startsWith("file:")) await client.execute("PRAGMA journal_mode = WAL");
    await client.batch(SCHEMA, "write");
  })();
  return { client, ready };
}

export async function db(): Promise<Client> {
  globalForDb.__shelfDb ??= init();
  await globalForDb.__shelfDb.ready;
  return globalForDb.__shelfDb.client;
}
