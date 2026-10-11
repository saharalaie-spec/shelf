import { describe, expect, it } from "vitest";
import { isBookBarcode, parseCsv, parseLibraryExport, parseList } from "@/lib/parse";

describe("parseList", () => {
  it("takes one title per line and strips bullets, numbers and quotes", () => {
    expect(parseList("- Meditations\n2. “Sapiens”\n• 1984.\n\n[x] Dune")).toEqual([
      { title: "Meditations" },
      { title: "Sapiens" },
      { title: "1984" },
      { title: "Dune" },
    ]);
  });

  it("splits a single line on commas", () => {
    expect(parseList("Dune, The Stranger; 1984").map((c) => c.title)).toEqual(["Dune", "The Stranger", "1984"]);
  });

  it("keeps commas inside titles when there are several lines", () => {
    expect(parseList("Thinking, Fast and Slow\nGuns, Germs, and Steel").map((c) => c.title)).toEqual([
      "Thinking, Fast and Slow",
      "Guns, Germs, and Steel",
    ]);
  });

  it("reads 'by' and spaced dashes as the author", () => {
    expect(parseList("Sapiens by Yuval Noah Harari\nThe Stranger - Camus\nCatch-22")).toEqual([
      { title: "Sapiens", author: "Yuval Noah Harari" },
      { title: "The Stranger", author: "Camus" },
      { title: "Catch-22" },
    ]);
  });

  it("drops duplicates regardless of case", () => {
    expect(parseList("Dune\ndune\nDUNE")).toHaveLength(1);
  });
});

describe("parseCsv", () => {
  it("handles quotes, escaped quotes and newlines in fields", () => {
    expect(parseCsv('a,"b, c","say ""hi"""\r\n1,"two\nlines",3\n')).toEqual([
      ["a", "b, c", 'say "hi"'],
      ["1", "two\nlines", "3"],
    ]);
  });
});

describe("parseLibraryExport", () => {
  it("reads a Goodreads export, keeping only read books and cleaning ISBNs and series", () => {
    const csv = [
      "Book Id,Title,Author,ISBN,ISBN13,Exclusive Shelf",
      '1,"The Hobbit (Middle-earth, #0)",J.R.R. Tolkien,"=""0547928220""","=""9780547928227""",read',
      '2,Dune Messiah,Frank Herbert,"=""""","=""""",to-read',
      '3,Siddhartha,Hermann Hesse,"=""""","=""""",read',
    ].join("\n");
    expect(parseLibraryExport(csv)).toEqual({
      source: "goodreads",
      skipped: 1,
      items: [
        { title: "The Hobbit", author: "J.R.R. Tolkien", isbn: "9780547928227" },
        { title: "Siddhartha", author: "Hermann Hesse", isbn: undefined },
      ],
    });
  });

  it("reads a StoryGraph export", () => {
    const csv = "Title,Authors,ISBN/UID,Read Status\nDune,\"Frank Herbert, Someone\",9780441172719,read\nX,Y,,to-read";
    const result = parseLibraryExport(csv)!;
    expect(result.source).toBe("storygraph");
    expect(result.items).toEqual([{ title: "Dune", author: "Frank Herbert", isbn: "9780441172719" }]);
  });

  it("rejects files without a title column", () => {
    expect(parseLibraryExport("foo,bar\n1,2")).toBeNull();
  });
});

describe("isBookBarcode", () => {
  it("accepts Bookland EAN-13 only", () => {
    expect(isBookBarcode("9780812968255")).toBe(true);
    expect(isBookBarcode("4006381333931")).toBe(false);
  });
});
