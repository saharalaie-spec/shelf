"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/client";
import { SPOT_BROWSE } from "@/lib/place-categories";
import { vocab, type Vocab } from "@/lib/kinds";
import type { Hit, Kind, Status } from "@/lib/types";
import { Cover } from "../Cover";
import { SpotTile, spotLine } from "../Spot";
import type { ShelfActions } from "../ShelfApp";
import { Icon, type IconName } from "../ui";
import { typedHit } from "./typed";

export type Method = "paste" | "voice" | "scan" | "photo" | "import";

type Props = {
  shelf: ShelfActions;
  empty: boolean;
  features: { photo: boolean };
  onMethod: (m: Method) => void;
};

/** The bulk-add methods each collection offers. */
const METHODS: Record<Kind, { id: Method; icon: IconName; title: string; desc: string; needs?: "speech" | "photo" }[]> = {
  book: [
    { id: "paste", icon: "list", title: "Paste a list", desc: "Dump every title you remember" },
    { id: "voice", icon: "mic", title: "Say them", desc: "Read titles out loud", needs: "speech" },
    { id: "scan", icon: "barcode", title: "Scan barcodes", desc: "Point at the back cover" },
    { id: "photo", icon: "camera", title: "Snap your shelf", desc: "One photo, every spine", needs: "photo" },
    { id: "import", icon: "file", title: "Import", desc: "Goodreads or StoryGraph" },
  ],
  podcast: [
    { id: "photo", icon: "camera", title: "Screenshot your app", desc: "Spotify or Apple Podcasts library", needs: "photo" },
    { id: "paste", icon: "list", title: "Paste a list", desc: "Every show you remember" },
    { id: "voice", icon: "mic", title: "Say them", desc: "Name shows out loud", needs: "speech" },
    { id: "import", icon: "file", title: "Import", desc: "OPML from Overcast, Pocket Casts…" },
  ],
  screen: [
    { id: "photo", icon: "camera", title: "Snap or screenshot", desc: "A watchlist, an app, your DVDs", needs: "photo" },
    { id: "paste", icon: "list", title: "Paste a list", desc: "Everything you’ve seen" },
    { id: "voice", icon: "mic", title: "Say them", desc: "Name titles out loud", needs: "speech" },
    { id: "import", icon: "file", title: "Import", desc: "Letterboxd, IMDb or Netflix" },
  ],
  place: [
    { id: "photo", icon: "camera", title: "Screenshot a list", desc: "A saved list, a note, a guide", needs: "photo" },
    { id: "paste", icon: "list", title: "Paste a list", desc: "Every spot you remember" },
    { id: "voice", icon: "mic", title: "Say them", desc: "Name spots out loud", needs: "speech" },
    { id: "import", icon: "file", title: "Import", desc: "Google Maps saved places" },
  ],
};

/** Icons for the one-tap "browse" chips, by the hint lib/place-categories gives. */
const BROWSE_ICON: Record<string, IconName> = {
  food: "food",
  coffee: "coffee",
  glass: "glass",
  museum: "museum",
  camera: "camera",
  leaf: "leaf",
  bag: "bag",
  bed: "bed",
};

export function SearchView({ shelf, empty, features, onMethod }: Props) {
  const { kind, destination } = shelf;
  const v = vocab(kind);
  const isPlace = kind === "place";
  // Spots are searched inside the chosen destination.
  const searchUrl = (text: string) =>
    `/api/search?kind=${kind}${isPlace && destination ? `&dest=${destination.id}` : ""}&q=${encodeURIComponent(text)}`;
  const [q, setQ] = useState("");
  const [browsing, setBrowsing] = useState<{ label: string; results: Hit[] | null } | null>(null);
  const [results, setResults] = useState<Hit[]>([]);
  const [resultsFor, setResultsFor] = useState("");
  const [failedFor, setFailedFor] = useState<string | null>(null);
  // Sheets only render in the browser, so it's safe to look at window here.
  const [speech] = useState(() => {
    const w = window as unknown as Record<string, unknown>;
    return Boolean(w.SpeechRecognition || w.webkitSpeechRecognition);
  });
  const inputRef = useRef<HTMLInputElement>(null);
  const [openedAt] = useState(() => Date.now());
  // Added or moved while this sheet is open.
  const justAdded = shelf.items.filter((b) => b.addedAt >= openedAt || b.statusAt >= openedAt);
  const query = q.trim();
  const failed = failedFor === query;
  const loading = query.length >= 2 && resultsFor !== query && !failed;

  // Enter adds the top match and clears the field, so you can rattle off titles one after another.
  // Each title is looked up on its own, so typing ahead never drops the previous one.
  const addQuery = async (text: string) => {
    setQ("");
    inputRef.current?.focus();
    let hits = resultsFor === text ? results : null;
    if (!hits) {
      try {
        hits = (await api<{ results: Hit[] }>(searchUrl(text))).results;
      } catch {
        hits = [];
      }
    }
    shelf.add([hits[0] ?? typedHit(kind, { title: text })]);
  };

  const addTyped = (text: string) => {
    setQ("");
    inputRef.current?.focus();
    shelf.add([typedHit(kind, { title: text })]);
  };

  useEffect(() => {
    if (query.length < 2) return;
    const ac = new AbortController();
    const t = setTimeout(async () => {
      try {
        const data = await api<{ results: Hit[] }>(searchUrl(query), { signal: ac.signal });
        setResults(data.results);
        setResultsFor(query);
      } catch {
        if (!ac.signal.aborted) setFailedFor(query);
      }
    }, 180);
    return () => {
      clearTimeout(t);
      ac.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, kind, destination?.id]);

  const browse = async (category: string, label: string) => {
    if (!destination) return;
    setBrowsing({ label, results: null });
    try {
      const { results } = await api<{ results: Hit[] }>(
        `/api/search?kind=place&dest=${destination.id}&browse=${encodeURIComponent(category)}`,
      );
      setBrowsing((b) => (b?.label === label ? { label, results } : b));
    } catch {
      setBrowsing((b) => (b?.label === label ? { label, results: [] } : b));
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "Enter" || query.length < 2) return;
    e.preventDefault();
    addQuery(query);
  };

  const showResults = query.length >= 2;
  const stale = resultsFor !== query;

  const methods = METHODS[kind].filter((m) => (m.needs === "speech" ? speech : m.needs === "photo" ? features.photo : true));

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="px-5 pt-1 pb-3">
        <div className="flex h-14 items-center gap-3 rounded-2xl bg-surface-2 px-4 transition-shadow focus-within:shadow-[0_0_0_2px_var(--ink)]">
          <Icon name="search" className="shrink-0 text-muted" />
          <input
            ref={inputRef}
            autoFocus
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setBrowsing(null);
            }}
            onKeyDown={onKeyDown}
            enterKeyHint="done"
            placeholder={isPlace && destination ? `Search spots in ${destination.name}` : v.placeholder}
            aria-label={`Search for ${v.many}`}
            autoComplete="off"
            autoCorrect="off"
            className="h-full min-w-0 flex-1 bg-transparent text-[17px] outline-none placeholder:text-muted"
          />
          {q && (
            <button onClick={() => setQ("")} aria-label="Clear" className="-mr-1 flex h-8 w-8 items-center justify-center rounded-full text-muted active:bg-line">
              <Icon name="x" size={18} />
            </button>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-safe" data-vaul-no-drag="">
        {browsing && !showResults ? (
          <div>
            <div className="flex items-center justify-between px-3 pb-1">
              <p className="text-[13px] font-medium tracking-wide text-muted uppercase">
                {browsing.label} in {destination?.name}
              </p>
              <button onClick={() => setBrowsing(null)} aria-label="Close" className="flex h-8 w-8 items-center justify-center rounded-full text-muted active:bg-surface-2">
                <Icon name="x" size={16} />
              </button>
            </div>
            <ul>
              {!browsing.results && Array.from({ length: 5 }, (_, i) => <SkeletonRow key={i} square />)}
              {browsing.results?.length === 0 && (
                <li className="px-3 py-3 text-[15px] text-muted">Nothing found nearby. Try searching by name.</li>
              )}
              {browsing.results?.map((hit) => (
                <ResultRow
                  key={hit.key}
                  v={v}
                  hit={hit}
                  top={false}
                  current={shelf.statusOf.get(hit.key)}
                  target={shelf.target}
                  onAdd={() => shelf.add([hit])}
                />
              ))}
            </ul>
          </div>
        ) : showResults ? (
          <ul className={`transition-opacity duration-200 ${stale && results.length ? "opacity-60" : ""}`}>
            {results.length === 0 && loading && Array.from({ length: 4 }, (_, i) => <SkeletonRow key={i} square={v.shape === "square"} />)}
            {results.map((hit, i) => (
              <ResultRow
                key={hit.key}
                v={v}
                hit={hit}
                top={i === 0 && !stale}
                current={shelf.statusOf.get(hit.key)}
                target={shelf.target}
                onAdd={() => shelf.add([hit])}
              />
            ))}
            {!loading && (
              <li>
                {results.length === 0 && (
                  <p className="px-3 pt-3 pb-1 text-[15px] text-muted">
                    {failed ? `Couldn’t reach ${v.catalog}.` : `No ${v.many} found for “${query}”.`}
                  </p>
                )}
                <button
                  onClick={() => addTyped(query)}
                  className="mt-1 flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-[15px] text-ink-2 active:bg-surface-2"
                >
                  <span
                    className={`flex w-9 items-center justify-center rounded-[4px] border border-dashed border-line ${v.shape === "square" ? "h-9" : "h-[54px]"}`}
                  >
                    <Icon name="plus" size={16} />
                  </span>
                  Add “{query}” as you typed it
                </button>
              </li>
            )}
          </ul>
        ) : (
          <div className="px-2">
            <AnimatePresence initial={false}>
              {justAdded.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  className="overflow-hidden"
                >
                  <p className="px-1 pb-2 text-[13px] font-medium tracking-wide text-muted uppercase">
                    Added just now · {justAdded.length}
                  </p>
                  <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-6 pb-5">
                    <AnimatePresence initial={false}>
                      {justAdded.slice(0, 30).map((b) => (
                        <motion.div
                          key={b.key}
                          layout
                          initial={{ opacity: 0, scale: 0.6 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ type: "spring", stiffness: 500, damping: 30 }}
                          className="w-12 shrink-0"
                        >
                          {isPlace ? <SpotTile spot={b} size={48} /> : <Cover book={b} shape={v.shape} rounded="rounded-[3px]" />}
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            {empty && !justAdded.length && (
              <p className="px-1 pb-4 text-[15px] leading-relaxed text-muted">
                Start with any {v.one} you remember. Press enter to add the top match, then type the next one.
              </p>
            )}
            {isPlace && destination && (
              <>
                <p className="px-1 pb-2 text-[13px] font-medium tracking-wide text-muted uppercase">Browse {destination.name}</p>
                <div className="flex flex-wrap gap-2 pb-6">
                  {SPOT_BROWSE.map((b) => (
                    <button
                      key={b.category}
                      onClick={() => browse(b.category, b.label)}
                      className="flex h-10 items-center gap-2 rounded-full border border-line bg-surface pr-4 pl-3 text-[15px] font-medium active:scale-95"
                    >
                      <Icon name={BROWSE_ICON[b.icon] ?? "pin"} size={17} className="text-ink-2" />
                      {b.label}
                    </button>
                  ))}
                </div>
              </>
            )}
            <p className="px-1 pb-2 text-[13px] font-medium tracking-wide text-muted uppercase">Or add a bunch at once</p>
            <div className="grid grid-cols-2 gap-2.5">
              {methods.map((m, i) => (
                  <motion.button
                    key={m.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.035 }}
                    onClick={() => onMethod(m.id)}
                    className="flex flex-col items-start gap-3 rounded-2xl border border-line bg-surface p-4 text-left transition-transform active:scale-[0.97]"
                  >
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-2 text-ink">
                      <Icon name={m.icon} />
                    </span>
                    <span>
                      <span className="block text-[16px] font-medium">{m.title}</span>
                      <span className="block text-[13px] leading-snug text-muted">{m.desc}</span>
                    </span>
                  </motion.button>
                ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ResultRow({
  v,
  hit,
  top,
  current,
  target,
  onAdd,
}: {
  v: Vocab;
  hit: Hit;
  top: boolean;
  current: Status | undefined;
  target: Status;
  onAdd: () => void;
}) {
  const here = current === target;
  return (
    <li>
      <button
        onClick={here ? undefined : onAdd}
        disabled={here}
        className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors active:bg-surface-2 ${top ? "bg-surface-2/60" : ""}`}
      >
        {v.kind === "place" ? (
          <SpotTile spot={hit} size={40} />
        ) : (
          <Cover book={hit} shape={v.shape} className="w-9 shrink-0" rounded="rounded-[3px]" />
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[16px] font-medium">{hit.title}</span>
          <span className="block truncate text-[14px] text-muted">
            {current && !here
              ? `In ${v.sections[current]} · tap to move`
              : v.kind === "place"
                ? spotLine(hit) || v.creatorFallback
                : [hit.author, hit.year && hit.year > 0 ? hit.year : null].filter(Boolean).join(" · ") || v.creatorFallback}
          </span>
        </span>
        <AnimatePresence mode="wait" initial={false}>
          {here ? (
            <motion.span
              key="on"
              initial={{ scale: 0.4, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 500, damping: 22 }}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-good text-white"
              aria-label={`In ${v.sections[target]}`}
            >
              <Icon name="check" size={18} />
            </motion.span>
          ) : (
            <motion.span
              key="add"
              exit={{ scale: 0.4, opacity: 0 }}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line text-ink"
            >
              <Icon name={current ? "arrow" : "plus"} size={18} />
            </motion.span>
          )}
        </AnimatePresence>
      </button>
    </li>
  );
}

function SkeletonRow({ square }: { square: boolean }) {
  return (
    <li className="flex items-center gap-3 px-3 py-2.5">
      <div className={`skeleton w-9 rounded-[3px] ${square ? "aspect-square" : "aspect-[2/3]"}`} />
      <div className="flex-1 space-y-2">
        <div className="skeleton h-4 w-3/5 rounded" />
        <div className="skeleton h-3 w-2/5 rounded" />
      </div>
    </li>
  );
}
