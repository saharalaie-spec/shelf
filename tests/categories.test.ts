import { describe, expect, it } from "vitest";
import { categorize } from "@/lib/categories";

describe("categorize", () => {
  it("maps catalog subjects to friendly categories", () => {
    expect(categorize(["Stoics", "Ethics", "Philosophy, Ancient"])[0]).toBe("Philosophy");
    expect(categorize(["Thought and thinking", "Decision making", "Cognitive psychology"])).toEqual(["Psychology"]);
  });

  it("lets a genre win over plain Fiction", () => {
    expect(categorize(["Fiction", "Science fiction", "Space opera"])).toEqual(["Science Fiction"]);
  });

  it("doesn't read 'science fiction' or 'political science' as Science", () => {
    expect(categorize(["Science fiction"])).not.toContain("Science");
    expect(categorize(["Political science"])).toEqual(["Politics & Society"]);
  });

  it("returns at most two categories, and none for unknown subjects", () => {
    expect(categorize(["History", "Philosophy", "Economics", "Poetry"]).length).toBeLessThanOrEqual(2);
    expect(categorize(["Accessible book", "Protected DAISY"])).toEqual([]);
  });
});
