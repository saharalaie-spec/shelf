"use client";

import Link from "next/link";
import { useState } from "react";
import { CATEGORIES } from "@/lib/categories";
import { itemLinks } from "@/lib/client";
import { PODCAST_CATEGORIES, SCREEN_CATEGORIES } from "@/lib/genres";
import { PLACE_CATEGORIES } from "@/lib/place-categories";
import { vocab } from "@/lib/kinds";
import type { Destination, Item, Kind, Status } from "@/lib/types";
import { Cover } from "./Cover";
import { SpotTile, spotLine } from "./Spot";
import { SectionTabs } from "./SectionTabs";
import { Sheet } from "./Sheet";
import { Avatar, Icon, Switch } from "./ui";

const CATEGORY_LISTS: Record<Kind, readonly string[]> = {
  book: CATEGORIES,
  podcast: PODCAST_CATEGORIES,
  screen: SCREEN_CATEGORIES,
  place: PLACE_CATEGORIES,
};

type Props = {
  kind: Kind;
  book: Item | null;
  /** Spots: the destination it's in. */
  destination?: Destination | null;
  onNote: (book: Item, note: string) => void;
  /** A typed name, or null to clear. */
  onRecBy: (book: Item, name: string | null) => void;
  allCategories: string[];
  onClose: () => void;
  onCategories: (book: Item, categories: string[]) => void;
  onStatus: (book: Item, status: Status) => void;
  onPrivate: (book: Item, value: boolean) => void;
  /** Keep it off friends' Table while it stays on your lists. */
  onQuiet: (book: Item, value: boolean) => void;
  onRemove: (book: Item) => void;
  /** Whether the owner's profile is public, which changes who a non-private item is visible to. */
  publicProfile: boolean;
};

export function ItemSheet({
  kind,
  book,
  destination,
  onNote,
  onRecBy,
  allCategories,
  onClose,
  onCategories,
  onStatus,
  onPrivate,
  onQuiet,
  onRemove,
  publicProfile,
}: Props) {
  const v = vocab(kind);
  // Keep showing the last item while the sheet animates closed.
  const [shown, setShown] = useState(book);
  if (book && book !== shown) setShown(book);
  const [custom, setCustom] = useState("");
  const [typing, setTyping] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const b = book ?? shown;
  // The item's own categories and ones already in this collection first; the full list on request.
  const mine = [...new Set([...(b?.categories ?? []), ...allCategories])];
  const rest = CATEGORY_LISTS[kind].filter((c) => !mine.includes(c));
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
    <Sheet open={Boolean(book)} onOpenChange={(o) => !o && onClose()} title={b?.title ?? "Details"} hideTitle>
      {b && (
        <div className="overflow-y-auto px-5 pb-safe" data-vaul-no-drag="">
          {kind === "place" ? (
            <div className="flex items-center gap-4 pt-2">
              <SpotTile spot={b} size={72} />
              <div className="min-w-0 flex-1">
                <h2 className="font-serif text-[24px] leading-tight font-medium tracking-tight">{b.title}</h2>
                <p className="mt-0.5 text-[15px] text-ink-2">{spotLine(b) || "Spot"}</p>
                {destination && <p className="text-[14px] text-muted">In {destination.name}</p>}
              </div>
            </div>
          ) : (
            <div className="flex gap-5 pt-2">
              <Cover book={b} shape={v.shape} className="w-28 shrink-0" locked={b.private} />
              <div className="min-w-0 flex-1 pt-1">
                <h2 className="font-serif text-[24px] leading-tight font-medium tracking-tight">{b.title}</h2>
                {b.author && <p className="mt-1 text-[16px] text-ink-2">{b.author}</p>}
                {b.year && b.year > 0 ? <p className="mt-0.5 text-[14px] text-muted">{b.year}</p> : null}
              </div>
            </div>
          )}

          <div className="mt-6">
            <SectionTabs
              value={b.status}
              options={v.statuses}
              labels={v.sections}
              onChange={(s) => onStatus(b, s)}
              layoutId="item-status-pill"
            />
          </div>

          {kind === "place" && <NoteField key={b.id} note={b.note} onSave={(n) => onNote(b, n)} />}
          <RecField key={`rec:${b.id}:${b.recBy?.id ?? ""}`} recBy={b.recBy} onSave={(n) => onRecBy(b, n)} />

          <label className="mt-3 flex cursor-pointer items-center gap-3 rounded-2xl bg-paper px-4 py-3">
            <Icon name="lock" size={20} className="shrink-0 text-ink-2" />
            <span className="min-w-0 flex-1">
              <span className="block text-[16px] font-medium">Private</span>
              <span className="block text-[13px] leading-snug text-muted">
                {b.private
                  ? "Only you can see this."
                  : publicProfile
                    ? "Anyone with your profile link can see it."
                    : "Your friends can see it."}
              </span>
            </span>
            <Switch checked={b.private} onChange={(v) => onPrivate(b, v)} label="Private" />
          </label>
          {!b.private && (
            <label className="mt-2 flex cursor-pointer items-center gap-3 rounded-2xl bg-paper px-4 py-3">
              <Icon name="eye" size={20} className="shrink-0 text-ink-2" />
              <span className="min-w-0 flex-1">
                <span className="block text-[16px] font-medium">Keep this quiet</span>
                <span className="block text-[13px] leading-snug text-muted">
                  {b.quiet
                    ? "Stays on your lists, but never shows on friends’ Table."
                    : "When you start or finish it, friends may see it on their Table."}
                </span>
              </span>
              <Switch checked={b.quiet} onChange={(v) => onQuiet(b, v)} label="Keep this quiet" />
            </label>
          )}

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

          <div className="mt-7 flex flex-wrap gap-2">
            {itemLinks(b, kind).map((l) => (
              <a
                key={l.label}
                href={l.href}
                target="_blank"
                rel="noreferrer"
                className="flex h-10 items-center gap-1.5 rounded-full bg-surface-2 px-4 text-[14px] font-medium active:scale-95"
              >
                {l.label}
                <Icon name="arrow" size={14} className="-rotate-45 text-muted" />
              </a>
            ))}
          </div>

          <button
            onClick={() => onRemove(b)}
            className="mt-5 mb-2 flex h-12 w-full items-center justify-center gap-2 rounded-full text-[15px] font-medium text-accent active:bg-surface-2"
          >
            <Icon name="trash" size={18} /> Remove
          </button>
        </div>
      )}
    </Sheet>
  );
}

/**
 * Who recommended it. Saved from a friend, it shows them (with a way to their trove); otherwise it's a name
 * you type, like "Mom" or "the bartender in Lisbon".
 */
function RecField({ recBy, onSave }: { recBy: Item["recBy"]; onSave: (name: string | null) => void }) {
  const [draft, setDraft] = useState(recBy?.id ? "" : (recBy?.name ?? ""));
  if (recBy?.id) {
    return (
      <div className="mt-3 flex items-center gap-3 rounded-2xl bg-paper px-4 py-2.5">
        <Avatar name={recBy.name} size={32} />
        <Link href={`/u/${recBy.id}`} className="min-w-0 flex-1 active:opacity-70">
          <span className="block text-[13px] text-muted">Recommended by</span>
          <span className="block truncate text-[16px] font-medium">{recBy.name}</span>
        </Link>
        <button
          onClick={() => onSave(null)}
          aria-label={`Remove ${recBy.name} as who recommended it`}
          className="-mr-1.5 flex h-9 w-9 items-center justify-center rounded-full text-muted active:bg-surface-2"
        >
          <Icon name="x" size={16} />
        </button>
      </div>
    );
  }
  return (
    <label className="mt-3 flex items-center gap-3 rounded-2xl bg-paper px-4 py-2.5">
      <Icon name="people" size={20} className="shrink-0 text-ink-2" />
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] text-muted">Recommended by</span>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => onSave(draft)}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          placeholder="Who told you about it?"
          maxLength={60}
          className="block w-full bg-transparent text-[16px] font-medium outline-none placeholder:font-normal placeholder:text-muted"
        />
      </span>
    </label>
  );
}

/** "Order the horchata": your own words, saved when you leave the field. */
function NoteField({ note, onSave }: { note: string | null; onSave: (note: string) => void }) {
  const [draft, setDraft] = useState(note ?? "");
  return (
    <textarea
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => onSave(draft)}
      placeholder="What did you love? What should a friend order?"
      aria-label="Your note"
      rows={2}
      maxLength={500}
      className="mt-3 block w-full resize-none rounded-2xl border border-line bg-surface px-4 py-3 text-[16px] leading-snug outline-none placeholder:text-muted focus:border-ink"
    />
  );
}
