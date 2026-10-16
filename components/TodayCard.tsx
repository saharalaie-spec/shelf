"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ago, api, itemLinks } from "@/lib/client";
import { VOCAB } from "@/lib/kinds";
import type { TodayCandidates, TodayPick } from "@/lib/today";
import type { Kind } from "@/lib/types";
import { Cover } from "./Cover";
import { Sheet } from "./Sheet";
import { SpotTile } from "./Spot";
import { Button, Icon, useHydrated, type IconName } from "./ui";

/** Each collection has its moment in the day. */
const SLOT: Record<Kind, { label: string; icon: IconName }> = {
  podcast: { label: "Morning", icon: "headphones" },
  book: { label: "Daytime", icon: "book" },
  place: { label: "Evening", icon: "pin" },
  screen: { label: "Tonight", icon: "film" },
};

/** Whichever fits the hour comes first. */
function slotOrder(hour: number): Kind[] {
  if (hour >= 5 && hour < 11) return ["podcast", "book", "place", "screen"];
  if (hour >= 11 && hour < 17) return ["book", "podcast", "place", "screen"];
  if (hour >= 17 && hour < 21) return ["place", "screen", "book", "podcast"];
  return ["screen", "book", "podcast", "place"];
}

const KEEP: Record<Kind, string> = { book: "Keep reading", podcast: "Keep listening", screen: "Keep watching", place: "Go" };
const DOING: Record<Kind, string> = { book: "reading it", podcast: "listening", screen: "watching it", place: "going" };
const DONE: Record<Kind, string> = { book: "just finished it", podcast: "has been listening", screen: "just watched it", place: "has been" };

const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
/** Days since 1970 in local time: changes at your midnight, not UTC's. */
const daySeed = (d: Date) => Math.floor((d.getTime() - d.getTimezoneOffset() * 60_000) / 86_400_000);

const skipKey = (d: Date) => `trove:today:skip:${dayKey(d)}`;
const NEAR_KEY = "trove:today:near";

function readSkips(d: Date): string[] {
  try {
    return JSON.parse(localStorage.getItem(skipKey(d)) ?? "[]");
  } catch {
    return [];
  }
}

type Pos = { lat: number; lon: number };

/** Metres between two points. */
function distance(a: Pos, b: Pos) {
  const r = 6371e3;
  const rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(h));
}

const NEARBY_M = 5000;

type Chosen = TodayPick & { note?: string };

/** One pick per collection: in progress first, then a rotation of the best few saved ones, then a friend's. */
function choose(kind: Kind, list: TodayPick[], seed: number, skips: string[], pos: Pos | null): Chosen | null {
  const open = list.filter((p) => !skips.includes(p.key));
  if (!open.length) return null;
  if (kind === "place") {
    if (pos) {
      const near = open
        .filter((p) => p.place)
        .map((p) => ({ p, d: distance(pos, { lat: p.place!.lat, lon: p.place!.lon }) }))
        .filter((x) => x.d <= NEARBY_M)
        .sort((a, b) => a.d - b.d)[0];
      if (near) {
        const d = near.d < 1000 ? `${Math.max(100, Math.round(near.d / 100) * 100)} m` : `${(near.d / 1000).toFixed(1)} km`;
        return { ...near.p, note: `${d} away · on your Want to go` };
      }
    }
    // Not near any: one from your latest place, a different one each day.
    const dest = open[0].destination;
    const there = open.filter((p) => p.destination === dest);
    const p = there[seed % there.length];
    return { ...p, note: dest ? `Next time you’re in ${dest}` : undefined };
  }
  const keep = open.find((p) => p.tier === "keep");
  if (keep) return keep;
  const wants = open.filter((p) => p.tier === "want");
  if (wants.length) {
    const top = wants.slice(0, 5);
    return top[seed % top.length];
  }
  return open[0];
}

function reasonText(p: Chosen) {
  if (p.note) return p.note;
  const r = p.reason;
  switch (r.type) {
    case "keep":
      return `${KEEP[p.kind]} · started ${ago(r.since)}`;
    case "trusted":
      return `From ${r.from} · you’ve finished ${r.finished} of their ${r.finished === 1 ? "pick" : "picks"}`;
    case "from":
      return `From ${r.from} · saved ${ago(r.savedAt)}`;
    case "waiting":
      return `Saved ${ago(r.savedAt)} · still waiting`;
    case "friend":
      return `${r.from} ${r.status === "read" ? DONE[p.kind] : `is ${DOING[p.kind]}`}`;
  }
}

/** Fresh picks for your day, from your own lists and your friends. Same all day; new tomorrow. */
export function TodayCard({ candidates }: { candidates: TodayCandidates }) {
  const hydrated = useHydrated();
  const kinds = (Object.keys(candidates) as Kind[]).filter((k) => candidates[k].length > 0);
  if (!kinds.length) return null;
  // Day, hour and saved choices are the viewer's, so the card fills in once it's on their device.
  return hydrated ? <TodayBody candidates={candidates} /> : <Skeleton rows={kinds.length} />;
}

function TodayBody({ candidates }: { candidates: TodayCandidates }) {
  const [now] = useState(() => new Date());
  const [skips, setSkips] = useState(() => readSkips(now));
  const [started, setStarted] = useState<Record<string, true>>({});
  const [pos, setPos] = useState<Pos | null>(null);
  const [open, setOpen] = useState<Chosen | null>(null);
  const [lastOpen, setLastOpen] = useState<Chosen | null>(null);
  const seed = daySeed(now);
  const geo = typeof navigator !== "undefined" && "geolocation" in navigator;

  const locate = (ask: boolean) => {
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setPos({ lat: p.coords.latitude, lon: p.coords.longitude });
        try {
          localStorage.setItem(NEAR_KEY, "1");
        } catch {}
      },
      () => ask && toast("Location is off for Trove. You can turn it on in your browser settings."),
      { maximumAge: 10 * 60_000, timeout: 8000 },
    );
  };
  // Asked before? Then look again quietly (no prompt once it's allowed).
  useEffect(() => {
    try {
      if (geo && localStorage.getItem(NEAR_KEY)) locate(false);
    } catch {}
  }, [geo]);

  const order = slotOrder(now.getHours());
  const picks = order
    .map((kind) => ({ kind, pick: choose(kind, candidates[kind], seed, skips, pos) }))
    .filter((x): x is { kind: Kind; pick: Chosen } => Boolean(x.pick));

  const notToday = (p: Chosen) => {
    const next = [...skips, p.key];
    setSkips(next);
    setOpen(null);
    try {
      localStorage.setItem(skipKey(now), JSON.stringify(next));
    } catch {}
  };

  const start = async (p: Chosen) => {
    setOpen(null);
    setStarted((s) => ({ ...s, [p.key]: true }));
    try {
      if (p.itemId) {
        const status = p.kind === "place" ? "read" : "reading";
        await api(`/api/items/${p.itemId}`, { method: "PATCH", body: { status } });
        toast(p.kind === "place" ? `Marked “${p.title}” as Been` : `Started “${p.title}”. Enjoy.`);
      } else {
        const { workKey, title, author, year, coverUrl, categories } = p;
        await api("/api/items", {
          body: {
            kind: p.kind,
            items: [{ key: workKey, title, author, year, coverUrl, categories, status: "want", recBy: { id: p.friendId } }],
          },
        });
        toast(`Saved “${p.title}” to your ${VOCAB[p.kind].sections.want}`);
      }
    } catch (err) {
      setStarted(({ [p.key]: _, ...rest }) => rest);
      toast.error((err as Error).message);
    }
  };

  if (!picks.length) return null;
  const shown = open ?? lastOpen;

  return (
    <section className="mx-5 mb-5 rounded-[28px] bg-surface p-4 shadow-book">
      <div className="mb-1 flex items-baseline justify-between px-1">
        <h2 className="font-serif text-[24px] font-medium tracking-tight">Today</h2>
        <span className="text-[13px] text-muted">{now.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}</span>
      </div>
      <ul>
        <AnimatePresence initial={false} mode="popLayout">
          {picks.map(({ kind, pick }, i) => (
            <motion.li
              key={pick.key}
              layout="position"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: 40 }}
              transition={{ type: "spring", stiffness: 420, damping: 34 }}
            >
              <button
                onClick={() => {
                  setOpen(pick);
                  setLastOpen(pick);
                }}
                className="flex w-full items-center gap-3 rounded-2xl px-1 py-2 text-left active:bg-surface-2"
              >
                {kind === "place" ? (
                  <SpotTile spot={pick} size={48} />
                ) : (
                  <Cover book={pick} shape={VOCAB[kind].shape} className="w-12 shrink-0" rounded="rounded-[4px]" />
                )}
                <span className="min-w-0 flex-1">
                  <span className={`flex items-center gap-1 text-[12px] font-semibold tracking-wide uppercase ${i === 0 ? "text-accent" : "text-muted"}`}>
                    <Icon name={SLOT[kind].icon} size={12} />
                    {i === 0 ? `Now · ${SLOT[kind].label}` : SLOT[kind].label}
                  </span>
                  <span className="block truncate text-[16px] font-medium">{pick.title}</span>
                  <span className="block truncate text-[13px] text-muted">
                    {started[pick.key] ? (pick.itemId ? "Started today" : "Saved to your list") : reasonText(pick)}
                  </span>
                </span>
                <Icon name="chevron" size={16} className="shrink-0 text-muted" />
              </button>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
      {geo && !pos && candidates.place.length > 0 && (
        <button onClick={() => locate(true)} className="mt-1 flex h-9 items-center gap-1.5 px-1 text-[13px] font-medium text-ink-2 active:opacity-60">
          <Icon name="pin" size={14} /> Pick places near me
        </button>
      )}

      <Sheet open={Boolean(open)} onOpenChange={(o) => !o && setOpen(null)} title={shown?.title ?? "Today"} hideTitle>
        {shown && (
          <div className="px-5 pb-safe">
            <div className="flex items-center gap-4 pt-2">
              {shown.kind === "place" ? (
                <SpotTile spot={shown} size={72} />
              ) : (
                <Cover book={shown} shape={VOCAB[shown.kind].shape} className="w-20 shrink-0" />
              )}
              <div className="min-w-0 flex-1">
                <h2 className="font-serif text-[24px] leading-tight font-medium tracking-tight">{shown.title}</h2>
                {shown.author && <p className="mt-0.5 text-[15px] text-ink-2">{shown.author}</p>}
                <p className="mt-1 text-[14px] text-muted">{reasonText(shown)}</p>
              </div>
            </div>
            <div className="mt-5 grid gap-2">
              {!started[shown.key] && !(shown.itemId && shown.tier === "keep") && (
                <Button onClick={() => start(shown)} icon={<Icon name={shown.itemId ? "check" : "plus"} size={18} />}>
                  {!shown.itemId
                    ? `Save to ${VOCAB[shown.kind].sections.want}`
                    : shown.kind === "place"
                      ? "I went"
                      : { book: "Start reading", podcast: "Start listening", screen: "Start watching" }[shown.kind]}
                </Button>
              )}
              <div className="flex flex-wrap gap-2">
                {itemLinks({ key: shown.workKey, title: shown.title, author: shown.author, place: shown.place }, shown.kind).map((l) => (
                  <a
                    key={l.label}
                    href={l.href}
                    target="_blank"
                    rel="noreferrer"
                    className="flex h-11 flex-1 items-center justify-center rounded-full bg-surface-2 px-4 text-[15px] font-medium whitespace-nowrap"
                  >
                    {l.label}
                  </a>
                ))}
              </div>
              <Button variant="ghost" onClick={() => notToday(shown)} className="mb-2">
                Not today
              </Button>
            </div>
          </div>
        )}
      </Sheet>
    </section>
  );
}

function Skeleton({ rows }: { rows: number }) {
  return (
    <section className="mx-5 mb-5 rounded-[28px] bg-surface p-4 shadow-book" aria-hidden>
      <div className="mb-2 h-7 w-24 rounded skeleton" />
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-1 py-2">
          <div className="h-[72px] w-12 rounded-[4px] skeleton" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3 w-1/4 rounded skeleton" />
            <div className="h-4 w-2/3 rounded skeleton" />
            <div className="h-3 w-1/2 rounded skeleton" />
          </div>
        </div>
      ))}
    </section>
  );
}
