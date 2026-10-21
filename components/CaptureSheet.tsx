"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/client";
import { VOCAB } from "@/lib/kinds";
import type { Hit, Item, Kind } from "@/lib/types";
import { typedHit } from "./add/typed";
import { Cover } from "./Cover";
import { CitySearch, Search } from "./QuickSearch";
import { Sheet } from "./Sheet";
import { SpotTile, spotLine } from "./Spot";
import { Button, Icon, KIND_ICON } from "./ui";

/**
 * "Someone recommended something": the fastest way into Trove, as quick as a note or a screenshot. What it is (found
 * across books, podcasts and screen, or a spot in a city), who said it, and it's on your Want list.
 */

const SEARCHED = ["book", "podcast", "screen"] as const;
type Picked = { kind: Kind; hit: Hit; destinationId?: string };
type Who = { id: string | null; name: string };

export function CaptureSheet({ open, onOpenChange, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; onSaved: () => void }) {
  const [picked, setPicked] = useState<Picked | null>(null);
  const [who, setWho] = useState<Who | null>(null);
  const [placeMode, setPlaceMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [people, setPeople] = useState<{ friends: { id: string; name: string }[]; names: string[] } | null>(null);

  // Fresh each time it opens.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setPicked(null);
      setWho(null);
      setPlaceMode(false);
      // Names typed last time belong in the chips this time.
      setPeople(null);
    }
  }
  useEffect(() => {
    if (!open || people) return;
    api<{ friends: { id: string; name: string }[]; names: string[] }>("/api/recommenders")
      .then(setPeople)
      .catch(() => setPeople({ friends: [], names: [] }));
  }, [open, people]);

  const save = async () => {
    if (!picked) return;
    setSaving(true);
    try {
      const { kind, hit, destinationId } = picked;
      const { added } = await api<{ added: Item[] }>("/api/items", {
        body: {
          kind,
          items: [{ ...hit, status: "want", recBy: who ? (who.id ? { id: who.id } : { name: who.name }) : null }],
          ...(destinationId ? { destinationId } : {}),
        },
      });
      const v = VOCAB[kind];
      toast(
        added.length
          ? `Saved to ${kind === "place" ? "Want to go" : v.sections.want}${who ? ` · from ${who.name}` : ""}`
          : `“${hit.title}” is already on your lists`,
      );
      onOpenChange(false);
      onSaved();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={picked ? "Who told you?" : "What did they recommend?"} tall>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-safe" data-vaul-no-drag="">
        {!picked ? (
          placeMode ? (
            <PlacePick onPick={setPicked} onBack={() => setPlaceMode(false)} />
          ) : (
            <WhatPick onPick={setPicked} onPlace={() => setPlaceMode(true)} />
          )
        ) : (
          <>
            <PickedCard picked={picked} onChange={() => setPicked(null)} />
            <p className="mt-5 mb-2 text-[15px] font-medium">Who told you?</p>
            <WhoPick people={people} who={who} onWho={setWho} />
            <Button onClick={save} loading={saving} className="mt-6 mb-2 w-full">
              {who ? `Save · from ${who.name}` : "Save it"}
            </Button>
            <p className="mb-4 text-center text-[13px] text-muted">
              Goes to your {picked.kind === "place" ? "Want to go" : VOCAB[picked.kind].sections.want} list.
            </p>
          </>
        )}
      </div>
    </Sheet>
  );
}

/** One box across books, podcasts and screen. Typed titles that match nothing can still be saved. */
function WhatPick({ onPick, onPlace }: { onPick: (p: Picked) => void; onPlace: () => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<{ q: string; hits: { kind: (typeof SEARCHED)[number]; hit: Hit }[] } | null>(null);
  const text = q.trim();

  useEffect(() => {
    if (text.length < 2) return;
    let live = true;
    const t = setTimeout(async () => {
      const per = await Promise.all(
        SEARCHED.map((kind) =>
          api<{ results: Hit[] }>(`/api/search?kind=${kind}&q=${encodeURIComponent(text)}`)
            .then((r) => r.results.slice(0, 3).map((hit) => ({ kind, hit })))
            .catch(() => []),
        ),
      );
      // Best match of each collection first, then the rest.
      const hits = [0, 1, 2].flatMap((i) => per.map((p) => p[i]).filter(Boolean));
      if (live) setResults({ q: text, hits });
    }, 300);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [text]);

  const shown = text.length >= 2 && results ? results.hits : [];
  return (
    <>
      <div className="relative mt-1">
        <Icon name="search" size={18} className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-muted" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="A book, podcast, movie or show"
          aria-label="What did they recommend?"
          autoComplete="off"
          className="h-12 w-full rounded-2xl border border-line bg-surface pr-4 pl-11 text-[16px] outline-none focus:border-ink"
        />
      </div>
      {shown.length > 0 && (
        <ul className="mt-2">
          {shown.map(({ kind, hit }) => (
            <li key={hit.key}>
              <button
                onClick={() => onPick({ kind, hit })}
                className="flex w-full items-center gap-3 rounded-2xl px-1 py-2 text-left active:bg-surface-2"
              >
                <Cover book={hit} shape={VOCAB[kind].shape} className="w-10 shrink-0" rounded="rounded-[3px]" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-medium">{hit.title}</span>
                  <span className="block truncate text-[13px] text-muted">{[hit.author, hit.year].filter(Boolean).join(" · ")}</span>
                </span>
                <KindTag kind={kind} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {text.length >= 2 && results?.q === text && (
        <div className="mt-3 rounded-2xl bg-surface-2 p-3">
          <p className="text-[14px] text-ink-2">{shown.length ? "Not there? Save" : "Nothing found. Save"} “{text}” as:</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {SEARCHED.map((kind) => (
              <button
                key={kind}
                onClick={() => onPick({ kind, hit: typedHit(kind, { title: text }) })}
                className="h-9 rounded-full bg-surface px-3.5 text-[14px] font-medium active:scale-95"
              >
                {VOCAB[kind].one.replace(/^./, (c) => c.toUpperCase())}
              </button>
            ))}
          </div>
        </div>
      )}
      <button onClick={onPlace} className="mt-4 flex h-12 w-full items-center gap-3 rounded-2xl border border-dashed border-line px-4 text-left active:bg-surface-2">
        <Icon name="pin" size={18} className="text-link" />
        <span className="flex-1 text-[15px] font-medium">It’s a place</span>
        <Icon name="chevron" size={17} className="text-muted" />
      </button>
    </>
  );
}

/** A spot: the city first, then the spot in it. */
function PlacePick({ onPick, onBack }: { onPick: (p: Picked) => void; onBack: () => void }) {
  const [city, setCity] = useState<{ id: string; name: string } | null>(null);
  return (
    <>
      <button onClick={onBack} className="-ml-1 flex h-9 items-center gap-0.5 text-[15px] font-medium text-ink-2 active:opacity-60">
        <Icon name="back" size={18} /> Not a place
      </button>
      {!city ? (
        <CitySearch onCity={setCity} />
      ) : (
        <div className="mt-5">
          <p className="mb-2 px-1 text-[14px] text-muted">
            In <span className="font-medium text-ink">{city.name}</span> ·{" "}
            <button onClick={() => setCity(null)} className="font-medium text-ink-2 underline underline-offset-2">
              change
            </button>
          </p>
          <Search
            key={city.id}
            url={(q) => `/api/search?kind=place&dest=${city.id}&q=${encodeURIComponent(q)}`}
            placeholder={`Search spots in ${city.name}`}
            label="Which spot?"
            render={(h: Hit) => (
              <>
                <SpotTile spot={h} size={36} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-medium">{h.title}</span>
                  <span className="block truncate text-[13px] text-muted">{spotLine(h)}</span>
                </span>
              </>
            )}
            onPick={(h: Hit) => onPick({ kind: "place", hit: h, destinationId: city.id })}
          />
        </div>
      )}
    </>
  );
}

function PickedCard({ picked, onChange }: { picked: Picked; onChange: () => void }) {
  const { kind, hit } = picked;
  return (
    <div className="mt-1 flex items-center gap-3 rounded-2xl bg-paper p-3">
      {kind === "place" ? <SpotTile spot={hit} size={48} /> : <Cover book={hit} shape={VOCAB[kind].shape} className="w-12 shrink-0" rounded="rounded-[4px]" />}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[16px] font-medium">{hit.title}</span>
        <span className="block truncate text-[13px] text-muted">{(kind === "place" ? spotLine(hit) : hit.author) || VOCAB[kind].one}</span>
      </span>
      <button onClick={onChange} className="shrink-0 px-1 text-[14px] font-medium text-ink-2 underline underline-offset-2">
        Change
      </button>
    </div>
  );
}

/** Friends and names used before as one-tap chips, or any name. */
function WhoPick({ people, who, onWho }: { people: { friends: { id: string; name: string }[]; names: string[] } | null; who: Who | null; onWho: (w: Who | null) => void }) {
  const [typing, setTyping] = useState(false);
  const [name, setName] = useState("");
  const chips: Who[] = [...(people?.friends ?? []).map((f) => ({ id: f.id, name: f.name })), ...(people?.names ?? []).map((n) => ({ id: null, name: n }))];
  const same = (a: Who | null, b: Who) => Boolean(a && a.id === b.id && a.name === b.name);
  const custom = who && !chips.some((c) => same(who, c)) ? who : null;

  return (
    <div className="flex flex-wrap gap-2">
      {chips.map((c) => (
        <Chip key={`${c.id ?? "n"}:${c.name}`} on={same(who, c)} onClick={() => onWho(same(who, c) ? null : c)}>
          {c.name}
        </Chip>
      ))}
      {custom && (
        <Chip on onClick={() => onWho(null)}>
          {custom.name}
        </Chip>
      )}
      {typing ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const n = name.trim();
            if (n) onWho({ id: null, name: n.slice(0, 60) });
            setTyping(false);
            setName("");
          }}
          className="flex w-full gap-2"
        >
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Mom, a coworker, a podcast host…"
            aria-label="Who told you?"
            maxLength={60}
            className="h-11 min-w-0 flex-1 rounded-2xl border border-line bg-surface px-4 text-[16px] outline-none focus:border-ink"
          />
          <Button type="submit" variant="secondary" className="h-11 px-4">
            Add
          </Button>
        </form>
      ) : (
        <Chip on={false} onClick={() => setTyping(true)}>
          <Icon name="plus" size={14} /> {chips.length ? "Someone else" : "Add a name"}
        </Chip>
      )}
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`flex h-9 items-center gap-1 rounded-full px-3.5 text-[14px] font-medium transition-colors active:scale-95 ${
        on ? "bg-accent text-accent-ink" : "bg-surface-2 text-ink-2"
      }`}
    >
      {children}
    </button>
  );
}

function KindTag({ kind }: { kind: Kind }) {
  return (
    <span className="flex h-7 shrink-0 items-center gap-1 rounded-full px-2 text-[12px] font-medium text-ink" style={{ background: VOCAB[kind].tint }}>
      <Icon name={KIND_ICON[kind]} size={13} />
      {VOCAB[kind].label === "Movies & TV" ? "Watch" : VOCAB[kind].label.replace(/s$/, "")}
    </span>
  );
}
