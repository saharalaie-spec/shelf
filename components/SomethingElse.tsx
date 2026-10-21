"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { normalize } from "./add/typed";
import { screenFormat, VOCAB } from "@/lib/kinds";
import { moodsFor, type Mood } from "@/lib/moods";
import type { FriendPlace } from "@/lib/friend-places";
import type { Suggestion } from "@/lib/suggest";
import type { TodayPick } from "@/lib/today";
import type { Area, AreaHit, Hit, Kind } from "@/lib/types";
import { Cover } from "./Cover";
import { AreaSearch } from "./QuickSearch";
import { SpotTile } from "./Spot";
import { Icon } from "./ui";

/** Something to pick from anywhere: your lists, a friend, or a suggestion (which carries its own reason). */
export type Choice = TodayPick & { note?: string };
/** Picking something that isn't on your lists yet: what to save, who it's from, and for a spot, where. */
export type ChoiceSave = { hit: Hit; friendId: string | null; destinationId: string | null; area?: Area | null };

const TITLE: Record<Kind, string> = {
  podcast: "Something to listen to",
  book: "Something to read",
  screen: "Something to watch",
  place: "Somewhere to go",
};

const MOOD_LABEL: Record<Mood, string> = {
  any: "Anything",
  lighter: "Lighter",
  deeper: "Deeper",
  short: "Short",
  surprise: "Surprise me",
  date: "Date night",
  friends: "Drinks with friends",
  family: "Family dinner",
  celebrate: "Celebrating",
  solo: "Just me",
};

type Props = {
  kind: Kind;
  /** This collection's candidates: your saved ones, then friends'. */
  list: TodayPick[];
  /** Work keys just started or saved from here, left out of friends' spots and ideas. */
  taken?: Set<string>;
  suggest: boolean;
  /** Says why something from your lists or a friend is there. */
  reasonOf: (p: Choice) => string;
  onChoose: (c: Choice, save?: ChoiceSave) => void;
};

const NONE = new Set<string>();
const fold = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();

/** Choose something: from your lists, from friends, or new ideas from your taste. Nothing is pushed. */
export function SomethingElse({ kind, list, taken = NONE, suggest, reasonOf, onChoose }: Props) {
  const v = VOCAB[kind];
  const isPlace = kind === "place";
  const [mood, setMood] = useState<Mood>("any");
  // Movies & TV: either, or just one.
  const [format, setFormat] = useState<"any" | "movie" | "tv">("any");
  const fits = (p: TodayPick) =>
    kind !== "screen" || format === "any" || (screenFormat({ key: p.workKey, categories: p.categories, author: p.author }) ?? format) === format;
  // Places: nothing is picked for you, and looking a city up saves nothing. Spots wait until you say where.
  const [city, setCity] = useState<AreaHit | null>(null);
  const there = useFriendsIn(isPlace ? city : null)
    .map((f) => ({ ...f, spots: f.spots.filter((i) => !taken.has(i.key)) }))
    .filter((f) => f.spots.length > 0);

  const mine = list
    .filter((p) => p.tier !== "friend" && fits(p) && (!isPlace || (city !== null && fold(p.destination ?? "") === fold(city.name))))
    .slice(0, 6);
  const friends = list.filter((p) => p.tier === "friend" && fits(p)).slice(0, 5);
  const chips = <MoodChips kind={kind} mood={mood} onMood={setMood} />;

  return (
    <div className="max-h-[78dvh] overflow-y-auto px-5 pb-safe" data-vaul-no-drag="">
      <h2 className="font-serif text-[24px] font-medium tracking-tight">{TITLE[kind]}</h2>
      {kind === "screen" && (
        <div className="mt-4 grid grid-cols-3 gap-1 rounded-full bg-surface-2 p-1" role="radiogroup" aria-label="Movie or TV show">
          {(["any", "movie", "tv"] as const).map((f) => (
            <button
              key={f}
              role="radio"
              aria-checked={format === f}
              onClick={() => setFormat(f)}
              className={`h-9 rounded-full text-[14px] font-medium transition-colors ${format === f ? "bg-surface text-ink shadow-book" : "text-ink-2"}`}
            >
              {{ any: "Either", movie: "Movie", tv: "TV show" }[f]}
            </button>
          ))}
        </div>
      )}
      {/* Places: the occasion, then the city; everything below is for that city. */}
      {isPlace && (
        <>
          <p className="mt-4 mb-1 text-[13px] font-medium tracking-wide text-muted uppercase">What for?</p>
          {chips}
          <p className="mt-3 mb-1 text-[13px] font-medium tracking-wide text-muted uppercase">Where?</p>
          {city ? (
            <div className="flex items-center gap-2 pt-1">
              <span className="flex h-8 items-center gap-1 rounded-full bg-olive px-3.5 text-[13px] font-medium text-white">
                <Icon name="pin" size={13} />
                {[city.name, city.country].filter(Boolean).join(", ")}
              </span>
              <button onClick={() => setCity(null)} className="h-8 px-1 text-[13px] font-medium text-ink-2 underline underline-offset-2">
                Change
              </button>
            </div>
          ) : (
            <AreaSearch onArea={setCity} />
          )}
        </>
      )}
      {mine.length > 0 && (
        <Group title={isPlace ? `Your Want to go in ${city?.name ?? "this place"}` : `From your ${v.sections.want}`}>
          {mine.map((p) => (
            <Row key={p.key} kind={kind} item={p} line={reasonOf(p)} onPick={() => onChoose(p)} />
          ))}
        </Group>
      )}
      {friends.length > 0 && (
        <Group title="Friends are into">
          {friends.map((p) => (
            <Row
              key={p.key}
              kind={kind}
              item={p}
              line={reasonOf(p)}
              onPick={() =>
                onChoose(p, {
                  hit: { key: p.workKey, title: p.title, author: p.author, year: p.year, coverUrl: p.coverUrl, categories: p.categories, ...(p.place ? { place: p.place } : {}) },
                  friendId: p.friendId,
                  destinationId: null,
                })
              }
            />
          ))}
        </Group>
      )}
      {isPlace && city && there.length > 0 && (
        <FriendsThere there={there} city={city} onChoose={onChoose} reasonOf={reasonOf} />
      )}
      {isPlace && !city && <p className="mt-6 mb-6 px-1 text-[15px] text-muted">Pick a city, and spots for it show up here.</p>}
      {suggest && (!isPlace || city) && (
        <Ideas
          key={`${city?.key ?? kind}|${format}`}
          kind={kind}
          mood={mood}
          format={kind === "screen" && format !== "any" ? format : null}
          chips={isPlace ? null : chips}
          area={city}
          title={isPlace && city ? `Picked for you in ${city.name}` : "Picked for you"}
          onChoose={onChoose}
          shown={[...mine, ...friends].map((p) => p.title).concat(there.flatMap((f) => f.spots.map((i) => i.title)))}
          taken={taken}
        />
      )}
      {!mine.length && !friends.length && !suggest && (!isPlace || city) && (
        <p className="mt-4 mb-6 text-[15px] text-muted">Nothing saved here yet. Add a few and they’ll show up here.</p>
      )}
    </div>
  );
}

/** Friends who know the place on screen, and what they share there. */
function useFriendsIn(city: AreaHit | null) {
  const [found, setFound] = useState<{ key: string; friends: FriendPlace[] } | null>(null);
  useEffect(() => {
    if (!city) return;
    let live = true;
    api<{ friends: FriendPlace[] }>("/api/friends/places", { body: { area: city } })
      .then((r) => live && setFound({ key: city.key, friends: r.friends }))
      .catch(() => live && setFound({ key: city.key, friends: [] }));
    return () => {
      live = false;
    };
  }, [city]);
  return found && city && found.key === city.key ? found.friends : [];
}

const names = (ns: string[]) => (ns.length <= 2 ? ns.join(" and ") : `${ns.slice(0, -1).join(", ")} and ${ns[ns.length - 1]}`);

/** "Bo and Juno have been to Paris": their places to open, and a few of their spots to pick from. */
function FriendsThere({
  there,
  city,
  onChoose,
  reasonOf,
}: {
  there: FriendPlace[];
  city: AreaHit;
  onChoose: Props["onChoose"];
  reasonOf: Props["reasonOf"];
}) {
  const people = [...new Map(there.map((f) => [f.friend.id, f.friend.name])).values()];
  const allBeen = there.every((f) => f.been > 0);
  const spots = there
    .flatMap((f) => f.spots.map((item) => ({ f, item })))
    .sort((a, b) => Number(b.item.status === "read") - Number(a.item.status === "read") || Number(Boolean(b.item.note)) - Number(Boolean(a.item.note)))
    .slice(0, 5);

  return (
    <section className="mt-5 rounded-2xl bg-paper p-4">
      <p className="text-[16px] leading-snug">
        <b className="font-medium">
          {names(people)} {allBeen ? `${people.length === 1 ? "has" : "have"} been to ${city.name}.` : `${people.length === 1 ? "knows" : "know"} ${city.name}.`}
        </b>{" "}
        <span className="text-muted">See what they loved there.</span>
      </p>
      <div className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4">
        {there.map((f) => (
          <Link
            key={`${f.friend.id}:${f.place.id}`}
            href={`/u/${f.friend.ref}?place=${f.place.id}`}
            className="flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-surface px-3.5 text-[14px] font-medium whitespace-nowrap shadow-book active:scale-95"
          >
            {f.friend.name}’s {f.place.name}
            <span className="text-muted tabular-nums">{f.spots.length}</span>
          </Link>
        ))}
      </div>
      <ul className="-mx-1 mt-2">
        {spots.map(({ f, item }) => {
          const c: Choice = {
            key: `friendspot:${item.id}`,
            itemId: null,
            kind: "place",
            workKey: item.key,
            title: item.title,
            author: item.author,
            year: item.year,
            coverUrl: item.coverUrl,
            categories: item.categories,
            ...(item.place ? { place: item.place } : {}),
            destination: city.name,
            destinationId: null,
            tier: "friend",
            reason: { type: "friend", from: f.friend.name, status: item.status },
            friendId: f.friend.id,
            ...(item.note ? { note: `${f.friend.name}: “${item.note}”` } : {}),
          };
          return (
            <Row
              key={c.key}
              kind="place"
              item={c}
              line={reasonOf(c)}
              onPick={() =>
                onChoose(c, {
                  hit: { key: item.key, title: item.title, author: item.author, year: item.year, coverUrl: item.coverUrl, categories: item.categories, ...(item.place ? { place: item.place } : {}) },
                  friendId: f.friend.id,
                  destinationId: null,
                  area: city,
                })
              }
            />
          );
        })}
      </ul>
    </section>
  );
}

function MoodChips({ kind, mood, onMood }: { kind: Kind; mood: Mood; onMood: (m: Mood) => void }) {
  return (
    <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5 pt-1">
      {moodsFor(kind).map((m) => (
        <button
          key={m}
          onClick={() => onMood(m)}
          aria-pressed={mood === m}
          className={`h-8 shrink-0 rounded-full px-3.5 text-[13px] font-medium whitespace-nowrap active:scale-95 ${
            mood === m ? "bg-ink text-paper" : "bg-surface-2 text-ink-2"
          }`}
        >
          {MOOD_LABEL[m]}
        </button>
      ))}
    </div>
  );
}

/** New ideas from your taste map across all four collections, in the mood you pick. Loaded only when asked. */
function Ideas({
  kind,
  mood,
  chips,
  area,
  format,
  title,
  onChoose,
  shown,
  taken,
}: Pick<Props, "kind" | "onChoose"> & {
  mood: Mood;
  chips: React.ReactNode;
  area: AreaHit | null;
  format: "movie" | "tv" | null;
  title: string;
  shown: string[];
  taken: Set<string>;
}) {
  // Ideas never repeat what's already listed above them.
  const already = new Set(shown.map(normalize));
  const [round, setRound] = useState(0);
  const want = `${kind}|${mood}|${round}`;
  const [result, setResult] = useState<{ key: string; picks: Suggestion[]; destinationId: string | null; error?: string } | null>(null);
  const loading = result?.key !== want;

  useEffect(() => {
    let live = true;
    api<{ picks: Suggestion[]; destinationId: string | null }>("/api/suggest", {
      body: { kind, mood, fresh: round > 0, area, format },
    })
      .then((r) => live && setResult({ key: want, ...r }))
      .catch((err) => live && setResult({ key: want, picks: [], destinationId: null, error: (err as Error).message }));
    return () => {
      live = false;
    };
  }, [kind, mood, round, area, format, want]);

  return (
    <Group
      title={title}
      aside={
        // Places name the city in the title instead.
        kind !== "place" && (
          <span className="flex items-center gap-1 text-[12px] text-muted">
            <Icon name="sparkle" size={13} /> from your taste & friends
          </span>
        )
      }
    >
      {chips && <div className="mb-2">{chips}</div>}
      {loading ? (
        <div className="space-y-1" aria-label="Thinking about your taste">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-3 px-1 py-2">
              <div className="h-[60px] w-10 rounded-[4px] skeleton" />
              <div className="flex-1 space-y-1.5">
                <div className="h-4 w-1/2 rounded skeleton" />
                <div className="h-3 w-3/4 rounded skeleton" />
              </div>
            </div>
          ))}
        </div>
      ) : result?.error ? (
        <p className="px-1 py-2 text-[14px] text-muted">{result.error}</p>
      ) : !result?.picks.length ? (
        <p className="px-1 py-2 text-[14px] text-muted">
          {kind === "place" ? "No new ideas for here right now. Try another occasion." : "No new ideas right now. Try another mood."}
        </p>
      ) : (
        <>
          {result.picks.filter((s) => !already.has(normalize(s.hit.title)) && !taken.has(s.hit.key)).map((s) => {
            const c: Choice = {
              key: `idea:${s.hit.key}`,
              itemId: null,
              kind,
              workKey: s.hit.key,
              title: s.hit.title,
              author: s.hit.author,
              year: s.hit.year,
              coverUrl: s.hit.coverUrl,
              categories: s.hit.categories,
              ...(s.hit.place ? { place: s.hit.place } : {}),
              destination: area?.name ?? null,
              destinationId: result.destinationId,
              tier: "want",
              // Shown with its own reason (the note); "saved" is only a fallback label.
              reason: { type: "waiting", savedAt: 0 },
              friendId: null,
              note: s.why,
            };
            return (
              <Row
                key={c.key}
                kind={kind}
                item={c}
                line={s.why}
                onPick={() => onChoose(c, { hit: s.hit, friendId: null, destinationId: result.destinationId, area })}
              />
            );
          })}
          <button onClick={() => setRound((r) => r + 1)} className="mt-1 mb-3 h-9 px-1 text-[14px] font-medium text-ink-2 active:opacity-60">
            Different ideas
          </button>
        </>
      )}
    </Group>
  );
}

function Group({ title, aside, children }: { title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mt-5">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <p className="text-[13px] font-medium tracking-wide text-muted uppercase">{title}</p>
        {aside}
      </div>
      <ul className="-mx-1">{children}</ul>
    </section>
  );
}

function Row({ kind, item, line, onPick }: { kind: Kind; item: Choice; line: string; onPick: () => void }) {
  return (
    <li>
      <button onClick={onPick} className="flex w-full items-center gap-3 rounded-2xl px-1 py-2 text-left active:bg-surface-2">
        {kind === "place" ? (
          <SpotTile spot={item} size={40} />
        ) : (
          <Cover book={item} shape={VOCAB[kind].shape} className="w-10 shrink-0" rounded="rounded-[3px]" />
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-medium">{item.title}</span>
          <span className="block truncate text-[13px] text-muted">{line}</span>
        </span>
        <Icon name="chevron" size={16} className="shrink-0 text-muted" />
      </button>
    </li>
  );
}
