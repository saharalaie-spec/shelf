"use client";

import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { ago, api, itemLinks } from "@/lib/client";
import { VOCAB, type Vocab } from "@/lib/kinds";
import { KINDS, STATUSES, type Item, type Kind, type Status } from "@/lib/types";
import { Cover } from "./Cover";
import { Login, type Channels } from "./Login";
import { SectionTabs } from "./SectionTabs";
import { Sheet } from "./Sheet";
import { Avatar, Button, Icon, KIND_ICON, Logo, useHydrated } from "./ui";

/** How the viewer is connected to the person whose shelf this is. */
export type Relation =
  | { kind: "self"; hiddenCount: number }
  | { kind: "friend" }
  | { kind: "stranger" }
  | { kind: "requested" }
  | { kind: "asked-you"; requestId: string }
  | { kind: "signed-out" };

type Props = {
  person: { id: string; name: string | null; handle: string | null; isPublic: boolean };
  /** Everything they share, across collections. */
  items: Item[];
  relation: Relation;
  /** The viewer's own items (work key → section), so one they have shows where it lives. */
  mine: Record<string, Status>;
  channels: Channels;
};

const firstSection = (counts: Record<Status, number>) => STATUSES.find((s) => counts[s] > 0) ?? "read";

export function ProfileShelf({ person, items, relation, mine: initialMine, channels }: Props) {
  const counts = useMemo(() => {
    const c = Object.fromEntries(KINDS.map((k) => [k, { read: 0, reading: 0, want: 0 }])) as Record<Kind, Record<Status, number>>;
    for (const b of items) c[b.kind][b.status]++;
    return c;
  }, [items]);
  const total = (k: Kind) => counts[k].read + counts[k].reading + counts[k].want;
  // Open on the first collection they've put something in.
  const [kind, setKind] = useState<Kind>(() => KINDS.find((k) => total(k) > 0) ?? "book");
  const [section, setSection] = useState<Status>(() => firstSection(counts[kind]));
  const v = VOCAB[kind];
  const books = items.filter((b) => b.kind === kind);
  const showKind = (k: Kind) => {
    setKind(k);
    setSection(firstSection(counts[k]));
  };
  const [mine, setMine] = useState(initialMine);
  const [open, setOpen] = useState<Item | null>(null);
  const [lastOpen, setLastOpen] = useState<Item | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const name = person.name ?? "A Shelf reader";
  const signedIn = relation.kind !== "signed-out";
  // Signed in from the sheet: the page re-renders with the viewer, so put the sheet away.
  if (signingIn && signedIn) setSigningIn(false);
  const shown = open ?? lastOpen;

  const inSection = books.filter((b) => b.status === section);

  const save = async (book: Item, status: Status) => {
    setMine((m) => ({ ...m, [book.key]: status }));
    try {
      // Only things you don't have get these buttons, so this is always a fresh add.
      const { key, title, author, year, coverUrl, categories } = book;
      await api("/api/items", { body: { kind: book.kind, items: [{ key, title, author, year, coverUrl, categories, status }] } });
      toast(`Added “${book.title}” to your ${VOCAB[book.kind].sections[status]}`);
    } catch (err) {
      setMine(({ [book.key]: _, ...rest }) => rest);
      toast.error((err as Error).message);
    }
  };

  return (
    <div className="mx-auto min-h-dvh w-full max-w-3xl pb-40">
      <header className="flex h-16 items-center justify-between px-5 pt-[env(safe-area-inset-top)]">
        <Link href="/" className="flex items-center gap-2">
          <Logo size={24} />
          <span className="font-serif text-[19px] font-semibold tracking-tight">Shelf</span>
        </Link>
        {signedIn && (
          <Link href="/" className="flex h-9 items-center rounded-full bg-surface-2 px-4 text-[14px] font-medium">
            Your shelves
          </Link>
        )}
      </header>

      {relation.kind === "self" && <SelfBanner hidden={relation.hiddenCount} isPublic={person.isPublic} />}

      <section className="px-5 pt-5 pb-6">
        <div className="flex items-center gap-4">
          <Avatar name={person.name} size={64} />
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
        {relation.kind !== "self" && (
          <div className="mt-5">
            <RelationButton person={person} relation={relation} onSignIn={() => setSigningIn(true)} />
          </div>
        )}
      </section>

      <div className="sticky top-0 z-20 bg-paper/85 px-5 pt-2 pb-4 backdrop-blur-xl">
        <div className="grid grid-cols-3 gap-2 pb-3" role="tablist" aria-label="Collections">
          {KINDS.map((k) => (
            <button
              key={k}
              role="tab"
              aria-selected={k === kind}
              aria-label={`${VOCAB[k].label}, ${total(k)}`}
              onClick={() => showKind(k)}
              className={`flex h-11 min-w-0 items-center justify-center gap-1.5 rounded-2xl px-2 text-[14px] font-medium transition-colors active:scale-95 ${
                k === kind ? "text-white" : "bg-surface-2 text-ink-2"
              }`}
              style={k === kind ? { background: VOCAB[k].tint } : undefined}
            >
              {/* On a phone, three labels only fit without icons. */}
              <Icon name={KIND_ICON[k]} size={16} className="hidden shrink-0 sm:block" />
              <span className="truncate">{VOCAB[k].label}</span>
            </button>
          ))}
        </div>
        {books.length > 0 && (
          <SectionTabs value={section} labels={v.sections} counts={counts[kind]} onChange={setSection} layoutId="profile-status-pill" />
        )}
      </div>

      {books.length === 0 ? (
        <p className="px-5 text-[16px] text-muted">No {v.many} here yet.</p>
      ) : inSection.length === 0 ? (
        <p className="px-5 text-[16px] text-muted">{v.sectionEmpty[section][0]}.</p>
      ) : (
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={`${kind}:${section}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
            className="px-5"
          >
            {section === "reading" ? (
              <ul className="space-y-3">
                {inSection.map((b) => (
                  <ReadingRow key={b.id} v={v} book={b} onOpen={() => (setOpen(b), setLastOpen(b))} />
                ))}
              </ul>
            ) : (
              <ul className="grid grid-cols-3 gap-x-3 gap-y-5 sm:grid-cols-4 md:grid-cols-5">
                {inSection.map((b, i) => (
                  <motion.li
                    key={b.id}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(i, 18) * 0.025, type: "spring", stiffness: 380, damping: 32 }}
                  >
                    <button
                      onClick={() => (setOpen(b), setLastOpen(b))}
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
            className="pointer-events-auto mx-auto flex max-w-xl items-center gap-4 rounded-3xl bg-ink p-4 pl-5 text-paper shadow-float"
          >
            <div className="min-w-0 flex-1">
              <p className="text-[16px] font-medium">Make your own shelf</p>
              <p className="text-[14px] text-paper/65">Your books, podcasts and shows, shared with friends.</p>
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
            <BookActions book={shown} relation={relation} mine={mine[shown.key]} onSave={save} />
            <div className="mt-2 mb-2 flex flex-wrap gap-2">
              {itemLinks(shown, shown.kind).map((l) => (
                <a
                  key={l.label}
                  href={l.href}
                  target="_blank"
                  rel="noreferrer"
                  className="flex h-11 flex-1 items-center justify-center rounded-full px-4 text-[15px] font-medium whitespace-nowrap text-ink-2 active:bg-surface-2"
                >
                  {l.label}
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

function SelfBanner({ hidden, isPublic }: { hidden: number; isPublic: boolean }) {
  return (
    <div className="mx-5 mt-1 flex items-start gap-3 rounded-2xl bg-surface-2 px-4 py-3">
      <Icon name="eye" size={19} className="mt-0.5 shrink-0 text-ink-2" />
      <p className="min-w-0 flex-1 text-[14px] leading-snug text-ink-2">
        This is what {isPublic ? "friends and anyone with your link" : "your friends"} see.
        {hidden > 0 && ` ${hidden === 1 ? "Your private item is" : `Your ${hidden} private items are`} hidden.`}{" "}
        <Link href="/" className="font-medium text-ink underline underline-offset-2">
          Back to your shelves
        </Link>
      </p>
    </div>
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
                You’ll stop seeing each other’s shelves{person.isPublic ? " (their public profile stays open to everyone)" : ""}. They won’t be told.
              </p>
              <Button
                variant="secondary"
                className="mt-5 w-full text-accent"
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
      <Link href="/" className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-ink text-[16px] font-medium text-paper active:scale-[0.97]">
        <Icon name="plus" size={18} /> Start your own shelf
      </Link>
    );
  }
  if (mine) {
    return (
      <div className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-surface-2 text-[15px] font-medium text-ink-2">
        <Icon name="check" size={17} className="text-good" /> On your shelf in {VOCAB[book.kind].sections[mine]}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-2">
      <Button onClick={() => onSave(book, "want")} icon={<Icon name="plus" size={18} />} className="px-3">
        {VOCAB[book.kind].sections.want}
      </Button>
      <Button variant="secondary" onClick={() => onSave(book, "read")} className="px-3">
        {{ book: "I’ve read it", podcast: "I’ve listened", screen: "I’ve seen it" }[book.kind]}
      </Button>
    </div>
  );
}

function ReadingRow({ v, book, onOpen }: { v: Vocab; book: Item; onOpen: () => void }) {
  const hydrated = useHydrated();
  return (
    <li>
      <button onClick={onOpen} className="flex w-full items-center gap-4 rounded-3xl bg-surface p-3 pr-4 text-left shadow-book active:opacity-80">
        <Cover book={book} shape={v.shape} className="w-16 shrink-0" rounded="rounded-[4px]" />
        <span className="min-w-0">
          <span className="block font-serif text-[19px] leading-tight font-medium line-clamp-2">{book.title}</span>
          {book.author && <span className="mt-0.5 block truncate text-[14px] text-ink-2">{book.author}</span>}
          <span className="mt-1 block min-h-5 text-[13px] text-muted">{hydrated && book.statusAt ? `${v.started} ${ago(book.statusAt)}` : ""}</span>
        </span>
      </button>
    </li>
  );
}
