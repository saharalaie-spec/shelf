import { describe, expect, it } from "vitest";
import { spotTally, troveCount, troveTitle, VOCAB } from "@/lib/kinds";

describe("share titles", () => {
  it("name the owner and what's shared", () => {
    expect(troveTitle("Sahar", "Philosophy", "read", "book")).toBe("Sahar’s Philosophy books");
    expect(troveTitle("Sahar", null, "read", "book")).toBe("Sahar’s books");
    expect(troveTitle("Sahar", null, "want", "screen")).toBe("Sahar’s watchlist");
    expect(troveTitle("Sahar", null, "reading", "podcast")).toBe("What Sahar’s listening to");
  });

  it("read naturally without a name", () => {
    expect(troveTitle(null, "Philosophy", "read", "book")).toBe("Philosophy books");
    expect(troveTitle(null, null, "read", "podcast")).toBe("Favorite podcasts");
    expect(troveTitle(null, null, "want", "screen")).toBe("A watchlist");
  });
});

describe("places wording", () => {
  it("titles a shared destination after its owner, whatever the spots are marked", () => {
    expect(troveTitle("Sahar", "Valencia", "read", "place")).toBe("Sahar’s Valencia");
    expect(troveTitle("Sahar", "Valencia", "want", "place")).toBe("Sahar’s Valencia");
    expect(troveTitle("Sahar", null, "read", "place")).toBe("Sahar’s places");
    expect(troveTitle(null, "Valencia", "read", "place")).toBe("Spots in Valencia");
    expect(troveCount(3, "read", "place")).toBe("3 spots");
  });

  it("counts been and want to go", () => {
    expect(spotTally([{ status: "read" }, { status: "read" }, { status: "want" }])).toBe("2 been · 1 want to go");
    expect(spotTally([{ status: "want" }])).toBe("1 want to go");
    expect(spotTally([])).toBe("");
  });

  it("offers only Been and Want to go for places", () => {
    expect(VOCAB.place.statuses.map((s) => VOCAB.place.sections[s])).toEqual(["Been", "Want to go"]);
    expect(VOCAB.book.statuses).toEqual(["read", "reading", "want"]);
  });
});

describe("moods and occasions", () => {
  it("places go by the occasion, everything else by mood", async () => {
    const { isMood, moodsFor } = await import("@/lib/moods");
    expect(moodsFor("place")).toContain("date");
    expect(moodsFor("book")).not.toContain("date");
    expect(isMood("celebrate", "place")).toBe(true);
    expect(isMood("celebrate", "podcast")).toBe(false);
    expect(isMood("lighter", "place")).toBe(false);
    expect(isMood("any", "screen")).toBe(true);
  });
});

describe("movie or TV show", () => {
  it("tells them apart from the catalog, the source, or the label", async () => {
    const { screenFormat } = await import("@/lib/kinds");
    expect(screenFormat({ key: "fx:screen:x", categories: ["TV", "Drama"], author: null })).toBe("tv");
    expect(screenFormat({ key: "tmdb:movie:1", categories: [], author: null })).toBe("movie");
    expect(screenFormat({ key: "tvmaze:5", categories: [], author: null })).toBe("tv");
    expect(screenFormat({ key: "sample:screen:pastlives", categories: ["Drama"], author: "Movie · Celine Song" })).toBe("movie");
    expect(screenFormat({ key: "typed:screen:x|", categories: [], author: null })).toBeNull();
  });
});
