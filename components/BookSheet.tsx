"use client";

import { useState } from "react";
import { CATEGORIES } from "@/lib/categories";
import type { Book, Status } from "@/lib/types";
import { BookCover } from "./BookCover";
import { SectionTabs } from "./SectionTabs";
import { Sheet } from "./Sheet";
import { Icon, Switch } from "./ui";

type Props = {
  book: Book | null;
  allCategories: string[];
  onClose: () => void;
  onCategories: (book: Book, categories: string[]) => void;
  onStatus: (book: Book, status: Status) => void;
  onPrivate: (book: Book, value: boolean) => void;
  onRemove: (book: Book) => void;
  /** Whether the owner's profile is public, which changes who a non-private book is visible to. */
  publicProfile: boolean;
};

export function BookSheet({ book, allCategories, onClose, onCategories, onStatus, onPrivate, onRemove, publicProfile }: Props) {
  // Keep showing the last book while the sheet animates closed.
  const [shown, setShown] = useState(book);
  if (book && book !== shown) setShown(book);
  const [custom, setCustom] = useState("");
  const [typing, setTyping] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const b = book ?? shown;
  // The book's own categories and ones already on your shelf first; the full list on request.
  const mine = [...new Set([...(b?.categories ?? []), ...allCategories])];
  const rest = CATEGORIES.filter((c) => !mine.includes(c));
  const options = showAll || mine.length < 4 ? [...mine, ...rest] : mine;

  const toggle = (c: string) => {
    if (!b) return;
    const has = b.categories.includes(c);
    onCategories(b, has ? b.categories.filter((x) => x !== c) : [...b.categories, c]);
  };

  const addCustom = (e: React.FormEvent) => {
    e.preventDefault();
    const c = custom.trim();
    if (b && c && !b.categories.includes(c)) onCategories(b, [...b.categories, c]);
    setCustom("");
    setTyping(false);
  };

  return (
    <Sheet open={Boolean(book)} onOpenChange={(o) => !o && onClose()} title={b?.title ?? "Book"} hideTitle>
      {b && (
        <div className="overflow-y-auto px-5 pb-safe" data-vaul-no-drag="">
          <div className="flex gap-5 pt-2">
            <BookCover book={b} className="w-28 shrink-0" locked={b.private} />
            <div className="min-w-0 flex-1 pt-1">
              <h2 className="font-serif text-[24px] leading-tight font-medium tracking-tight">{b.title}</h2>
              {b.author && <p className="mt-1 text-[16px] text-ink-2">{b.author}</p>}
              {b.year && b.year > 0 ? <p className="mt-0.5 text-[14px] text-muted">{b.year}</p> : null}
            </div>
          </div>

          <div className="mt-6">
            <SectionTabs value={b.status} onChange={(s) => onStatus(b, s)} layoutId="book-status-pill" />
          </div>

          <label className="mt-3 flex cursor-pointer items-center gap-3 rounded-2xl bg-paper px-4 py-3">
            <Icon name="lock" size={20} className="shrink-0 text-ink-2" />
            <span className="min-w-0 flex-1">
              <span className="block text-[16px] font-medium">Private</span>
              <span className="block text-[13px] leading-snug text-muted">
                {b.private
                  ? "Only you can see this book."
                  : publicProfile
                    ? "Anyone with your profile link can see it."
                    : "Your friends can see it."}
              </span>
            </span>
            <Switch checked={b.private} onChange={(v) => onPrivate(b, v)} label="Private" />
          </label>

          <p className="mt-6 mb-2.5 text-[13px] font-medium tracking-wide text-muted uppercase">Categories</p>
          <div className="flex flex-wrap gap-2">
            {options.map((c) => {
              const on = b.categories.includes(c);
              return (
                <button
                  key={c}
                  onClick={() => toggle(c)}
                  className={`flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[14px] font-medium transition-[background-color,color,transform] active:scale-95 ${
                    on ? "bg-ink text-paper" : "border border-line text-ink-2"
                  }`}
                >
                  {on && <Icon name="check" size={14} />}
                  {c}
                </button>
              );
            })}
            {options.length < mine.length + rest.length && (
              <button onClick={() => setShowAll(true)} className="flex h-9 items-center rounded-full px-3 text-[14px] font-medium text-muted active:scale-95">
                More…
              </button>
            )}
            {typing ? (
              <form onSubmit={addCustom}>
                <input
                  autoFocus
                  value={custom}
                  onChange={(e) => setCustom(e.target.value)}
                  onBlur={addCustom}
                  placeholder="New category"
                  maxLength={40}
                  className="h-9 w-40 rounded-full border border-ink bg-transparent px-3.5 text-[14px] outline-none"
                />
              </form>
            ) : (
              <button onClick={() => setTyping(true)} className="flex h-9 items-center gap-1 rounded-full border border-dashed border-line px-3.5 text-[14px] font-medium text-muted active:scale-95">
                <Icon name="plus" size={14} /> New
              </button>
            )}
          </div>

          <button
            onClick={() => onRemove(b)}
            className="mt-8 mb-2 flex h-12 w-full items-center justify-center gap-2 rounded-full text-[15px] font-medium text-accent active:bg-surface-2"
          >
            <Icon name="trash" size={18} /> Remove from shelf
          </button>
        </div>
      )}
    </Sheet>
  );
}
