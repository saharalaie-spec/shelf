"use client";

import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ago, api, plural, STATUS_LABEL } from "@/lib/client";
import { STATUSES, type Book, type BookHit, type Status } from "@/lib/types";
import { AccountSheet, type Profile } from "./AccountSheet";
import { AddSheet } from "./AddSheet";
import { BookCover } from "./BookCover";
import { BookSheet } from "./BookSheet";
import { FriendsSheet } from "./FriendsSheet";
import { ShareSheet } from "./ShareSheet";
import { SectionTabs } from "./SectionTabs";
import { Button, Icon, Logo, useHydrated } from "./ui";

/** A catalog hit to add; imports may already know which section it belongs in. */
export type NewHit = BookHit & { status?: Status };

/** What the shelf hands the add sheet. */
export type ShelfApi = {
  books: Book[];
  statusOf: Map<string, Status>;
  add: (hits: NewHit[], opts: { status: Status; quiet?: boolean }) => Promise<Book[]>;
};

/** What the add sheet's views can do. `target` is the section new books go to. */
export type ShelfActions = Omit<ShelfApi, "add"> & {
  target: Status;
  add: (hits: NewHit[], opts?: { quiet?: boolean }) => Promise<Book[]>;
};

type Props = {
  user: Profile & { contact: string };
  /** Friend requests waiting for an answer, for the badge on the Friends button. */
  pendingRequests: number;
  initialBooks: Book[];
  features: { photo: boolean };
};

const SECTION_KEY = "shelf:section";
const byNewest = (a: Book, b: Book) => b.statusAt - a.statusAt || b.addedAt - a.addedAt;

export function ShelfApp({ user, pendingRequests, initialBooks, features }: Props) {
  const [books, setBooks] = useState(initialBooks);
  const [profile, setProfile] = useState<Profile>({ id: user.id, name: user.name, handle: user.handle, isPublic: user.isPublic });
  const { name } = profile;
  const [pending, setPending] = useState(pendingRequests);
  const [friendsOpen, setFriendsOpen] = useState(false);
  const [section, setSection] = useState<Status>("read");
  const [chosenFilter, setFilter] = useState<string | null>(null);
  const [adding, setAdding] = useState(initialBooks.length === 0);
  const [sharing, setSharing] = useState(false);
  const [account, setAccount] = useState(false);
  const [openBookId, setOpenBookId] = useState<string | null>(null);
  const lastAddedTo = useRef<Status | null>(null);

  const booksRef = useRef(books);
  useEffect(() => {
    booksRef.current = books;
  }, [books]);

  // Reopen on the section you were last looking at (a per-device convenience).
  useEffect(() => {
    try {
      const saved = localStorage.getItem(SECTION_KEY) as Status | null;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved && STATUSES.includes(saved)) setSection(saved);
    } catch {}
  }, []);

  const showSection = useCallback((s: Status) => {
    setSection(s);
    setFilter(null);
    try {
      localStorage.setItem(SECTION_KEY, s);
    } catch {}
  }, []);

  const statusOf = useMemo(() => new Map(books.map((b) => [b.key, b.status])), [books]);
  const counts = useMemo(() => {
    const c: Record<Status, number> = { read: 0, reading: 0, want: 0 };
    for (const b of books) c[b.status]++;
    return c;
  }, [books]);
  const inSection = useMemo(() => books.filter((b) => b.status === section).sort(byNewest), [books, section]);

  const categories = useMemo(() => {
    const tally = new Map<string, number>();
    for (const b of inSection) for (const c of b.categories) tally.set(c, (tally.get(c) ?? 0) + 1);
    return [...tally.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [inSection]);
  const allCategories = useMemo(() => [...new Set(books.flatMap((b) => b.categories))], [books]);
  const privateCount = useMemo(() => books.filter((b) => b.private).length, [books]);

  const updateProfile = useCallback((patch: Partial<Profile>) => setProfile((p) => ({ ...p, ...patch })), []);
  const setName = useCallback((n: string | null) => updateProfile({ name: n }), [updateProfile]);

  // If the last book in a category goes, fall back to everything.
  const filter = chosenFilter && categories.some(([c]) => c === chosenFilter) ? chosenFilter : null;
  const visible = filter ? inSection.filter((b) => b.categories.includes(filter)) : inSection;

  const patchBook = useCallback((id: string, patch: Partial<Book>) => {
    setBooks((bs) => bs.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  }, []);

  const remove = useCallback(async (book: Book) => {
    setBooks((bs) => bs.filter((b) => b.id !== book.id));
    setOpenBookId(null);
    try {
      await api(`/api/books/${book.id}`, { method: "DELETE" });
      toast(`Removed “${book.title}”`, {
        action: {
          label: "Undo",
          onClick: async () => {
            const { added } = await api<{ added: Book[] }>("/api/books", { body: { books: [book] } });
            setBooks((bs) => [...added, ...bs]);
          },
        },
      });
    } catch (err) {
      setBooks((bs) => [book, ...bs]);
      toast.error((err as Error).message);
    }
  }, []);

  /** Moves a book to another section. Saves in the background; reverts if the server says no. */
  const moveBook = useCallback(
    async (book: Book, status: Status) => {
      if (book.status === status) return;
      patchBook(book.id, { status, statusAt: Date.now() });
      try {
        const saved = await api<{ statusAt: number }>(`/api/books/${book.id}`, { method: "PATCH", body: { status } });
        patchBook(book.id, { statusAt: saved.statusAt });
      } catch (err) {
        patchBook(book.id, { status: book.status, statusAt: book.statusAt });
        throw err;
      }
    },
    [patchBook],
  );

  const changeStatus = useCallback(
    async (book: Book, status: Status) => {
      try {
        await moveBook(book, status);
        toast(status === "read" ? `Finished “${book.title}”` : `Moved “${book.title}” to ${STATUS_LABEL[status]}`, {
          action: { label: "Undo", onClick: () => moveBook({ ...book, status }, book.status).catch(() => {}) },
        });
      } catch (err) {
        toast.error((err as Error).message);
      }
    },
    [moveBook],
  );

  const add = useCallback(
    async (hits: NewHit[], opts: { status: Status; quiet?: boolean }) => {
      const unique = hits.filter((h, i) => hits.findIndex((x) => x.key === h.key) === i);
      const statusFor = (h: NewHit) => h.status ?? opts.status;
      const onShelf = new Map(booksRef.current.map((b) => [b.key, b]));
      const fresh = unique.filter((h) => !onShelf.has(h.key));
      // Already on the shelf in another section: adding it here means it moved (e.g. want → read).
      const moves = unique
        .map((h) => ({ book: onShelf.get(h.key), to: statusFor(h) }))
        .filter((m): m is { book: Book; to: Status } => Boolean(m.book && m.book.status !== m.to));

      if (!fresh.length && !moves.length) {
        if (!opts.quiet) toast(`Already in ${STATUS_LABEL[unique[0] ? statusFor(unique[0]) : opts.status]}`);
        return [];
      }
      lastAddedTo.current = opts.status;

      // Show them immediately; swap in the saved versions when the server answers.
      const now = Date.now();
      const temp: Book[] = fresh.map((h, i) => ({
        ...h,
        status: statusFor(h),
        id: `tmp:${h.key}`,
        addedAt: now - i,
        statusAt: now - i,
        private: false,
      }));
      // Update the ref right away too, so a second quick add sees these as already on the shelf.
      booksRef.current = [...temp, ...booksRef.current];
      setBooks((bs) => [...temp, ...bs]);

      // New books and moves save independently, so one failing doesn't lose the other.
      const fail = (err: unknown) => toast.error((err as Error).message);
      const movedOk: { book: Book; to: Status }[] = [];
      const [added] = await Promise.all([
        fresh.length
          ? api<{ added: Book[] }>("/api/books", { body: { books: fresh.map((h) => ({ ...h, status: statusFor(h) })) } })
              .then((r) => r.added)
              .catch((err) => (fail(err), [] as Book[]))
          : Promise.resolve([] as Book[]),
        ...moves.map((m) => moveBook(m.book, m.to).then(() => void movedOk.push(m), fail)),
      ]);
      const byKey = new Map(added.map((b) => [b.key, b]));
      const tempIds = new Set(temp.map((t) => t.id));
      setBooks((bs) => bs.flatMap((b) => (!tempIds.has(b.id) ? [b] : byKey.has(b.key) ? [byKey.get(b.key)!] : [])));

      if (!opts.quiet && (added.length || movedOk.length)) {
        const one = added.length + movedOk.length === 1;
        const where = (s: Status) => (s === "read" ? "" : ` to ${STATUS_LABEL[s]}`);
        const label = one
          ? added.length
            ? `Added “${added[0].title}”${where(added[0].status)}`
            : `Moved “${movedOk[0].book.title}” to ${STATUS_LABEL[movedOk[0].to]}`
          : [added.length && `Added ${plural(added.length, "book")}`, movedOk.length && `moved ${movedOk.length}`]
              .filter(Boolean)
              .join(" · ");
        toast(label, {
          action: {
            label: "Undo",
            onClick: async () => {
              const ids = new Set(added.map((a) => a.id));
              setBooks((bs) => bs.filter((b) => !ids.has(b.id)));
              await Promise.all([
                ...added.map((b) => api(`/api/books/${b.id}`, { method: "DELETE" })),
                ...movedOk.map((m) => moveBook({ ...m.book, status: m.to }, m.book.status).catch(() => {})),
              ]);
            },
          },
        });
      }
      return [...added, ...movedOk.map((m) => ({ ...m.book, status: m.to }))];
    },
    [moveBook],
  );

  const setCategories = useCallback(
    async (book: Book, next: string[]) => {
      patchBook(book.id, { categories: next });
      try {
        await api(`/api/books/${book.id}`, { method: "PATCH", body: { categories: next } });
      } catch (err) {
        patchBook(book.id, { categories: book.categories });
        toast.error((err as Error).message);
      }
    },
    [patchBook],
  );

  const setPrivate = useCallback(
    async (book: Book, value: boolean) => {
      patchBook(book.id, { private: value });
      try {
        await api(`/api/books/${book.id}`, { method: "PATCH", body: { private: value } });
        toast(value ? `Only you can see “${book.title}”` : `“${book.title}” is back on your shared shelf`);
      } catch (err) {
        patchBook(book.id, { private: book.private });
        toast.error((err as Error).message);
      }
    },
    [patchBook],
  );

  // After adding to another section, show that section when the sheet closes.
  const onAddSheet = (open: boolean) => {
    setAdding(open);
    if (!open && lastAddedTo.current && lastAddedTo.current !== section) showSection(lastAddedTo.current);
    if (!open) lastAddedTo.current = null;
  };

  const openBook = books.find((b) => b.id === openBookId) ?? null;
  const animateLayout = visible.length <= 200;
  const open = (book: Book) => !book.id.startsWith("tmp:") && setOpenBookId(book.id);

  return (
    <div className="mx-auto min-h-dvh w-full max-w-3xl pb-32">
      <header className="sticky top-0 z-20 bg-paper/85 px-5 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur-xl">
        <div className="flex h-12 items-center justify-between">
          <div className="flex items-center gap-2">
            <Logo size={24} />
            <span className="font-serif text-[19px] font-semibold tracking-tight">Shelf</span>
          </div>
          <div className="flex items-center gap-1">
            {inSection.length > 0 && (
              <button
                onClick={() => setSharing(true)}
                className="flex h-10 items-center gap-2 rounded-full bg-surface-2 px-4 text-[15px] font-medium transition-transform active:scale-95"
              >
                <Icon name="share" size={17} />
                {filter ? `Share ${filter}` : "Share"}
              </button>
            )}
            <button
              onClick={() => setFriendsOpen(true)}
              aria-label={pending ? `Friends, ${pending} new ${pending === 1 ? "request" : "requests"}` : "Friends"}
              className="relative flex h-10 w-10 items-center justify-center rounded-full bg-surface-2 transition-transform active:scale-95"
            >
              <Icon name="people" size={19} />
              <AnimatePresence>
                {pending > 0 && (
                  <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    exit={{ scale: 0 }}
                    className="absolute -top-0.5 -right-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-accent px-1 text-[11px] font-semibold text-accent-ink tabular-nums"
                  >
                    {pending}
                  </motion.span>
                )}
              </AnimatePresence>
            </button>
            <button
              onClick={() => setAccount(true)}
              aria-label="Account"
              className="ml-1 flex h-10 w-10 items-center justify-center rounded-full bg-ink font-serif text-[16px] text-paper transition-transform active:scale-95"
            >
              {(name ?? user.contact).replace(/^\+/, "").charAt(0).toUpperCase() || "?"}
            </button>
          </div>
        </div>

        {books.length > 0 && (
          <>
            <SectionTabs value={section} counts={counts} onChange={showSection} />
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
        )}
      </header>

      {books.length === 0 ? (
        <EmptyState onAdd={() => setAdding(true)} />
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
              <SectionHeading section={section} count={visible.length} filter={filter} />
              {visible.length === 0 ? (
                <SectionEmpty section={section} onAdd={() => setAdding(true)} />
              ) : section === "reading" ? (
                <ul className="space-y-3">
                  <AnimatePresence initial={false} mode="popLayout">
                    {visible.map((book) => (
                      <ReadingCard key={book.key} book={book} onOpen={() => open(book)} onFinish={() => changeStatus(book, "read")} />
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
                          <BookCover book={book} locked={book.private} />
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
        {!adding && books.length > 0 && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 32 }}
            className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center pb-safe"
          >
            <Button onClick={() => setAdding(true)} icon={<Icon name="plus" size={20} />} className="pointer-events-auto h-14 px-7 shadow-float">
              Add books
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      <AddSheet
        open={adding}
        onOpenChange={onAddSheet}
        section={section}
        shelf={{ books, statusOf, add }}
        empty={books.length === 0}
        features={features}
      />
      <BookSheet
        book={openBook}
        allCategories={allCategories}
        onClose={() => setOpenBookId(null)}
        onCategories={setCategories}
        onStatus={(book, status) => changeStatus(book, status)}
        onPrivate={setPrivate}
        onRemove={remove}
        publicProfile={profile.isPublic}
      />
      <ShareSheet
        open={sharing}
        onOpenChange={setSharing}
        books={books}
        initialStatus={section}
        initialCategory={filter}
        name={name}
        onName={setName}
      />
      <AccountSheet
        open={account}
        onOpenChange={setAccount}
        profile={profile}
        contact={user.contact}
        count={books.length}
        privateCount={privateCount}
        onProfile={updateProfile}
      />
      <FriendsSheet open={friendsOpen} onOpenChange={setFriendsOpen} name={name} onName={setName} onPending={setPending} />
    </div>
  );
}

function SectionHeading({ section, count, filter }: { section: Status; count: number; filter: string | null }) {
  const noun = `${filter ? `${filter.toLowerCase()} ` : ""}${count === 1 ? "book" : "books"}`;
  const sub = { read: "you’ve read", reading: "you’re reading", want: "you want to read" }[section];
  return (
    <div className="mt-2 mb-5">
      <h1 className="font-serif text-[34px] leading-tight font-medium tracking-tight">
        <motion.span key={count} initial={{ opacity: 0.4, y: 4 }} animate={{ opacity: 1, y: 0 }} className="inline-block tabular-nums">
          {count.toLocaleString()}
        </motion.span>{" "}
        {noun}
      </h1>
      <p className="text-[15px] text-muted">{sub}</p>
    </div>
  );
}

function ReadingCard({ book, onOpen, onFinish }: { book: Book; onOpen: () => void; onFinish: () => void }) {
  const hydrated = useHydrated();
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
        <BookCover book={book} className="w-16 shrink-0" rounded="rounded-[4px]" locked={book.private} />
        <span className="min-w-0">
          <span className="block font-serif text-[19px] leading-tight font-medium line-clamp-2">{book.title}</span>
          {book.author && <span className="mt-0.5 block truncate text-[14px] text-ink-2">{book.author}</span>}
          {/* Relative dates depend on the viewer's clock and locale, so they render after hydration. */}
          <span className="mt-1 block min-h-5 text-[13px] text-muted">{hydrated && book.statusAt ? `Started ${ago(book.statusAt)}` : ""}</span>
        </span>
      </button>
      <button
        onClick={onFinish}
        className="flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-ink px-4 text-[14px] font-medium text-paper transition-transform active:scale-95"
      >
        <Icon name="check" size={16} />
        Finished
      </button>
    </motion.li>
  );
}

function SectionEmpty({ section, onAdd }: { section: Status; onAdd: () => void }) {
  const copy = {
    read: ["Nothing finished yet", "Books you’ve read land here. Tap Finished on a book you’re reading, or add some."],
    reading: ["Not reading anything right now", "Start a book from Want to read, or add the one on your nightstand."],
    want: ["Your list is empty", "Save the books you’d like to read next, so they’re here when you need one."],
  }[section];
  return (
    <div className="flex flex-col items-center rounded-3xl border border-dashed border-line px-6 py-10 text-center">
      <p className="font-serif text-[22px] font-medium">{copy[0]}</p>
      <p className="mt-1.5 max-w-xs text-[15px] text-muted">{copy[1]}</p>
      <Button variant="secondary" onClick={onAdd} className="mt-5" icon={<Icon name="plus" size={18} />}>
        {section === "reading" ? "Add a book" : "Add books"}
      </Button>
    </div>
  );
}

function Chip({ active, label, count, onClick }: { active: boolean; label: string; count: number; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex h-9 shrink-0 items-center gap-1.5 rounded-full px-4 text-[14px] font-medium whitespace-nowrap transition-[background-color,color,transform] duration-200 active:scale-95 ${
        active ? "bg-ink text-paper" : "bg-surface-2 text-ink-2"
      }`}
    >
      {label}
      <span className={`tabular-nums ${active ? "text-paper/60" : "text-muted"}`}>{count}</span>
    </button>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <main className="flex flex-col items-center px-8 pt-[14vh] text-center">
      <div className="flex items-end gap-1.5" aria-hidden>
        {["#34466b", "#b5532c", "#2f4b3a", "#9a6c22"].map((c, i) => (
          <motion.div
            key={c}
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1, rotate: i === 3 ? 10 : 0 }}
            transition={{ delay: i * 0.06, type: "spring", stiffness: 300, damping: 20 }}
            className="w-7 rounded-[3px] shadow-book"
            style={{ background: c, height: [92, 110, 84, 98][i], transformOrigin: "bottom left" }}
          />
        ))}
      </div>
      <h1 className="mt-8 font-serif text-[32px] leading-tight font-medium tracking-tight">Your shelf is empty</h1>
      <p className="mt-2 max-w-xs text-[16px] text-muted">
        Type the books you remember, paste a list, scan barcodes or import from Goodreads.
      </p>
      <Button onClick={onAdd} className="mt-8 h-14 px-8" icon={<Icon name="plus" size={20} />}>
        Add books
      </Button>
    </main>
  );
}
