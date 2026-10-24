import Link from "next/link";
import type { Numbers } from "@/lib/metrics";
import { Wordmark } from "./ui";

// Day keys are dates already; format them as written, not shifted by the server's zone.
const short = (key: string) => new Date(`${key}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const weekday = (key: string) => new Date(`${key}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
const pct = (n: number | null) => (n === null ? "–" : `${Math.round(n * 100)}%`);

function Stat({ label, value, note }: { label: string; value: string | number; note?: string }) {
  return (
    <div className="rounded-2xl bg-surface p-4 shadow-book">
      <p className="text-[13px] text-muted">{label}</p>
      <p className="mt-1 font-serif text-[32px] leading-none font-medium tracking-tight">{value}</p>
      {note && <p className="mt-1.5 text-[13px] leading-snug text-muted">{note}</p>}
    </div>
  );
}

function Table({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <div className="mt-3 overflow-x-auto rounded-2xl bg-surface shadow-book">
      <table className="w-full text-[14px] tabular-nums">
        <thead>
          <tr className="text-left text-[12px] text-muted">
            {head.map((h, i) => (
              <th key={h} className={`px-3 py-2.5 font-medium ${i ? "text-right" : ""}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={String(r[0])} className="border-t border-line">
              {r.map((c, i) => (
                <td key={i} className={`px-3 py-2 whitespace-nowrap ${i ? "text-right" : ""}`}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const H2 = ({ children }: { children: React.ReactNode }) => (
  <h2 className="mt-10 font-serif text-[24px] leading-tight font-medium tracking-tight">{children}</h2>
);

export function NumbersView({ numbers: n }: { numbers: Numbers }) {
  const joined = n.weeks.reduce((s, w) => s + w.joined, 0);
  const throughFriend = n.weeks.reduce((s, w) => s + w.throughFriend, 0);
  const since = new Date(n.since).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: n.timeZone });
  const zone = n.timeZone.split("/").pop()!.replace(/_/g, " ");

  return (
    <div className="mx-auto min-h-dvh w-full max-w-2xl px-5 pb-16">
      <header className="flex h-16 items-center pt-[env(safe-area-inset-top)]">
        <Link href="/" className="flex items-center gap-2">
          <Wordmark size={24} />
        </Link>
      </header>
      <h1 className="mt-4 font-serif text-[34px] leading-tight font-medium tracking-tight">Numbers</h1>
      <p className="mt-1 text-[15px] text-muted">
        Counting since {since}, in {zone} time. Your account, test accounts and Juno are left out.
      </p>

      <H2>Active</H2>
      <p className="mt-1 text-[14px] leading-snug text-muted">
        Active means they saved, started or finished something, looked through a friend’s trove, used “Stuck on what’s
        next?”, thanked a friend or added one. Visited means they opened Trove.
      </p>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Active this week" value={n.week.active} note={`${n.week.visited} visited`} />
        <Stat label="Active today" value={n.today.active} note={`${n.today.visited} visited`} />
        <Stat
          label="Days active each"
          value={n.week.active ? n.week.daysPerActive.toFixed(1) : "–"}
          note="Of the last 7, per active person: the habit"
        />
      </div>
      <Table
        head={["Day", "Visited", "Active"]}
        rows={[...n.days].reverse().map((d) => [`${weekday(d.day)} ${short(d.day)}`, d.visited, d.active])}
      />

      <H2>Joining</H2>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat
          label="Joined through a friend"
          value={throughFriend}
          note={joined ? `of ${joined} new (${pct(throughFriend / joined)})` : "No one new yet"}
        />
        <Stat
          label="Invite conversion"
          value={pct(n.invites.conversion)}
          note={`${n.invites.joins} joined of ${n.invites.opens} who opened an invite`}
        />
        <Stat label="Invites shared" value={n.invites.shares} note="Send or Copy on an invite link" />
        <Stat label="Joined from a shared list or profile" value={n.invites.otherLinkJoins} />
        <Stat label="Friends added by people already here" value={n.invites.connections} />
      </div>
      <Table
        head={["Week of", "Joined", "Via friend", "Opened invite", "Joined from invite"]}
        rows={[...n.weeks].reverse().map((w) => [short(w.start), w.joined, w.throughFriend, w.inviteOpens, w.inviteJoins])}
      />
      {n.topInviters.length > 0 && (
        <>
          <h3 className="mt-6 text-[15px] font-medium">Who brought people in</h3>
          <Table head={["Friend", "Joined"]} rows={n.topInviters.map((t) => [t.name, t.joined])} />
        </>
      )}

      <H2>Coming back</H2>
      <p className="mt-1 text-[14px] leading-snug text-muted">
        Of the people who joined each week, how many were active again a week later (days 7 to 13) and a month later
        (days 30 to 59). A dash means it’s too soon to tell.
      </p>
      {n.cohorts.length ? (
        <Table
          head={["Joined week of", "People", "After a week", "After a month"]}
          rows={[...n.cohorts].reverse().map((c) => [short(c.start), c.joined, pct(c.backAfterWeek), pct(c.backAfterMonth)])}
        />
      ) : (
        <p className="mt-3 text-[15px] text-muted">No one has joined since counting started.</p>
      )}

      <H2>Week by week</H2>
      <Table
        head={["Week of", "Visited", "Active", "Invites shared"]}
        rows={[...n.weeks].reverse().map((w) => [short(w.start), w.visited, w.active, w.inviteShares])}
      />
    </div>
  );
}
