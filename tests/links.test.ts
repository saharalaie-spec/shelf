import { afterEach, describe, expect, it, vi } from "vitest";
import { origin } from "@/lib/api";

afterEach(() => vi.unstubAllEnvs());

describe("links people share", () => {
  const fromPreview = new Request("https://trove-x1y2z3-saharalaie-1767s-projects.vercel.app/api/friends");

  it("use the site's production address, even when opened on a Vercel preview or deployment address", () => {
    vi.stubEnv("APP_URL", "");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "shelf-eight-delta.vercel.app");
    expect(origin(fromPreview)).toBe("https://shelf-eight-delta.vercel.app");
  });

  it("use APP_URL (your own domain) over everything", () => {
    vi.stubEnv("APP_URL", "https://trove.example/");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "shelf-eight-delta.vercel.app");
    expect(origin(fromPreview)).toBe("https://trove.example");
  });

  it("in development, use the address it was opened on", () => {
    vi.stubEnv("APP_URL", "");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "");
    expect(origin(new Request("http://localhost:3000/api/friends"))).toBe("http://localhost:3000");
  });
});
