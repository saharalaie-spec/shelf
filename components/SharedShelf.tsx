"use client";

import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { itemLinks } from "@/lib/client";
import { shelfCount, vocab } from "@/lib/kinds";
import type { Item, Kind, Status } from "@/lib/types";
import { Cover } from "./Cover";
import { Sheet } from "./Sheet";
import { Logo } from "./ui";

type Props = {
  title: string;
  kind: Kind;
  ownerName: string | null;
  status: Status;
  category: string | null;
  items: Item[];
  viewerSignedIn: boolean;
};

export function SharedShelf({ title, kind, ownerName, status, category, items: books, viewerSignedIn }: Props) {
  const v = vocab(kind);
  const [filter, setFilter] = useState<string | null>(null);
  const [open, setOpen] = useState<Item | null>(null);
  const [lastOpen, setLastOpen] = useState<Item | null>(null);

  // A whole-shelf link can still be browsed by category.
  const categories = useMemo(() => {
    if (category) return [];
    const counts = new Map<string, number>();
    for (const b of books) for (const c of b.categories) counts.set(c, (counts.get(c) ?? 0) + 1);
    return [...counts.entries()].filter(([, n]) => n > 1).sort((a, b) => b[1] - a[1]).slice(0, 12);
  }, [books, category]);

  const visible = filter ? books.filter((b) => b.categories.includes(filter)) : books;
  const shown = open ?? lastOpen;

  return (
    <div className="mx-auto min-h-dvh w-full max-w-3xl pb-40">
      <header className="flex h-16 items-center justify-between px-5 pt-[env(safe-area-inset-top)]">
        <Link href="/" className="flex items-center gap-2">
          <Logo size={24} />
          <span className="font-serif text-[19px] font-semibold tracking-tight">Shelf</span>
        </Link>
        {viewerSignedIn && (
          <Link href="/" className="flex h-9 items-center rounded-full bg-surface-2 px-4 text-[14px] font-medium">
            Your shelf
          </Link>
        )}
      </header>

      <section className="px-5 pt-6 pb-6">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent font-serif text-[24px] text-accent-ink">
          {(ownerName ?? "?").charAt(0).toUpperCase()}
        </div>
        <h1 className="mt-4 font-serif text-[38px] leading-[1.05] font-medium tracking-tight text-balance">{title}</h1>
        <p className="mt-2 text-[16px] text-muted">{shelfCount(books.length, status, kind)}</p>
      </section>

      {categories.length > 1 && (
        <div className="no-scrollbar flex gap-2 overflow-x-auto px-5 pb-5">
          {[[null, books.length] as const, ...categories].map(([c, n]) => (
            <button
              key={c ?? "all"}
              onClick={() => setFilter(c)}
              className={`flex h-9 shrink-0 items-center gap-1.5 rounded-full px-4 text-[14px] font-medium whitespace-nowrap transition-colors active:scale-95 ${
                filter === c ? "bg-ink text-paper" : "bg-surface-2 text-ink-2"
              }`}
            >
              {c ?? "All"}
              <span className={filter === c ? "text-paper/60" : "text-muted"}>{n}</span>
            </button>
          ))}
        </div>
      )}

      {books.length === 0 ? (
        <p className="px-5 text-[16px] text-muted">Nothing here yet. Check back soon.</p>
      ) : (
        <ul className="grid grid-cols-3 gap-x-3 gap-y-5 px-5 sm:grid-cols-4 md:grid-cols-5">
          <AnimatePresence initial={false} mode="popLayout">
            {visible.map((b, i) => (
              <motion.li
                key={b.id}
                layout="position"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ delay: Math.min(i, 18) * 0.025, type: "spring", stiffness: 380, damping: 32 }}
              >
                <button
                  onClick={() => {
                    setOpen(b);
                    setLastOpen(b);
                  }}
                  className="block w-full text-left transition-transform active:scale-[0.96]"
                >
                  <Cover book={b} shape={v.shape} />
                  <p className="mt-2 line-clamp-2 text-[13px] leading-snug font-medium">{b.title}</p>
                  {b.author && <p className="truncate text-[12px] text-muted">{b.author}</p>}
                </button>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}

      {/* The invitation. This is where the "get the app" hook will live. */}
      {!viewerSignedIn && (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 px-4 pb-safe">
          <motion.div
            initial={{ y: 120, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.6, type: "spring", stiffness: 260, damping: 26 }}
            className="pointer-events-auto mx-auto flex max-w-xl items-center gap-4 rounded-3xl bg-ink p-4 pl-5 text-paper shadow-float"
          >
            <div className="min-w-0 flex-1">
              <p className="text-[16px] font-medium">Make your own shelf</p>
              <p className="text-[14px] text-paper/65">Your books, podcasts and shows, shared with friends.</p>
            </div>
            <Link href="/" className="inline-flex h-11 shrink-0 items-center rounded-full bg-paper px-5 text-[15px] font-medium text-ink active:scale-[0.97]">
              Start yours
            </Link>
          </motion.div>
        </div>
      )}

      <Sheet open={Boolean(open)} onOpenChange={(o) => !o && setOpen(null)} title={shown?.title ?? "Details"} hideTitle>
        {shown && (
          <div className="px-5 pb-safe">
            <div className="flex gap-5 pt-2 pb-4">
              <Cover book={shown} shape={v.shape} className="w-28 shrink-0" />
              <div className="min-w-0 flex-1 pt-1">
                <h2 className="font-serif text-[24px] leading-tight font-medium tracking-tight">{shown.title}</h2>
                {shown.author && <p className="mt-1 text-[16px] text-ink-2">{shown.author}</p>}
                {shown.year && shown.year > 0 ? <p className="mt-0.5 text-[14px] text-muted">{shown.year}</p> : null}
                {shown.categories.length > 0 && <p className="mt-3 text-[13px] text-muted">{shown.categories.join(" · ")}</p>}
              </div>
            </div>
            <div className="mb-2 flex flex-wrap gap-2">
              {itemLinks(shown, kind).map((l) => (
                <a
                  key={l.label}
                  href={l.href}
                  target="_blank"
                  rel="noreferrer"
                  className="flex h-12 flex-1 items-center justify-center rounded-full bg-surface-2 px-4 text-[15px] font-medium whitespace-nowrap"
                >
                  {l.label}
                </a>
              ))}
            </div>
          </div>
        )}
      </Sheet>
    </div>
  );
}
