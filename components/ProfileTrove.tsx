"use client";

import { AnimatePresence, motion } from "motion/react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { api, itemLinks } from "@/lib/client";
import { isFormat } from "@/lib/genres";
import { VOCAB } from "@/lib/kinds";
import { KINDS, STATUSES, type Destination, type Item, type Kind, type Status } from "@/lib/types";
import { placesOnMap } from "@/lib/world";
import { Cover } from "./Cover";
import { Login, type Channels } from "./Login";
import { PlacesList, StatusTag } from "./PlacesList";
import { SpotTile, spotLine } from "./Spot";
import { SectionTabs } from "./SectionTabs";
import { AskBox } from "./AskBox";
import { PlacesViewSwitch, Shelf, ShelfViewSwitch, hasShelf, usePlacesList, useShelfView } from "./Bookshelf";
import { Sheet } from "./Sheet";
import { TagRow } from "./TagRow";
import { Avatar, Button, Icon, KIND_ICON, Wordmark } from "./ui";

// The world map (and its coastlines) loads only when their places are on screen.
const WorldMap = dynamic(() => import("./WorldMap").then((m) => m.WorldMap), { ssr: false });

/** How the viewer is connected to the person whose trove this is. */
export type Relation =
  | { kind: "self"; hiddenCount: number }
  | { kind: "friend" }
  | { kind: "stranger" }
  | { kind: "requested" }
  | { kind: "asked-you"; requestId: string }
  | { kind: "signed-out" };

type Props = {
  person: { id: string; name: string | null; handle: string | null; isPublic: boolean; photo: string | null };
  /** Everything they share, across collections. */
  items: Item[];
  /** Where their shared spots are. */
  destinations: Destination[];
  relation: Relation;
  /** The viewer's own items (work key → section), so one they have shows where it lives. */
  mine: Record<string, Status>;
  channels: Channels;
  /** Open on one of their places (`?place=`), e.g. from "Bo's Paris". */
  focusPlace?: string | null;
};

/** Short names, so all four fit in one row. */
const SHORT: Record<Kind, string> = { book: "Books", podcast: "Podcasts", screen: "Watch", place: "Places" };

const firstSection = (counts: Record<Status, number>) => STATUSES.find((s) => counts[s] > 0) ?? "read";

export function ProfileTrove({ person, items, destinations, relation, mine: initialMine, channels, focusPlace = null }: Props) {
  const counts = useMemo(() => {
    const c = Object.fromEntries(KINDS.map((k) => [k, { read: 0, reading: 0, want: 0 }])) as Record<Kind, Record<Status, number>>;
    for (const b of items) c[b.kind][b.status]++;
    return c;
  }, [items]);
  const total = (k: Kind) => counts[k].read + counts[k].reading + counts[k].want;
  // Only the collections with something in them (all four if there's nothing yet).
  const kinds = KINDS.some((k) => total(k) > 0) ? KINDS.filter((k) => total(k) > 0) : [...KINDS];
  // Open on the first collection they've put something in.
  const [focus, setFocus] = useState(() => destinations.find((d) => d.id === focusPlace) ?? null);
  const [kind, setKind] = useState<Kind>(() => (focus ? "place" : (KINDS.find((k) => total(k) > 0) ?? "book")));
  const [section, setSectionState] = useState<Status>(() => firstSection(counts[kind]));
  // A category picked from their tags, like on your own lists; cleared when the list changes.
  const [chosenFilter, setFilter] = useState<string | null>(null);
  // Their collection as the covers grid or its own look (stacks, film strips, tapes): the same choice as on your own lists.
  const [stack, setStack] = useShelfView(kind);
  const [placesList, setPlacesList] = usePlacesList();
  const setSection = (s: Status) => {
    setSectionState(s);
    setFilter(null);
  };
  const v = VOCAB[kind];
  const books = items.filter((b) => b.kind === kind && (!focus || kind !== "place" || b.destinationId === focus.id));
  const showKind = (k: Kind) => {
    setKind(k);
    setSection(firstSection(counts[k]));
  };
  const [mine, setMine] = useState(initialMine);
  const [open, setOpen] = useState<Item | null>(null);
  // Writing to them about the one that's open.
  const [asking, setAsking] = useState(false);
  const [lastOpen, setLastOpen] = useState<Item | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const name = person.name ?? "Someone on Trove";
  const signedIn = relation.kind !== "signed-out";
  // Signed in from the sheet: the page re-renders with the viewer, so put the sheet away.
  if (signingIn && signedIn) setSigningIn(false);
  const shown = open ?? lastOpen;

  // Places have no sections: every spot shows, under its destination, marked Been or Want to go.
  const isPlace = kind === "place";
  const mapPlaces = useMemo(() => (isPlace ? placesOnMap(destinations, items.filter((i) => i.kind === "place")) : []), [isPlace, destinations, items]);
  const inSection = isPlace ? books : books.filter((b) => b.status === section);
  const categories = (() => {
    const tally = new Map<string, number>();
    for (const b of inSection) for (const c of b.categories) if (!isFormat(c)) tally.set(c, (tally.get(c) ?? 0) + 1);
    return [...tally.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  })();
  const filter = !isPlace && chosenFilter && categories.some(([c]) => c === chosenFilter) ? chosenFilter : null;
  const visible = filter ? inSection.filter((b) => b.categories.includes(filter)) : inSection;

  const save = async (book: Item, status: Status) => {
    setMine((m) => ({ ...m, [book.key]: status }));
    try {
      // Only things you don't have get these buttons, so this is always a fresh add.
      const { key, title, author, year, coverUrl, categories, place } = book;
      // Remembered as their recommendation. A spot lands in your destination of the same name, which is made
      // for you if you don't have one.
      const where = destinations.find((d) => d.id === book.destinationId);
      await api("/api/items", {
        body: {
          kind: book.kind,
          items: [{ key, title, author, year, coverUrl, categories, place, status, recBy: { id: person.id } }],
          ...(book.kind === "place" && where
            ? { destination: { name: where.name, country: where.country, label: where.label, lat: where.lat, lon: where.lon, bbox: where.bbox } }
            : {}),
        },
      });
      toast(
        book.kind === "place"
          ? `Added “${book.title}” to ${where ? where.name : "your places"} as ${VOCAB.place.sections[status]}`
          : `Added “${book.title}” to your ${VOCAB[book.kind].sections[status]}`,
      );
    } catch (err) {
      setMine(({ [book.key]: _, ...rest }) => rest);
      toast.error((err as Error).message);
    }
  };

  return (
    <div className="mx-auto min-h-dvh w-full max-w-3xl pb-40">
      <header className="flex h-16 items-center justify-between px-5 pt-[env(safe-area-inset-top)]">
        <Link href="/" className="flex items-center gap-2">
          <Wordmark size={24} />
        </Link>
        {relation.kind === "self" ? (
          <Link href="/" className="flex h-9 items-center rounded-full bg-accent px-4 text-[14px] font-medium text-accent-ink active:scale-95">
            Done
          </Link>
        ) : (
          signedIn && (
            <Link href="/" className="flex h-9 items-center rounded-full bg-surface-2 px-4 text-[14px] font-medium">
              Your trove
            </Link>
          )
        )}
      </header>

      <section className="px-5 pt-3 pb-5">
        <div className="flex items-center gap-4">
          <Avatar name={person.name} photo={person.photo} size={64} />
          <div className="min-w-0">
            <h1 className="font-serif text-[32px] leading-[1.05] font-medium tracking-tight text-balance">{name}</h1>
            <p className="mt-1 text-[15px] leading-snug text-muted">
              {person.handle && person.isPublic ? `@${person.handle} · ` : ""}
              {KINDS.filter((k) => total(k))
                .map((k) => VOCAB[k].noun(total(k)))
                .join(" · ") || "Nothing shared yet"}
            </p>
          </div>
        </div>
        {relation.kind === "self" && <SelfNote hidden={relation.hiddenCount} isPublic={person.isPublic} />}
        {relation.kind !== "self" && (
          <div className="mt-5">
            <RelationButton person={person} relation={relation} onSignIn={() => setSigningIn(true)} />
          </div>
        )}
      </section>

      {/* Pinned while scrolling: which collection, and which part of it. Kept slim so the list has the room. */}
      <div className="sticky top-0 z-20 space-y-2.5 bg-paper/85 px-5 pt-2 pb-3 backdrop-blur-xl">
        {kinds.length > 1 && (
          <div className={`grid gap-1.5 ${kinds.length === 4 ? "grid-cols-4" : kinds.length === 3 ? "grid-cols-3" : "grid-cols-2"}`} role="tablist" aria-label="Collections">
            {kinds.map((k) => (
              <button
                key={k}
                role="tab"
                aria-selected={k === kind}
                aria-label={`${VOCAB[k].label}, ${total(k)}`}
                onClick={() => showKind(k)}
                className={`flex h-10 min-w-0 items-center justify-center gap-1.5 rounded-full px-2 text-[13px] font-medium transition-colors active:scale-95 ${
                  k === kind ? "bg-ink text-paper" : "bg-surface-2 text-ink-2"
                }`}
              >
                {/* Four across leaves no room for icons: the names alone fit. */}
                {kinds.length < 4 && <Icon name={KIND_ICON[k]} size={16} className="shrink-0" />}
                <span className="truncate">{kinds.length === 4 ? SHORT[k] : VOCAB[k].label}</span>
              </button>
            ))}
          </div>
        )}
        {books.length > 0 && !isPlace && (
          <SectionTabs value={section} labels={v.sections} counts={counts[kind]} onChange={setSection} layoutId="profile-status-pill" />
        )}
      </div>
      {/* Their tags, on one line; the rest are a tap away. Scrolls away with the list. */}
      {!isPlace && categories.length > 1 && (
        <TagRow key={`${kind}:${section}`} tags={categories} total={inSection.length} value={filter} onChange={setFilter} className="px-5 pt-1 pb-4" />
      )}
      {hasShelf(kind) && visible.length > 1 && (
        <div className="flex justify-end px-5 pb-3">
          <ShelfViewSwitch kind={kind} on={stack} onChange={setStack} />
        </div>
      )}

      {!focus && isPlace && mapPlaces.length > 0 && (
        <div className="flex justify-end px-5 pb-3">
          <PlacesViewSwitch list={placesList} onChange={setPlacesList} />
        </div>
      )}
      {!focus && isPlace && mapPlaces.length > 0 && !placesList && (
        <div className="px-5">
          <WorldMap places={mapPlaces} onOpen={(id) => setFocus(destinations.find((d) => d.id === id) ?? null)} />
        </div>
      )}
      {focus && kind === "place" && (
        <div className="mx-5 mb-3 flex items-center justify-between gap-3">
          <h2 className="font-serif text-[24px] font-medium tracking-tight">
            {person.name ? `${person.name}’s` : "Their"} {focus.name}
          </h2>
          <button onClick={() => setFocus(null)} className="shrink-0 text-[14px] font-medium text-ink-2 underline underline-offset-2">
            All their places
          </button>
        </div>
      )}
      {books.length === 0 ? (
        <p className="px-5 text-[16px] text-muted">No {v.many} here yet.</p>
      ) : inSection.length === 0 ? (
        <p className="px-5 text-[16px] text-muted">{v.sectionEmpty[section][0]}.</p>
      ) : (
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={`${kind}:${section}:${filter ?? ""}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
            className="px-5"
          >
            {hasShelf(kind) && stack ? (
              <Shelf kind={kind} items={visible} tags={categories} single={filter} onOpen={(b) => (setOpen(b), setLastOpen(b), setAsking(false))} />
            ) : isPlace ? (
              <PlacesList
                // All their places: the map alone, unless they chose the list (or none of the places can go on the map).
                items={focus || placesList || mapPlaces.length === 0 ? inSection : []}
                destinations={destinations}
                groupBy={focus ? "category" : "destination"} onOpen={(b) => (setOpen(b), setLastOpen(b), setAsking(false))} />
            ) : (
              <ul className="grid grid-cols-3 gap-x-3 gap-y-5 sm:grid-cols-4 md:grid-cols-5">
                {visible.map((b, i) => (
                  <motion.li
                    key={b.id}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(i, 18) * 0.025, type: "spring", stiffness: 380, damping: 32 }}
                  >
                    <button
                      onClick={() => (setOpen(b), setLastOpen(b), setAsking(false))}
                      className="block w-full text-left transition-transform active:scale-[0.96]"
                    >
                      <Cover book={b} shape={v.shape} />
                      <p className="mt-2 line-clamp-2 text-[13px] leading-snug font-medium">{b.title}</p>
                      {b.author && <p className="truncate text-[12px] text-muted">{b.author}</p>}
                    </button>
                  </motion.li>
                ))}
              </ul>
            )}
          </motion.div>
        </AnimatePresence>
      )}

      {!signedIn && (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 px-4 pb-safe">
          <motion.div
            initial={{ y: 120, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.6, type: "spring", stiffness: 260, damping: 26 }}
            className="pointer-events-auto mx-auto flex max-w-xl items-center gap-4 rounded-3xl bg-accent p-4 pl-5 text-accent-ink shadow-float"
          >
            <div className="min-w-0 flex-1">
              <p className="text-[16px] font-medium">Make your own trove</p>
              <p className="text-[14px] text-paper/65">Books, podcasts, shows and favorite spots, shared with friends.</p>
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
            {shown.kind === "place" ? (
              <div className="pt-2 pb-5">
                <div className="flex items-center gap-4">
                  <SpotTile spot={shown} size={72} />
                  <div className="min-w-0 flex-1">
                    <h2 className="font-serif text-[24px] leading-tight font-medium tracking-tight">{shown.title}</h2>
                    <p className="mt-0.5 text-[15px] text-ink-2">{spotLine(shown) || "Spot"}</p>
                    {destinations.some((d) => d.id === shown.destinationId) && (
                      <p className="text-[14px] text-muted">In {destinations.find((d) => d.id === shown.destinationId)!.name}</p>
                    )}
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-2 text-[14px] text-muted">
                  <StatusTag status={shown.status} />
                  {shown.status === "read"
                    ? person.name ? `${person.name} has been` : "They’ve been"
                    : person.name ? `${person.name} wants to go` : "They want to go"}
                </div>
                {shown.note && (
                  <p className="mt-4 rounded-2xl bg-surface-2 px-4 py-3 text-[15px] leading-snug text-ink-2">
                    <span className="font-medium text-ink">{person.name ?? "They"}:</span> “{shown.note}”
                  </p>
                )}
              </div>
            ) : (
              <div className="flex gap-5 pt-2 pb-5">
                <Cover book={shown} shape={VOCAB[shown.kind].shape} className="w-28 shrink-0" />
                <div className="min-w-0 flex-1 pt-1">
                  <h2 className="font-serif text-[24px] leading-tight font-medium tracking-tight">{shown.title}</h2>
                  {shown.author && <p className="mt-1 text-[16px] text-ink-2">{shown.author}</p>}
                  {shown.year && shown.year > 0 ? <p className="mt-0.5 text-[14px] text-muted">{shown.year}</p> : null}
                  <p className="mt-3 text-[13px] text-muted">
                    {[`In ${person.name ? `${person.name}’s` : "their"} ${VOCAB[shown.kind].sections[shown.status]}`, ...shown.categories].join(" · ")}
                  </p>
                </div>
              </div>
            )}
            <BookActions book={shown} relation={relation} mine={mine[shown.key]} onSave={save} />
            {relation.kind === "friend" &&
              (asking ? (
                <AskBox
                  key={shown.id}
                  friend={person}
                  item={{ kind: shown.kind, key: shown.key, title: shown.title, author: shown.author, coverUrl: shown.coverUrl }}
                  status={shown.status}
                  onDone={() => setAsking(false)}
                />
              ) : (
                <Button variant="secondary" className="mt-2 w-full" onClick={() => setAsking(true)} icon={<Icon name="chat" size={18} />}>
                  Ask {person.name ?? "them"} about it
                </Button>
              ))}
            <div className="mt-2 mb-2 flex flex-wrap gap-2">
              {itemLinks(shown, shown.kind).map((l) => (
                <a
                  key={l.label}
                  href={l.href}
                  target="_blank"
                  rel="noreferrer"
                  className="flex h-11 flex-1 items-center justify-center rounded-full px-4 text-[15px] font-medium whitespace-nowrap text-ink-2 active:bg-surface-2"
                >
                  {shown.kind === "place" ? `Open in ${l.label}` : l.label}
                </a>
              ))}
            </div>
          </div>
        )}
      </Sheet>

      <Sheet open={signingIn} onOpenChange={setSigningIn} title={`Sign in to add ${person.name ?? "them"}`} hideTitle>
        <div className="overflow-y-auto pb-4" data-vaul-no-drag="">
          <Login
            channels={channels}
            compact
            heading={`Add ${person.name ?? "them"} as a friend`}
            subheading="Sign in to send the request."
          />
        </div>
      </Sheet>
    </div>
  );
}

/** Previewing your own: one quiet line under your name. */
function SelfNote({ hidden, isPublic }: { hidden: number; isPublic: boolean }) {
  return (
    <p className="mt-4 flex items-center gap-2 text-[13px] leading-snug text-muted">
      <Icon name="eye" size={15} className="shrink-0" />
      <span>
        What {isPublic ? "friends and anyone with your link" : "your friends"} see
        {hidden > 0 ? ` · ${hidden.toLocaleString()} private hidden` : ""}
      </span>
    </p>
  );
}

function RelationButton({
  person,
  relation,
  onSignIn,
}: {
  person: Props["person"];
  relation: Exclude<Relation, { kind: "self" }>;
  onSignIn: () => void;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  // Show the result right away; the server's answer (via refresh) replaces it.
  const [optimistic, setOptimistic] = useState<{ from: Relation; to: Relation } | null>(null);
  const current = optimistic && optimistic.from === relation ? optimistic.to : relation;
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const who = person.name ?? "them";

  const act = async (to: Relation, call: () => Promise<unknown>, message?: string) => {
    setBusy(true);
    setOptimistic({ from: relation, to });
    try {
      await call();
      if (message) toast(message);
      startTransition(() => router.refresh());
    } catch (err) {
      setOptimistic(null);
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const add = () =>
    act({ kind: "requested" }, async () => {
      const res = await api<{ status: "sent" | "friends" }>("/api/friends", { body: { userId: person.id } });
      toast(res.status === "friends" ? `You and ${who} are friends now` : `Asked ${who} to be friends`);
    });

  switch (current.kind) {
    case "signed-out":
      return (
        <Button onClick={onSignIn} icon={<Icon name="addPerson" size={18} />}>
          Add friend
        </Button>
      );
    case "stranger":
      return (
        <Button onClick={add} loading={busy} icon={<Icon name="addPerson" size={18} />}>
          Add friend
        </Button>
      );
    case "requested":
      return (
        <Button variant="secondary" disabled icon={<Icon name="check" size={18} />}>
          Requested
        </Button>
      );
    case "asked-you":
      return (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            loading={busy}
            onClick={() =>
              act(
                { kind: "friend" },
                () => api(`/api/friends/requests/${current.requestId}`, { body: { action: "accept" } }),
                `You and ${who} are friends now`,
              )
            }
          >
            Accept friend request
          </Button>
          <span className="text-[14px] text-muted">{who} asked to be friends</span>
        </div>
      );
    case "friend":
      return (
        <>
          <Button variant="secondary" onClick={() => setConfirming(true)} icon={<Icon name="people" size={18} />}>
            Friends
          </Button>
          <Sheet open={confirming} onOpenChange={setConfirming} title={`Remove ${who}?`}>
            <div className="px-5 pb-safe">
              <p className="text-[15px] text-muted">
                You’ll stop seeing each other’s troves{person.isPublic ? " (their public profile stays open to everyone)" : ""}. They won’t be told.
              </p>
              <Button
                variant="secondary"
                className="mt-5 w-full text-link"
                loading={busy}
                onClick={() =>
                  act({ kind: "stranger" }, async () => {
                    await api(`/api/friends/${person.id}`, { method: "DELETE" });
                    setConfirming(false);
                  }, `Removed ${who}`)
                }
              >
                Remove friend
              </Button>
              <Button variant="ghost" className="mt-1 mb-2 w-full" onClick={() => setConfirming(false)}>
                Cancel
              </Button>
            </div>
          </Sheet>
        </>
      );
  }
}

function BookActions({
  book,
  relation,
  mine,
  onSave,
}: {
  book: Item;
  relation: Relation;
  mine: Status | undefined;
  onSave: (book: Item, status: Status) => void;
}) {
  if (relation.kind === "self") return null;
  if (relation.kind === "signed-out") {
    return (
      <Link href="/" className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-accent text-[16px] font-medium text-accent-ink active:scale-[0.97]">
        <Icon name="plus" size={18} /> Start your own trove
      </Link>
    );
  }
  if (mine) {
    return (
      <div className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-surface-2 text-[15px] font-medium text-ink-2">
        <Icon name="check" size={17} className="text-good" />
        {book.kind === "place"
          ? mine === "read"
            ? "You’ve been too"
            : "On your Want to go list"
          : `In your trove · ${VOCAB[book.kind].sections[mine]}`}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-2">
      <Button onClick={() => onSave(book, "want")} icon={<Icon name="plus" size={18} />} className="px-3">
        {VOCAB[book.kind].sections.want}
      </Button>
      <Button variant="secondary" onClick={() => onSave(book, "read")} className="px-3">
        {{ book: "I’ve read it", podcast: "I’ve listened", screen: "I’ve seen it", place: "I’ve been" }[book.kind]}
      </Button>
    </div>
  );
}

