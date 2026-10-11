import { afterEach, describe, expect, it, vi } from "vitest";
import { databaseUrl, devCodesAllowedFor, signInChannels } from "@/lib/config";

afterEach(() => vi.unstubAllEnvs());

describe("devCodesAllowedFor", () => {
  it("always allows on-screen codes in development", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(devCodesAllowedFor("+14155550132")).toBe(true);
  });

  it("refuses them in production unless ALLOW_DEV_CODES is set", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ALLOW_DEV_CODES", "");
    expect(devCodesAllowedFor("+14155550132")).toBe(false);
    vi.stubEnv("ALLOW_DEV_CODES", "1");
    expect(devCodesAllowedFor("+14155550132")).toBe(true);
  });

  it("limits them to listed numbers and emails, however they're written", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ALLOW_DEV_CODES", "+1 (415) 555-0132, Me@Example.com");
    expect(devCodesAllowedFor("+14155550132")).toBe(true);
    expect(devCodesAllowedFor("me@example.com")).toBe(true);
    expect(devCodesAllowedFor("+14155550199")).toBe(false);
    expect(devCodesAllowedFor("someone@else.com")).toBe(false);
  });
});

describe("signInChannels", () => {
  it("offers only the channels that can deliver a code", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ALLOW_DEV_CODES", "");
    vi.stubEnv("TWILIO_ACCOUNT_SID", "");
    vi.stubEnv("RESEND_API_KEY", "re_x");
    vi.stubEnv("EMAIL_FROM", "Shelf <a@b.co>");
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
    vi.stubEnv("TURSO_DATABASE_URL", "libsql://shelf-me.turso.io");
    expect(databaseUrl()).toBe("libsql://shelf-me.turso.io");
  });
});
