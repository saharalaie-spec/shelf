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
    const [book] = await shelf.listItems(USER);
    expect(book).toMatchObject({ title: "Meditations", kind: "book", status: "read", statusAt: 1000, private: false });
  });

  it("keeps old share links working as Read links", async () => {
    const shared = await shelf.getSharedShelf("oldlink");
    expect(shared).toMatchObject({ ownerName: "Sahar", status: "read", category: null });
    expect(shared!.items.map((b) => b.title)).toEqual(["Meditations"]);
    expect(await shelf.getOrCreateShare(USER, "book", "read", "")).toBe("oldlink");
  });

  it("gives each section its own link", async () => {
    const want = await shelf.getOrCreateShare(USER, "book", "want", "");
    const reading = await shelf.getOrCreateShare(USER, "book", "reading", "");
    expect(new Set(["oldlink", want, reading]).size).toBe(3);
    expect(await shelf.getOrCreateShare(USER, "book", "want", "")).toBe(want);
  });
});

describe("sections", () => {
  it("adds books to a section and filters by section and category", async () => {
    await shelf.addItems(USER, "book", [
      { key: "fx:2", title: "Dune", author: null, year: null, coverUrl: null, categories: ["Science Fiction"], status: "want" },
      { key: "fx:3", title: "The Republic", author: null, year: null, coverUrl: null, categories: ["Philosophy"], status: "reading" },
    ]);
    expect((await shelf.listItems(USER, { status: "want" })).map((b) => b.title)).toEqual(["Dune"]);
    expect((await shelf.listItems(USER, { category: "Philosophy" })).map((b) => b.title).sort()).toEqual([
      "Meditations",
      "The Republic",
    ]);
    expect((await shelf.listItems(USER, { status: "read", category: "Philosophy" })).map((b) => b.title)).toEqual([
      "Meditations",
    ]);
  });

  it("restamps a book only when it actually changes section", async () => {
    const dune = (await shelf.listItems(USER, { status: "want" }))[0];
    const moved = await shelf.updateItem(USER, dune.id, { status: "reading" });
    expect(moved!.statusAt).toBeGreaterThan(dune.statusAt - 1);
    const again = await shelf.updateItem(USER, dune.id, { status: "reading", categories: ["Classics"] });
    expect(again!.statusAt).toBe(moved!.statusAt);
    expect(again!.categories).toEqual(["Classics"]);
  });

  it("won't touch someone else's book", async () => {
    const [book] = await shelf.listItems(USER);
    expect(await shelf.updateItem("someone-else", book.id, { status: "want" })).toBeNull();
  });
});

describe("collections", () => {
  it("keeps books, podcasts and movies apart, with their own links", async () => {
    await shelf.addItems(USER, "podcast", [
      { key: "fx:pod:daily", title: "The Daily", author: null, year: null, coverUrl: null, categories: [], status: "reading" },
    ]);
    await shelf.addItems(USER, "screen", [
      { key: "fx:screen:dune-2021", title: "Dune", author: null, year: 2021, coverUrl: null, categories: ["Movies"], status: "read" },
    ]);
    expect((await shelf.listItems(USER, { kind: "podcast" })).map((b) => b.title)).toEqual(["The Daily"]);
    expect((await shelf.listItems(USER, { kind: "screen" })).map((b) => [b.title, b.kind])).toEqual([["Dune", "screen"]]);
    expect((await shelf.listItems(USER, { kind: "book" })).every((b) => b.kind === "book")).toBe(true);

    const books = await shelf.getOrCreateShare(USER, "book", "read", "");
    const movies = await shelf.getOrCreateShare(USER, "screen", "read", "");
    expect(books).toBe("oldlink");
    expect(movies).not.toBe(books);
    expect(await shelf.getSharedShelf(movies)).toMatchObject({ kind: "screen", items: [{ title: "Dune" }] });

    const home = await shelf.summarize(USER);
    expect(home.podcast).toMatchObject({ counts: { read: 0, reading: 1, want: 0 }, now: "The Daily" });
    expect(home.screen.covers.map((c) => c.title)).toEqual(["Dune"]);
  });
});
