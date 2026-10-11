import { describe, expect, it } from "vitest";
import { matchCandidates, splitTitleAuthor } from "@/lib/books";

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
