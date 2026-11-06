import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

let db: typeof import("@/lib/db").db;

beforeAll(async () => {
  process.env.DATABASE_URL = `file:${join(mkdtempSync(join(tmpdir(), "trove-spots-")), "test.db")}`;
  db = (await import("@/lib/db")).db;
});

describe("spots saved by name only", () => {
  it("get their details from the map once it knows them, keeping their Google link", async () => {
    const { fillSpotDetails } = await import("@/lib/spot-details");
    const { findOrCreateDestination } = await import("@/lib/destinations");
    const { addItems, listItems } = await import("@/lib/trove");
    const client = await db();
    await client.execute(`INSERT INTO users (id, phone, created_at) VALUES ('s1', '+14155550990', 1)`);
    const kyoto = await findOrCreateDestination("s1", { name: "Kyoto", country: "Japan", lat: 35, lon: 135.7, bbox: null });
    const spot = (key: string, title: string) => ({ key, title, author: null, year: null, coverUrl: null, categories: [], status: "want" as const });
    await addItems("s1", "place", [spot("gcid:123", "Nishiki Market"), spot("gcid:456", "A Bar Nobody Mapped")], { destinationId: kyoto.id });

    await fillSpotDetails("s1");
    const byTitle = Object.fromEntries((await listItems("s1", { includePrivate: true })).map((i) => [i.title, i]));
    expect(byTitle["Nishiki Market"].place).toBeTruthy();
    expect(byTitle["Nishiki Market"].author).toBeTruthy();
    // Still the place from the Google list, so its link opens that very spot.
    expect(byTitle["Nishiki Market"].key).toBe("gcid:123");
    expect(byTitle["A Bar Nobody Mapped"].place).toBeUndefined();

    // Looked for already: not again this month.
    const checked = (await client.execute(`SELECT cover_checked_at FROM books WHERE work_key = 'gcid:456'`)).rows[0];
    expect(checked.cover_checked_at).not.toBeNull();
  });

  it("say they're from Google Maps until then", async () => {
    const { spotLine } = await import("@/components/Spot");
    expect(spotLine({ key: "gcid:456", author: null, categories: [] })).toBe("From Google Maps");
    expect(spotLine({ key: "typed:place:x", author: null, categories: [] })).toBe("");
    expect(spotLine({ key: "gcid:123", author: "Nakagyō", categories: ["Food & Drink"] })).toBe("Food & Drink · Nakagyō");
  });
});
