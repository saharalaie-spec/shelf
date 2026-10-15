"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { vocab } from "@/lib/kinds";
import type { Candidate, Kind, Status } from "@/lib/types";
import { ImportView } from "./add/ImportView";
import { PasteView } from "./add/PasteView";
import { PhotoView } from "./add/PhotoView";
import { ReviewView } from "./add/ReviewView";
import { ScanView } from "./add/ScanView";
import { SearchView, type Method } from "./add/SearchView";
import { VoiceView } from "./add/VoiceView";
import { DestinationPicker } from "./Destinations";
import { SectionTabs } from "./SectionTabs";
import type { ShelfActions, ShelfApi } from "./ShelfApp";
import { Sheet } from "./Sheet";
import { Icon } from "./ui";

type View = "search" | Method | "review" | "where";

const TITLES: Record<View, string> = {
  search: "",
  where: "Where?",
  paste: "Paste a list",
  voice: "Say them out loud",
  scan: "Scan barcodes",
  photo: "",
  import: "",
  review: "Look right?",
};

/** The titles that differ between collections. */
const KIND_TITLES: Record<Kind, Partial<Record<View, string>>> = {
  book: { photo: "Snap your shelf", import: "Import your library" },
  podcast: { photo: "Screenshot your app", import: "Import subscriptions" },
  screen: { photo: "Snap or screenshot", import: "Import your history" },
  place: { photo: "Screenshot a list", import: "Import from Google Maps" },
};

type Props = {
  kind: Kind;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The section on screen; new items go there unless the picker says otherwise. */
  section: Status;
  /** Places: the destination on screen, where new spots go unless changed here. */
  destination?: string | null;
  /** Places: open straight on the destination picker ("New place"). */
  pickDestination?: boolean;
  shelf: ShelfApi;
  empty: boolean;
  features: { photo: boolean };
};

export function AddSheet({ kind, open, onOpenChange, section, destination = null, pickDestination, shelf, empty, features }: Props) {
  const v = vocab(kind);
  const isPlace = kind === "place";
  // Places start by asking where, when there's nowhere yet (a first visit opens the sheet straight away).
  const [view, setView] = useState<View>(() =>
    isPlace && (pickDestination || !(destination ?? shelf.destinations[0]?.id)) ? "where" : "search",
  );
  const [direction, setDirection] = useState(1);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [target, setTarget] = useState<Status>(section);
  // Places: which destination spots go to. Defaults to the one on screen, else the latest one.
  const [destId, setDestId] = useState<string | null>(destination ?? shelf.destinations[0]?.id ?? null);
  const dest = shelf.destinations.find((d) => d.id === destId) ?? null;

  // Each time the sheet opens, start from the section (and destination) being viewed.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setTarget(section);
      if (isPlace) {
        const next = destination ?? shelf.destinations[0]?.id ?? null;
        setDestId(next);
        // No destination yet, or "New place": ask where first.
        if (pickDestination || !next) setView("where");
      }
    }
  }

  const actions: ShelfActions = {
    kind,
    items: shelf.items,
    statusOf: shelf.statusOf,
    destinations: shelf.destinations,
    onDestination: shelf.onDestination,
    destination: dest,
    target,
    add: (hits, opts) => shelf.add(hits, { status: target, destinationId: destId, ...opts }),
  };

  // Come back to search next time; wait for the close animation first.
  useEffect(() => {
    if (open) return;
    const t = setTimeout(() => setView("search"), 350);
    return () => clearTimeout(t);
  }, [open]);

  const go = (next: View) => {
    setDirection(next === "search" ? -1 : 1);
    setView(next);
  };
  const review = (items: Candidate[]) => {
    setCandidates(items);
    go("review");
  };

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={view === "search" ? v.addLabel : (KIND_TITLES[kind][view] ?? TITLES[view])}
      tall
      headerLeft={
        view !== "search" && !(view === "where" && !dest) ? (
          <button
            onClick={() => go("search")}
            aria-label="Back"
            className="-ml-2 flex h-10 w-10 items-center justify-center rounded-full text-ink-2 active:bg-surface-2"
          >
            <Icon name="back" />
          </button>
        ) : null
      }
      headerRight={
        <button
          onClick={() => onOpenChange(false)}
          className="-mr-2 h-10 rounded-full px-3 text-[16px] font-medium text-accent active:bg-surface-2"
        >
          Done
        </button>
      }
    >
      {view !== "where" && (
        <div className="flex shrink-0 items-center gap-3 px-5 pb-3">
          <span className="text-[13px] font-medium text-muted">Add to</span>
          <div className="flex-1">
            <SectionTabs value={target} labels={v.sections} onChange={setTarget} layoutId="add-target-pill" />
          </div>
        </div>
      )}
      {isPlace && view !== "where" && dest && (
        <div className="flex shrink-0 items-center gap-3 px-5 pb-3">
          <span className="w-[42px] text-[13px] font-medium text-muted">In</span>
          <button
            onClick={() => go("where")}
            className="flex h-10 min-w-0 items-center gap-2 rounded-full bg-surface-2 pr-3 pl-1.5 text-[15px] font-medium active:scale-95"
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#3d5a3c] text-white">
              <Icon name="pin" size={15} />
            </span>
            <span className="truncate">{dest.name}</span>
            <Icon name="down" size={16} className="shrink-0 text-muted" />
          </button>
        </div>
      )}
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        <AnimatePresence mode="popLayout" initial={false} custom={direction}>
          <motion.div
            key={view}
            custom={direction}
            initial={{ x: `${direction * 30}%`, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: `${direction * -30}%`, opacity: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 36 }}
            className="flex min-h-0 flex-1 flex-col"
          >
            {view === "where" && (
              <DestinationPicker
                destinations={shelf.destinations}
                current={destId}
                onPicked={(d, created) => {
                  shelf.onDestination(d, created);
                  setDestId(d.id);
                  go("search");
                }}
              />
            )}
            {view === "search" && <SearchView shelf={actions} empty={empty} features={features} onMethod={go} />}
            {view === "paste" && <PasteView kind={kind} onReview={review} />}
            {view === "voice" && <VoiceView kind={kind} onReview={review} />}
            {view === "scan" && <ScanView shelf={actions} />}
            {view === "photo" && <PhotoView kind={kind} onReview={review} />}
            {view === "import" && <ImportView kind={kind} onReview={review} />}
            {view === "review" && (
              <ReviewView items={candidates} shelf={actions} onAdded={() => onOpenChange(false)} />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </Sheet>
  );
}
