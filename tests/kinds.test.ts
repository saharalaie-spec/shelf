import { describe, expect, it } from "vitest";
import { shelfCount, shelfTitle, spotTally, VOCAB } from "@/lib/kinds";

describe("places wording", () => {
  it("titles a shared destination after its owner, whatever the spots are marked", () => {
    expect(shelfTitle("Sahar", "Valencia", "read", "place")).toBe("Sahar’s Valencia");
    expect(shelfTitle("Sahar", "Valencia", "want", "place")).toBe("Sahar’s Valencia");
    expect(shelfTitle("Sahar", null, "read", "place")).toBe("Sahar’s places");
    expect(shelfTitle(null, "Valencia", "read", "place")).toBe("Spots in Valencia");
    expect(shelfCount(3, "read", "place")).toBe("3 spots");
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
