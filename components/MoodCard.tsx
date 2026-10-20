"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { ago, api, itemLinks } from "@/lib/client";
import { VOCAB } from "@/lib/kinds";
import type { TodayCandidates } from "@/lib/today";
import type { Item, Kind } from "@/lib/types";
import { Cover } from "./Cover";
import { Sheet } from "./Sheet";
import { SomethingElse, type Choice, type ChoiceSave } from "./SomethingElse";
import { SpotTile } from "./Spot";
import { Button, Icon, KIND_ICON, useHydrated } from "./ui";

/**
 * "Stuck on what's next?": four doors into choosing something. Nothing here keeps score
 * of what you're already in the middle of, and nothing changes by itself from day to day.
 */

const TILE: Record<Kind, string> = { podcast: "Listen", book: "Read", screen: "Watch", place: "Go out" };

/** The tile that fits the hour comes first: a podcast in the morning, a show at night. */
function order(hour: number): Kind[] {
  if (hour >= 5 && hour < 11) return ["podcast", "book", "screen", "place"];
  if (hour >= 11 && hour < 17) return ["book", "podcast", "place", "screen"];
  if (hour >= 17 && hour < 21) return ["place", "screen", "book", "podcast"];
  return ["screen", "book", "podcast", "place"];
}

const DOING: Record<Kind, string> = { book: "reading it", podcast: "listening", screen: "watching it", place: "going" };
const DONE: Record<Kind, string> = { book: "just finished it", podcast: "has been listening", screen: "just watched it", place: "has been" };
const START: Record<Kind, string> = { book: "Start reading", podcast: "Start listening", screen: "Start watching", place: "I went" };
const STARTED: Record<Kind, string> = { book: "Reading", podcast: "Listening", screen: "Watching", place: "Been" };

function reasonText(p: Choice) {
  if (p.note) return p.note;
  const where = p.kind === "place" && p.destination ? `In ${p.destination} · ` : "";
  const r = p.reason;
  switch (r.type) {
    case "trusted":
      return `${where}From ${r.from} · you’ve finished ${r.finished} of their ${r.finished === 1 ? "pick" : "picks"}`;
    case "from":
      return `${where}From ${r.from} · saved ${ago(r.savedAt)}`;
    case "waiting":
      return `${where}Saved ${ago(r.savedAt)}`;
    case "friend":
      return `${r.from} ${r.status === "read" ? DONE[p.kind] : `is ${DOING[p.kind]}`}`;
  }
}

export function MoodCard({ candidates, suggest, places }: { candidates: TodayCandidates; suggest: boolean; places: { id: string; name: string }[] }) {
  const hydrated = useHydrated();
  const [open, setOpen] = useState<Kind | null>(null);
  const [last, setLast] = useState<Kind>("book");
  const [chosen, setChosen] = useState<{ c: Choice; save?: ChoiceSave } | null>(null);
  // Started or saved from here: off the list now.
  const [taken, setTaken] = useState<Set<string>>(() => new Set());
  // The hour is the viewer's, so the order settles once it's on their device.
  const kinds = order(hydrated ? new Date().getHours() : 12);
  const kind = open ?? last;
  // Start on the place where your latest Want to go spot is, else your newest place.
  const first = candidates.place[0]?.destinationId;
  const startPlaces = [...places].sort((a, b) => Number(b.id === first) - Number(a.id === first));

  const show = (k: Kind) => {
    setChosen(null);
    setOpen(k);
    setLast(k);
  };

  return (
    <section className="mx-5 mb-5 rounded-[28px] bg-surface p-4 shadow-book">
      <h2 className="px-1 font-serif text-[22px] leading-tight font-medium tracking-tight">Stuck on what’s next?</h2>
      <p className="mt-0.5 px-1 text-[14px] leading-snug text-muted">Tap one for a few ideas from your lists, your friends and your taste.</p>
      <div className="mt-3 grid grid-cols-4 gap-2">
        {kinds.map((k) => (
          <button
            key={k}
            onClick={() => show(k)}
            className="flex h-[76px] flex-col items-center justify-center gap-1.5 rounded-2xl text-[14px] font-medium text-white transition-transform active:scale-95"
            style={{ background: VOCAB[k].tint }}
          >
            <Icon name={KIND_ICON[k]} size={22} />
            {TILE[k]}
          </button>
        ))}
      </div>

      <Sheet open={open !== null} onOpenChange={(o) => !o && setOpen(null)} title={TILE[kind]} hideTitle>
        {chosen && (
          <Chosen
            key={chosen.c.key}
            choice={chosen.c}
            save={chosen.save}
            onBack={() => setChosen(null)}
            onDone={(key) => setTaken((t) => new Set(t).add(key))}
          />
        )}
        {/* Kept while one is open, so going back finds the city, occasion and ideas as you left them. */}
        <div hidden={Boolean(chosen)}>
          <SomethingElse
            key={kind}
            kind={kind}
            list={candidates[kind].filter((p) => !taken.has(p.workKey))}
            places={startPlaces}
            taken={taken}
            suggest={suggest}
            reasonOf={reasonText}
            onChoose={(c, save) => setChosen({ c, save })}
          />
        </div>
      </Sheet>
    </section>
  );
}

/** What you chose: start it (or save it for later), and where to play it or how to get there. */
function Chosen({
  choice,
  save,
  onBack,
  onDone,
}: {
  choice: Choice;
  save?: ChoiceSave;
  onBack: () => void;
  onDone: (workKey: string) => void;
}) {
  const router = useRouter();
  const [itemId, setItemId] = useState(choice.itemId);
  const [done, setDone] = useState<"started" | "saved" | null>(null);
  const [busy, setBusy] = useState(false);
  const { kind } = choice;
  const links = itemLinks({ key: choice.workKey, title: choice.title, author: choice.author, place: choice.place }, kind);
  const started = kind === "place" ? "read" : "reading";

  const act = async (to: "started" | "saved") => {
    setBusy(true);
    try {
      const status = to === "started" ? started : "want";
      if (itemId) {
        await api(`/api/items/${itemId}`, { method: "PATCH", body: { status } });
      } else if (save) {
        const { added } = await api<{ added: Item[] }>("/api/items", {
          body: {
            kind,
            items: [{ ...save.hit, status, ...(save.friendId ? { recBy: { id: save.friendId } } : {}) }],
            ...(kind === "place" && save.destinationId ? { destinationId: save.destinationId } : {}),
          },
        });
        if (added[0]) setItemId(added[0].id);
      }
      setDone(to);
      onDone(choice.workKey);
      toast(
        to === "saved"
          ? `Saved “${choice.title}” to ${kind === "place" ? "Want to go" : VOCAB[kind].sections.want}`
          : kind === "place"
            ? `Marked “${choice.title}” as Been`
            : `Started “${choice.title}”. Enjoy.`,
      );
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="px-5 pb-safe">
      <button onClick={onBack} className="-ml-1 flex h-9 items-center gap-0.5 text-[15px] font-medium text-ink-2 active:opacity-60">
        <Icon name="back" size={18} /> Other options
      </button>
      <div className="mt-2 flex items-center gap-4">
        {kind === "place" ? <SpotTile spot={choice} size={72} /> : <Cover book={choice} shape={VOCAB[kind].shape} className="w-20 shrink-0" />}
        <div className="min-w-0 flex-1">
          <h2 className="font-serif text-[24px] leading-tight font-medium tracking-tight">{choice.title}</h2>
          {choice.author && <p className="mt-0.5 text-[15px] text-ink-2">{choice.author}</p>}
          <p className="mt-1 text-[14px] text-muted">{reasonText(choice)}</p>
        </div>
      </div>

      <div className="mt-5 mb-3 grid gap-2">
        {/* Places: getting there comes first; marking it Been is for after. */}
        {kind === "place" && links[0] && (
          <a href={links[0].href} target="_blank" rel="noreferrer" className="flex h-12 items-center justify-center gap-2 rounded-full bg-ink text-[16px] font-medium text-paper active:scale-[0.97]">
            <Icon name="map" size={18} /> Directions
          </a>
        )}
        {done === "started" ? (
          <p className="flex h-12 items-center justify-center gap-2 rounded-full bg-surface-2 text-[15px] font-medium text-ink-2">
            <Icon name="check" size={17} className="text-good" /> {STARTED[kind]}
          </p>
        ) : (
          <Button variant={kind === "place" ? "secondary" : "primary"} loading={busy} onClick={() => act("started")}>
            {START[kind]}
          </Button>
        )}
        {!choice.itemId && !done && (
          <Button variant="secondary" disabled={busy} onClick={() => act("saved")}>
            Save for later
          </Button>
        )}
        {done === "saved" && (
          <p className="flex h-12 items-center justify-center gap-2 text-[15px] font-medium text-ink-2">
            <Icon name="check" size={17} className="text-good" /> On your {kind === "place" ? "Want to go" : VOCAB[kind].sections.want}
          </p>
        )}
        {kind !== "place" && (
          <div className="flex flex-wrap gap-2">
            {links.map((l) => (
              <a
                key={l.label}
                href={l.href}
                target="_blank"
                rel="noreferrer"
                className="flex h-11 flex-1 items-center justify-center rounded-full px-4 text-[15px] font-medium whitespace-nowrap text-ink-2 active:bg-surface-2"
              >
                {l.label}
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
