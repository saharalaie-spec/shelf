import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import { beforeAll, describe, expect, it } from "vitest";

let shelf: typeof import("@/lib/shelf");
const USER = "u1";

// A database as the first release left it: no status columns, one share link per (user, category).
beforeAll(async () => {
  const url = `file:${join(mkdtempSync(join(tmpdir(), "shelf-db-")), "old.db")}`;
  const old = createClient({ url });
  await old.batch(
    [
      `CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT UNIQUE, phone TEXT UNIQUE, name TEXT, created_at INTEGER NOT NULL)`,
      `CREATE TABLE books (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        work_key TEXT NOT NULL, title TEXT NOT NULL, author TEXT, year INTEGER, cover_url TEXT,
        categories TEXT NOT NULL DEFAULT '[]', added_at INTEGER NOT NULL, UNIQUE (user_id, work_key))`,
      `CREATE TABLE shares (slug TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        category TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL, views INTEGER NOT NULL DEFAULT 0,
        UNIQUE (user_id, category))`,
      `INSERT INTO users (id, phone, name, created_at) VALUES ('${USER}', '+14155550100', 'Sahar', 1)`,
      `INSERT INTO books (id, user_id, work_key, title, categories, added_at)
        VALUES ('b1', '${USER}', 'fx:1', 'Meditations', '["Philosophy"]', 1000)`,
      `INSERT INTO shares (slug, user_id, category, created_at, views) VALUES ('oldlink', '${USER}', '', 1, 7)`,
    ],
    "write",
  );
  old.close();
  process.env.DATABASE_URL = url;
  shelf = await import("@/lib/shelf");
});

describe("upgrading an existing database", () => {
  it("files every existing book under Read, keeping its date", async () => {
    const [book] = await shelf.listBooks(USER);
    expect(book).toMatchObject({ title: "Meditations", status: "read", statusAt: 1000 });
  });

  it("keeps old share links working as Read links", async () => {
    const shared = await shelf.getSharedShelf("oldlink");
    expect(shared).toMatchObject({ ownerName: "Sahar", status: "read", category: null });
    expect(shared!.books.map((b) => b.title)).toEqual(["Meditations"]);
    expect(await shelf.getOrCreateShare(USER, "read", "")).toBe("oldlink");
  });

  it("gives each section its own link", async () => {
    const want = await shelf.getOrCreateShare(USER, "want", "");
    const reading = await shelf.getOrCreateShare(USER, "reading", "");
    expect(new Set(["oldlink", want, reading]).size).toBe(3);
    expect(await shelf.getOrCreateShare(USER, "want", "")).toBe(want);
  });
});

describe("sections", () => {
  it("adds books to a section and filters by section and category", async () => {
    await shelf.addBooks(USER, [
      { key: "fx:2", title: "Dune", author: null, year: null, coverUrl: null, categories: ["Science Fiction"], status: "want" },
      { key: "fx:3", title: "The Republic", author: null, year: null, coverUrl: null, categories: ["Philosophy"], status: "reading" },
    ]);
    expect((await shelf.listBooks(USER, { status: "want" })).map((b) => b.title)).toEqual(["Dune"]);
    expect((await shelf.listBooks(USER, { category: "Philosophy" })).map((b) => b.title).sort()).toEqual([
      "Meditations",
      "The Republic",
    ]);
    expect((await shelf.listBooks(USER, { status: "read", category: "Philosophy" })).map((b) => b.title)).toEqual([
      "Meditations",
    ]);
  });

  it("restamps a book only when it actually changes section", async () => {
    const dune = (await shelf.listBooks(USER, { status: "want" }))[0];
    const moved = await shelf.updateBook(USER, dune.id, { status: "reading" });
    expect(moved!.statusAt).toBeGreaterThan(dune.statusAt - 1);
    const again = await shelf.updateBook(USER, dune.id, { status: "reading", categories: ["Classics"] });
    expect(again!.statusAt).toBe(moved!.statusAt);
    expect(again!.categories).toEqual(["Classics"]);
  });

  it("won't touch someone else's book", async () => {
    const [book] = await shelf.listBooks(USER);
    expect(await shelf.updateBook("someone-else", book.id, { status: "want" })).toBeNull();
  });
});
