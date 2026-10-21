"use client";

import { AnimatePresence, motion, type PanInfo } from "motion/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/client";
import { VOCAB } from "@/lib/kinds";
import { SAMPLE_FRIEND_NAME } from "@/lib/sample";
import type { StartFrom } from "@/lib/start";
import type { DeckCard } from "@/lib/suggest";
import { KINDS, type Hit, type Item, type Kind, type RecBy, type Status } from "@/lib/types";
import { Cover } from "./Cover";
import { CitySearch, Search } from "./QuickSearch";
import { SpotTile, spotLine } from "./Spot";
import { Avatar, Button, Icon, KIND_ICON, Logo } from "./ui";

type Mine = { id: string; key: string; kind: Kind; title: string; status: Status };

type Props = {
  name: string | null;
  /** The friend to start from, or null when there's no one yet. */
  from: StartFrom | null;
  /** Came in on that friend's invite link: start with their trove. */
  invited: boolean;
  /** What's on your lists already. */
  mine: Mine[];
  features: { deck: boolean };
  /** Your invite link's token, for the last step. */
  inviteToken: string;
};

type Step = "friend" | `loved:${Kind}` | "deck" | "invite";
const lovedKind = (s: Step) => (s.startsWith("loved:") ? (s.slice(6) as Kind) : null);

/** Something saved here, by work key. `id` starts "tmp:" until the server answers. */
type Have = Map<string, { id: string; kind: Kind; status: Status }>;
type Save = (
  kind: Kind,
  hit: Hit,
  status: Status,
  extra?: { recBy?: Pick<RecBy, "id">; destination?: object; destinationId?: string },
) => void;

const LOVED = (kind: Kind) => (kind === "place" ? "Been" : "Me too");
const WANT = (kind: Kind) => (kind === "place" ? "Want to go" : "Want it");

/**
 * Getting started without logging everything: two things you loved per collection (each one skippable), a friend's
 * trove (first, when you came in on their invite), then a quick deck.
 */
export function Start({ name, from, invited, mine, features, inviteToken }: Props) {
  const router = useRouter();
  const loved = KINDS.map((k) => `loved:${k}` as const);
  const steps: Step[] = [
    ...(invited ? (["friend", ...loved] as const) : ([...loved, "friend"] as const)),
    ...(features.deck ? (["deck"] as const) : []),
    // Last, once there's something on your lists to share: bring your people.
    "invite",
  ];
  const [step, setStep] = useState<Step>(steps[0]);
  const [picks, setPicks] = useState<Partial<Record<Kind, Hit[]>>>({});
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
        body: {
          kind,
          items: [{ ...hit, status, recBy: extra.recBy ?? null }],
          ...(extra.destinationId ? { destinationId: extra.destinationId } : extra.destination ? { destination: extra.destination } : {}),
        },
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
  // A collection's second pick moves on by itself, unless you've moved on already.
  const advanceFrom = (from: Step) =>
    setTimeout(() => {
      setStep((cur) => (cur === from && steps.indexOf(cur) < steps.length - 1 ? steps[steps.indexOf(cur) + 1] : cur));
      window.scrollTo({ top: 0 });
    }, 650);

  const pickLoved = (kind: Kind, hit: Hit, destinationId?: string) => {
    const now = [...(picks[kind] ?? []).filter((h) => h.key !== hit.key), hit];
    setPicks((p) => ({ ...p, [kind]: now }));
    save(kind, hit, "read", { destinationId });
    if (now.length >= ASK_COUNT) advanceFrom(step);
  };
  const removeLoved = (kind: Kind, hit: Hit) => {
    setPicks((p) => ({ ...p, [kind]: (p[kind] ?? []).filter((h) => h.key !== hit.key) }));
    const had = have.get(hit.key);
    if (!had || had.id.startsWith("tmp:") || mine.some((m) => m.id === had.id)) return;
    setHave((m) => {
      const n = new Map(m);
      n.delete(hit.key);
      return n;
    });
    api(`/api/items/${had.id}`, { method: "DELETE" }).catch((err) => toast.error((err as Error).message));
  };
  const askingFor = lovedKind(step);
  const skipping = askingFor !== null && !(picks[askingFor] ?? []).length;
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
            Skip all
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
          {step === "friend" && <FromFriend from={from} have={have} save={save} />}
          {askingFor && (
            <LovedKind
              welcome={at === 0 ? (name ? `Welcome, ${name}. A few quick ones to start.` : "Welcome to Trove. A few quick ones to start.") : null}
              kind={askingFor}
              picks={picks[askingFor] ?? []}
              have={have}
              onPick={(h, d) => pickLoved(askingFor, h, d)}
              onRemove={(h) => removeLoved(askingFor, h)}
            />
          )}
          {step === "deck" && <Deck have={have} save={save} />}
          {step === "invite" && <InviteStep name={name} token={inviteToken} />}
        </motion.main>
      </AnimatePresence>

      <div className="fixed inset-x-0 bottom-0 z-30 bg-gradient-to-t from-paper via-paper/95 to-transparent px-5 pt-6 pb-safe">
        <div className="mx-auto flex max-w-xl items-center gap-3 pb-3">
          <p className="min-w-0 flex-1 text-[14px] text-muted">{added ? `${added} added so far` : "Nothing has to be complete."}</p>
          <Button
            onClick={next}
            loading={finishing}
            variant={skipping ? "secondary" : "primary"}
            icon={at === steps.length - 1 || skipping ? undefined : <Icon name="arrow" size={18} />}
          >
            {skipping ? SKIP[askingFor] : at === steps.length - 1 ? "Done" : "Next"}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Step one: a friend's trove, their picks for you up top, each thing a tap from your lists. */
function FromFriend({ from, have, save }: { from: StartFrom | null; have: Have; save: Save }) {
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
        <Title title="Start from a friend" sub="Tap what a friend loves and you’ll have a trove in a minute. When your friends join, you’ll start from theirs." />
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
              <button onClick={addAll} className="shrink-0 text-[14px] font-medium text-link active:opacity-60">
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

const ASK: Record<Kind, { title: string; placeholder: string }> = {
  book: { title: "Two books you loved", placeholder: "Search books" },
  podcast: { title: "Two podcasts you love", placeholder: "Search podcasts" },
  screen: { title: "Two movies or shows you loved", placeholder: "Search movies and shows" },
  place: { title: "Two places you loved", placeholder: "Search spots" },
};
const ASK_COUNT = 2;
const SKIP: Record<Kind, string> = { book: "Skip books", podcast: "Skip podcasts", screen: "Skip movies & TV", place: "Skip places" };

/** One collection at a time: two things you loved, or skip. Picking the second moves on by itself. */
function LovedKind({
  welcome,
  kind,
  picks,
  have,
  onPick,
  onRemove,
}: {
  /** On the very first screen. */
  welcome: string | null;
  kind: Kind;
  picks: Hit[];
  have: Have;
  onPick: (hit: Hit, destinationId?: string) => void;
  onRemove: (hit: Hit) => void;
}) {
  const v = VOCAB[kind];
  const isPlace = kind === "place";
  const [city, setCity] = useState<{ id: string; name: string } | null>(null);
  const full = picks.length >= ASK_COUNT;

  return (
    <>
      <div className="pt-2">
        {welcome && <p className="mb-4 text-[15px] font-medium text-ink-2">{welcome}</p>}
        <span className="mb-3 flex h-9 w-9 items-center justify-center rounded-full text-white" style={{ background: v.tint }}>
          <Icon name={KIND_ICON[kind]} size={18} />
        </span>
        <h1 className="font-serif text-[32px] leading-[1.05] font-medium tracking-tight text-balance">{ASK[kind].title}</h1>
        <p className="mt-2 text-[16px] leading-snug text-muted">Nothing comes to mind? Skip it.</p>
      </div>

      {picks.length > 0 && (
        <ul className="mt-5 space-y-2">
          {picks.map((h) => (
            <li key={h.key} className="flex items-center gap-3 rounded-2xl bg-surface p-2 pr-3 shadow-book">
              {isPlace ? <SpotTile spot={h} size={44} /> : <Cover book={h} shape={v.shape} className="w-10 shrink-0" rounded="rounded-[3px]" />}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-medium">{h.title}</span>
                <span className="block truncate text-[13px] text-muted">{(isPlace ? spotLine(h) : h.author) || v.one}</span>
              </span>
              <button
                onClick={() => onRemove(h)}
                aria-label={`Remove ${h.title}`}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted active:bg-surface-2"
              >
                <Icon name="x" size={17} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {!full &&
        (isPlace && !city ? (
          <CitySearch onCity={setCity} />
        ) : (
          <div className="mt-5">
            {isPlace && city && (
              <p className="mb-2 px-1 text-[14px] text-muted">
                In <span className="font-medium text-ink">{city.name}</span> ·{" "}
                <button onClick={() => setCity(null)} className="font-medium text-ink-2 underline underline-offset-2">
                  change
                </button>
              </p>
            )}
            <Search
              key={city?.id ?? kind}
              url={(q) => `/api/search?kind=${kind}${city ? `&dest=${city.id}` : ""}&q=${encodeURIComponent(q)}`}
              placeholder={isPlace && city ? `Search spots in ${city.name}` : ASK[kind].placeholder}
              label={ASK[kind].title}
              render={(h: Hit) => (
                <>
                  {isPlace ? <SpotTile spot={h} size={36} /> : <Cover book={h} shape={v.shape} className="w-9 shrink-0" rounded="rounded-[3px]" />}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-medium">{h.title}</span>
                    <span className="block truncate text-[13px] text-muted">
                      {isPlace ? spotLine(h) : [h.author, h.year].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  <Icon name={have.has(h.key) ? "check" : "plus"} size={18} className={`shrink-0 ${have.has(h.key) ? "text-good" : "text-ink-2"}`} />
                </>
              )}
              onPick={(h: Hit) => onPick(h, city?.id)}
            />
            <p className="mt-2 px-1 text-[13px] text-muted">{picks.length ? "One more, or move on." : `Up to ${ASK_COUNT}.`}</p>
          </div>
        ))}
    </>
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

/** The last step: send your invite link to the people you swap recommendations with. */
function InviteStep({ name: initialName, token }: { name: string | null; token: string }) {
  const [name, setName] = useState(initialName ?? "");
  const [sent, setSent] = useState<"shared" | "copied" | null>(null);
  const link = () => `${window.location.origin}/f/${token}`;
  // Friends see your name on the invite: keep it if it's new.
  const keepName = () => {
    const n = name.trim();
    if (n && n !== initialName) api("/api/me", { method: "PATCH", body: { name: n } }).catch(() => {});
    return n || null;
  };
  const share = async () => {
    const who = keepName();
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Be my friend on Trove",
          text: `${who ? `${who} here. ` : ""}Let’s swap books, podcasts, shows and places on Trove:`,
          url: link(),
        });
        setSent("shared");
        return;
      } catch (err) {
        if ((err as DOMException).name === "AbortError") return;
      }
    }
    copy();
  };
  const copy = async () => {
    keepName();
    await navigator.clipboard.writeText(link()).catch(() => {});
    setSent("copied");
    toast("Invite link copied");
  };

  return (
    <>
      <Title
        title="Trove is better with friends"
        sub="Send your link to the people you swap recommendations with. When they join, you’ll see each other’s picks, and they can start from yours."
      />
      {!initialName && (
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your first name (friends see it)"
          aria-label="Your first name"
          autoComplete="given-name"
          maxLength={40}
          className="mt-6 h-12 w-full rounded-2xl border border-line bg-surface px-4 text-[16px] outline-none focus:border-ink"
        />
      )}
      <div className={`${initialName ? "mt-6" : "mt-3"} grid grid-cols-[1fr_auto] gap-2`}>
        <Button onClick={share} icon={<Icon name="share" size={18} />}>
          Send invite link
        </Button>
        <Button variant="secondary" onClick={copy} icon={<Icon name={sent === "copied" ? "check" : "copy"} size={17} />}>
          {sent === "copied" ? "Copied" : "Copy"}
        </Button>
      </div>
      <p className="mt-4 flex gap-2 text-[14px] leading-snug text-muted">
        <Icon name="lock" size={15} className="mt-0.5 shrink-0" />
        Only friends see your trove. Anything you mark private stays yours.
      </p>
      {sent === "shared" && <p className="mt-3 text-[15px] font-medium text-ink-2">Sent. Invite another, or tap Done.</p>}
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
