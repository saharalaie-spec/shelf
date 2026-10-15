"use client";

import { AnimatePresence, motion } from "motion/react";
import type { Destination, Item } from "@/lib/types";
import { SpotTile, spotLine } from "./Spot";
import { Icon } from "./ui";

type Props = {
  items: Item[];
  destinations: Destination[];
  /** Everywhere: one group per destination. One destination: one group per kind of spot. */
  groupBy: "destination" | "category";
  onOpen: (item: Item) => void;
  /** In-progress spots get a quick "Been" button. */
  onDone?: (item: Item) => void;
  doneLabel?: string;
};

/** Spots as list rows, grouped under headings. */
export function PlacesList({ items, destinations, groupBy, onOpen, onDone, doneLabel }: Props) {
  const byId = new Map(destinations.map((d) => [d.id, d]));
  const groups = new Map<string, Item[]>();
  for (const item of items) {
    const key =
      groupBy === "destination"
        ? (byId.get(item.destinationId ?? "")?.name ?? "Elsewhere")
        : (item.categories[0] ?? "Other");
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  // Destinations keep their (most recent first) order; kinds of spot go biggest first.
  const order =
    groupBy === "destination"
      ? [...groups.keys()]
      : [...groups.keys()].sort((a, b) => groups.get(b)!.length - groups.get(a)!.length || a.localeCompare(b));

  return (
    <div className="space-y-6">
      {order.map((name) => (
        <section key={name}>
          <h3 className="mb-1 flex items-baseline justify-between px-1">
            <span className="font-serif text-[20px] font-medium tracking-tight">{name}</span>
            <span className="text-[13px] text-muted tabular-nums">{groups.get(name)!.length}</span>
          </h3>
          <ul className="-mx-2">
            <AnimatePresence initial={false} mode="popLayout">
              {groups.get(name)!.map((item) => (
                <SpotRow key={item.key} item={item} onOpen={() => onOpen(item)} onDone={onDone && (() => onDone(item))} doneLabel={doneLabel} />
              ))}
            </AnimatePresence>
          </ul>
        </section>
      ))}
    </div>
  );
}

function SpotRow({ item, onOpen, onDone, doneLabel }: { item: Item; onOpen: () => void; onDone?: () => void; doneLabel?: string }) {
  return (
    <motion.li
      layout="position"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: 40 }}
      transition={{ type: "spring", stiffness: 420, damping: 34 }}
      className="flex items-center gap-3 rounded-2xl px-2 py-2"
    >
      <button onClick={onOpen} disabled={item.id.startsWith("tmp:")} className="flex min-w-0 flex-1 items-center gap-3 text-left active:opacity-70">
        <SpotTile spot={item} size={48} />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-[16px] font-medium">{item.title}</span>
            {item.private && <Icon name="lock" size={13} className="shrink-0 text-muted" />}
          </span>
          <span className="block truncate text-[14px] text-muted">{spotLine(item) || "Spot"}</span>
          {item.note && <span className="block truncate text-[13px] text-ink-2 italic">“{item.note}”</span>}
        </span>
      </button>
      {onDone && (
        <button
          onClick={onDone}
          className="flex h-9 shrink-0 items-center gap-1 rounded-full bg-ink px-3.5 text-[13px] font-medium text-paper active:scale-95"
        >
          <Icon name="check" size={14} />
          {doneLabel}
        </button>
      )}
    </motion.li>
  );
}

/** The big title for one destination, with its actions. */
export function DestinationHeader({
  destination,
  count,
  noun,
  onAdd,
  onShare,
  onEdit,
}: {
  destination: Destination;
  count: number;
  noun: string;
  onAdd: () => void;
  onShare?: () => void;
  onEdit: () => void;
}) {
  const where = [destination.label, destination.country].filter(Boolean).join(" in ");
  return (
    <div className="mt-2 mb-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-serif text-[34px] leading-tight font-medium tracking-tight">{destination.name}</h1>
          <p className="text-[15px] text-muted">
            {noun}
            {where ? ` · ${where}` : ""}
          </p>
        </div>
        <button
          onClick={onEdit}
          aria-label={`Edit ${destination.name}`}
          className="mt-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-2 active:scale-95"
        >
          <Icon name="more" size={20} />
        </button>
      </div>
      <div className="mt-4 flex gap-2">
        <button
          onClick={onAdd}
          className="flex h-10 items-center gap-1.5 rounded-full bg-ink px-4 text-[14px] font-medium text-paper active:scale-95"
        >
          <Icon name="plus" size={16} /> Add spots here
        </button>
        {onShare && count > 0 && (
          <button
            onClick={onShare}
            className="flex h-10 items-center gap-1.5 rounded-full bg-surface-2 px-4 text-[14px] font-medium active:scale-95"
          >
            <Icon name="share" size={16} /> Share
          </button>
        )}
      </div>
    </div>
  );
}
