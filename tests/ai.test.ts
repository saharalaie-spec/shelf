import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import { aiProblem, cleanKey, keyShape } from "@/lib/ai";
import { AuthError } from "@/lib/auth";

const body = (message: string) => ({ type: "error", error: { type: "invalid_request_error", message } });

describe("aiProblem", () => {
  vi.spyOn(console, "error").mockImplementation(() => {});

  it("says what to fix instead of a bare failure", () => {
    const bad = aiProblem(new Anthropic.AuthenticationError(401, body("invalid x-api-key"), undefined, new Headers()));
    expect(bad).toBeInstanceOf(AuthError);
    expect((bad as AuthError).message).toMatch(/rejected the API key/);

    const broke = aiProblem(
      new Anthropic.BadRequestError(400, body("Your credit balance is too low to access the Anthropic API."), undefined, new Headers()),
    );
    expect((broke as AuthError).message).toMatch(/out of credit/);

    const other = aiProblem(new Anthropic.BadRequestError(400, body("fallbacks: unknown field"), undefined, new Headers()));
    expect((other as AuthError).message).toBe("Claude couldn’t do that: fallbacks: unknown field");
  });

  it("leaves other errors alone", () => {
    const err = new Error("db down");
    expect(aiProblem(err)).toBe(err);
  });
});

describe("cleanKey", () => {
  it("drops what a paste can add around the key", () => {
    expect(cleanKey("sk-ant-api03-abc\n")).toBe("sk-ant-api03-abc");
    expect(cleanKey(' "sk-ant-api03-abc" ')).toBe("sk-ant-api03-abc");
    expect(cleanKey("")).toBeUndefined();
  });
});

describe("keyShape", () => {
  it("shows only the public prefix and the length", () => {
    expect(keyShape("apikey_01AbCdEf")).toBe("The key here starts with “apikey_…” and is 15 characters; a real one starts with “sk-ant-api03-” and is about 100.");
    expect(keyShape(`sk-ant-api03-${"x".repeat(95)}`)).toMatch(/starts with “sk-ant-api03-…” and is 108 characters/);
    expect(keyShape(undefined)).toMatch(/isn’t set/);
  });
});
