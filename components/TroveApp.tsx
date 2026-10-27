"use client";

import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/client";
import { spotTally, vocab, type Vocab } from "@/lib/kinds";
import { SAMPLE_FRIEND_ID } from "@/lib/sample";
import { STATUSES, type Hit, type Item, type Kind, type RecBy, type Status } from "@/lib/types";
import { AccountSheet, type Profile } from "./AccountSheet";
import { AddSheet } from "./AddSheet";
import { Cover } from "./Cover";
import { ItemSheet } from "./ItemSheet";
import { DestinationSheet, type Dest } from "./Destinations";
import { AvatarButton, FriendsButton } from "./HeaderButtons";
import { KindMenu } from "./KindMenu";
import { DestinationCards, DestinationHeader, PlacesList } from "./PlacesList";
import { ShareSheet } from "./ShareSheet";
import { SectionTabs } from "./SectionTabs";
import { Button, Icon, Logo } from "./ui";

/** A catalog hit to add; imports may already know which section it belongs in (and bring a note). */
export type NewHit = Hit & { status?: Status; note?: string; recBy?: RecBy | null };

/** What a collection hands the add sheet. */
export type TroveApi = {
  kind: Kind;
  items: Item[];
  statusOf: Map<string, Status>;
  add: (hits: NewHit[], opts: { status: Status; quiet?: boolean; destinationId?: string | null }) => Promise<Item[]>;
  /** Places only. */
  destinations: Dest[];
  onDestination: (d: Dest, created: boolean) => void;
};

/** What the add sheet's views can do. `target` is the section new items go to, `destination` where spots go. */
export type TroveActions = Omit<TroveApi, "add"> & {
  target: Status;
  destination: Dest | null;
  add: (hits: NewHit[], opts?: { quiet?: boolean }) => Promise<Item[]>;
};

type Props = {
  kind: Kind;
  user: Profile & { contact: string; owner?: boolean };
  /** Friend requests waiting for an answer, for the badge on the Friends button. */
  pendingRequests: number;
  initialItems: Item[];
  /** Places only: the user's destinations. */
  initialDestinations?: Dest[];
  features: { photo: boolean };
};

// The key predates the name Trove; keeping it keeps everyone's remembered section.
const sectionKey = (kind: Kind) => `shelf:section:${kind}`;
const byNewest = (a: Item, b: Item) => b.statusAt - a.statusAt || b.addedAt - a.addedAt;

export function TroveApp({ kind, user, pendingRequests, initialItems, initialDestinations = [], features }: Props) {
  const v = vocab(kind);
  const isPlace = kind === "place";
  const [destinations, setDestinations] = useState(initialDestinations);
  // Places open on a list of destinations; the one being looked at lives in the URL (?in=…), so the back
  // gesture and a refresh both do the expected thing.
  const pathname = usePathname();
  const chosenDest = useSearchParams().get("in");
  const fromList = useRef(false);
  const showDest = useCallback(
    (id: string | null) => {
      const inOne = new URLSearchParams(window.location.search).has("in");
      if (id) {
        const url = `${pathname}?in=${encodeURIComponent(id)}`;
        if (inOne) window.history.replaceState(null, "", url);
        else {
          window.history.pushState(null, "", url);
          fromList.current = true;
        }
      } else if (fromList.current) {
        // Back to the list we came from, rather than stacking another copy of it.
        fromList.current = false;
        window.history.back();
      } else if (inOne) {
        window.history.replaceState(null, "", pathname);
      }
    },
    [pathname],
  );
  useEffect(() => {
    const onPop = () => void (fromList.current = false);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  const [editingDest, setEditingDest] = useState<Dest | null>(null);
  // "New place" opens the add sheet on the destination picker.
  const [pickingDest, setPickingDest] = useState(false);
  const [items, setItems] = useState(initialItems);
  const [profile, setProfile] = useState<Profile>({
    id: user.id,
    name: user.name,
    handle: user.handle,
    isPublic: user.isPublic,
    shareActivity: user.shareActivity,
  });
  const { name } = profile;
  const [section, setSection] = useState<Status>("read");
  const [chosenFilter, setFilter] = useState<string | null>(null);
  const [adding, setAdding] = useState(initialItems.length === 0 && initialDestinations.length === 0);
  const [sharing, setSharing] = useState(false);
  const [account, setAccount] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const lastAddedTo = useRef<Status | null>(null);
  const lastAddedDest = useRef<string | null>(null);

  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  // Reopen on the section you were last looking at (a per-device convenience). Places have no sections.
  useEffect(() => {
    if (kind === "place") return;
    try {
      const saved = localStorage.getItem(sectionKey(kind)) as Status | null;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved && STATUSES.includes(saved)) setSection(saved);
    } catch {}
  }, [kind]);

  const showSection = useCallback(
    (s: Status) => {
      setSection(s);
      setFilter(null);
      try {
        localStorage.setItem(sectionKey(kind), s);
      } catch {}
    },
    [kind],
  );

  const statusOf = useMemo(() => new Map(items.map((b) => [b.key, b.status])), [items]);
  const counts = useMemo(() => {
    const c: Record<Status, number> = { read: 0, reading: 0, want: 0 };
    for (const b of items) c[b.status]++;
    return c;
  }, [items]);
  // Places aren't split into sections: each spot is marked Been or Want to go within its destination.
  const inSection = useMemo(
    () => items.filter((b) => isPlace || b.status === section).sort(byNewest),
    [items, section, isPlace],
  );

  const categories = useMemo(() => {
    const tally = new Map<string, number>();
    for (const b of inSection) for (const c of b.categories) tally.set(c, (tally.get(c) ?? 0) + 1);
    return [...tally.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [inSection]);
  const allCategories = useMemo(() => [...new Set(items.flatMap((b) => b.categories))], [items]);
  const privateCount = useMemo(() => items.filter((b) => b.private).length, [items]);

  const updateProfile = useCallback((patch: Partial<Profile>) => setProfile((p) => ({ ...p, ...patch })), []);
  const setName = useCallback((n: string | null) => updateProfile({ name: n }), [updateProfile]);

  // If the last item in a category goes, fall back to everything.
  const filter = !isPlace && chosenFilter && categories.some(([c]) => c === chosenFilter) ? chosenFilter : null;
  // Places: the destination being looked at, if any (a new, still-empty one can be open too).
  const dest = (isPlace && destinations.find((d) => d.id === chosenDest)) || null;
  const visible = filter
    ? inSection.filter((b) => b.categories.includes(filter))
    : dest
      ? inSection.filter((b) => b.destinationId === dest.id)
      : inSection;

  const onDestination = useCallback(
    (d: Dest, created: boolean) => {
      if (created) setDestinations((ds) => [d, ...ds.filter((x) => x.id !== d.id)]);
      showDest(d.id);
    },
    [showDest],
  );

  const patchItem = useCallback((id: string, patch: Partial<Item>) => {
    setItems((bs) => bs.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  }, []);

  const remove = useCallback(async (book: Item) => {
    setItems((bs) => bs.filter((b) => b.id !== book.id));
    setOpenId(null);
    try {
      await api(`/api/items/${book.id}`, { method: "DELETE" });
      toast(`Removed “${book.title}”`, {
        action: {
          label: "Undo",
          onClick: async () => {
            const { added } = await api<{ added: Item[] }>("/api/items", {
              body: { kind, items: [book], destinationId: book.destinationId ?? undefined },
            });
            setItems((bs) => [...added, ...bs]);
          },
        },
      });
    } catch (err) {
      setItems((bs) => [book, ...bs]);
      toast.error((err as Error).message);
    }
  }, [kind]);

  /** Moves an item to another section. Saves in the background; reverts if the server says no. */
  const moveItem = useCallback(
    async (book: Item, status: Status) => {
      if (book.status === status) return;
      patchItem(book.id, { status, statusAt: Date.now() });
      try {
        const saved = await api<{ statusAt: number }>(`/api/items/${book.id}`, { method: "PATCH", body: { status } });
        patchItem(book.id, { statusAt: saved.statusAt });
      } catch (err) {
        patchItem(book.id, { status: book.status, statusAt: book.statusAt });
        throw err;
      }
    },
    [patchItem],
  );

  /** Tells the friend who recommended it that you loved it. */
  const thank = useCallback(
    async (book: Item, message = "") => {
      try {
        const { to } = await api<{ to: string }>(`/api/items/${book.id}/thanks`, { body: { message } });
        patchItem(book.id, { thanked: true });
        toast(`${to} will see you loved it`);
      } catch (err) {
        toast.error((err as Error).message);
      }
    },
    [patchItem],
  );

  const changeStatus = useCallback(
    async (book: Item, status: Status) => {
      try {
        await moveItem(book, status);
        const moved =
          status === "read"
            ? v.doneToast(book.title)
            : `${isPlace ? "Marked" : "Moved"} “${book.title}” ${isPlace ? "as" : "to"} ${v.sections[status]}`;
        const undo = { label: "Undo", onClick: () => moveItem({ ...book, status }, book.status).catch(() => {}) };
        // Finished a friend's pick: the moment to close the loop with them.
        const from = status === "read" && !book.thanked && book.recBy?.id && book.recBy.id !== SAMPLE_FRIEND_ID ? book.recBy : null;
        toast(
          moved,
          from
            ? { action: { label: `Tell ${from.name}`, onClick: () => thank(book) }, cancel: undo, duration: 9000 }
            : { action: undo },
        );
      } catch (err) {
        toast.error((err as Error).message);
      }
    },
    [moveItem, v, isPlace, thank],
  );
  const toggleSpot = useCallback((spot: Item) => changeStatus(spot, spot.status === "read" ? "want" : "read"), [changeStatus]);

  const add = useCallback(
    async (hits: NewHit[], opts: { status: Status; quiet?: boolean; destinationId?: string | null }) => {
      const unique = hits.filter((h, i) => hits.findIndex((x) => x.key === h.key) === i);
      const statusFor = (h: NewHit) => h.status ?? opts.status;
      const inTrove = new Map(itemsRef.current.map((b) => [b.key, b]));
      const fresh = unique.filter((h) => !inTrove.has(h.key));
      // Already in the collection, in another section: adding it here means it moved (e.g. want → read).
      const moves = unique
        .map((h) => ({ book: inTrove.get(h.key), to: statusFor(h) }))
        .filter((m): m is { book: Item; to: Status } => Boolean(m.book && m.book.status !== m.to));

      if (!fresh.length && !moves.length) {
        if (!opts.quiet) {
          toast(isPlace ? "Already in your places" : `Already in ${v.sections[unique[0] ? statusFor(unique[0]) : opts.status]}`);
        }
        return [];
      }
      lastAddedTo.current = opts.status;
      lastAddedDest.current = opts.destinationId ?? null;

      // Show them immediately; swap in the saved versions when the server answers.
      const now = Date.now();
      const temp: Item[] = fresh.map((h, i) => ({
        ...h,
        status: statusFor(h),
        id: `tmp:${h.key}`,
        addedAt: now - i,
        statusAt: now - i,
        kind,
        private: false,
        quiet: false,
        destinationId: opts.destinationId ?? null,
        note: h.note ?? null,
        recBy: h.recBy ?? null,
      }));
      // Update the ref right away too, so a second quick add sees these as already added.
      itemsRef.current = [...temp, ...itemsRef.current];
      setItems((bs) => [...temp, ...bs]);

      // New items and moves save independently, so one failing doesn't lose the other.
      const fail = (err: unknown) => toast.error((err as Error).message);
      const movedOk: { book: Item; to: Status }[] = [];
      const [added] = await Promise.all([
        fresh.length
          ? api<{ added: Item[] }>("/api/items", {
              body: { kind, destinationId: opts.destinationId ?? undefined, items: fresh.map((h) => ({ ...h, status: statusFor(h) })) },
            })
              .then((r) => r.added)
              .catch((err) => (fail(err), [] as Item[]))
          : Promise.resolve([] as Item[]),
        ...moves.map((m) => moveItem(m.book, m.to).then(() => void movedOk.push(m), fail)),
      ]);
      const byKey = new Map(added.map((b) => [b.key, b]));
      const tempIds = new Set(temp.map((t) => t.id));
      setItems((bs) => bs.flatMap((b) => (!tempIds.has(b.id) ? [b] : byKey.has(b.key) ? [byKey.get(b.key)!] : [])));

      if (!opts.quiet && (added.length || movedOk.length)) {
        const one = added.length + movedOk.length === 1;
        const where = (s: Status) => (s === "read" ? "" : ` to ${v.sections[s]}`);
        const label = one
          ? added.length
            ? `Added “${added[0].title}”${where(added[0].status)}`
            : `Moved “${movedOk[0].book.title}” to ${v.sections[movedOk[0].to]}`
          : [added.length && `Added ${v.noun(added.length)}`, movedOk.length && `moved ${movedOk.length}`]
              .filter(Boolean)
              .join(" · ");
        toast(label, {
          action: {
            label: "Undo",
            onClick: async () => {
              const ids = new Set(added.map((a) => a.id));
              setItems((bs) => bs.filter((b) => !ids.has(b.id)));
              await Promise.all([
                ...added.map((b) => api(`/api/items/${b.id}`, { method: "DELETE" })),
                ...movedOk.map((m) => moveItem({ ...m.book, status: m.to }, m.book.status).catch(() => {})),
              ]);
            },
          },
        });
      }
      return [...added, ...movedOk.map((m) => ({ ...m.book, status: m.to }))];
    },
    [moveItem, kind, v, isPlace],
  );

  const setCategories = useCallback(
    async (book: Item, next: string[]) => {
      patchItem(book.id, { categories: next });
      try {
        await api(`/api/items/${book.id}`, { method: "PATCH", body: { categories: next } });
      } catch (err) {
        patchItem(book.id, { categories: book.categories });
        toast.error((err as Error).message);
      }
    },
    [patchItem],
  );

  const setPrivate = useCallback(
    async (book: Item, value: boolean) => {
      patchItem(book.id, { private: value });
      try {
        await api(`/api/items/${book.id}`, { method: "PATCH", body: { private: value } });
        toast(value ? `Only you can see “${book.title}”` : `“${book.title}” is shared again`);
      } catch (err) {
        patchItem(book.id, { private: book.private });
        toast.error((err as Error).message);
      }
    },
    [patchItem],
  );

  const setQuiet = useCallback(
    async (book: Item, value: boolean) => {
      patchItem(book.id, { quiet: value });
      try {
        await api(`/api/items/${book.id}`, { method: "PATCH", body: { quiet: value } });
        toast(value ? `“${book.title}” stays off friends’ Table` : `Friends can see “${book.title}” on their Table`);
      } catch (err) {
        patchItem(book.id, { quiet: book.quiet });
        toast.error((err as Error).message);
      }
    },
    [patchItem],
  );

  const setNote = useCallback(
    async (book: Item, note: string) => {
      const next = note.trim() || null;
      if (next === book.note) return;
      patchItem(book.id, { note: next });
      try {
        await api(`/api/items/${book.id}`, { method: "PATCH", body: { note: next } });
      } catch (err) {
        patchItem(book.id, { note: book.note });
        toast.error((err as Error).message);
      }
    },
    [patchItem],
  );

  const setRecBy = useCallback(
    async (book: Item, name: string | null) => {
      const next = name?.trim() || null;
      // A typed name that hasn't changed is a no-op; anything replaces (or clears) a friend.
      if (!book.recBy?.id && next === (book.recBy?.name ?? null)) return;
      patchItem(book.id, { recBy: next ? { id: null, name: next } : null });
      try {
        await api(`/api/items/${book.id}`, { method: "PATCH", body: { recName: next } });
      } catch (err) {
        patchItem(book.id, { recBy: book.recBy });
        toast.error((err as Error).message);
      }
    },
    [patchItem],
  );

  // After adding to another section (or for places, a destination), show it when the sheet closes.
  const onAddSheet = (open: boolean) => {
    setAdding(open);
    if (open) return;
    setPickingDest(false);
    if (isPlace) {
      if (lastAddedDest.current && lastAddedDest.current !== dest?.id) showDest(lastAddedDest.current);
    } else if (lastAddedTo.current && lastAddedTo.current !== section) {
      showSection(lastAddedTo.current);
    }
    lastAddedTo.current = null;
    lastAddedDest.current = null;
  };
  // Adding from the list of places starts by asking where.
  const startAdding = () => {
    if (isPlace && !dest) setPickingDest(true);
    setAdding(true);
  };
  const isEmpty = items.length === 0 && (!isPlace || destinations.length === 0);

  const openItem = items.find((b) => b.id === openId) ?? null;
  const animateLayout = visible.length <= 200;
  const open = (book: Item) => !book.id.startsWith("tmp:") && setOpenId(book.id);

  return (
    <div className="mx-auto min-h-dvh w-full max-w-3xl pb-32">
      <header className="sticky top-0 z-20 bg-paper/85 px-5 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur-xl">
        <div className="flex h-12 items-center justify-between">
          <div className="flex min-w-0 items-center gap-1.5">
            <Link href="/" aria-label="Your trove" className="-ml-1.5 flex h-10 w-9 shrink-0 items-center justify-center rounded-full active:bg-surface-2">
              <Logo size={24} />
            </Link>
            <KindMenu kind={kind} />
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {/* Anything shareable in the collection: an empty section can still share "All". */}
            {(isPlace ? visible.some((b) => !b.private) : items.some((b) => !b.private)) && (
              <button
                onClick={() => setSharing(true)}
                aria-label={
                  isPlace
                    ? `Share ${dest ? dest.name : "your places"}`
                    : filter
                      ? `Share ${filter}`
                      : `Share ${inSection.length ? v.sections[section] : v.label}`
                }
                className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-2 transition-transform active:scale-95"
              >
                <Icon name="share" size={18} />
              </button>
            )}
            <FriendsButton pending={pendingRequests} />
            <AvatarButton name={name} contact={user.contact} onClick={() => setAccount(true)} />
          </div>
        </div>

        {items.length > 0 && !isPlace ? (
          <>
            <SectionTabs value={section} labels={v.sections} counts={counts} onChange={showSection} />
            {categories.length > 0 ? (
              <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5 pt-3 pb-3">
                <Chip active={!filter} onClick={() => setFilter(null)} label="All" count={inSection.length} />
                {categories.map(([c, n]) => (
                  <Chip key={c} active={filter === c} onClick={() => setFilter(filter === c ? null : c)} label={c} count={n} />
                ))}
              </div>
            ) : (
              <div className="h-3" />
            )}
          </>
        ) : (
          <div className="h-2" />
        )}
      </header>

      {isEmpty ? (
        <EmptyState v={v} onAdd={startAdding} />
      ) : isPlace ? (
        <main className="px-5">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={dest?.id ?? "all"}
              initial={{ opacity: 0, x: dest ? 24 : -24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: dest ? -24 : 24 }}
              transition={{ duration: 0.2 }}
            >
              {dest ? (
                <>
                  <DestinationHeader
                    destination={dest}
                    items={visible}
                    onBack={() => showDest(null)}
                    onAdd={() => setAdding(true)}
                    onShare={() => setSharing(true)}
                    onEdit={() => setEditingDest(dest)}
                  />
                  {visible.length === 0 ? (
                    <div className="flex flex-col items-center rounded-3xl border border-dashed border-line px-6 py-10 text-center">
                      <p className="font-serif text-[22px] font-medium">Nothing in {dest.name} yet</p>
                      <p className="mt-1.5 max-w-xs text-[15px] text-muted">
                        Add the spots you loved there, and the ones you want to try next time.
                      </p>
                    </div>
                  ) : (
                    <PlacesList items={visible} destinations={destinations} groupBy="category" onOpen={open} onToggle={toggleSpot} />
                  )}
                </>
              ) : (
                <>
                  <div className="mt-2 mb-5">
                    <h1 className="font-serif text-[34px] leading-tight font-medium tracking-tight">
                      <span className="tabular-nums">{destinations.length.toLocaleString()}</span>{" "}
                      {destinations.length === 1 ? "place" : "places"}
                    </h1>
                    <p className="text-[15px] text-muted">
                      {items.length ? `${v.noun(items.length)} · ${spotTally(items)}` : "Add the spots you loved, or want to try"}
                    </p>
                  </div>
                  <DestinationCards destinations={destinations} items={items} onOpen={(d) => showDest(d.id)} onNew={startAdding} />
                </>
              )}
            </motion.div>
          </AnimatePresence>
        </main>
      ) : (
        <main className="px-5">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={section}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
            >
              <SectionHeading v={v} section={section} count={visible.length} filter={filter} />
              {visible.length === 0 ? (
                <SectionEmpty v={v} section={section} onAdd={() => setAdding(true)} />
              ) : section === "reading" ? (
                <ul className="space-y-3">
                  <AnimatePresence initial={false} mode="popLayout">
                    {visible.map((book) => (
                      <ReadingCard key={book.key} v={v} book={book} onOpen={() => open(book)} onFinish={() => changeStatus(book, "read")} />
                    ))}
                  </AnimatePresence>
                </ul>
              ) : (
                <motion.ul layout={animateLayout} className="grid grid-cols-3 gap-x-3 gap-y-4 sm:grid-cols-4 md:grid-cols-5">
                  <AnimatePresence initial={false} mode="popLayout">
                    {visible.map((book) => (
                      <motion.li
                        key={book.key}
                        layout={animateLayout ? "position" : false}
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        transition={{ type: "spring", stiffness: 420, damping: 32 }}
                      >
                        <button
                          onClick={() => open(book)}
                          className="block w-full text-left transition-transform duration-150 active:scale-[0.96]"
                          aria-label={`${book.title}${book.author ? ` by ${book.author}` : ""}`}
                        >
                          <Cover book={book} shape={v.shape} locked={book.private} />
                        </button>
                      </motion.li>
                    ))}
                  </AnimatePresence>
                </motion.ul>
              )}
            </motion.div>
          </AnimatePresence>
        </main>
      )}

      <AnimatePresence>
        {!adding && !isEmpty && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 32 }}
            className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center pb-safe"
          >
            <Button onClick={startAdding} icon={<Icon name="plus" size={20} />} className="pointer-events-auto h-14 px-7 shadow-float">
              {v.addLabel}
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      <AddSheet
        open={adding}
        onOpenChange={onAddSheet}
        section={isPlace ? "read" : section}
        kind={kind}
        destination={dest?.id ?? null}
        pickDestination={pickingDest}
        trove={{ kind, items, statusOf, add, destinations, onDestination }}
        empty={items.length === 0}
        features={features}
      />
      <ItemSheet
        kind={kind}
        book={openItem}
        destination={destinations.find((d) => d.id === openItem?.destinationId) ?? null}
        onNote={setNote}
        onRecBy={setRecBy}
        onThank={thank}
        allCategories={allCategories}
        onClose={() => setOpenId(null)}
        onCategories={setCategories}
        onStatus={(book, status) => changeStatus(book, status)}
        onPrivate={setPrivate}
        onQuiet={setQuiet}
        onRemove={remove}
        publicProfile={profile.isPublic}
      />
      <ShareSheet
        open={sharing}
        onOpenChange={setSharing}
        kind={kind}
        items={items}
        destinations={destinations}
        initialStatus={isPlace ? "read" : inSection.some((b) => !b.private) ? section : "all"}
        initialCategory={isPlace ? (dest?.id ?? null) : filter}
        name={name}
        onName={setName}
      />
      <AccountSheet
        open={account}
        onOpenChange={setAccount}
        profile={profile}
        contact={user.contact}
        countLabel={v.noun(items.length)}
        privateCount={privateCount}
        onProfile={updateProfile}
        owner={user.owner}
      />
      {isPlace && (
        <DestinationSheet
          destination={editingDest}
          count={items.filter((b) => b.destinationId === editingDest?.id).length}
          onClose={() => setEditingDest(null)}
          onRenamed={(d) => setDestinations((ds) => ds.map((x) => (x.id === d.id ? d : x)))}
          onDeleted={(d) => {
            setDestinations((ds) => ds.filter((x) => x.id !== d.id));
            setItems((bs) => bs.filter((b) => b.destinationId !== d.id));
            showDest(null);
          }}
        />
      )}
    </div>
  );
}

function SectionHeading({ v, section, count, filter }: { v: Vocab; section: Status; count: number; filter: string | null }) {
  const noun = `${filter ? `${filter.toLowerCase()} ` : ""}${count === 1 ? v.one : v.many}`;
  return (
    <div className="mt-2 mb-5">
      <h1 className="font-serif text-[34px] leading-tight font-medium tracking-tight">
        <motion.span key={count} initial={{ opacity: 0.4, y: 4 }} animate={{ opacity: 1, y: 0 }} className="inline-block tabular-nums">
          {count.toLocaleString()}
        </motion.span>{" "}
        {noun}
      </h1>
      <p className="text-[15px] text-muted">{v.sectionSub[section]}</p>
    </div>
  );
}

function ReadingCard({ v, book, onOpen, onFinish }: { v: Vocab; book: Item; onOpen: () => void; onFinish: () => void }) {
  // The circle fills with a check for a moment, then the card moves to the finished section.
  const [ticked, setTicked] = useState(false);
  const finish = () => {
    if (ticked) return;
    setTicked(true);
    navigator.vibrate?.(10);
    setTimeout(onFinish, 380);
  };
  return (
    <motion.li
      layout="position"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: 40 }}
      transition={{ type: "spring", stiffness: 400, damping: 34 }}
      className="flex items-center gap-4 rounded-3xl bg-surface p-3 pr-4 shadow-book"
    >
      <button onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-4 text-left active:opacity-80">
        <Cover book={book} shape={v.shape} className="w-16 shrink-0" rounded="rounded-[4px]" locked={book.private} />
        <span className="min-w-0">
          <span className="block font-serif text-[19px] leading-tight font-medium line-clamp-2">{book.title}</span>
          {book.author && <span className="mt-0.5 block truncate text-[14px] text-ink-2">{book.author}</span>}
          {book.recBy && <span className="mt-1 block truncate text-[13px] text-muted">from {book.recBy.name}</span>}
        </span>
      </button>
      <button
        onClick={finish}
        aria-label={`${v.finish}: ${book.title}`}
        className={`flex h-10 shrink-0 items-center gap-2 rounded-full border px-3.5 text-[14px] font-medium transition-colors active:scale-95 ${
          ticked ? "border-accent bg-accent text-accent-ink" : "border-line bg-surface text-ink"
        }`}
      >
        {/* An empty circle until tapped: an action, not a state. */}
        <span
          className={`flex h-[18px] w-[18px] items-center justify-center rounded-full border-2 transition-colors ${
            ticked ? "border-accent-ink" : "border-ink-2"
          }`}
        >
          {ticked && <Icon name="check" size={11} />}
        </span>
        {v.finish}
      </button>
    </motion.li>
  );
}

function SectionEmpty({ v, section, onAdd }: { v: Vocab; section: Status; onAdd: () => void }) {
  const [title, body] = v.sectionEmpty[section];
  return (
    <div className="flex flex-col items-center rounded-3xl border border-dashed border-line px-6 py-10 text-center">
      <p className="font-serif text-[22px] font-medium">{title}</p>
      <p className="mt-1.5 max-w-xs text-[15px] text-muted">{body}</p>
      <Button variant="secondary" onClick={onAdd} className="mt-5" icon={<Icon name="plus" size={18} />}>
        {v.addLabel}
      </Button>
    </div>
  );
}

function Chip({ active, label, count, onClick }: { active: boolean; label: string; count: number; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex h-9 shrink-0 items-center gap-1.5 rounded-full px-4 text-[14px] font-medium whitespace-nowrap transition-[background-color,color,transform] duration-200 active:scale-95 ${
        active ? "bg-accent text-accent-ink" : "bg-surface-2 text-ink-2"
      }`}
    >
      {label}
      <span className={`tabular-nums ${active ? "text-paper/60" : "text-muted"}`}>{count}</span>
    </button>
  );
}

function EmptyState({ v, onAdd }: { v: Vocab; onAdd: () => void }) {
  const square = v.shape === "square";
  return (
    <main className="flex flex-col items-center px-8 pt-[14vh] text-center">
      <div className="flex items-end gap-1.5" aria-hidden>
        {["var(--accent)", "var(--stone)", "var(--stone-2)", "var(--tint-book)"].map((c, i) => (
          <motion.div
            key={c}
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1, rotate: square ? (i - 1.5) * 6 : i === 3 ? 10 : 0 }}
            transition={{ delay: i * 0.06, type: "spring", stiffness: 300, damping: 20 }}
            className={`${square ? "-mx-1 h-16 w-16 rounded-[8px]" : "w-7 rounded-[3px]"} shadow-book`}
            style={{ background: c, height: square ? undefined : [92, 110, 84, 98][i], transformOrigin: "bottom left" }}
          />
        ))}
      </div>
      <h1 className="mt-8 font-serif text-[32px] leading-tight font-medium tracking-tight">{v.empty[0]}</h1>
      <p className="mt-2 max-w-xs text-[16px] text-muted">{v.empty[1]}</p>
      <Button onClick={onAdd} className="mt-8 h-14 px-8" icon={<Icon name="plus" size={20} />}>
        {v.addLabel}
      </Button>
    </main>
  );
}
