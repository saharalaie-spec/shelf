import { afterEach, describe, expect, it, vi } from "vitest";
import { findBooks, matchCandidates, matchShare, splitTitleAuthor } from "@/lib/books";

describe("splitTitleAuthor", () => {
  it("splits on 'by' and spaced dashes only", () => {
    expect(splitTitleAuthor("Meditations by Marcus Aurelius")).toEqual({ title: "Meditations", author: "Marcus Aurelius" });
    expect(splitTitleAuthor("Catch-22")).toEqual({ q: "Catch-22" });
  });
});

describe("matchCandidates (offline catalog)", () => {
  it("matches by ISBN, title + author, and loose titles", async () => {
    const results = await matchCandidates([
      { title: "anything", isbn: "9780679733737" },
      { title: "beyond good", author: "nietzsche" },
      { title: "sapiens" },
      { title: "a book that does not exist" },
    ]);
    expect(results.map((r) => r.match?.title ?? null)).toEqual([
      "The Myth of Sisyphus",
      "Beyond Good and Evil",
      "Sapiens",
      null,
    ]);
    expect(results[1].match?.categories).toContain("Philosophy");
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("matching what you typed", () => {
  it("counts each word, the last one as the start of a word", () => {
    expect(matchShare("take the lea", "Take the Lead")).toBe(1);
    expect(matchShare("take the lea", "Bible")).toBe(0);
    expect(matchShare("dune herbert", "Dune", "Frank Herbert")).toBe(1);
    // Only the last word can be half typed.
    expect(matchShare("tak the lead", "Take the Lead")).toBeCloseTo(2 / 3);
  });
});

describe("book search", () => {
  it("puts the book you're typing ahead of a famous one that doesn't match", async () => {
    vi.stubEnv("BOOKS_PROVIDER", "live");
    const asked: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const q = new URL(String(input)).searchParams.get("q") ?? "";
        asked.push(q);
        // Open Library's own answers: the plain words find the Bible first; the half word, Take the Lead.
        const bible = { key: "/works/OL1W", title: "Bible", author_name: ["Bible"], edition_count: 4000, cover_i: 1 };
        const lead = { key: "/works/OL2W", title: "Take the Lead", author_name: ["Someone"], edition_count: 3 };
        const leader = { key: "/works/OL3W", title: "Take the Leader's Path", edition_count: 2 };
        return Response.json({ docs: q.endsWith("*") ? [lead, leader, bible] : [bible] });
      }),
    );
    const hits = await findBooks({ q: "Take the lea", typing: true }, 5);
    expect(asked.sort()).toEqual(["Take the lea", "Take the lea*"]);
    expect(hits.map((h) => h.title)).toEqual(["Take the Lead", "Take the Leader's Path", "Bible"]);

    // Matching an import's titles asks once per book: no extra half-word search.
    asked.length = 0;
    await findBooks({ q: "Take the lead" }, 5);
    expect(asked).toEqual(["Take the lead"]);
  });

  it("asks Google Books too when nothing on Open Library matches all you typed, like the author", async () => {
    vi.stubEnv("BOOKS_PROVIDER", "live");
    const hosts: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = new URL(String(input));
        hosts.push(url.hostname);
        if (url.hostname === "openlibrary.org") {
          return Response.json({ docs: [{ key: "/works/OL5W", title: "Take the Lead", author_name: ["Someone Else"], edition_count: 9 }] });
        }
        return Response.json({
          items: [
            { id: "g1", volumeInfo: { title: "Take the Lead", authors: ["Betsy Myers"], publishedDate: "2011-09-13" } },
            // The one Open Library already had: not listed twice.
            { id: "g2", volumeInfo: { title: "Take the Lead", authors: ["Someone Else"] } },
          ],
        });
      }),
    );
    const hits = await findBooks({ q: "Take the lead betsy myers", typing: true }, 5);
    expect(hits.map((h) => [h.title, h.author])).toEqual([
      ["Take the Lead", "Betsy Myers"],
      ["Take the Lead", "Someone Else"],
    ]);
    expect(hits[1].key).toBe("ol:/works/OL5W");
    expect(hosts).toContain("www.googleapis.com");

    // When Open Library has it, Google isn't asked.
    hosts.length = 0;
    await findBooks({ q: "Take the lead someone", typing: true }, 5);
    expect(hosts.every((h) => h === "openlibrary.org")).toBe(true);
  });

  it("still answers when the half-word search fails", async () => {
    vi.stubEnv("BOOKS_PROVIDER", "live");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const q = new URL(String(input)).searchParams.get("q") ?? "";
        if (q.endsWith("*")) return new Response("bad query", { status: 400 });
        return Response.json({ docs: [{ key: "/works/OL9W", title: "Piranesi", edition_count: 40 }] });
      }),
    );
    expect((await findBooks({ q: "Piranesi", typing: true }, 5)).map((h) => h.title)).toEqual(["Piranesi"]);
  });
});
