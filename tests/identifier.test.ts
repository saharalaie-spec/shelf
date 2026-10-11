import { describe, expect, it } from "vitest";
import { looksLikeEmail, parseIdentifier } from "@/lib/identifier";

describe("parseIdentifier", () => {
  it("normalizes emails", () => {
    expect(parseIdentifier("  Sahar@Example.COM ")).toEqual({ kind: "email", value: "sahar@example.com", display: "sahar@example.com" });
    expect(parseIdentifier("sahar@example")).toBeNull();
  });

  it("normalizes phone numbers to E.164 using the chosen country", () => {
    expect(parseIdentifier("(415) 555-0132", "US")?.value).toBe("+14155550132");
    expect(parseIdentifier("07911 123456", "GB")?.value).toBe("+447911123456");
    expect(parseIdentifier("+44 7911 123456", "US")?.value).toBe("+447911123456");
    expect(parseIdentifier("123", "US")).toBeNull();
  });

  it("spots when someone is typing an email into the phone field", () => {
    expect(looksLikeEmail("sa")).toBe(true);
    expect(looksLikeEmail("+1 415")).toBe(false);
  });
});
