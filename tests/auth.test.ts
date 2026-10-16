import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";

// Sessions are set as cookies; outside a request there's no cookie jar, so stub one.
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }),
}));

let auth: typeof import("@/lib/auth");

beforeAll(async () => {
  process.env.DATABASE_URL = `file:${join(mkdtempSync(join(tmpdir(), "trove-auth-")), "test.db")}`;
  auth = await import("@/lib/auth");
});

const phone = (n: number) => ({ kind: "phone" as const, value: `+1415555${String(n).padStart(4, "0")}`, display: "" });
const reasons = (results: PromiseSettledResult<unknown>[]) =>
  results.map((r) => (r.status === "fulfilled" ? "ok" : (r.reason as Error).message));

describe("login codes under concurrent requests", () => {
  it("checks at most 5 guesses per code, even when they arrive at once", async () => {
    const to = phone(1);
    const { devCode } = await auth.startLogin(to);
    const wrong = devCode === "000000" ? "111111" : "000000";
    const results = reasons(await Promise.allSettled(Array.from({ length: 20 }, () => auth.verifyLogin(to, wrong))));
    expect(results.filter((r) => r.includes("didn’t match"))).toHaveLength(5);
    // The right code no longer works once the tries are used up.
    await expect(auth.verifyLogin(to, devCode!)).rejects.toThrow(/Too many tries/);
  });

  it("lets a code sign in only once", async () => {
    const to = phone(2);
    const { devCode } = await auth.startLogin(to);
    const results = reasons(await Promise.allSettled([1, 2, 3].map(() => auth.verifyLogin(to, devCode!))));
    expect(results.filter((r) => r === "ok")).toHaveLength(1);
  });

  it("sends one code for a burst of requests, then makes you wait", async () => {
    const to = phone(3);
    const results = reasons(await Promise.allSettled(Array.from({ length: 8 }, () => auth.startLogin(to))));
    expect(results.filter((r) => r === "ok")).toHaveLength(1);
    expect(results.filter((r) => r.includes("Hang on"))).toHaveLength(7);
  });

  it("allows 5 sends per 15 minutes, then opens up again", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      const to = phone(4);
      for (let i = 0; i < 5; i++) {
        await auth.startLogin(to);
        vi.advanceTimersByTime(21_000);
      }
      await expect(auth.startLogin(to)).rejects.toThrow(/Too many codes/);
      vi.advanceTimersByTime(15 * 60_000);
      await expect(auth.startLogin(to)).resolves.toBeDefined();
    } finally {
      vi.useRealTimers();
    }
  });
});
