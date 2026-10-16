import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import { beforeAll, describe, expect, it } from "vitest";

let trove: typeof import("@/lib/trove");
const USER = "u1";

// A database as the first release left it: no status columns, one share link per (user, category).
beforeAll(async () => {
  const url = `file:${join(mkdtempSync(join(tmpdir(), "trove-db-")), "old.db")}`;
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
  trove = await import("@/lib/trove");
});

describe("upgrading an existing database", () => {
  it("files every existing book under Read, keeping its date", async () => {
    const [book] = await trove.listItems(USER);
    expect(book).toMatchObject({ title: "Meditations", kind: "book", status: "read", statusAt: 1000, private: false });
  });

  it("keeps old share links working as Read links", async () => {
    const shared = await trove.getSharedTrove("oldlink");
    expect(shared).toMatchObject({ ownerName: "Sahar", status: "read", category: null });
    expect(shared!.items.map((b) => b.title)).toEqual(["Meditations"]);
    expect(await trove.getOrCreateShare(USER, "book", "read", "")).toBe("oldlink");
  });

  it("gives each section its own link", async () => {
    const want = await trove.getOrCreateShare(USER, "book", "want", "");
    const reading = await trove.getOrCreateShare(USER, "book", "reading", "");
    expect(new Set(["oldlink", want, reading]).size).toBe(3);
    expect(await trove.getOrCreateShare(USER, "book", "want", "")).toBe(want);
  });
});

describe("sections", () => {
  it("adds books to a section and filters by section and category", async () => {
    await trove.addItems(USER, "book", [
      { key: "fx:2", title: "Dune", author: null, year: null, coverUrl: null, categories: ["Science Fiction"], status: "want" },
      { key: "fx:3", title: "The Republic", author: null, year: null, coverUrl: null, categories: ["Philosophy"], status: "reading" },
    ]);
    expect((await trove.listItems(USER, { status: "want" })).map((b) => b.title)).toEqual(["Dune"]);
    expect((await trove.listItems(USER, { category: "Philosophy" })).map((b) => b.title).sort()).toEqual([
      "Meditations",
      "The Republic",
    ]);
    expect((await trove.listItems(USER, { status: "read", category: "Philosophy" })).map((b) => b.title)).toEqual([
      "Meditations",
    ]);
  });

  it("restamps a book only when it actually changes section", async () => {
    const dune = (await trove.listItems(USER, { status: "want" }))[0];
    const moved = await trove.updateItem(USER, dune.id, { status: "reading" });
    expect(moved!.statusAt).toBeGreaterThan(dune.statusAt - 1);
    const again = await trove.updateItem(USER, dune.id, { status: "reading", categories: ["Classics"] });
    expect(again!.statusAt).toBe(moved!.statusAt);
    expect(again!.categories).toEqual(["Classics"]);
  });

  it("won't touch someone else's book", async () => {
    const [book] = await trove.listItems(USER);
    expect(await trove.updateItem("someone-else", book.id, { status: "want" })).toBeNull();
  });
});

describe("collections", () => {
  it("keeps books, podcasts and movies apart, with their own links", async () => {
    await trove.addItems(USER, "podcast", [
      { key: "fx:pod:daily", title: "The Daily", author: null, year: null, coverUrl: null, categories: [], status: "reading" },
    ]);
    await trove.addItems(USER, "screen", [
      { key: "fx:screen:dune-2021", title: "Dune", author: null, year: 2021, coverUrl: null, categories: ["Movies"], status: "read" },
    ]);
    expect((await trove.listItems(USER, { kind: "podcast" })).map((b) => b.title)).toEqual(["The Daily"]);
    expect((await trove.listItems(USER, { kind: "screen" })).map((b) => [b.title, b.kind])).toEqual([["Dune", "screen"]]);
    expect((await trove.listItems(USER, { kind: "book" })).every((b) => b.kind === "book")).toBe(true);

    const books = await trove.getOrCreateShare(USER, "book", "read", "");
    const movies = await trove.getOrCreateShare(USER, "screen", "read", "");
    expect(books).toBe("oldlink");
    expect(movies).not.toBe(books);
    expect(await trove.getSharedTrove(movies)).toMatchObject({ kind: "screen", items: [{ title: "Dune" }] });

    const home = await trove.summarize(USER);
    expect(home.podcast).toMatchObject({ counts: { read: 0, reading: 1, want: 0 }, now: "The Daily" });
    expect(home.screen.covers.map((c) => c.title)).toEqual(["Dune"]);
  });
});

describe("places", () => {
  const spot = (key: string, title: string, extra: Partial<import("@/lib/trove").NewItem> = {}) => ({
    key,
    title,
    author: "Ruzafa",
    year: null,
    coverUrl: null,
    categories: ["Food & Drink"],
    status: "read" as const,
    place: { lat: 39.46, lon: -0.37, type: "Restaurant", address: "Carrer de Sueca 1, València" },
    ...extra,
  });

  it("finds a destination by name instead of making a second one", async () => {
    const places = await import("@/lib/destinations");
    const a = await places.findOrCreateDestination(USER, {
      name: "Valencia",
      country: "Spain",
      label: "City",
      lat: 39.47,
      lon: -0.38,
      bbox: [-0.43, 39.42, -0.27, 39.57],
    });
    const b = await places.findOrCreateDestination(USER, { name: " valencia ", country: null, lat: null, lon: null, bbox: null });
    expect(b.id).toBe(a.id);
    expect(a).toMatchObject({ name: "Valencia", country: "Spain", bbox: [-0.43, 39.42, -0.27, 39.57] });
    // Names are the user's own; anything goes.
    const trip = await places.findOrCreateDestination(USER, { name: "Road trip 2024", country: null, lat: null, lon: null, bbox: null });
    expect(trip).toMatchObject({ name: "Road trip 2024", lat: null, bbox: null });
  });

  it("keeps spots in their destination, with where they are and a note", async () => {
    const places = await import("@/lib/destinations");
    const valencia = await places.findOrCreateDestination(USER, { name: "Valencia", country: null, lat: null, lon: null, bbox: null });
    await trove.addItems(
      USER,
      "place",
      [spot("fx:spot:casa-montana", "Casa Montaña", { note: "Get the anchovies" }), spot("fx:spot:secret", "Secret bar", { private: true })],
      { destinationId: valencia.id },
    );
    const [casa] = await trove.listItems(USER, { kind: "place", destinationId: valencia.id });
    expect(casa).toMatchObject({
      kind: "place",
      title: "Casa Montaña",
      destinationId: valencia.id,
      note: "Get the anchovies",
      place: { type: "Restaurant", lat: 39.46 },
    });
    const updated = await trove.updateItem(USER, casa.id, { note: "  " });
    expect(updated!.note).toBeNull();

    // Friends see the destination only through spots they may see.
    const theirs = await places.listDestinations(USER);
    expect(theirs.find((d) => d.id === valencia.id)?.count).toBe(1);
    const mine = await places.listDestinations(USER, { includePrivate: true, includeEmpty: true });
    expect(mine.find((d) => d.id === valencia.id)?.count).toBe(2);
    expect(mine.some((d) => d.name === "Road trip 2024")).toBe(true);
    expect(theirs.some((d) => d.name === "Road trip 2024")).toBe(false);

    expect((await trove.summarize(USER)).place).toMatchObject({ counts: { read: 1, reading: 0, want: 0 }, areas: 1 });
  });

  it("marks each spot Been or Want to go, never in progress", async () => {
    const places = await import("@/lib/destinations");
    const valencia = await places.findOrCreateDestination(USER, { name: "Valencia", country: null, lat: null, lon: null, bbox: null });
    const [torres] = await trove.addItems(USER, "place", [spot("fx:spot:torres", "Torres de Serranos", { status: "reading" })], {
      destinationId: valencia.id,
    });
    expect(torres.status).toBe("want");
    const casa = (await trove.listItems(USER, { kind: "place" })).find((s) => s.title === "Casa Montaña")!;
    expect(await trove.updateItem(USER, casa.id, { status: "reading" })).toMatchObject({ status: "want" });
    expect(await trove.updateItem(USER, casa.id, { status: "read" })).toMatchObject({ status: "read" });
    expect((await trove.summarize(USER)).place.counts).toEqual({ read: 1, reading: 0, want: 1 });
  });

  it("shares one destination by link, every spot in it but the private ones", async () => {
    const places = await import("@/lib/destinations");
    const valencia = await places.findOrCreateDestination(USER, { name: "Valencia", country: null, lat: null, lon: null, bbox: null });
    const slug = await trove.getOrCreateShare(USER, "place", "read", valencia.id);
    const shared = await trove.getSharedTrove(slug);
    expect(shared).toMatchObject({ kind: "place", category: "Valencia" });
    // Been and Want to go alike; there are no sections for places.
    expect(shared!.items.map((s) => [s.title, s.status]).sort()).toEqual([
      ["Casa Montaña", "read"],
      ["Torres de Serranos", "want"],
    ]);
    expect(shared!.destinations.map((d) => d.name)).toContain("Valencia");
    // An older link made for one section shows the same spots.
    const older = await trove.getSharedTrove(await trove.getOrCreateShare(USER, "place", "want", valencia.id));
    expect(older!.items.map((s) => s.title).sort()).toEqual(["Casa Montaña", "Torres de Serranos"]);
  });

  it("deletes a destination with its spots, and only the owner can", async () => {
    const places = await import("@/lib/destinations");
    const valencia = await places.findOrCreateDestination(USER, { name: "Valencia", country: null, lat: null, lon: null, bbox: null });
    await places.deleteDestination("someone-else", valencia.id);
    expect(await places.getDestination(USER, valencia.id)).not.toBeNull();
    await places.deleteDestination(USER, valencia.id);
    expect(await places.getDestination(USER, valencia.id)).toBeNull();
    expect(await trove.listItems(USER, { kind: "place", includePrivate: true })).toEqual([]);
  });
});
