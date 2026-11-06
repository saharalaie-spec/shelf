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

  it("doesn't let one stray subject on a long list add a tag", () => {
    // A children's classic whose subjects pick up an odd one along the way.
    const foxInSocks = [
      "Juvenile fiction",
      "Stories in rhyme",
      "Tongue twisters",
      "Children's fiction",
      "Picture books for children",
      "Juvenile literature",
      "Children's stories",
      "Christian life",
    ];
    expect(categorize(foxInSocks)).not.toContain("Religion & Spirituality");
    expect(categorize(foxInSocks)[0]).toBe("Children's");
    // Faith words count as whole words only.
    expect(categorize(["Tao Te Ching"])).toEqual(["Religion & Spirituality"]);
    expect(categorize(["Rotaoberflächen"])).toEqual([]);
    // Two strong tags both stay.
    expect(categorize(["History", "World War, 1939-1945", "Biography", "Personal narratives"])).toEqual(["History", "Biography & Memoir"]);
  });

  it("returns at most two categories, and none for unknown subjects", () => {
    expect(categorize(["History", "Philosophy", "Economics", "Poetry"]).length).toBeLessThanOrEqual(2);
    expect(categorize(["Accessible book", "Protected DAISY"])).toEqual([]);
  });
});
