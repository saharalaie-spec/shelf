/**
 * The numbers page: who joined through a friend, how invites convert, and who's active.
 *
 * - Visited: opened Trove while signed in that day.
 * - Active: did something that's Trove's point that day: saved something, started or finished something, looked
 *   through a friend's trove, used "Stuck on what's next?", told a friend you loved their pick, or added a friend.
 *
 * Days are counted in one time zone (TIME_ZONE). The owners, NOT_COUNTED test accounts and the sample friend are
 * left out before anything is counted. `computeNumbers` is pure, so it can be tested; `loadNumbers` feeds it.
 */

export type MetricsUser = {
  id: string;
  name: string | null;
  createdAt: number;
  invitedBy: string | null;
  cameVia: string | null;
  /** False for the owners, test accounts and the sample friend: they can still have invited someone. */
  counted: boolean;
};
export type MetricsEvent = { userId: string | null; visitor: string | null; action: string; ref: string | null; at: number };

export type MetricsInput = {
  users: MetricsUser[];
  /** Rows of the activity table. */
  activity: MetricsEvent[];
  /** When someone added or moved something (item_events). */
  itemEvents: { userId: string; at: number }[];
  /** When someone told a friend they loved their pick. */
  thanks: { userId: string; at: number }[];
  /** When counting started: nothing before this was recorded. */
  since: number;
  now: number;
  timeZone: string;
};

/** Actions that make a day "active" (saves, moves and thank-yous come from their own tables). */
const MEANINGFUL = new Set(["friend_added", "friend_trove", "next_open", "ideas", "ask"]);
const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKS = 8;
const DAYS = 14;

export type WeekRow = {
  /** Monday the week starts, "2026-10-19". */
  start: string;
  joined: number;
  throughFriend: number;
  inviteShares: number;
  /** Different people (browsers) who opened an invite link while signed out. */
  inviteOpens: number;
  /** New accounts that came in on an invite link. */
  inviteJoins: number;
  /** Friends added by people who were already on Trove. */
  connections: number;
  active: number;
  visited: number;
};

export type Numbers = {
  since: number;
  timeZone: string;
  today: { visited: number; active: number };
  /** The last seven days, today included. */
  week: { visited: number; active: number; daysPerActive: number };
  days: { day: string; visited: number; active: number }[];
  weeks: WeekRow[];
  invites: { shares: number; opens: number; joins: number; conversion: number | null; otherLinkJoins: number; connections: number };
  topInviters: { name: string; joined: number }[];
  cohorts: { start: string; joined: number; backAfterWeek: number | null; backAfterMonth: number | null }[];
};

/** "2026-10-24" for a moment, in the given time zone. */
export function dayKey(at: number, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}

/** Days from one day key to another. */
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / DAY_MS);
const addDays = (key: string, n: number) => new Date(Date.parse(key) + n * DAY_MS).toISOString().slice(0, 10);
/** The Monday on or before a day. */
const weekOf = (key: string) => addDays(key, -((new Date(Date.parse(key)).getUTCDay() + 6) % 7));

export function computeNumbers(input: MetricsInput): Numbers {
  const tz = input.timeZone;
  const day = (at: number) => dayKey(at, tz);
  const today = day(input.now);
  // Days before counting started weren't recorded: leave them off rather than show zeros.
  const firstDay = day(input.since);
  const people = new Map(input.users.map((u) => [u.id, u]));
  const counted = (id: string | null): id is string => id !== null && people.get(id)?.counted === true;

  // Who was active, and who visited, on which days.
  const active = new Map<string, Set<string>>(); // day -> people
  const visited = new Map<string, Set<string>>();
  const mark = (map: Map<string, Set<string>>, d: string, id: string) => {
    if (!map.has(d)) map.set(d, new Set());
    map.get(d)!.add(id);
  };
  const markActive = (id: string, at: number) => {
    if (at < input.since) return;
    mark(active, day(at), id);
    mark(visited, day(at), id);
  };
  for (const e of input.itemEvents) if (counted(e.userId)) markActive(e.userId, e.at);
  for (const t of input.thanks) if (counted(t.userId)) markActive(t.userId, t.at);
  for (const e of input.activity) {
    if (!counted(e.userId)) continue;
    if (MEANINGFUL.has(e.action)) markActive(e.userId, e.at);
    else if (e.action === "visit" && e.at >= input.since) mark(visited, day(e.at), e.userId);
  }
  const size = (map: Map<string, Set<string>>, d: string) => map.get(d)?.size ?? 0;
  const across = (map: Map<string, Set<string>>, from: string, to: string) => {
    const all = new Set<string>();
    for (let d = from; d <= to; d = addDays(d, 1)) for (const id of map.get(d) ?? []) all.add(id);
    return all;
  };

  // The last seven days, and how many of them each active person was active on.
  const weekStart = addDays(today, -6);
  const weekActive = across(active, weekStart, today);
  let activeDays = 0;
  for (let d = weekStart; d <= today; d = addDays(d, 1)) activeDays += size(active, d);

  const days = Array.from({ length: DAYS }, (_, i) => addDays(today, i - DAYS + 1))
    .filter((d) => d >= firstDay)
    .map((d) => ({
    day: d,
    visited: size(visited, d),
    active: size(active, d),
  }));

  // Week by week.
  const thisWeek = weekOf(today);
  const weekStarts = Array.from({ length: WEEKS }, (_, i) => addDays(thisWeek, (i - WEEKS + 1) * 7)).filter(
    (start) => addDays(start, 6) >= firstDay,
  );
  const rows = new Map<string, WeekRow>(
    weekStarts.map((start) => {
      const end = addDays(start, 6);
      return [
        start,
        {
          start,
          joined: 0,
          throughFriend: 0,
          inviteShares: 0,
          inviteOpens: 0,
          inviteJoins: 0,
          connections: 0,
          active: across(active, start, end).size,
          visited: across(visited, start, end).size,
        },
      ];
    }),
  );
  const rowFor = (at: number) => rows.get(weekOf(day(at)));

  const joinedSince = input.users.filter((u) => u.counted && u.createdAt >= input.since);
  for (const u of joinedSince) {
    const row = rowFor(u.createdAt);
    if (!row) continue;
    row.joined++;
    if (u.invitedBy) row.throughFriend++;
    if (u.cameVia === "invite") row.inviteJoins++;
  }

  const opened = new Map<string, Set<string>>(); // week -> visitors
  let shares = 0;
  let connections = 0;
  const allOpens = new Set<string>();
  for (const e of input.activity) {
    if (e.at < input.since) continue;
    const row = rowFor(e.at);
    if (e.action === "link_open" && e.visitor && e.ref?.startsWith("invite:")) {
      allOpens.add(e.visitor);
      if (row) {
        if (!opened.has(row.start)) opened.set(row.start, new Set());
        opened.get(row.start)!.add(e.visitor);
      }
    } else if (e.action === "invite_share" && counted(e.userId)) {
      shares++;
      if (row) row.inviteShares++;
    } else if (e.action === "friend_added" && counted(e.userId)) {
      // A friend added by someone who joined more than a day before: a connection, not a sign-up.
      const who = people.get(e.userId)!;
      if (e.at - who.createdAt > DAY_MS) {
        connections++;
        if (row) row.connections++;
      }
    }
  }
  for (const [start, visitors] of opened) rows.get(start)!.inviteOpens = visitors.size;

  const inviteJoins = joinedSince.filter((u) => u.cameVia === "invite").length;
  const brought = new Map<string, number>();
  for (const u of joinedSince) if (u.invitedBy) brought.set(u.invitedBy, (brought.get(u.invitedBy) ?? 0) + 1);

  // Did people come back? Join-week groups, once enough time has passed to tell.
  const cohorts = weekStarts
    .map((start) => {
      const members = joinedSince.filter((u) => weekOf(day(u.createdAt)) === start);
      const back = (from: number, to: number) => {
        // Everyone in the group needs to have had the whole window.
        if (daysBetween(addDays(start, 6), today) < to) return null;
        if (!members.length) return null;
        const returned = members.filter((u) => {
          const joined = day(u.createdAt);
          return [...active].some(([d, ids]) => ids.has(u.id) && daysBetween(joined, d) >= from && daysBetween(joined, d) <= to);
        });
        return returned.length / members.length;
      };
      return { start, joined: members.length, backAfterWeek: back(7, 13), backAfterMonth: back(30, 59) };
    })
    .filter((c) => c.joined > 0);

  return {
    since: input.since,
    timeZone: tz,
    today: { visited: size(visited, today), active: size(active, today) },
    week: {
      visited: across(visited, weekStart, today).size,
      active: weekActive.size,
      daysPerActive: weekActive.size ? activeDays / weekActive.size : 0,
    },
    days,
    weeks: [...rows.values()],
    invites: {
      shares,
      opens: allOpens.size,
      joins: inviteJoins,
      conversion: allOpens.size ? Math.min(1, inviteJoins / allOpens.size) : null,
      otherLinkJoins: joinedSince.filter((u) => u.invitedBy && u.cameVia !== "invite").length,
      connections,
    },
    topInviters: [...brought]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id, joined]) => ({ name: people.get(id)?.name ?? "Someone", joined })),
    cohorts,
  };
}
