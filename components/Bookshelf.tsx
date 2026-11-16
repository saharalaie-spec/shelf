"use client";

import { useState } from "react";
import type { Item, Kind } from "@/lib/types";
import { Icon, useHydrated } from "./ui";

/** Plain bindings for books with no cover image: Trove's navy and stones, with a few warm and muted ones. Text color for each. */
const BINDINGS: [string, string][] = [
  ["#1E2B47", "#F2F0EB"],
  ["#A89C88", "#1C1F26"],
  ["#D9CDB6", "#1C1F26"],
  ["#7C8B76", "#F2F0EB"],
  ["#9B5D4B", "#F2F0EB"],
  ["#5A6B82", "#F2F0EB"],
  ["#ECE4D3", "#1C1F26"],
  ["#3F4A3C", "#F2F0EB"],
  ["#B88B5A", "#1C1F26"],
  ["#6E5A7E", "#F2F0EB"],
  ["#C7CDD4", "#1C1F26"],
  ["#2F3A33", "#ECE4D3"],
];

/** The same book always looks the same: its color, length and offset come from its key. */
function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Where single-item tags gather, per collection. */
const OTHER: Record<ShelfKind, string> = { book: "More books", screen: "More film & TV", podcast: "More podcasts" };

/** The collections with a second look: books as stacks, film & TV as film strips, podcasts as a list of tape cases. */
export type ShelfKind = Exclude<Kind, "place">;
export const hasShelf = (k: Kind): k is ShelfKind => k !== "place";
const SHELF_LABEL: Record<ShelfKind, string> = { book: "Stack", screen: "Film strip", podcast: "List" };
// Books keep the key they were first saved under ("stack" / "grid").
const viewKey = (k: ShelfKind) => (k === "book" ? "trove:books:view" : `trove:${k}:view`);

/**
 * Each collection as its covers grid (the default) or its own look, remembered on this device per collection and the
 * same on your lists and on friends' pages. Until the page is live in the browser it's the grid, as the server drew it.
 */
export function useShelfView(kind: Kind): [boolean, (on: boolean) => void] {
  const hydrated = useHydrated();
  const [views, setViews] = useState<Partial<Record<ShelfKind, boolean>>>(() => {
    const out: Partial<Record<ShelfKind, boolean>> = {};
    try {
      for (const k of ["book", "screen", "podcast"] as const) {
        const v = localStorage.getItem(viewKey(k));
        out[k] = v !== null && v !== "grid";
      }
    } catch {
      // No storage: always the grid.
    }
    return out;
  });
  const set = (on: boolean) => {
    if (!hasShelf(kind)) return;
    setViews((v) => ({ ...v, [kind]: on }));
    try {
      localStorage.setItem(viewKey(kind), on ? (kind === "book" ? "stack" : "shelf") : "grid");
    } catch {
      // Private browsing: it just won't be remembered.
    }
  };
  return [hydrated && hasShelf(kind) && !!views[kind], set];
}

/** Grid | Stack, Grid | Film strip, Grid | List. */
export function ShelfViewSwitch({ kind, on, onChange, className = "" }: { kind: ShelfKind; on: boolean; onChange: (on: boolean) => void; className?: string }) {
  return <ViewSwitch labels={["Grid", SHELF_LABEL[kind]]} on={on} onChange={onChange} className={className} />;
}

const PLACES_KEY = "trove:places:view";

/** Places as the world map (the default) or as a list, remembered on this device; the same on friends' pages. */
export function usePlacesList(): [boolean, (on: boolean) => void] {
  const hydrated = useHydrated();
  const [list, setList] = useState(() => {
    try {
      return localStorage.getItem(PLACES_KEY) === "list";
    } catch {
      return false;
    }
  });
  const set = (on: boolean) => {
    setList(on);
    try {
      localStorage.setItem(PLACES_KEY, on ? "list" : "map");
    } catch {
      // Private browsing: it just won't be remembered.
    }
  };
  return [hydrated && list, set];
}

/** Map | List. */
export function PlacesViewSwitch({ list, onChange, className = "" }: { list: boolean; onChange: (on: boolean) => void; className?: string }) {
  return <ViewSwitch labels={["Map", "List"]} on={list} onChange={onChange} className={className} />;
}

/** Two looks for one list: the first is off, the second on. */
function ViewSwitch({ labels, on, onChange, className }: { labels: [string, string]; on: boolean; onChange: (on: boolean) => void; className: string }) {
  return (
    <div className={`flex shrink-0 rounded-full bg-surface-2 p-1 ${className}`} role="radiogroup" aria-label="Show as">
      {(
        [
          [false, labels[0]],
          [true, labels[1]],
        ] as const
      ).map(([value, label]) => (
        <button
          key={label}
          role="radio"
          aria-checked={on === value}
          onClick={() => onChange(value)}
          className={`h-8 rounded-full px-3 text-[13px] font-medium whitespace-nowrap transition-colors ${on === value ? "bg-surface text-ink shadow-book" : "text-ink-2"}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/** The right look for a collection, when its grid is switched off. */
export function Shelf({ kind, ...props }: { kind: ShelfKind } & ShelfProps) {
  return kind === "book" ? <Bookshelf {...props} /> : kind === "screen" ? <Filmstrips {...props} /> : <TapeRack {...props} />;
}

type ShelfProps = { items: Item[]; tags: [string, number][]; single?: string | null; onOpen: (b: Item) => void };

/**
 * One group per tag, in order of how many items it holds, each item once (under its most common tag that doesn't
 * cover nearly everything). Tags with a single item share a last "More…" group.
 */
function groupByTag(items: Item[], tags: [string, number][], single: string | null | undefined, other: string): [string, Item[]][] {
  const rank = new Map(tags.map(([t], i) => [t, i]));
  // A tag on nearly everything ("Drama" on most films) sorts nothing, so an item goes under its next tag when it has one.
  const count = new Map<string, number>();
  for (const b of items) for (const c of b.categories) count.set(c, (count.get(c) ?? 0) + 1);
  const everywhere = (c: string) => items.length >= 4 && count.get(c)! > items.length * 0.6;
  const groups = new Map<string, Item[]>();
  for (const b of items) {
    const own = [...b.categories].filter((c) => rank.has(c)).sort((x, y) => rank.get(x)! - rank.get(y)!);
    const tag = single ?? own.find((c) => !everywhere(c)) ?? own[0] ?? other;
    groups.set(tag, [...(groups.get(tag) ?? []), b]);
  }
  if (!single && groups.size > 1) {
    for (const [tag, list] of [...groups]) {
      if (tag === other || list.length > 1) continue;
      groups.delete(tag);
      groups.set(other, [...(groups.get(other) ?? []), ...list]);
    }
  }
  return [...groups.entries()].sort(([a], [b]) => (a === other ? 1 : b === other ? -1 : (rank.get(a) ?? 0) - (rank.get(b) ?? 0)));
}

function GroupHeading({ tag, count }: { tag: string; count: number }) {
  return (
    <p className="mb-1.5 flex items-baseline justify-between px-1">
      <span className="font-serif text-[19px] font-medium tracking-tight">{tag}</span>
      <span className="text-[13px] text-muted tabular-nums">{count}</span>
    </p>
  );
}

const byline = (b: Item) => `${b.title}${b.author ? ` by ${b.author}` : ""}`;

/**
 * Books as stacks on a bookcase: one stack per tag, lying flat so each title and author read across the spine. A spine
 * is made from the book's own cover (catalogs have no spine photos), with the cover itself at its end.
 */
function Bookshelf({ items, tags, single, onOpen }: ShelfProps) {
  const shelves = groupByTag(items, tags, single, OTHER.book);
  return (
    <div className="space-y-6">
      {shelves.map(([tag, books]) => (
        <section key={tag}>
          <GroupHeading tag={tag} count={books.length} />
          <div className="rounded-t-xl px-3 pt-3" style={{ backgroundColor: "var(--tint-book)" }}>
            <ul className="flex flex-col items-start gap-[3px]">
              {books.map((b) => (
                <Spine key={b.key} book={b} onOpen={() => onOpen(b)} />
              ))}
            </ul>
            {/* The plank the stack rests on. */}
            <div
              className="-mx-3 mt-[3px] h-2.5"
              style={{ background: "linear-gradient(var(--plank), var(--plank-edge))", boxShadow: "0 3px 4px var(--plank-shadow)" }}
              aria-hidden
            />
          </div>
        </section>
      ))}
    </div>
  );
}

function Spine({ book, onOpen }: { book: Item; onOpen: () => void }) {
  const h = hash(book.key);
  const [bg, ink] = BINDINGS[h % BINDINGS.length];
  // A cover that doesn't load falls back to the plain binding.
  const [failed, setFailed] = useState(false);
  const cover = book.coverUrl && !failed ? book.coverUrl : null;
  // Not every book the same size, nor squared off: lengths and a slight offset vary, as in a real stack.
  const width = 74 + (h % 23);
  const offset = (h >> 5) % 14;
  return (
    <li className="max-w-full" style={{ width: `calc(${width}% - ${offset}px)`, marginLeft: offset }}>
      <button
        onClick={onOpen}
        aria-label={byline(book)}
        className="relative flex h-[34px] w-full items-center gap-2 overflow-hidden rounded-[3px] pr-3 pl-1 text-left shadow-[inset_0_-2px_0_rgba(0,0,0,0.14),inset_0_1px_0_rgba(255,255,255,0.14),0_1px_2px_rgba(0,0,0,0.18)] transition-transform duration-150 active:translate-x-1"
        style={{ background: bg, color: cover ? "#FBFAF7" : ink }}
      >
        {cover && (
          <>
            {/* The spine's surface: the book's own cover, enlarged and softened, so it carries the book's colors. */}
            <span
              className="absolute inset-0 scale-125 bg-cover bg-center blur-[6px] saturate-[1.15]"
              style={{ backgroundImage: `url("${cover}")` }}
              aria-hidden
            />
            {/* A shade over it, so the title reads on any cover. */}
            <span className="absolute inset-0 bg-gradient-to-r from-black/45 via-black/30 to-black/20" aria-hidden />
          </>
        )}
        <span className="relative h-[26px] w-[19px] shrink-0 overflow-hidden rounded-[2px] shadow-[0_0_0_1px_rgba(0,0,0,0.12)]" style={{ background: bg }}>
          {cover && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={cover} alt="" className="h-full w-full object-cover" loading="lazy" onError={() => setFailed(true)} />
          )}
        </span>
        <span className="relative min-w-0 flex-1 truncate">
          <span className="font-serif text-[13.5px] font-medium tracking-tight">{book.title}</span>
          {book.author && <span className="ml-2 text-[11.5px] opacity-80">{book.author}</span>}
        </span>
        {book.private && <Icon name="lock" size={12} className="relative shrink-0 opacity-70" />}
      </button>
    </li>
  );
}

/** Three frames to a strip, so a row never runs off the screen. */
const chunk = <T,>(xs: T[], n: number) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

/** A row of sprocket holes along a film strip's edge. */
function Sprockets() {
  return (
    <span
      className="block h-[5px] rounded-[1px] opacity-80"
      style={{ background: "repeating-linear-gradient(90deg, var(--film-hole) 0 7px, transparent 7px 13px)" }}
      aria-hidden
    />
  );
}

/** Film & TV as film strips: one strip per genre or tag, posters as the frames, title and year under each. */
function Filmstrips({ items, tags, single, onOpen }: ShelfProps) {
  return (
    <div className="space-y-6">
      {groupByTag(items, tags, single, OTHER.screen).map(([tag, list]) => (
        <section key={tag}>
          <GroupHeading tag={tag} count={list.length} />
          <div className="space-y-3">
            {chunk(list, 3).map((row) => (
              <div key={row[0].key}>
                <div className="space-y-2 rounded-[4px] px-2 py-[6px]" style={{ backgroundColor: "var(--film)" }}>
                  <Sprockets />
                  <div className="grid grid-cols-3 gap-2">
                    {row.map((b) => (
                      <button key={b.key} onClick={() => onOpen(b)} aria-label={byline(b)} className="block transition-transform duration-150 active:scale-[0.96]">
                        <Frame item={b} />
                      </button>
                    ))}
                  </div>
                  <Sprockets />
                </div>
                <div className="grid grid-cols-3 gap-2 px-2 pt-1.5">
                  {row.map((b) => (
                    <button key={b.key} onClick={() => onOpen(b)} className="min-w-0 text-left" tabIndex={-1} aria-hidden>
                      <span className="line-clamp-2 text-[12.5px] leading-tight font-medium">{b.title}</span>
                      <span className="block text-[11.5px] text-muted">{[b.year, b.categories.includes("TV") ? "TV" : null].filter(Boolean).join(" · ")}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function Frame({ item }: { item: Item }) {
  const [failed, setFailed] = useState(false);
  const [bg, ink] = BINDINGS[hash(item.key) % BINDINGS.length];
  return (
    <span className="relative flex aspect-[2/3] items-center justify-center overflow-hidden rounded-[2px] p-1.5 text-center" style={{ background: bg, color: ink }}>
      {item.coverUrl && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.coverUrl} alt="" className="absolute inset-0 h-full w-full object-cover" loading="lazy" onError={() => setFailed(true)} />
      ) : (
        <span className="line-clamp-4 font-serif text-[12px] leading-tight font-medium">{item.title}</span>
      )}
      {item.private && <Icon name="lock" size={12} className="absolute top-1 right-1 rounded-full bg-black/40 p-[1px] text-white" />}
    </span>
  );
}

/** Podcasts as cassette cases on a rack: one row per show, a stripe in its cover's colors, name and host across. */
function TapeRack({ items, tags, single, onOpen }: ShelfProps) {
  return (
    <div className="space-y-6">
      {groupByTag(items, tags, single, OTHER.podcast).map(([tag, list]) => (
        <section key={tag}>
          <GroupHeading tag={tag} count={list.length} />
          <ul className="space-y-[3px]">
            {list.map((b) => (
              <TapeSpine key={b.key} item={b} onOpen={() => onOpen(b)} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function TapeSpine({ item, onOpen }: { item: Item; onOpen: () => void }) {
  const [failed, setFailed] = useState(false);
  const [bg] = BINDINGS[hash(item.key) % BINDINGS.length];
  const cover = item.coverUrl && !failed ? item.coverUrl : null;
  return (
    <li>
      <button
        onClick={onOpen}
        aria-label={byline(item)}
        className="flex h-10 w-full items-center gap-3 overflow-hidden rounded-[3px] pr-3 text-left shadow-[0_1px_2px_rgba(0,0,0,0.14)] transition-transform duration-150 active:translate-x-1"
        style={{ backgroundColor: "var(--tape-case)" }}
      >
        {/* The stripe: the left edge of the show's cover, softened, which is usually its background color. */}
        <span className="relative h-full w-3 shrink-0 overflow-hidden" style={{ background: bg }} aria-hidden>
          {cover && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={cover}
              alt=""
              className="absolute top-0 left-0 h-full w-[72px] max-w-none scale-110 object-cover object-left blur-[2px] saturate-[1.15]"
              loading="lazy"
              onError={() => setFailed(true)}
            />
          )}
        </span>
        <span className="min-w-0 flex-1 truncate font-serif text-[14.5px] font-medium tracking-tight">{item.title}</span>
        {item.author && <span className="max-w-[45%] shrink-0 truncate text-[12px] text-muted">{item.author}</span>}
        {item.private && <Icon name="lock" size={12} className="shrink-0 opacity-70" />}
      </button>
    </li>
  );
}
