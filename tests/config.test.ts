import { afterEach, describe, expect, it, vi } from "vitest";
import { databaseUrl, devCodeDelivery, isOwner, signInChannels } from "@/lib/config";

afterEach(() => vi.unstubAllEnvs());

describe("devCodeDelivery", () => {
  it("shows codes on screen in development", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(devCodeDelivery("+14155550132")).toBe("screen");
  });

  it("refuses in production unless ALLOW_DEV_CODES is set, and '1' means anyone, on screen", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ALLOW_DEV_CODES", "");
    expect(devCodeDelivery("+14155550132")).toBeNull();
    vi.stubEnv("ALLOW_DEV_CODES", "1");
    expect(devCodeDelivery("+14155550132")).toBe("screen");
  });

  it("sends listed numbers and emails to the server log, never the screen, however they're written", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ALLOW_DEV_CODES", "1 (415) 555-0132, Me@Example.com, +44 7911 123456");
    expect(devCodeDelivery("+14155550132")).toBe("log");
    expect(devCodeDelivery("me@example.com")).toBe("log");
    expect(devCodeDelivery("+447911123456")).toBe("log");
    expect(devCodeDelivery("+14155550199")).toBeNull();
    expect(devCodeDelivery("someone@else.com")).toBeNull();
  });

  it("warns about entries it can't read instead of guessing a country", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ALLOW_DEV_CODES", "(415) 555-0132");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(devCodeDelivery("+14155550132")).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("+<country code><number>"));
    warn.mockRestore();
  });
});

describe("signInChannels", () => {
  it("offers only the channels that can deliver a code", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ALLOW_DEV_CODES", "");
    vi.stubEnv("TWILIO_ACCOUNT_SID", "");
    vi.stubEnv("RESEND_API_KEY", "re_x");
    vi.stubEnv("EMAIL_FROM", "Trove <a@b.co>");
    expect(signInChannels()).toEqual({ phone: false, email: true });
  });
});

describe("databaseUrl", () => {
  it("uses a local file normally, Turso's variables when present, and nothing on Vercel by default", () => {
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("TURSO_DATABASE_URL", "");
    vi.stubEnv("VERCEL", "");
    expect(databaseUrl()).toBe("file:data/shelf.db");
    vi.stubEnv("VERCEL", "1");
    expect(databaseUrl()).toBeNull();
    vi.stubEnv("TURSO_DATABASE_URL", "libsql://trove-me.turso.io");
    expect(databaseUrl()).toBe("libsql://trove-me.turso.io");
  });
});

describe("isOwner", () => {
  it("matches OWNERS phone numbers and emails however they're written, and nobody when it's unset", () => {
    vi.stubEnv("OWNERS", "");
    expect(isOwner({ phone: "+14155550132", email: null })).toBe(false);
    vi.stubEnv("OWNERS", "14155550132, Me@Example.com");
    expect(isOwner({ phone: "+14155550132", email: null })).toBe(true);
    expect(isOwner({ phone: null, email: "me@example.com" })).toBe(true);
    expect(isOwner({ phone: "+14155550199", email: null })).toBe(false);
  });
});
