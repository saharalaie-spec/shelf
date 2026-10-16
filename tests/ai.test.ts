import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import { aiProblem } from "@/lib/ai";
import { AuthError } from "@/lib/auth";

const body = (message: string) => ({ type: "error", error: { type: "invalid_request_error", message } });

describe("aiProblem", () => {
  vi.spyOn(console, "error").mockImplementation(() => {});

  it("says what to fix instead of a bare failure", () => {
    const bad = aiProblem(new Anthropic.AuthenticationError(401, body("invalid x-api-key"), undefined, new Headers()));
    expect(bad).toBeInstanceOf(AuthError);
    expect((bad as AuthError).message).toMatch(/API key was rejected/);

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
