import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

let db: typeof import("@/lib/db").db;

beforeAll(async () => {
  process.env.DATABASE_URL = `file:${join(mkdtempSync(join(tmpdir(), "shelf-migrate-")), "test.db")}`;
  db = (await import("@/lib/db")).db;
});

describe("places: been or want to go", () => {
  it("files spots that were marked Going under Want to go, and leaves other collections alone", async () => {
    const client = await db();
    await client.batch(
      [
        `INSERT INTO users (id, phone, created_at) VALUES ('m1', '+14155550900', 1)`,
        `INSERT INTO books (id, user_id, kind, work_key, title, added_at, status, status_at)
          VALUES ('s1', 'm1', 'place', 'fx:spot:a', 'Going spot', 1, 'reading', 1),
                 ('s2', 'm1', 'place', 'fx:spot:b', 'Been spot', 1, 'read', 1),
                 ('b1', 'm1', 'book', 'fx:b', 'Dune', 1, 'reading', 1)`,
        // As if the database predates this migration.
        `DELETE FROM migrations WHERE id = '2026-10-15-places-been-or-want'`,
      ],
      "write",
    );
    // A fresh start runs whatever hasn't been applied yet.
    (globalThis as { __shelfDb?: unknown }).__shelfDb = undefined;
    const again = await db();
    const { rows } = await again.execute("SELECT id, status FROM books ORDER BY id");
    expect(rows.map((r) => [r.id, r.status])).toEqual([
      ["b1", "reading"],
      ["s1", "want"],
      ["s2", "read"],
    ]);
  });
});
