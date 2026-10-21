"use client";

import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { toast } from "sonner";
import { ago, api, itemLinks } from "@/lib/client";
import { VOCAB } from "@/lib/kinds";
import type { FriendsTable, TableFriend, TableItem, TablePlace } from "@/lib/table";
import type { Kind, Status } from "@/lib/types";
import { Cover } from "./Cover";
import { SampleCard } from "./FriendsPanel";
import { Sheet } from "./Sheet";
import { SpotTile, spotLine } from "./Spot";
import { Avatar, Button, Icon, useHydrated } from "./ui";

/** How many rows a section shows before "See all". */
const FIRST = 5;

const DOING: Record<Kind, string> = { book: "reading", podcast: "listening", screen: "watching", place: "wants to go" };
const DONE: Record<Kind, string> = { book: "finished", podcast: "listened", screen: "watched", place: "has been" };

type Props = {
  table: FriendsTable;
  /** Somewhere to go when there's nobody yet. */
  onFindFriends: () => void;
  onSampleAdded: () => void;
};

/** What your friends are into, grouped by the thing. A place to visit, not a feed: every section ends. */
export function FriendsTableView({ table, onFindFriends, onSampleAdded }: Props) {
  // What you've saved from here, so rows update without a reload.
  const [saved, setSaved] = useState<Record<string, Status>>({});
  const [openItem, setOpenItem] = useState<TableItem | null>(null);
  const [openPlace, setOpenPlace] = useState<TablePlace | null>(null);
  const [lastItem, setLastItem] = useState<TableItem | null>(null);
  const [lastPlace, setLastPlace] = useState<TablePlace | null>(null);

  const mineOf = (i: TableItem) => saved[i.key] ?? i.mine;
  const empty =
    !table.watching.length && !table.reading.length && !table.listening.length && !table.finished.length && !table.places.length;

  const save = async (item: TableItem, status: Status, place?: TablePlace) => {
    setSaved((s) => ({ ...s, [item.key]: status }));
    try {
      const { workKey, title, author, year, coverUrl, categories, place: geo } = item;
      await api("/api/items", {
        body: {
          kind: item.kind,
          items: [{ key: workKey, title, author, year, coverUrl, categories, place: geo, status, recBy: { id: item.friends[0]?.id } }],
          ...(place ? { destination: place.destination } : {}),
        },
      });
      const v = VOCAB[item.kind];
      toast(
        place
          ? `Added “${title}” to ${place.name} as ${v.sections[status]}`
          : `Added “${title}” to your ${v.sections[status]}`,
      );
    } catch (err) {
      setSaved(({ [item.key]: _, ...rest }) => rest);
      toast.error((err as Error).message);
    }
  };

  if (table.friendCount === 0) {
    return (
      <Empty title="Your Table is set, but empty" body="Once friends join, what they're reading, watching, listening to and saving shows up here.">
        <Button onClick={onFindFriends} icon={<Icon name="addPerson" size={18} />} className="mt-5">
          Invite friends
        </Button>
        <SampleCard onAdded={onSampleAdded} compact />
      </Empty>
    );
  }
  if (empty) {
    return (
      <Empty
        title="Quiet at the Table"
        body="Nothing new from your friends lately. When they start a book or a show, finish one, or save spots somewhere, it shows up here."
      />
    );
  }

  const openRow = (i: TableItem) => {
    setOpenItem(i);
    setLastItem(i);
  };
  const shownItem = openItem ?? lastItem;
  const shownPlace = openPlace ?? lastPlace;

  return (
    <div className="space-y-8">
      <Section title="Watching now" items={table.watching} mineOf={mineOf} onOpen={openRow} />
      <Section title="Reading now" items={table.reading} mineOf={mineOf} onOpen={openRow} />
      <Section title="Listening now" items={table.listening} mineOf={mineOf} onOpen={openRow} />
      <Section title="Finished lately" items={table.finished} mineOf={mineOf} onOpen={openRow} />
      {table.places.length > 0 && (
        <Expandable title="Saving spots in" count={table.places.length}>
          {(limit) =>
            table.places.slice(0, limit).map((p) => (
              <li key={p.key}>
                <button
                  onClick={() => {
                    setOpenPlace(p);
                    setLastPlace(p);
                  }}
                  className="flex w-full items-center gap-3 rounded-2xl px-2 py-2 text-left active:bg-surface-2"
                >
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] bg-accent text-accent-ink">
                    <Icon name="pin" size={22} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[16px] font-medium">{p.name}</span>
                    <span className="block truncate text-[13px] text-muted">
                      {p.spots.length} {p.spots.length === 1 ? "spot" : "spots"} · {names(p.friends)}
                    </span>
                    {p.yours && <span className="block truncate text-[13px] font-medium text-link">One of your places</span>}
                  </span>
                  <Faces friends={p.friends} />
                </button>
              </li>
            ))
          }
        </Expandable>
      )}

      <Sheet open={Boolean(openItem)} onOpenChange={(o) => !o && setOpenItem(null)} title={shownItem?.title ?? "Details"} hideTitle>
        {shownItem && <ItemDetail item={shownItem} mine={mineOf(shownItem)} onSave={(s) => save(shownItem, s)} />}
      </Sheet>
      <Sheet open={Boolean(openPlace)} onOpenChange={(o) => !o && setOpenPlace(null)} title={shownPlace?.name ?? "Place"}>
        {shownPlace && (
          <PlaceDetail place={shownPlace} mineOf={mineOf} onSave={(spot, s) => save(spot, s, shownPlace)} />
        )}
      </Sheet>
    </div>
  );
}

function Section({
  title,
  items,
  mineOf,
  onOpen,
}: {
  title: string;
  items: TableItem[];
  mineOf: (i: TableItem) => Status | null;
  onOpen: (i: TableItem) => void;
}) {
  if (!items.length) return null;
  return (
    <Expandable title={title} count={items.length}>
      {(limit) =>
        items.slice(0, limit).map((i) => (
          <li key={i.key}>
            <button onClick={() => onOpen(i)} className="flex w-full items-center gap-3 rounded-2xl px-2 py-2 text-left active:bg-surface-2">
              <Cover book={i} shape={VOCAB[i.kind].shape} className="w-11 shrink-0" rounded="rounded-[4px]" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[16px] font-medium">{i.title}</span>
                <span className="block truncate text-[13px] text-muted">{names(i.friends)}</span>
                <Relevance item={i} mine={mineOf(i)} />
              </span>
              <Faces friends={i.friends} />
            </button>
          </li>
        ))
      }
    </Expandable>
  );
}

/** A heading, the first few rows, and "See all" for the rest. */
function Expandable({ title, count, children }: { title: string; count: number; children: (limit: number) => React.ReactNode }) {
  const [all, setAll] = useState(false);
  return (
    <section>
      <h2 className="mb-1 flex items-baseline justify-between px-1">
        <span className="font-serif text-[22px] font-medium tracking-tight">{title}</span>
        <span className="text-[13px] text-muted tabular-nums">{count}</span>
      </h2>
      <ul className="-mx-2">
        <AnimatePresence initial={false}>{children(all ? count : FIRST)}</AnimatePresence>
      </ul>
      {count > FIRST && (
        <button onClick={() => setAll(!all)} className="mt-1 h-9 rounded-full px-1 text-[14px] font-medium text-ink-2 active:opacity-60">
          {all ? "Show fewer" : `See all ${count}`}
        </button>
      )}
    </section>
  );
}

/** Why this row involves you, when it does. */
function Relevance({ item, mine }: { item: TableItem; mine: Status | null }) {
  if (item.yourPick) return <span className="block truncate text-[13px] font-medium text-link">Your pick</span>;
  if (mine) return <span className="block truncate text-[13px] font-medium text-link">In your {VOCAB[item.kind].sections[mine]}</span>;
  return null;
}

/** "Bo", "Bo and Mia", "Bo, Mia +5". Circle first. */
function names(friends: TableFriend[]) {
  const n = (f: TableFriend) => f.name ?? "A friend";
  if (friends.length === 1) return n(friends[0]);
  if (friends.length === 2) return `${n(friends[0])} and ${n(friends[1])}`;
  return `${n(friends[0])}, ${n(friends[1])} +${friends.length - 2}`;
}

/** Up to three faces, overlapping. */
function Faces({ friends }: { friends: TableFriend[] }) {
  return (
    <span className="flex shrink-0 items-center pl-2" aria-hidden>
      {friends.slice(0, 3).map((f, i) => (
        <Avatar key={f.id} name={f.name} size={28} className={`ring-2 ring-paper ${i ? "-ml-2" : ""} text-[13px]`} />
      ))}
      {friends.length > 3 && <span className="ml-1 text-[12px] text-muted tabular-nums">+{friends.length - 3}</span>}
    </span>
  );
}

function ItemDetail({ item, mine, onSave }: { item: TableItem; mine: Status | null; onSave: (s: Status) => void }) {
  const v = VOCAB[item.kind];
  return (
    <div className="max-h-[75dvh] overflow-y-auto px-5 pb-safe" data-vaul-no-drag="">
      <div className="flex gap-5 pt-2">
        <Cover book={item} shape={v.shape} className="w-24 shrink-0" />
        <div className="min-w-0 flex-1 pt-1">
          <h2 className="font-serif text-[24px] leading-tight font-medium tracking-tight">{item.title}</h2>
          {item.author && <p className="mt-1 text-[16px] text-ink-2">{item.author}</p>}
          {item.year && item.year > 0 ? <p className="mt-0.5 text-[14px] text-muted">{item.year}</p> : null}
          {item.yourPick && <p className="mt-2 text-[14px] font-medium text-link">Your recommendation</p>}
        </div>
      </div>

      <div className="mt-5">
        {mine ? (
          <div className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-surface-2 text-[15px] font-medium text-ink-2">
            <Icon name="check" size={17} className="text-good" /> In your {v.sections[mine]}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <Button onClick={() => onSave("want")} icon={<Icon name="plus" size={18} />} className="px-3">
              {v.sections.want}
            </Button>
            <Button variant="secondary" onClick={() => onSave("read")} className="px-3">
              {{ book: "I’ve read it", podcast: "I’ve listened", screen: "I’ve seen it", place: "I’ve been" }[item.kind]}
            </Button>
          </div>
        )}
        {!mine && item.friends[0] && (
          <p className="mt-2 text-center text-[13px] text-muted">Saved as recommended by {item.friends[0].name ?? "your friend"}.</p>
        )}
      </div>

      <FriendList item={item} />

      <div className="mt-5 mb-2 flex flex-wrap gap-2">
        {itemLinks(item, item.kind).map((l) => (
          <a
            key={l.label}
            href={l.href}
            target="_blank"
            rel="noreferrer"
            className="flex h-11 flex-1 items-center justify-center rounded-full bg-surface-2 px-4 text-[15px] font-medium whitespace-nowrap"
          >
            {l.label}
          </a>
        ))}
      </div>
    </div>
  );
}

/** Who's into it, and a way to ask each of them about it. */
function FriendList({ item }: { item: TableItem }) {
  const hydrated = useHydrated();
  const ask = async (f: TableFriend) => {
    const text = `${f.name ? `${f.name}, w` : "W"}hat did you think of ${item.title}?`;
    if (navigator.share) {
      try {
        await navigator.share({ text });
        return;
      } catch (err) {
        if ((err as DOMException).name === "AbortError") return;
      }
    }
    await navigator.clipboard?.writeText(text).catch(() => {});
    toast(`Copied. Paste it to ${f.name ?? "them"}.`);
  };
  return (
    <>
      <p className="mt-6 mb-1 text-[13px] font-medium tracking-wide text-muted uppercase">
        {item.friends.length === 1 ? "1 friend" : `${item.friends.length} friends`}
      </p>
      <ul className="-mx-2">
        {item.friends.map((f) => (
          <li key={f.id} className="flex items-center gap-3 rounded-2xl px-2 py-1.5">
            <Avatar name={f.name} size={36} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-medium">
                {f.name ?? "A friend"}
                {f.circle && <span className="ml-1 text-link">★</span>}
              </span>
              <span className="block truncate text-[13px] text-muted">
                {f.status === "read" ? DONE[item.kind] : DOING[item.kind]}
                {hydrated ? ` · ${ago(f.at)}` : ""}
              </span>
            </span>
            <button
              onClick={() => ask(f)}
              className="h-9 shrink-0 rounded-full bg-surface-2 px-3.5 text-[14px] font-medium active:scale-95"
              aria-label={`Ask ${f.name ?? "them"} about ${item.title}`}
            >
              Ask
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

function PlaceDetail({
  place,
  mineOf,
  onSave,
}: {
  place: TablePlace;
  mineOf: (i: TableItem) => Status | null;
  onSave: (spot: TableItem, s: Status) => void;
}) {
  return (
    <div className="max-h-[75dvh] overflow-y-auto px-5 pb-safe" data-vaul-no-drag="">
      <p className="-mt-2 mb-3 text-[15px] text-muted">
        {names(place.friends)} {place.friends.length === 1 ? "is" : "are"} saving spots here. Saving one adds it to your {place.name}.
      </p>
      <ul className="-mx-2 mb-2">
        {place.spots.map((s) => {
          const mine = mineOf(s);
          return (
            <li key={s.key} className="flex items-center gap-3 rounded-2xl px-2 py-2">
              <SpotTile spot={s} size={44} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[16px] font-medium">{s.title}</span>
                <span className="block truncate text-[13px] text-muted">
                  {[spotLine(s) || "Spot", names(s.friends)].join(" · ")}
                </span>
              </span>
              {mine ? (
                <span className="flex h-9 shrink-0 items-center gap-1 px-2 text-[13px] font-medium text-ink-2">
                  <Icon name="check" size={14} className="text-good" /> {VOCAB.place.sections[mine]}
                </span>
              ) : (
                <button
                  onClick={() => onSave(s, "want")}
                  className="flex h-9 shrink-0 items-center gap-1 rounded-full bg-ink px-3 text-[13px] font-medium text-paper active:scale-95"
                >
                  <Icon name="plus" size={14} /> Want to go
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Empty({ title, body, children }: { title: string; body: string; children?: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center rounded-3xl border border-dashed border-line px-6 py-10 text-center"
    >
      <p className="font-serif text-[22px] font-medium">{title}</p>
      <p className="mt-1.5 max-w-xs text-[15px] text-muted">{body}</p>
      {children}
    </motion.div>
  );
}
