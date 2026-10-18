"use client";

import { AnimatePresence, motion, type PanInfo } from "motion/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/client";
import { VOCAB } from "@/lib/kinds";
import { SAMPLE_FRIEND_NAME } from "@/lib/sample";
import type { StartFrom } from "@/lib/start";
import type { DeckCard, DeckKind } from "@/lib/suggest";
import { KINDS, type Hit, type Item, type Kind, type RecBy, type Status } from "@/lib/types";
import { Cover } from "./Cover";
import { SpotTile, spotLine } from "./Spot";
import { Avatar, Button, Icon, Logo } from "./ui";

type Mine = { id: string; key: string; kind: Kind; title: string; status: Status };

type Props = {
  name: string | null;
  /** The friend to start from, or null when there's no one yet. */
  from: StartFrom | null;
  /** What's on your lists already. */
  mine: Mine[];
  features: { deck: boolean };
};

type Step = "friend" | "loved" | "deck";

/** Something saved here, by work key. `id` starts "tmp:" until the server answers. */
type Have = Map<string, { id: string; kind: Kind; status: Status }>;
type Save = (kind: Kind, hit: Hit, status: Status, extra?: { recBy?: Pick<RecBy, "id">; destination?: object }) => void;

const PROMPT: Record<DeckKind, { label: string; placeholder: string }> = {
  book: { label: "A book you loved", placeholder: "Search books" },
  podcast: { label: "A podcast you love", placeholder: "Search podcasts" },
  screen: { label: "Something you loved watching", placeholder: "Search movies and shows" },
};

const LOVED = (kind: Kind) => (kind === "place" ? "Been" : "Me too");
const WANT = (kind: Kind) => (kind === "place" ? "Want to go" : "Want it");

/** Getting started without logging everything: start from a friend, name one thing you loved, then a quick deck. */
export function Start({ name, from, mine, features }: Props) {
  const router = useRouter();
  const steps: Step[] = ["friend", "loved", ...(features.deck ? (["deck"] as const) : [])];
  const [step, setStep] = useState<Step>("friend");
  const [have, setHave] = useState<Have>(() => new Map(mine.map((m) => [m.key, { id: m.id, kind: m.kind, status: m.status }])));
  const [finishing, setFinishing] = useState(false);
  const at = steps.indexOf(step);

  const save: Save = async (kind, hit, status, extra = {}) => {
    const had = have.get(hit.key);
    // Already there in that section, or still saving.
    if (had?.status === status || had?.id.startsWith("tmp:")) return;
    setHave((m) => new Map(m).set(hit.key, { id: had?.id ?? `tmp:${hit.key}`, kind, status }));
    try {
      if (had) {
        await api(`/api/items/${had.id}`, { method: "PATCH", body: { status } });
        return;
      }
      const { added } = await api<{ added: Item[] }>("/api/items", {
        body: { kind, items: [{ ...hit, status, recBy: extra.recBy ?? null }], ...(extra.destination ? { destination: extra.destination } : {}) },
      });
      setHave((m) => new Map(m).set(hit.key, { id: added[0]?.id ?? `saved:${hit.key}`, kind, status }));
    } catch (err) {
      setHave((m) => {
        const next = new Map(m);
        if (had) next.set(hit.key, had);
        else next.delete(hit.key);
        return next;
      });
      toast.error((err as Error).message);
    }
  };

  const next = () => {
    if (at < steps.length - 1) {
      setStep(steps[at + 1]);
      window.scrollTo({ top: 0 });
    } else finish();
  };
  const finish = async () => {
    setFinishing(true);
    try {
      await api("/api/start/done", { body: {} });
      router.replace("/");
    } catch (err) {
      toast.error((err as Error).message);
      setFinishing(false);
    }
  };
  const added = [...have.values()].filter((h) => !mine.some((m) => m.id === h.id)).length;

  return (
    <div className="mx-auto min-h-dvh w-full max-w-xl pb-32">
      <header className="flex h-16 items-center justify-between px-5 pt-[env(safe-area-inset-top)]">
        <div className="flex items-center gap-2">
          <Logo size={24} />
          <span className="font-serif text-[19px] font-semibold tracking-tight">Trove</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex gap-1.5" aria-label={`Step ${at + 1} of ${steps.length}`}>
            {steps.map((s, i) => (
              <span key={s} className={`h-1.5 rounded-full transition-all ${i === at ? "w-5 bg-ink" : i < at ? "w-1.5 bg-ink" : "w-1.5 bg-line"}`} />
            ))}
          </span>
          <button onClick={finish} disabled={finishing} className="h-9 rounded-full px-2 text-[15px] font-medium text-ink-2 active:opacity-60">
            Skip
          </button>
        </div>
      </header>

      <AnimatePresence mode="wait" initial={false}>
        <motion.main
          key={step}
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -24 }}
          transition={{ type: "spring", stiffness: 380, damping: 36 }}
          className="px-5"
        >
          {step === "friend" && <FromFriend from={from} name={name} have={have} save={save} />}
          {step === "loved" && <Loved have={have} save={save} mine={mine} />}
          {step === "deck" && <Deck have={have} save={save} />}
        </motion.main>
      </AnimatePresence>

      <div className="fixed inset-x-0 bottom-0 z-30 bg-gradient-to-t from-paper via-paper/95 to-transparent px-5 pt-6 pb-safe">
        <div className="mx-auto flex max-w-xl items-center gap-3 pb-3">
          <p className="min-w-0 flex-1 text-[14px] text-muted">{added ? `${added} added so far` : "Nothing has to be complete."}</p>
          <Button onClick={next} loading={finishing} icon={at === steps.length - 1 ? undefined : <Icon name="arrow" size={18} />}>
            {at === steps.length - 1 ? "Done" : "Next"}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Step one: a friend's trove, their picks for you up top, each thing a tap from your lists. */
function FromFriend({ from, name, have, save }: { from: StartFrom | null; name: string | null; have: Have; save: Save }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [expanded, setExpanded] = useState<Partial<Record<Kind, boolean>>>({});

  if (!from) {
    const addJuno = async () => {
      setAdding(true);
      try {
        await api("/api/friends/sample", { method: "POST" });
        router.refresh();
      } catch (err) {
        toast.error((err as Error).message);
        setAdding(false);
      }
    };
    return (
      <>
        <Title title={name ? `Welcome, ${name}` : "Welcome to Trove"} sub="You don’t have to log everything you’ve ever read or watched. Start small, and start from a friend." />
        <section className="mt-6 rounded-3xl bg-surface p-5 shadow-book">
          <p className="font-serif text-[20px] leading-tight font-medium">Start from {SAMPLE_FRIEND_NAME}’s picks</p>
          <p className="mt-1 text-[15px] leading-snug text-muted">
            {SAMPLE_FRIEND_NAME} is a sample friend with books, podcasts, shows and favorite spots. Tap what you’ve loved too, or want to try.
            When your real friends join, you’ll start from theirs.
          </p>
          <Button onClick={addJuno} loading={adding} className="mt-4 w-full" icon={<Icon name="people" size={18} />}>
            Show me {SAMPLE_FRIEND_NAME}’s trove
          </Button>
        </section>
      </>
    );
  }

  const who = from.friend.name ?? "Your friend";
  const destOf = (i: Item) => from.destinations.find((d) => d.id === i.destinationId);
  const pick = (i: Item, status: Status) => {
    const d = destOf(i);
    const { key, title, author, year, coverUrl, categories, place } = i;
    save(i.kind, { key, title, author, year, coverUrl, categories, place }, status, {
      // Wanting it is taking their recommendation; loving it too is your own.
      recBy: status === "want" ? { id: from.friend.id } : undefined,
      destination: i.kind === "place" && d ? { name: d.name, country: d.country, label: d.label, lat: d.lat, lon: d.lon, bbox: d.bbox } : undefined,
    });
  };
  const top = new Set(from.picks.map((p) => p.id));
  const rest = from.items.filter((i) => !top.has(i.id));
  const addAll = () => from.picks.filter((p) => !have.has(p.key)).forEach((p) => pick(p, "want"));

  return (
    <>
      <div className="flex items-center gap-4 pt-2">
        <Avatar name={from.friend.name} size={56} />
        <div className="min-w-0">
          <h1 className="font-serif text-[30px] leading-[1.05] font-medium tracking-tight text-balance">Start from {who}’s trove</h1>
        </div>
      </div>
      <p className="mt-3 text-[16px] leading-snug text-muted">
        Tap <b className="font-medium text-ink">{LOVED("book")}</b> for what you’ve loved too, <b className="font-medium text-ink">{WANT("book")}</b> for
        what you’d try. A minute here and your trove isn’t empty anymore.
      </p>

      {from.picks.length > 0 && (
        <section className="mt-6 rounded-3xl bg-surface p-4 shadow-book">
          <div className="mb-1 flex items-baseline justify-between gap-2 px-1">
            <p className="font-serif text-[19px] font-medium">{from.chosen ? `${who} picked these for you` : `${who}’s favorites lately`}</p>
            {from.picks.some((p) => !have.has(p.key)) && (
              <button onClick={addAll} className="shrink-0 text-[14px] font-medium text-accent active:opacity-60">
                Want all {from.picks.length}
              </button>
            )}
          </div>
          <ul>
            {from.picks.map((i) => (
              <PickRow key={i.id} item={i} by={who} state={have.get(i.key)?.status} onPick={(s) => pick(i, s)} />
            ))}
          </ul>
        </section>
      )}

      {KINDS.map((kind) => {
        const items = rest.filter((i) => i.kind === kind);
        if (!items.length) return null;
        const shown = expanded[kind] ? items : items.slice(0, 5);
        return (
          <section key={kind} className="mt-7">
            <h2 className="mb-1 px-1 text-[13px] font-medium tracking-wide text-muted uppercase">{VOCAB[kind].label}</h2>
            <ul>
              {shown.map((i) => (
                <PickRow key={i.id} item={i} by={who} state={have.get(i.key)?.status} onPick={(s) => pick(i, s)} />
              ))}
            </ul>
            {items.length > shown.length && (
              <button
                onClick={() => setExpanded((e) => ({ ...e, [kind]: true }))}
                className="mt-1 h-9 px-1 text-[14px] font-medium text-ink-2 active:opacity-60"
              >
                Show all {items.length}
              </button>
            )}
          </section>
        );
      })}
    </>
  );
}

function PickRow({ item, by, state, onPick }: { item: Item; by: string; state: Status | undefined; onPick: (s: Status) => void }) {
  const loved = state === "read";
  const wanted = state === "want" || state === "reading";
  return (
    <li className="flex items-center gap-3 px-1 py-2">
      {item.kind === "place" ? (
        <SpotTile spot={item} size={44} />
      ) : (
        <Cover book={item} shape={VOCAB[item.kind].shape} className="w-11 shrink-0" rounded="rounded-[3px]" />
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-medium">{item.title}</span>
        <span className="block truncate text-[13px] text-muted">{(item.kind === "place" ? spotLine(item) : item.author) || VOCAB[item.kind].one}</span>
        {item.note && (
          <span className="block truncate text-[13px] text-ink-2 italic">
            {by}: “{item.note}”
          </span>
        )}
      </span>
      <span className="flex shrink-0 gap-1.5">
        <Toggle on={loved} onClick={() => onPick("read")} label={`${item.title}: ${LOVED(item.kind)}`}>
          {loved && <Icon name="check" size={14} />}
          {LOVED(item.kind)}
        </Toggle>
        <Toggle on={wanted} onClick={() => onPick("want")} label={`${item.title}: ${WANT(item.kind)}`}>
          {wanted && <Icon name="check" size={14} />}
          {WANT(item.kind)}
        </Toggle>
      </span>
    </li>
  );
}

function Toggle({ on, onClick, label, children }: { on: boolean; onClick: () => void; label: string; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      aria-label={label}
      className={`flex h-8 items-center gap-1 rounded-full px-3 text-[13px] font-medium whitespace-nowrap transition-colors active:scale-95 ${
        on ? "bg-ink text-paper" : "bg-surface-2 text-ink-2"
      }`}
    >
      {children}
    </button>
  );
}

/** Step two: one thing you loved in each collection, if you like. Any of them can stay empty. */
function Loved({ have, save, mine }: { have: Have; save: Save; mine: Mine[] }) {
  return (
    <>
      <Title title="One you loved, from each" sub="Only if one comes to mind. Ideas for you start from these; skip any you like." />
      {(Object.keys(PROMPT) as DeckKind[]).map((kind) => (
        <QuickAdd key={kind} kind={kind} have={have} mine={mine} save={save} />
      ))}
    </>
  );
}

function QuickAdd({ kind, have, mine, save }: { kind: DeckKind; have: Have; mine: Mine[]; save: Save }) {
  const v = VOCAB[kind];
  const [q, setQ] = useState("");
  const [results, setResults] = useState<{ q: string; hits: Hit[] } | null>(null);
  const [savedHere, setSavedHere] = useState<Hit[]>([]);
  const text = q.trim();

  useEffect(() => {
    if (text.length < 2) return;
    let live = true;
    const t = setTimeout(() => {
      api<{ results: Hit[] }>(`/api/search?kind=${kind}&q=${encodeURIComponent(text)}`)
        .then((r) => live && setResults({ q: text, hits: r.results.slice(0, 4) }))
        .catch(() => live && setResults({ q: text, hits: [] }));
    }, 280);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [kind, text]);

  const add = (hit: Hit) => {
    save(kind, hit, "read");
    setSavedHere((s) => (s.some((h) => h.key === hit.key) ? s : [...s, hit]));
    setQ("");
    setResults(null);
  };
  const shown = text.length >= 2 && results ? results.hits : [];
  const already = mine.filter((m) => m.kind === kind && m.status === "read").length;

  return (
    <section className="mt-7">
      <label htmlFor={`start-${kind}`} className="mb-2 flex items-center gap-2 px-1 text-[16px] font-medium">
        <span className="flex h-7 w-7 items-center justify-center rounded-full text-white" style={{ background: v.tint }}>
          <Icon name={kind === "book" ? "book" : kind === "podcast" ? "headphones" : "film"} size={15} />
        </span>
        {PROMPT[kind].label}
      </label>
      <div className="relative">
        <Icon name="search" size={18} className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-muted" />
        <input
          id={`start-${kind}`}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={PROMPT[kind].placeholder}
          autoComplete="off"
          className="h-12 w-full rounded-2xl border border-line bg-surface pr-4 pl-11 text-[16px] outline-none focus:border-ink"
        />
      </div>
      {shown.length > 0 && (
        <ul className="mt-1 rounded-2xl bg-surface p-1 shadow-book">
          {shown.map((h) => (
            <li key={h.key}>
              <button onClick={() => add(h)} className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left active:bg-surface-2">
                <Cover book={h} shape={v.shape} className="w-9 shrink-0" rounded="rounded-[3px]" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-medium">{h.title}</span>
                  <span className="block truncate text-[13px] text-muted">{[h.author, h.year].filter(Boolean).join(" · ")}</span>
                </span>
                {have.has(h.key) ? (
                  <Icon name="check" size={18} className="shrink-0 text-good" />
                ) : (
                  <Icon name="plus" size={18} className="shrink-0 text-ink-2" />
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
      {text.length >= 2 && results?.q === text && !results.hits.length && (
        <p className="mt-2 px-1 text-[14px] text-muted">Nothing found. Try the exact title?</p>
      )}
      {savedHere.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {savedHere.map((h) => (
            <li key={h.key} className="flex h-8 max-w-full items-center gap-1 rounded-full bg-ink px-3 text-[13px] font-medium text-paper">
              <Icon name="check" size={14} className="shrink-0" />
              <span className="truncate">{h.title}</span>
            </li>
          ))}
        </ul>
      )}
      {already > savedHere.length && <p className="mt-1 px-1 text-[13px] text-muted">{already} on your lists</p>}
    </section>
  );
}

/** Step three: a deck of well-known things near your taste. Loved it, Want to, or Not for me. */
function Deck({ have, save }: { have: Have; save: Save }) {
  const [round, setRound] = useState(0);
  const [deck, setDeck] = useState<{ round: number; cards: DeckCard[]; error?: string } | null>(null);
  const [index, setIndex] = useState(0);
  const [answered, setAnswered] = useState(0);
  const loading = deck?.round !== round;

  useEffect(() => {
    let live = true;
    api<{ cards: DeckCard[] }>("/api/start/deck", { body: { fresh: round > 0 } })
      .then((r) => live && (setDeck({ round, cards: r.cards }), setIndex(0)))
      .catch((err) => live && setDeck({ round, cards: [], error: (err as Error).message }));
    return () => {
      live = false;
    };
  }, [round]);

  // Skip anything already saved (on an earlier step, or since).
  const remaining = (deck?.cards ?? []).slice(index).filter((c) => !have.has(c.hit.key));
  const card = remaining[0];

  const answer = (status: Status | null) => {
    if (!card) return;
    if (status) save(card.kind, card.hit, status);
    setAnswered((n) => n + 1);
    setIndex((deck?.cards ?? []).indexOf(card) + 1);
  };
  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.x > 110) answer("read");
    else if (info.offset.x < -110) answer(null);
  };

  return (
    <>
      <Title title="Quick: loved it?" sub="Well-known ones near your taste. Swipe right if you loved it, left to pass." />
      <div className="relative mt-5 flex min-h-[380px] flex-col items-center">
        {loading ? (
          <div className="flex w-full max-w-[300px] flex-col items-center" aria-label="Building your deck">
            <div className="aspect-[2/3] w-[120px] rounded-[8px] skeleton" />
            <div className="mt-4 h-5 w-2/3 rounded skeleton" />
            <div className="mt-2 h-4 w-1/2 rounded skeleton" />
          </div>
        ) : deck?.error ? (
          <p className="mt-10 max-w-xs text-center text-[15px] text-muted">{deck.error}</p>
        ) : !card ? (
          <div className="mt-10 flex max-w-xs flex-col items-center text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-2">
              <Icon name="sparkle" size={24} />
            </span>
            <p className="mt-4 font-serif text-[22px] font-medium">{answered ? "That’s the deck" : "Nothing new to show"}</p>
            <p className="mt-1 text-[15px] text-muted">
              {answered ? `${answered} answered. Ideas on your Today card start from these.` : "You’ve got the well-known ones covered."}
            </p>
            <Button variant="secondary" className="mt-5" onClick={() => setRound((r) => r + 1)} icon={<Icon name="sparkle" size={17} />}>
              Another round
            </Button>
          </div>
        ) : (
          <>
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.div
                key={card.hit.key}
                drag="x"
                dragSnapToOrigin
                onDragEnd={onDragEnd}
                initial={{ opacity: 0, scale: 0.92, y: 12 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ type: "spring", stiffness: 420, damping: 32 }}
                className="flex w-full max-w-[300px] cursor-grab touch-pan-y flex-col items-center rounded-[28px] bg-surface p-4 pb-5 text-center shadow-float active:cursor-grabbing"
              >
                <span className="mb-3 rounded-full px-2.5 py-1 text-[12px] font-medium text-white" style={{ background: VOCAB[card.kind].tint }}>
                  {VOCAB[card.kind].one.replace(/^./, (c) => c.toUpperCase())}
                </span>
                <Cover
                  book={card.hit}
                  shape={VOCAB[card.kind].shape}
                  className={VOCAB[card.kind].shape === "square" ? "w-[150px]" : "w-[120px]"}
                  rounded="rounded-[8px]"
                />
                <p className="mt-3 font-serif text-[21px] leading-tight font-medium text-balance">{card.hit.title}</p>
                <p className="mt-1 text-[14px] text-muted">{[card.hit.author, card.hit.year].filter(Boolean).join(" · ")}</p>
              </motion.div>
            </AnimatePresence>
            <div className="mt-5 grid w-full max-w-[340px] grid-cols-3 gap-2">
              <Button variant="secondary" onClick={() => answer(null)} className="px-1 text-[15px] whitespace-nowrap">
                Not for me
              </Button>
              <Button variant="secondary" onClick={() => answer("want")} className="px-1 text-[15px] whitespace-nowrap">
                Want to
              </Button>
              <Button onClick={() => answer("read")} className="px-1 text-[15px] whitespace-nowrap">
                Loved it
              </Button>
            </div>
            <p className="mt-3 text-[13px] text-muted tabular-nums">{remaining.length} left</p>
          </>
        )}
      </div>
    </>
  );
}

function Title({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="pt-2">
      <h1 className="font-serif text-[32px] leading-[1.05] font-medium tracking-tight text-balance">{title}</h1>
      <p className="mt-2 text-[16px] leading-snug text-muted">{sub}</p>
    </div>
  );
}
