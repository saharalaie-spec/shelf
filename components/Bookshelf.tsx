"use client";

import { useState } from "react";
import type { Item } from "@/lib/types";
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

const OTHER = "More books";
const VIEW_KEY = "trove:books:view";

/**
 * Books as the covers grid (the default) or as stacks, remembered on this device and the same on your lists and on
 * friends' pages. Until the page is live in the browser it's the grid, as the server drew it.
 */
export function useBookStacks(): [boolean, (on: boolean) => void] {
  const hydrated = useHydrated();
  const [stack, setStack] = useState(() => {
    try {
      return localStorage.getItem(VIEW_KEY) === "stack";
    } catch {
      return false;
    }
  });
  const set = (on: boolean) => {
    setStack(on);
    try {
      localStorage.setItem(VIEW_KEY, on ? "stack" : "grid");
    } catch {
      // Private browsing: it just won't be remembered.
    }
  };
  return [hydrated && stack, set];
}

/** Grid | Stack. */
export function BookViewSwitch({ stack, onChange, className = "" }: { stack: boolean; onChange: (on: boolean) => void; className?: string }) {
  return (
    <div className={`flex shrink-0 rounded-full bg-surface-2 p-1 ${className}`} role="radiogroup" aria-label="Show books as">
      {(
        [
          [false, "Grid"],
          [true, "Stack"],
        ] as const
      ).map(([on, label]) => (
        <button
          key={label}
          role="radio"
          aria-checked={stack === on}
          onClick={() => onChange(on)}
          className={`h-8 rounded-full px-3 text-[13px] font-medium transition-colors ${stack === on ? "bg-surface text-ink shadow-book" : "text-ink-2"}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/**
 * Books as stacks on a bookcase: one stack per tag, in order of how many books it holds, each book once (on the
 * stack of its most common tag), lying flat so its title and author read across the spine. A spine is made from the
 * book's own cover (catalogs have no spine photos), with the cover itself at its end. Tags with a single book share a
 * last "More books" stack.
 */
export function Bookshelf({ items, tags, single, onOpen }: { items: Item[]; tags: [string, number][]; single?: string | null; onOpen: (b: Item) => void }) {
  const rank = new Map(tags.map(([t], i) => [t, i]));
  const shelves = new Map<string, Item[]>();
  for (const b of items) {
    const tag = single ?? [...b.categories].filter((c) => rank.has(c)).sort((x, y) => rank.get(x)! - rank.get(y)!)[0] ?? OTHER;
    shelves.set(tag, [...(shelves.get(tag) ?? []), b]);
  }
  if (!single && shelves.size > 1) {
    for (const [tag, books] of [...shelves]) {
      if (tag === OTHER || books.length > 1) continue;
      shelves.delete(tag);
      shelves.set(OTHER, [...(shelves.get(OTHER) ?? []), ...books]);
    }
  }
  const order = [...shelves.keys()].sort((a, b) => (a === OTHER ? 1 : b === OTHER ? -1 : (rank.get(a) ?? 0) - (rank.get(b) ?? 0)));

  return (
    <div className="space-y-6">
      {order.map((tag) => (
        <section key={tag}>
          <p className="mb-1.5 flex items-baseline justify-between px-1">
            <span className="font-serif text-[19px] font-medium tracking-tight">{tag}</span>
            <span className="text-[13px] text-muted tabular-nums">{shelves.get(tag)!.length}</span>
          </p>
          <div className="rounded-t-xl px-3 pt-3" style={{ backgroundColor: "var(--tint-book)" }}>
            <ul className="flex flex-col items-start gap-[3px]">
              {shelves.get(tag)!.map((b) => (
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
        aria-label={`${book.title}${book.author ? ` by ${book.author}` : ""}`}
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
