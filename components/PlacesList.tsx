"use client";

import { AnimatePresence, motion } from "motion/react";
import { spotTally } from "@/lib/kinds";
import type { Destination, Item, Status } from "@/lib/types";
import { SpotTile, spotLine } from "./Spot";
import { Icon } from "./ui";

type Props = {
  items: Item[];
  destinations: Destination[];
  /** Everywhere: one group per destination. One destination: one group per kind of spot. */
  groupBy: "destination" | "category";
  onOpen: (item: Item) => void;
  /** The owner can flip a spot between Been and Want to go right from the list. */
  onToggle?: (item: Item) => void;
};

/** Spots as list rows, grouped under headings, each marked Been or Want to go. */
export function PlacesList({ items, destinations, groupBy, onOpen, onToggle }: Props) {
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
                <SpotRow key={item.key} item={item} onOpen={() => onOpen(item)} onToggle={onToggle && (() => onToggle(item))} />
              ))}
            </AnimatePresence>
          </ul>
        </section>
      ))}
    </div>
  );
}

function SpotRow({ item, onOpen, onToggle }: { item: Item; onOpen: () => void; onToggle?: () => void }) {
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
          {item.recBy && <span className="block truncate text-[13px] text-muted">From {item.recBy.name}</span>}
        </span>
      </button>
      <StatusTag status={item.status} onToggle={item.id.startsWith("tmp:") ? undefined : onToggle} title={item.title} />
    </motion.li>
  );
}

const TAG = {
  read: { label: "Been", icon: "check", className: "bg-[#3d5a3c] text-white" },
  want: { label: "Want to go", icon: "flag", className: "border border-line text-ink-2" },
} as const;

/** Been or Want to go. A button that flips it for the owner; just a label for everyone else. */
export function StatusTag({ status, onToggle, title }: { status: Status; onToggle?: () => void; title?: string }) {
  const tag = TAG[status === "read" ? "read" : "want"];
  const size = onToggle ? "h-8 px-3 text-[13px]" : "h-7 px-2.5 text-[12px]";
  const body = (
    <AnimatePresence mode="popLayout" initial={false}>
      <motion.span
        key={tag.label}
        initial={{ opacity: 0, scale: 0.7 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.7 }}
        transition={{ type: "spring", stiffness: 600, damping: 30 }}
        className={`flex items-center gap-1 rounded-full font-medium whitespace-nowrap ${size} ${tag.className}`}
      >
        <Icon name={tag.icon} size={onToggle ? 14 : 13} />
        {tag.label}
      </motion.span>
    </AnimatePresence>
  );
  if (!onToggle) return <span className="shrink-0">{body}</span>;
  return (
    <button
      onClick={onToggle}
      aria-label={`${title ? `${title}: ` : ""}${tag.label}. Tap to mark as ${status === "read" ? "Want to go" : "Been"}`}
      className="flex shrink-0 justify-end transition-transform active:scale-90"
    >
      {body}
    </button>
  );
}

const whereOf = (d: Destination) => [d.label, d.country].filter(Boolean).join(" in ");

/** Places' front page: one card per destination, newest activity first. */
export function DestinationCards({
  destinations,
  items,
  onOpen,
  onNew,
}: {
  destinations: Destination[];
  items: Item[];
  onOpen: (d: Destination) => void;
  onNew: () => void;
}) {
  const spotsIn = new Map<string, Item[]>();
  for (const item of items) {
    if (item.destinationId) spotsIn.set(item.destinationId, [...(spotsIn.get(item.destinationId) ?? []), item]);
  }
  const latest = (d: Destination) => Math.max(d.createdAt, ...(spotsIn.get(d.id) ?? []).map((i) => Math.max(i.addedAt, i.statusAt)));
  const sorted = [...destinations].sort((a, b) => latest(b) - latest(a));

  return (
    <ul className="space-y-3">
      <AnimatePresence initial={false} mode="popLayout">
        {sorted.map((d) => {
          const spots = spotsIn.get(d.id) ?? [];
          return (
            <motion.li
              key={d.id}
              layout="position"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ type: "spring", stiffness: 400, damping: 34 }}
            >
              <button
                onClick={() => onOpen(d)}
                className="flex w-full items-center gap-4 rounded-3xl bg-surface p-3 pr-4 text-left shadow-book transition-transform active:scale-[0.98]"
              >
                <Mosaic spots={spots} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-serif text-[21px] leading-tight font-medium tracking-tight">{d.name}</span>
                  {whereOf(d) && <span className="block truncate text-[14px] text-muted">{whereOf(d)}</span>}
                  <span className="mt-0.5 block truncate text-[14px] text-ink-2">{spotTally(spots) || "No spots yet"}</span>
                </span>
                <Icon name="chevron" size={18} className="shrink-0 text-muted" />
              </button>
            </motion.li>
          );
        })}
      </AnimatePresence>
      <li>
        <button
          onClick={onNew}
          className="flex w-full items-center gap-4 rounded-3xl border border-dashed border-line p-3 pr-4 text-left transition-transform active:scale-[0.98]"
        >
          <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[18px] bg-surface-2 text-ink-2">
            <Icon name="plus" size={24} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-serif text-[19px] leading-tight font-medium">New place</span>
            <span className="block text-[14px] text-muted">A city, region or country</span>
          </span>
        </button>
      </li>
    </ul>
  );
}

/** Up to four of a destination's spots, as a little 2×2 of tiles. */
function Mosaic({ spots }: { spots: Item[] }) {
  if (spots.length === 0) {
    return (
      <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[18px] bg-[#3d5a3c]/12 text-[#3d5a3c]">
        <Icon name="pin" size={26} />
      </span>
    );
  }
  if (spots.length === 1) return <SpotTile spot={spots[0]} size={64} />;
  return (
    <span className="grid h-16 w-16 shrink-0 grid-cols-2 gap-1" aria-hidden>
      {[0, 1, 2, 3].map((i) =>
        spots[i] ? (
          <SpotTile key={i} spot={spots[i]} size={30} className="!rounded-[9px] !shadow-none" />
        ) : (
          <span key={i} className="rounded-[9px] bg-surface-2" />
        ),
      )}
    </span>
  );
}

/** The big title for one destination, with its actions. */
export function DestinationHeader({
  destination,
  items,
  onBack,
  onAdd,
  onShare,
  onEdit,
}: {
  destination: Destination;
  items: Item[];
  onBack: () => void;
  onAdd: () => void;
  onShare?: () => void;
  onEdit: () => void;
}) {
  return (
    <div className="mb-5">
      <button
        onClick={onBack}
        className="-ml-1 flex h-9 items-center gap-0.5 rounded-full pr-2 text-[15px] font-medium text-ink-2 active:opacity-60"
      >
        <Icon name="back" size={18} /> All places
      </button>
      <div className="mt-1 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-serif text-[34px] leading-tight font-medium tracking-tight">{destination.name}</h1>
          <p className="text-[15px] text-muted">
            {[whereOf(destination), spotTally(items) || "No spots yet"].filter(Boolean).join(" · ")}
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
        {onShare && items.some((i) => !i.private) && (
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
