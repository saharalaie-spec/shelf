"use client";

import type { Item } from "@/lib/types";
import { Icon } from "./ui";

/** Spine colors: Trove's navy and stones, with a few warm and muted bindings between them. Text color for each. */
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

/** The same book always looks the same: its colors and size come from its key. */
function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

// Each row of books stands on a plank: the row is this tall, the last PLANK pixels of it being the plank.
const ROW = 190;
const PLANK = 12;
const OTHER = "More books";

/**
 * Books as a bookcase: one shelf per tag, in order of how many books it holds, each book once (on the shelf of its
 * most common tag), spines side by side, wrapping onto the next plank when a shelf is full. Tags with a single book
 * share a last "More books" shelf.
 */
export function Bookshelf({ items, tags, single, onOpen }: { items: Item[]; tags: [string, number][]; single?: string | null; onOpen: (b: Item) => void }) {
  const rank = new Map(tags.map(([t], i) => [t, i]));
  const shelves = new Map<string, Item[]>();
  for (const b of items) {
    const tag = single ?? [...b.categories].filter((c) => rank.has(c)).sort((x, y) => rank.get(x)! - rank.get(y)!)[0] ?? OTHER;
    shelves.set(tag, [...(shelves.get(tag) ?? []), b]);
  }
  // A shelf of one looks bare: those books share the last shelf instead (unless one tag is all there is).
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
          <p className="mb-1 flex items-baseline justify-between px-1">
            <span className="font-serif text-[19px] font-medium tracking-tight">{tag}</span>
            <span className="text-[13px] text-muted tabular-nums">{shelves.get(tag)!.length}</span>
          </p>
          <ul
            className="flex flex-wrap items-end gap-x-[3px] rounded-t-xl px-2.5"
            style={{
              // The back of the bookcase, in the books' stone.
              backgroundColor: "var(--tint-book)",
              // A plank under every row of books, wood-toned, with a soft shadow beneath it.
              backgroundImage: `repeating-linear-gradient(to bottom, transparent 0, transparent ${ROW - PLANK}px, var(--plank) ${ROW - PLANK}px, var(--plank-edge) ${ROW - 2}px, var(--plank-shadow) ${ROW - 2}px, transparent ${ROW}px)`,
            }}
          >
            {shelves.get(tag)!.map((b) => (
              <li key={b.key} className="flex items-end" style={{ height: ROW, paddingBottom: PLANK }}>
                <Spine book={b} onOpen={() => onOpen(b)} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function Spine({ book, onOpen }: { book: Item; onOpen: () => void }) {
  const h = hash(book.key);
  const [bg, ink] = BINDINGS[h % BINDINGS.length];
  // Taller and thicker books for longer titles, with a little variety so the row isn't even.
  const height = 132 + (h % 6) * 7 + Math.min(book.title.length, 30) * 0.4;
  const width = 30 + ((h >> 4) % 4) * 4 + (book.title.length > 24 ? 6 : 0);
  return (
    <button
      onClick={onOpen}
      aria-label={`${book.title}${book.author ? ` by ${book.author}` : ""}`}
      className="relative flex flex-col items-center overflow-hidden rounded-[3px] py-2 shadow-[inset_-3px_0_4px_rgba(0,0,0,0.12),inset_2px_0_0_rgba(255,255,255,0.12),0_1px_2px_rgba(0,0,0,0.18)] transition-transform duration-150 active:-translate-y-1.5"
      style={{ height, width, background: bg, color: ink }}
    >
      {/* Bands across the top and bottom of the spine, like a cloth binding. */}
      <span className="absolute inset-x-0 top-2.5 h-px opacity-40" style={{ background: ink }} aria-hidden />
      <span className="absolute inset-x-0 bottom-2.5 h-px opacity-40" style={{ background: ink }} aria-hidden />
      <span
        className="mt-3 line-clamp-1 max-h-[78%] overflow-hidden font-serif text-[12px] leading-none font-medium tracking-tight whitespace-nowrap text-ellipsis"
        style={{ writingMode: "vertical-rl" }}
      >
        {book.title}
      </span>
      {book.private && <Icon name="lock" size={11} className="absolute bottom-4 opacity-70" />}
    </button>
  );
}
