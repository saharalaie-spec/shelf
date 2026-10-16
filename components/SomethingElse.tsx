"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { normalize } from "./add/typed";
import { VOCAB } from "@/lib/kinds";
import type { Mood, Suggestion } from "@/lib/suggest";
import type { TodayPick } from "@/lib/today";
import type { Hit, Kind } from "@/lib/types";
import { Cover } from "./Cover";
import { SpotTile } from "./Spot";
import { Icon } from "./ui";

/** A pick for today from anywhere: your lists, a friend, or a suggestion (which carries its own reason). */
export type Choice = TodayPick & { note?: string };

const TITLE: Record<Kind, string> = {
  podcast: "Something else to listen to",
  book: "Something else to read",
  screen: "Something else to watch",
  place: "Somewhere else to go",
};

const MOOD_LABEL: Record<Mood, string> = {
  any: "Anything",
  lighter: "Lighter",
  deeper: "Deeper",
  short: "Short",
  surprise: "Surprise me",
};

type Props = {
  kind: Kind;
  /** This collection's Today candidates. */
  list: TodayPick[];
  /** What's on Today now, so it isn't offered again. */
  currentKey: string | null;
  currentTitle?: string | null;
  /** Places: suggest spots for this place. */
  destinationId: string | null;
  suggest: boolean;
  /** Says why something from your lists or a friend is there. */
  reasonOf: (p: Choice) => string;
  onChoose: (c: Choice, save?: { hit: Hit; friendId: string | null; destinationId: string | null }) => void;
};

/** Pick something else for today: from your lists, from friends, or new ideas from your taste. Nothing is pushed. */
export function SomethingElse({ kind, list, currentKey, currentTitle, destinationId, suggest, reasonOf, onChoose }: Props) {
  const v = VOCAB[kind];
  const mine = list.filter((p) => p.tier !== "friend" && p.key !== currentKey).slice(0, 5);
  const friends = list.filter((p) => p.tier === "friend" && p.key !== currentKey).slice(0, 5);

  return (
    <div className="max-h-[78dvh] overflow-y-auto px-5 pb-safe" data-vaul-no-drag="">
      <h2 className="font-serif text-[24px] font-medium tracking-tight">{TITLE[kind]}</h2>
      {mine.length > 0 && (
        <Group title={kind === "place" ? `From your ${v.sections.want}` : "From your lists"}>
          {mine.map((p) => (
            <Row key={p.key} kind={kind} item={p} line={reasonOf(p)} onPick={() => onChoose(p)} />
          ))}
        </Group>
      )}
      {friends.length > 0 && (
        <Group title="Friends are into">
          {friends.map((p) => (
            <Row
              key={p.key}
              kind={kind}
              item={p}
              line={reasonOf(p)}
              onPick={() =>
                onChoose(p, {
                  hit: { key: p.workKey, title: p.title, author: p.author, year: p.year, coverUrl: p.coverUrl, categories: p.categories, ...(p.place ? { place: p.place } : {}) },
                  friendId: p.friendId,
                  destinationId: null,
                })
              }
            />
          ))}
        </Group>
      )}
      {suggest && (
        <Ideas
          kind={kind}
          destinationId={destinationId}
          onChoose={onChoose}
          shown={[...mine, ...friends].map((p) => p.title).concat(currentTitle ?? [])}
        />
      )}
      {!mine.length && !friends.length && !suggest && (
        <p className="mt-4 mb-6 text-[15px] text-muted">Nothing else saved here yet. Add a few and they’ll show up.</p>
      )}
    </div>
  );
}

/** New ideas from your taste map across all four collections, in the mood you pick. Loaded only when asked. */
function Ideas({
  kind,
  destinationId,
  onChoose,
  shown,
}: Pick<Props, "kind" | "destinationId" | "onChoose"> & { shown: string[] }) {
  // Ideas never repeat what's already listed above them.
  const already = new Set(shown.map(normalize));
  const [mood, setMood] = useState<Mood>("any");
  const [round, setRound] = useState(0);
  const want = `${kind}|${mood}|${round}`;
  const [result, setResult] = useState<{ key: string; picks: Suggestion[]; destinationId: string | null; error?: string } | null>(null);
  const loading = result?.key !== want;

  useEffect(() => {
    let live = true;
    api<{ picks: Suggestion[]; destinationId: string | null }>("/api/suggest", {
      body: { kind, mood, fresh: round > 0, destinationId },
    })
      .then((r) => live && setResult({ key: want, ...r }))
      .catch((err) => live && setResult({ key: want, picks: [], destinationId: null, error: (err as Error).message }));
    return () => {
      live = false;
    };
  }, [kind, mood, round, destinationId, want]);

  return (
    <Group
      title="Picked for you"
      aside={
        <span className="flex items-center gap-1 text-[12px] text-muted">
          <Icon name="sparkle" size={13} /> from your taste & friends
        </span>
      }
    >
      <div className="no-scrollbar -mx-5 mb-2 flex gap-2 overflow-x-auto px-5 pt-1">
        {(Object.keys(MOOD_LABEL) as Mood[]).map((m) => (
          <button
            key={m}
            onClick={() => setMood(m)}
            aria-pressed={mood === m}
            className={`h-8 shrink-0 rounded-full px-3.5 text-[13px] font-medium whitespace-nowrap active:scale-95 ${
              mood === m ? "bg-ink text-paper" : "bg-surface-2 text-ink-2"
            }`}
          >
            {MOOD_LABEL[m]}
          </button>
        ))}
      </div>
      {loading ? (
        <div className="space-y-1" aria-label="Thinking about your taste">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-3 px-1 py-2">
              <div className="h-[60px] w-10 rounded-[4px] skeleton" />
              <div className="flex-1 space-y-1.5">
                <div className="h-4 w-1/2 rounded skeleton" />
                <div className="h-3 w-3/4 rounded skeleton" />
              </div>
            </div>
          ))}
        </div>
      ) : result?.error ? (
        <p className="px-1 py-2 text-[14px] text-muted">{result.error}</p>
      ) : !result?.picks.length ? (
        <p className="px-1 py-2 text-[14px] text-muted">
          {kind === "place" ? "Add a place first, and ideas for it will show up here." : "No new ideas right now. Try another mood."}
        </p>
      ) : (
        <>
          {result.picks.filter((s) => !already.has(normalize(s.hit.title))).map((s) => {
            const c: Choice = {
              key: `idea:${s.hit.key}`,
              itemId: null,
              kind,
              workKey: s.hit.key,
              title: s.hit.title,
              author: s.hit.author,
              year: s.hit.year,
              coverUrl: s.hit.coverUrl,
              categories: s.hit.categories,
              ...(s.hit.place ? { place: s.hit.place } : {}),
              destination: null,
              destinationId: result.destinationId,
              tier: "want",
              // Shown with its own reason (the note); "saved" is only a fallback label.
              reason: { type: "waiting", savedAt: 0 },
              friendId: null,
              note: s.why,
            };
            return (
              <Row
                key={c.key}
                kind={kind}
                item={c}
                line={s.why}
                onPick={() => onChoose(c, { hit: s.hit, friendId: null, destinationId: result.destinationId })}
              />
            );
          })}
          <button onClick={() => setRound((r) => r + 1)} className="mt-1 mb-3 h-9 px-1 text-[14px] font-medium text-ink-2 active:opacity-60">
            Different ideas
          </button>
        </>
      )}
    </Group>
  );
}

function Group({ title, aside, children }: { title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mt-5">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <p className="text-[13px] font-medium tracking-wide text-muted uppercase">{title}</p>
        {aside}
      </div>
      <ul className="-mx-1">{children}</ul>
    </section>
  );
}

function Row({ kind, item, line, onPick }: { kind: Kind; item: Choice; line: string; onPick: () => void }) {
  return (
    <li>
      <button onClick={onPick} className="flex w-full items-center gap-3 rounded-2xl px-1 py-2 text-left active:bg-surface-2">
        {kind === "place" ? (
          <SpotTile spot={item} size={40} />
        ) : (
          <Cover book={item} shape={VOCAB[kind].shape} className="w-10 shrink-0" rounded="rounded-[3px]" />
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-medium">{item.title}</span>
          <span className="block truncate text-[13px] text-muted">{line}</span>
        </span>
        <span className="shrink-0 rounded-full bg-surface-2 px-3 py-1.5 text-[13px] font-medium">For today</span>
      </button>
    </li>
  );
}
