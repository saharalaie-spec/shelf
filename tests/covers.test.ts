import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

let db: typeof import("@/lib/db").db;
let fillCovers: typeof import("@/lib/covers").fillCovers;
let sameTitle: typeof import("@/lib/books").sameTitle;

beforeAll(async () => {
  process.env.DATABASE_URL = `file:${join(mkdtempSync(join(tmpdir(), "trove-covers-")), "test.db")}`;
  db = (await import("@/lib/db")).db;
  fillCovers = (await import("@/lib/covers")).fillCovers;
  sameTitle = (await import("@/lib/books")).sameTitle;
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("same title", () => {
  it("ignores subtitles, articles and accents, but not sequels", () => {
    expect(sameTitle("Sapiens: A Brief History of Humankind", "Sapiens")).toBe(true);
    expect(sameTitle("The Overstory", "Overstory")).toBe(true);
    expect(sameTitle("Amélie", "Amelie")).toBe(true);
    expect(sameTitle("Dune Messiah", "Dune")).toBe(false);
  });
});

describe("filling in covers", () => {
  it("finds a real cover for things saved without one, once, and leaves places alone", async () => {
    vi.stubEnv("BOOKS_PROVIDER", "live");
    const client = await db();
    await client.batch(
      [
        `INSERT INTO users (id, phone, created_at) VALUES ('c1', '+14155550950', 1)`,
        `INSERT INTO books (id, user_id, kind, work_key, title, author, added_at, status, status_at)
          VALUES ('b1', 'c1', 'book', 'typed:book:piranesi', 'Piranesi', 'Susanna Clarke', 1, 'read', 3),
                 ('b2', 'c1', 'book', 'typed:book:nowhere', 'A Book Nobody Has', null, 1, 'read', 2),
                 ('b3', 'c1', 'book', 'typed:book:dune', 'Dune', null, 1, 'want', 1),
                 ('p1', 'c1', 'place', 'typed:place:x', 'Some Spot', null, 1, 'want', 1)`,
      ],
      "write",
    );
    const asked: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = new URL(String(input));
        const title = url.searchParams.get("title") ?? url.searchParams.get("q") ?? "";
        asked.push(`${url.hostname} ${title}`);
        if (url.hostname === "openlibrary.org") {
          // Open Library knows Piranesi with a cover; for "Dune" it only has the sequel's.
          const docs = title.startsWith("Piranesi")
            ? [{ key: "/works/OL1W", title: "Piranesi", author_name: ["Susanna Clarke"], cover_i: 101 }]
            : title.startsWith("Dune")
              ? [{ key: "/works/OL2W", title: "Dune Messiah", author_name: ["Frank Herbert"], cover_i: 202 }]
              : [];
          return Response.json({ docs });
        }
        return Response.json({ items: [] });
      }),
    );

    await fillCovers("c1");
    const covers = Object.fromEntries(
      (await client.execute(`SELECT id, cover_url, cover_checked_at FROM books ORDER BY id`)).rows.map((r) => [r.id, [r.cover_url, r.cover_checked_at != null]]),
    );
    expect(covers).toEqual({
      b1: ["https://covers.openlibrary.org/b/id/101-M.jpg", true],
      // No cover anywhere, and a sequel's doesn't count: left as is, but marked as looked at.
      b2: [null, true],
      b3: [null, true],
      // Places keep their icons.
      p1: [null, false],
    });
    expect(asked.some((a) => a.includes("Some Spot"))).toBe(false);

    // Looked at already: not searched again this month.
    asked.length = 0;
    await fillCovers("c1");
    expect(asked).toEqual([]);
  });
});
