"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/client";
import { vocab } from "@/lib/kinds";
import type { Hit, Candidate, MatchResult } from "@/lib/types";
import { Cover } from "../Cover";
import type { ShelfActions } from "../ShelfApp";
import { Button, Icon } from "../ui";
import { normalize, typedHit } from "./typed";

const BATCH = 10;
const PARALLEL = 3;

type Props = { items: Candidate[]; shelf: ShelfActions; onAdded: () => void };

export function ReviewView({ items, shelf, onAdded }: Props) {
  const { kind } = shelf;
  const v = vocab(kind);
  const square = v.shape === "square";
  const [results, setResults] = useState<(MatchResult | null)[]>(() => items.map(() => null));
  // Per-row overrides. Unset means "use the default": the best match, ticked.
  const [picked, setPicked] = useState<Record<number, Hit>>({});
  const [ticked, setTicked] = useState<Record<number, boolean>>({});
  const [open, setOpen] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const batches: number[][] = [];
    for (let i = 0; i < items.length; i += BATCH) batches.push(items.slice(i, i + BATCH).map((_, j) => i + j));
    let next = 0;
    const worker = async () => {
      while (!cancelled && next < batches.length) {
        const idx = batches[next++];
        let rs: MatchResult[];
        try {
          rs = (await api<{ results: MatchResult[] }>("/api/match", { body: { kind, items: idx.map((i) => items[i]) } })).results;
        } catch {
          rs = idx.map((i) => ({ input: items[i], match: null, alternatives: [] }));
        }
        if (cancelled) return;
        setResults((prev) => {
          const copy = [...prev];
          idx.forEach((i, j) => (copy[i] = rs[j]));
          return copy;
        });
      }
    };
    Promise.all(Array.from({ length: PARALLEL }, worker));
    return () => {
      cancelled = true;
    };
  }, [items, kind]);

  const done = results.filter(Boolean).length;
  const loading = done < items.length;

  const hitFor = (i: number) => picked[i] ?? results[i]?.match ?? typedHit(kind, items[i]);
  // Imports know each item's section; everything else goes where the picker says.
  const statusFor = (i: number) => items[i].status ?? shelf.target;
  const alreadyThere = (i: number) => shelf.statusOf.get(hitFor(i).key) === statusFor(i);
  const isTicked = (i: number) => {
    const r = results[i];
    if (!r) return false;
    if (alreadyThere(i)) return false;
    return ticked[i] ?? Boolean(r.match);
  };

  const selected = useMemo(
    () => results.map((_, i) => i).filter(isTicked),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [results, picked, ticked, shelf.statusOf, shelf.target],
  );
  const matched = results.filter((r) => r?.match).length;

  const addAll = async () => {
    setAdding(true);
    const added = await shelf.add(selected.map((i) => ({ ...hitFor(i), status: statusFor(i) })));
    setAdding(false);
    if (added.length) onAdded();
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="px-5 pb-2">
        {loading ? (
          <div>
            <p className="text-[15px] text-muted">
              Finding your {v.many}… {done} of {items.length}
            </p>
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-surface-2">
              <motion.div className="h-full rounded-full bg-ink" animate={{ width: `${(done / items.length) * 100}%` }} transition={{ ease: "easeOut" }} />
            </div>
          </div>
        ) : (
          <p className="text-[15px] text-muted">
            Found {matched} of {items.length}. Tap one to fix the match.
          </p>
        )}
      </div>

      <ul className="min-h-0 flex-1 overflow-y-auto px-3" data-vaul-no-drag="">
        {items.map((input, i) => {
          const r = results[i];
          if (!r) return <PendingRow key={i} input={input} square={square} />;
          const hit = hitFor(i);
          const onShelf = alreadyThere(i);
          const current = shelf.statusOf.get(hit.key);
          const ownSection = input.status && input.status !== shelf.target ? ` · ${v.sections[input.status]}` : "";
          const isTyped = hit.key.startsWith("typed:");
          const expanded = open === i;
          const options = [r.match, ...r.alternatives].filter((h): h is Hit => Boolean(h));
          const differs = r.match && !isTyped && !sameBook(input.title, hit.title);
          return (
            <li key={i} className="border-b border-line/60 last:border-0">
              <div className="flex items-center gap-3 px-2 py-2.5">
                <button
                  onClick={() => !onShelf && setTicked((t) => ({ ...t, [i]: !isTicked(i) }))}
                  disabled={onShelf}
                  aria-label={isTicked(i) ? "Don’t add" : "Add"}
                  className="flex h-9 w-9 shrink-0 items-center justify-center"
                >
                  <span
                    className={`flex h-6 w-6 items-center justify-center rounded-full border-[1.5px] transition-colors ${
                      onShelf ? "border-good bg-good text-white" : isTicked(i) ? "border-ink bg-ink text-paper" : "border-line"
                    }`}
                  >
                    {(isTicked(i) || onShelf) && <Icon name="check" size={14} />}
                  </span>
                </button>
                <button onClick={() => setOpen(expanded ? null : i)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                  <Cover book={hit} shape={v.shape} className={`w-10 shrink-0 transition-opacity ${isTicked(i) || onShelf ? "" : "opacity-50"}`} rounded="rounded-[3px]" />
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate text-[16px] font-medium ${isTicked(i) || onShelf ? "" : "text-muted"}`}>{hit.title}</span>
                    <span className="block truncate text-[14px] text-muted">
                      {onShelf
                        ? `Already in ${v.sections[statusFor(i)]}`
                        : current
                          ? `Moves from ${v.sections[current]} to ${v.sections[statusFor(i)]}`
                          : !r.match && !picked[i]
                            ? "No match. Tick to add as typed"
                            : isTyped
                              ? `Added as you typed it${ownSection}`
                              : `${[hit.author, hit.year].filter(Boolean).join(" · ") || v.creatorFallback}${ownSection}`}
                    </span>
                    {differs && <span className="block truncate text-[12px] text-muted/80">from “{input.title}”</span>}
                  </span>
                  {options.length > 0 && (
                    <Icon name="back" size={16} className={`shrink-0 text-muted transition-transform ${expanded ? "rotate-90" : "-rotate-90"}`} />
                  )}
                </button>
              </div>
              <AnimatePresence initial={false}>
                {expanded && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                    <div className="space-y-1 pb-3 pl-14">
                      {[...options, typedHit(kind, input)].map((opt) => {
                        const active = opt.key === hit.key;
                        return (
                          <button
                            key={opt.key}
                            onClick={() => {
                              setPicked((p) => ({ ...p, [i]: opt }));
                              setTicked((t) => ({ ...t, [i]: true }));
                              setOpen(null);
                            }}
                            className={`flex w-full items-center gap-3 rounded-xl px-2 py-1.5 text-left ${active ? "bg-surface-2" : "active:bg-surface-2"}`}
                          >
                            <Cover book={opt} shape={v.shape} className="w-7 shrink-0" rounded="rounded-[2px]" />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[14px] font-medium">
                                {opt.key.startsWith("typed:") ? `Use “${input.title}” as typed` : opt.title}
                              </span>
                              <span className="block truncate text-[13px] text-muted">
                                {opt.key.startsWith("typed:") ? "No artwork, no category" : [opt.author, opt.year].filter(Boolean).join(" · ")}
                              </span>
                            </span>
                            {active && <Icon name="check" size={16} className="text-ink" />}
                          </button>
                        );
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </li>
          );
        })}
      </ul>

      <div className="border-t border-line/60 px-5 pt-3 pb-safe">
        <Button className="w-full" loading={adding} disabled={loading || !selected.length} onClick={addAll}>
          {loading ? "Finding…" : selected.length ? `Add ${v.noun(selected.length)}` : "Nothing selected"}
        </Button>
      </div>
    </div>
  );
}

function PendingRow({ input, square }: { input: Candidate; square: boolean }) {
  return (
    <li className="flex items-center gap-3 border-b border-line/60 px-2 py-2.5">
      <span className="h-9 w-9 shrink-0" />
      <div className={`skeleton w-10 shrink-0 rounded-[3px] ${square ? "aspect-square" : "aspect-[2/3]"}`} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[16px] text-muted">{input.title}</span>
        <span className="skeleton mt-1.5 block h-3 w-1/3 rounded" />
      </span>
    </li>
  );
}

function sameBook(typed: string, title: string) {
  const a = normalize(typed);
  const b = normalize(title);
  return a === b || b.startsWith(a) || a.startsWith(b);
}
