"use client";

import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { api, plural } from "@/lib/client";
import type { Book, BookHit } from "@/lib/types";
import { AccountSheet } from "./AccountSheet";
import { AddSheet } from "./AddSheet";
import { BookCover } from "./BookCover";
import { BookSheet } from "./BookSheet";
import { ShareSheet } from "./ShareSheet";
import { Button, Icon, Logo } from "./ui";

export type ShelfActions = {
  books: Book[];
  keys: Set<string>;
  add: (hits: BookHit[], opts?: { quiet?: boolean }) => Promise<Book[]>;
};

type Props = {
  user: { name: string | null; contact: string };
  initialBooks: Book[];
  features: { photo: boolean };
};

export function ShelfApp({ user, initialBooks, features }: Props) {
  const [books, setBooks] = useState(initialBooks);
  const [name, setName] = useState(user.name);
  const [chosenFilter, setFilter] = useState<string | null>(null);
  const [adding, setAdding] = useState(initialBooks.length === 0);
  const [sharing, setSharing] = useState(false);
  const [account, setAccount] = useState(false);
  const [openBookId, setOpenBookId] = useState<string | null>(null);

  const booksRef = useRef(books);
  useEffect(() => {
    booksRef.current = books;
  }, [books]);

  const keys = useMemo(() => new Set(books.map((b) => b.key)), [books]);

  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const b of books) for (const c of b.categories) counts.set(c, (counts.get(c) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [books]);

  // If the last book in a category goes, fall back to everything.
  const filter = chosenFilter && categories.some(([c]) => c === chosenFilter) ? chosenFilter : null;

  const visible = useMemo(
    () => (filter ? books.filter((b) => b.categories.includes(filter)) : books),
    [books, filter],
  );

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
            setBooks((bs) => [...added, ...bs].sort((a, b) => b.addedAt - a.addedAt));
          },
        },
      });
    } catch (err) {
      setBooks((bs) => [book, ...bs].sort((a, b) => b.addedAt - a.addedAt));
      toast.error((err as Error).message);
    }
  }, []);

  const add = useCallback(async (hits: BookHit[], opts?: { quiet?: boolean }) => {
    const have = new Set(booksRef.current.map((b) => b.key));
    const fresh = hits.filter((h, i) => !have.has(h.key) && hits.findIndex((x) => x.key === h.key) === i);
    if (!fresh.length) {
      if (!opts?.quiet) toast("Already on your shelf");
      return [];
    }
    // Show them immediately; swap in the saved versions when the server answers.
    const now = Date.now();
    const temp: Book[] = fresh.map((h, i) => ({ ...h, id: `tmp:${h.key}`, addedAt: now - i }));
    // Update the ref right away too, so a second quick add sees these as already on the shelf.
    booksRef.current = [...temp, ...booksRef.current];
    setBooks((bs) => [...temp, ...bs]);
    try {
      const { added } = await api<{ added: Book[] }>("/api/books", { body: { books: fresh } });
      const byKey = new Map(added.map((b) => [b.key, b]));
      const tempIds = new Set(temp.map((t) => t.id));
      setBooks((bs) => bs.flatMap((b) => (!tempIds.has(b.id) ? [b] : byKey.has(b.key) ? [byKey.get(b.key)!] : [])));
      if (!opts?.quiet) {
        const label = added.length === 1 ? `Added “${added[0].title}”` : `Added ${plural(added.length, "book")}`;
        toast(label, {
          action: {
            label: "Undo",
            onClick: async () => {
              const ids = new Set(added.map((a) => a.id));
              setBooks((bs) => bs.filter((b) => !ids.has(b.id)));
              await Promise.all(added.map((b) => api(`/api/books/${b.id}`, { method: "DELETE" })));
            },
          },
        });
      }
      return added;
    } catch (err) {
      setBooks((bs) => bs.filter((b) => !b.id.startsWith("tmp:") || !temp.some((t) => t.id === b.id)));
      toast.error((err as Error).message);
      return [];
    }
  }, []);

  const setCategories = useCallback(async (book: Book, next: string[]) => {
    setBooks((bs) => bs.map((b) => (b.id === book.id ? { ...b, categories: next } : b)));
    try {
      await api(`/api/books/${book.id}`, { method: "PATCH", body: { categories: next } });
    } catch (err) {
      setBooks((bs) => bs.map((b) => (b.id === book.id ? { ...b, categories: book.categories } : b)));
      toast.error((err as Error).message);
    }
  }, []);

  const openBook = books.find((b) => b.id === openBookId) ?? null;
  const animateLayout = books.length <= 200;

  return (
    <div className="mx-auto min-h-dvh w-full max-w-3xl pb-32">
      <header className="sticky top-0 z-20 bg-paper/85 px-5 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur-xl">
        <div className="flex h-12 items-center justify-between">
          <div className="flex items-center gap-2">
            <Logo size={24} />
            <span className="font-serif text-[19px] font-semibold tracking-tight">Shelf</span>
          </div>
          <div className="flex items-center gap-1">
            {books.length > 0 && (
              <button
                onClick={() => setSharing(true)}
                className="flex h-10 items-center gap-2 rounded-full bg-surface-2 px-4 text-[15px] font-medium transition-transform active:scale-95"
              >
                <Icon name="share" size={17} />
                {filter ? `Share ${filter}` : "Share"}
              </button>
            )}
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
          <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5 py-3">
            <Chip active={!filter} onClick={() => setFilter(null)} label="All" count={books.length} />
            {categories.map(([c, n]) => (
              <Chip key={c} active={filter === c} onClick={() => setFilter(filter === c ? null : c)} label={c} count={n} />
            ))}
          </div>
        )}
      </header>

      {books.length > 0 ? (
        <main className="px-5">
          <div className="mt-2 mb-5">
            <h1 className="font-serif text-[34px] leading-tight font-medium tracking-tight">
              <motion.span key={visible.length} initial={{ opacity: 0.4, y: 4 }} animate={{ opacity: 1, y: 0 }} className="inline-block tabular-nums">
                {visible.length.toLocaleString()}
              </motion.span>{" "}
              {filter ? <span>{filter.toLowerCase()} {visible.length === 1 ? "book" : "books"}</span> : visible.length === 1 ? "book" : "books"}
            </h1>
            <p className="text-[15px] text-muted">{filter ? "on your shelf" : "you’ve read"}</p>
          </div>

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
                    onClick={() => !book.id.startsWith("tmp:") && setOpenBookId(book.id)}
                    className="block w-full text-left transition-transform duration-150 active:scale-[0.96]"
                    aria-label={`${book.title}${book.author ? ` by ${book.author}` : ""}`}
                  >
                    <BookCover book={book} />
                  </button>
                </motion.li>
              ))}
            </AnimatePresence>
          </motion.ul>
        </main>
      ) : (
        <EmptyState onAdd={() => setAdding(true)} />
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
        onOpenChange={setAdding}
        shelf={{ books, keys, add }}
        empty={books.length === 0}
        features={features}
      />
      <BookSheet
        book={openBook}
        allCategories={categories.map(([c]) => c)}
        onClose={() => setOpenBookId(null)}
        onCategories={setCategories}
        onRemove={remove}
      />
      <ShareSheet
        open={sharing}
        onOpenChange={setSharing}
        books={books}
        categories={categories}
        initialCategory={filter}
        name={name}
        onName={setName}
      />
      <AccountSheet open={account} onOpenChange={setAccount} name={name} contact={user.contact} onName={setName} count={books.length} />
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
