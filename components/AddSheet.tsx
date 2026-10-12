"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import type { Candidate, Status } from "@/lib/types";
import { ImportView } from "./add/ImportView";
import { PasteView } from "./add/PasteView";
import { PhotoView } from "./add/PhotoView";
import { ReviewView } from "./add/ReviewView";
import { ScanView } from "./add/ScanView";
import { SearchView, type Method } from "./add/SearchView";
import { VoiceView } from "./add/VoiceView";
import { SectionTabs } from "./SectionTabs";
import type { ShelfActions, ShelfApi } from "./ShelfApp";
import { Sheet } from "./Sheet";
import { Icon } from "./ui";

type View = "search" | Method | "review";

const TITLES: Record<View, string> = {
  search: "Add books",
  paste: "Paste a list",
  voice: "Say them out loud",
  scan: "Scan barcodes",
  photo: "Snap your shelf",
  import: "Import your library",
  review: "Look right?",
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The section on screen; new books go there unless the picker says otherwise. */
  section: Status;
  shelf: ShelfApi;
  empty: boolean;
  features: { photo: boolean };
};

export function AddSheet({ open, onOpenChange, section, shelf, empty, features }: Props) {
  const [view, setView] = useState<View>("search");
  const [direction, setDirection] = useState(1);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [target, setTarget] = useState<Status>(section);

  // Each time the sheet opens, start from the section being viewed.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setTarget(section);
  }

  const actions: ShelfActions = {
    books: shelf.books,
    statusOf: shelf.statusOf,
    target,
    add: (hits, opts) => shelf.add(hits, { status: target, ...opts }),
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
      title={TITLES[view]}
      tall
      headerLeft={
        view !== "search" ? (
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
      <div className="flex shrink-0 items-center gap-3 px-5 pb-3">
        <span className="text-[13px] font-medium text-muted">Add to</span>
        <div className="flex-1">
          <SectionTabs value={target} onChange={setTarget} layoutId="add-target-pill" />
        </div>
      </div>
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
            {view === "search" && <SearchView shelf={actions} empty={empty} features={features} onMethod={go} />}
            {view === "paste" && <PasteView onReview={review} />}
            {view === "voice" && <VoiceView onReview={review} />}
            {view === "scan" && <ScanView shelf={actions} />}
            {view === "photo" && <PhotoView onReview={review} />}
            {view === "import" && <ImportView onReview={review} />}
            {view === "review" && (
              <ReviewView items={candidates} shelf={actions} onAdded={() => onOpenChange(false)} />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </Sheet>
  );
}
