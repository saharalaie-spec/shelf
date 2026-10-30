import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { computeNumbers, dayKey, type MetricsInput, type MetricsUser } from "@/lib/metrics";

const TZ = "America/New_York";
const DAY = 24 * 60 * 60 * 1000;
// Friday Oct 24, 2026, noon in New York.
const NOW = Date.parse("2026-10-24T16:00:00Z");
const SINCE = NOW - 70 * DAY;

const user = (id: string, joinedDaysAgo: number, extra: Partial<MetricsUser> = {}): MetricsUser => ({
  id,
  name: id,
  createdAt: NOW - joinedDaysAgo * DAY,
  invitedBy: null,
  cameVia: null,
  counted: true,
  ...extra,
});
const input = (over: Partial<MetricsInput>): MetricsInput => ({
  users: [],
  activity: [],
  itemEvents: [],
  thanks: [],
  friendships: [],
  savedFromFriends: [],
  since: SINCE,
  now: NOW,
  timeZone: TZ,
  ...over,
});
const ev = (action: string, userId: string | null, daysAgo: number, extra: { visitor?: string; ref?: string } = {}) => ({
  action,
  userId,
  at: NOW - daysAgo * DAY,
  visitor: extra.visitor ?? null,
  ref: extra.ref ?? null,
});

describe("days", () => {
  it("are counted in the chosen time zone", () => {
    // 11pm in New York is already the next day in UTC.
    expect(dayKey(Date.parse("2026-10-24T03:00:00Z"), TZ)).toBe("2026-10-23");
    expect(dayKey(Date.parse("2026-10-24T03:00:00Z"), "UTC")).toBe("2026-10-24");
  });
});

describe("active", () => {
  it("means doing something, not just opening the app", () => {
    const n = computeNumbers(
      input({
        users: [user("looker", 30), user("saver", 30), user("asker", 30), user("thanker", 30)],
        activity: [ev("visit", "looker", 0), ev("visit", "saver", 0), ev("next_open", "asker", 0)],
        itemEvents: [{ userId: "saver", at: NOW - 1000 }],
        thanks: [{ userId: "thanker", at: NOW - 1000 }],
      }),
    );
    expect(n.today).toEqual({ visited: 4, active: 3 });
  });

  it("counts a person once a day, and tracks how many days of the week they were active", () => {
    const n = computeNumbers(
      input({
        users: [user("a", 30), user("b", 30)],
        itemEvents: [0, 0, 1, 2].map((d) => ({ userId: "a", at: NOW - d * DAY })).concat([{ userId: "b", at: NOW - 3 * DAY }]),
      }),
    );
    expect(n.today.active).toBe(1);
    expect(n.week.active).toBe(2);
    // a: 3 days, b: 1 day.
    expect(n.week.daysPerActive).toBe(2);
  });

  it("leaves out people who aren't counted, and anything before counting started", () => {
    const n = computeNumbers(
      input({
        users: [user("owner", 30, { counted: false }), user("old", 300)],
        itemEvents: [
          { userId: "owner", at: NOW - 1000 },
          { userId: "old", at: SINCE - DAY },
        ],
      }),
    );
    expect(n.week.active).toBe(0);
    expect(n.days.every((d) => d.active === 0)).toBe(true);
  });

  it("only lists days and weeks since counting started", () => {
    const n = computeNumbers(input({ since: NOW - 2 * DAY }));
    expect(n.days.map((d) => d.day)).toEqual(["2026-10-22", "2026-10-23", "2026-10-24"]);
    // Oct 22 is a Thursday: its week started Monday Oct 19.
    expect(n.weeks.map((w) => w.start)).toEqual(["2026-10-19"]);
  });
});

describe("joining and invites", () => {
  const people = [
    user("owner", 60, { counted: false, name: "Sahar" }),
    user("ana", 10, { invitedBy: "owner", cameVia: "invite" }),
    user("ben", 3, { invitedBy: "ana", cameVia: "invite" }),
    user("cy", 2, { invitedBy: "ana", cameVia: "share" }),
    user("dee", 1),
    user("ed", 40),
  ];
  const n = computeNumbers(
    input({
      users: people,
      activity: [
        // Three browsers opened invite links; one opened twice, one opened a shared list (not an invite).
        ev("link_open", null, 10, { visitor: "v1", ref: "invite:aaa" }),
        ev("link_open", null, 3, { visitor: "v2", ref: "invite:bbb" }),
        ev("link_open", null, 3, { visitor: "v2", ref: "invite:bbb" }),
        ev("link_open", null, 2, { visitor: "v3", ref: "invite:bbb" }),
        ev("link_open", null, 2, { visitor: "v4", ref: "share:xyz" }),
        ev("invite_share", "ana", 4, { ref: "share" }),
        ev("invite_share", "ana", 4, { ref: "copy" }),
        ev("invite_share", "owner", 4, { ref: "copy" }),
        // A new account adding its inviter is a sign-up; someone already here adding a friend is a connection.
        ev("friend_added", "ben", 3),
        ev("friend_added", "ed", 1),
      ],
    }),
  );

  it("counts who joined through a friend, the owner's invitees included", () => {
    const joined = n.weeks.reduce((s, w) => s + w.joined, 0);
    const viaFriend = n.weeks.reduce((s, w) => s + w.throughFriend, 0);
    expect([joined, viaFriend]).toEqual([5, 3]);
    expect(n.topInviters).toEqual([
      { name: "ana", joined: 2 },
      { name: "Sahar", joined: 1 },
    ]);
  });

  it("converts invite opens by person, not by click", () => {
    expect(n.invites.opens).toBe(3);
    expect(n.invites.joins).toBe(2);
    expect(n.invites.conversion).toBeCloseTo(2 / 3);
    expect(n.invites.otherLinkJoins).toBe(1);
    // The owner's own shares aren't counted.
    expect(n.invites.shares).toBe(2);
    expect(n.invites.connections).toBe(1);
  });
});

describe("coming back", () => {
  it("waits until a whole join week has had the window, then counts who was active in it", () => {
    const n = computeNumbers(
      input({
        users: [user("back", 40), user("gone", 40), user("new", 2)],
        itemEvents: [
          { userId: "back", at: NOW - 40 * DAY },
          { userId: "back", at: NOW - 31 * DAY },
          { userId: "gone", at: NOW - 40 * DAY },
        ],
      }),
    );
    const old = n.cohorts.find((c) => c.joined === 2)!;
    expect(old.backAfterWeek).toBe(0.5);
    // A month needs day 59 to have passed for the whole week.
    expect(old.backAfterMonth).toBeNull();
    const recent = n.cohorts.find((c) => c.joined === 1)!;
    expect(recent.backAfterWeek).toBeNull();
  });
});

// Arriving on a friend's link, then signing up, records who brought them in.
const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    set: (name: string, value: string) => jar.set(name, value),
    delete: (name: string) => jar.delete(name),
  }),
}));

describe("is it working", () => {
  it("counts who has 3+ friends, who's active, and what's saved from friends", () => {
    const people = ["a", "b", "c", "d", "e"].map((id) => user(id, 30));
    const pair = (x: string, y: string) => [
      { userId: x, friendId: y },
      { userId: y, friendId: x },
    ];
    const n = computeNumbers(
      input({
        // a knows b, c and d; b, c and d know a and each other a little; e knows no one. "owner" isn't counted.
        users: [...people, user("owner", 60, { counted: false })],
        friendships: [...pair("a", "b"), ...pair("a", "c"), ...pair("a", "d"), ...pair("b", "c"), ...pair("b", "owner")],
        itemEvents: [
          { userId: "a", at: NOW - 1 * DAY },
          { userId: "b", at: NOW - 2 * DAY },
          { userId: "owner", at: NOW - 1 * DAY },
        ],
        savedFromFriends: [
          { userId: "a", at: NOW - 1 * DAY },
          { userId: "a", at: NOW - 3 * DAY },
          { userId: "b", at: NOW - 2 * DAY },
          // Last month: not this week, but in its week's row.
          { userId: "b", at: NOW - 20 * DAY },
          { userId: "owner", at: NOW - 1 * DAY },
        ],
      }),
    );
    expect(n.goals).toEqual({
      people: 5,
      // a: b, c, d · b: a, c, owner · c: a, b · d: a · e: nobody
      friends: { none: 1, few: 2, threePlus: 2 },
      connected: 2 / 5,
      activeWeekly: 2 / 5,
      savedFromFriends: 3,
      savedPerActive: 3 / 2,
    });
    expect(n.weeks.reduce((sum, w) => sum + w.savedFromFriends, 0)).toBe(4);
  });

  it("has nothing to say before anyone's here", () => {
    const { goals } = computeNumbers(input({}));
    expect(goals).toMatchObject({ people: 0, connected: null, activeWeekly: null, savedPerActive: null });
  });
});

describe("signing up through an invite", () => {
  let auth: typeof import("@/lib/auth");
  let activity: typeof import("@/lib/activity");
  let db: typeof import("@/lib/db").db;

  beforeAll(async () => {
    process.env.DATABASE_URL = `file:${join(mkdtempSync(join(tmpdir(), "trove-metrics-")), "test.db")}`;
    auth = await import("@/lib/auth");
    activity = await import("@/lib/activity");
    db = (await import("@/lib/db")).db;
  });

  it("notes the inviter on the new account and counts the open once", async () => {
    const client = await db();
    await client.execute(`INSERT INTO users (id, phone, name, invite_token, created_at) VALUES ('host', '+14155550700', 'Host', 'tok123', 1)`);
    await activity.arrivedVia("invite:tok123");
    await activity.arrivedVia("invite:tok123");
    await activity.arrivedVia("invite:made-up");

    const to = { kind: "phone" as const, value: "+14155550701", display: "" };
    const { devCode } = await auth.startLogin(to);
    const { isNew } = await auth.verifyLogin(to, devCode!);
    expect(isNew).toBe(true);

    const joined = (await client.execute(`SELECT invited_by, came_via FROM users WHERE phone = '+14155550701'`)).rows[0];
    expect([joined.invited_by, joined.came_via]).toEqual(["host", "invite"]);
    const opens = await client.execute(`SELECT COUNT(*) AS n FROM activity WHERE action = 'link_open'`);
    expect(Number(opens.rows[0].n)).toBe(1);
    const signups = await client.execute(`SELECT ref FROM activity WHERE action = 'signup'`);
    expect(signups.rows.map((r) => r.ref)).toEqual(["invite:tok123"]);
    // Used once: a second account on this browser isn't credited to the same invite.
    expect(jar.has("trove_via")).toBe(false);

    // Juno doesn't count: being her friend, or saving her picks, isn't the real thing.
    const { SAMPLE_FRIEND_ID } = await import("@/lib/sample");
    const guest = String((await client.execute(`SELECT id FROM users WHERE phone = '+14155550701'`)).rows[0].id);
    const now = Date.now();
    await client.batch(
      [
        { sql: "INSERT INTO users (id, name, created_at) VALUES (?, 'Juno', 1) ON CONFLICT DO NOTHING", args: [SAMPLE_FRIEND_ID] },
        ...[
          ["host", guest],
          [guest, "host"],
          [guest, SAMPLE_FRIEND_ID],
        ].map(([a, b]) => ({ sql: "INSERT INTO friendships (user_id, friend_id, created_at) VALUES (?, ?, ?)", args: [a, b, now] })),
        ...[
          ["s1", "host"],
          ["s2", SAMPLE_FRIEND_ID],
        ].map(([id, from]) => ({
          sql: `INSERT INTO books (id, user_id, kind, work_key, title, added_at, status, status_at, rec_user_id)
                VALUES (?, ?, 'book', ?, 'A pick', ?, 'want', ?, ?)`,
          args: [id, guest, `typed:book:${id}`, now, now, from],
        })),
      ],
      "write",
    );
    const { loadNumbers } = await import("@/lib/numbers");
    const { goals } = await loadNumbers();
    expect(goals.friends.few).toBeGreaterThanOrEqual(1);
    expect(goals.savedFromFriends).toBe(1);
  });
});
