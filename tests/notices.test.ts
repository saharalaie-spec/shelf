import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";

const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    set: (name: string, value: string) => jar.set(name, value),
    delete: (name: string) => jar.delete(name),
  }),
}));

let auth: typeof import("@/lib/auth");
let social: typeof import("@/lib/social");
let notices: typeof import("@/lib/notices");
let db: typeof import("@/lib/db").db;

let n = 0;
/** Someone already on Trove; `daysAgo` is when they joined. */
async function person(name: string, daysAgo = 30) {
  const id = `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
  const phone = `+1415555${String(1300 + n)}`;
  const created = Date.now() - daysAgo * 24 * 60 * 60 * 1000;
  await (await db()).execute({ sql: "INSERT INTO users (id, phone, name, created_at) VALUES (?, ?, ?, ?)", args: [id, phone, name, created] });
  return { id, phone, email: null, name, handle: null, isPublic: false, shareActivity: true, started: true, photo: null };
}

/** Signs up the way people do: a code, then in. */
async function signUp(phone: string, name: string) {
  const to = { kind: "phone" as const, value: phone, display: phone };
  const { devCode } = await auth.startLogin(to);
  await auth.verifyLogin(to, devCode!);
  const client = await db();
  const row = (await client.execute({ sql: "SELECT id FROM users WHERE phone = ?", args: [phone] })).rows[0];
  await client.execute({ sql: "UPDATE users SET name = ? WHERE id = ?", args: [name, row.id] });
  return { id: String(row.id), phone, email: null, name, handle: null, isPublic: false, shareActivity: true, started: false, photo: null };
}

const kinds = async (userId: string) => (await notices.unseenNotices(userId)).map((x) => [x.kind, x.friend.name]);

beforeAll(async () => {
  process.env.DATABASE_URL = `file:${join(mkdtempSync(join(tmpdir(), "trove-notices-")), "test.db")}`;
  db = (await import("@/lib/db")).db;
  auth = await import("@/lib/auth");
  social = await import("@/lib/social");
  notices = await import("@/lib/notices");
});

describe("news about people you invited", () => {
  it("tells you when someone joins from your invite link, or uses it while already here", async () => {
    const ana = await person("Ana");
    const bo = await signUp("+14155551401", "Bo");
    await social.acceptInvite(bo, await social.inviteToken(ana.id));
    expect(await kinds(ana.id)).toEqual([["joined_invite", "Bo"]]);
    // The one who joined isn't told about themselves.
    expect(await kinds(bo.id)).toEqual([]);

    const cy = await person("Cy", 90);
    await social.acceptInvite(cy, await social.inviteToken(ana.id));
    expect((await kinds(ana.id)).map(([k]) => k).sort()).toEqual(["added_invite", "joined_invite"]);
  });

  it("tells you when someone you asked by phone joins, then when they say yes, one at a time", async () => {
    const dee = await person("Dee");
    await social.requestByIdentifier(dee, "+14155551402");
    expect(await kinds(dee.id)).toEqual([]);

    const eli = await signUp("+14155551402", "Eli");
    expect(await kinds(dee.id)).toEqual([["joined_waiting", "Eli"]]);

    const [req] = await social.incomingRequests(eli);
    await social.respondToRequest(eli, req.id, "accept");
    // The newer news replaces what she hadn't seen yet.
    expect(await kinds(dee.id)).toEqual([["accepted", "Eli"]]);

    // Put away: gone.
    const [notice] = await notices.unseenNotices(dee.id);
    await notices.markNoticesSeen(dee.id, [notice.id]);
    expect(await kinds(dee.id)).toEqual([]);
  });

  it("tells you when someone asks you back", async () => {
    const fay = await person("Fay");
    const gus = await person("Gus");
    await social.requestByUserId(fay, gus.id);
    await social.requestByUserId(gus, fay.id);
    expect(await social.areFriends(fay.id, gus.id)).toBe(true);
    expect(await kinds(fay.id)).toEqual([["accepted", "Gus"]]);
  });
});
