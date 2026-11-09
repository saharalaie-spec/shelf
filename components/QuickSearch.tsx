"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/client";
import { matchCountries } from "@/lib/countries";
import type { AreaHit } from "@/lib/types";
import { Icon } from "./ui";

/** Places start with a city: pick one from the map, and it's saved as one of your places. */
export function CitySearch({ onCity, prompt = "First, which city?" }: { onCity: (d: { id: string; name: string }) => void; prompt?: string }) {
  const [saving, setSaving] = useState(false);
  const pick = async (a: AreaHit) => {
    setSaving(true);
    try {
      const { destination } = await api<{ destination: { id: string; name: string } }>("/api/destinations", {
        body: { name: a.name, country: a.country, label: a.label, lat: a.lat, lon: a.lon, bbox: a.bbox },
      });
      onCity(destination);
    } catch (err) {
      toast.error((err as Error).message);
      setSaving(false);
    }
  };
  return <AreaSearch onArea={pick} prompt={prompt} disabled={saving} />;
}

/** A city, region or country from the map, just picked: nothing is saved. */
export function AreaSearch({ onArea, prompt, disabled }: { onArea: (a: AreaHit) => void; prompt?: string; disabled?: boolean }) {
  return (
    <div className={prompt ? "mt-5" : "mt-1"}>
      {prompt && <p className="mb-2 px-1 text-[15px] font-medium">{prompt}</p>}
      <Search
        url={(q) => `/api/search?kind=area&q=${encodeURIComponent(q)}`}
        placeholder="Search cities"
        label="Which city?"
        disabled={disabled}
        render={(a: AreaHit) => (
          <>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-accent-ink">
              <Icon name="pin" size={17} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-medium">{a.name}</span>
              <span className="block truncate text-[13px] text-muted">{[a.label, a.country].filter(Boolean).join(" · ")}</span>
            </span>
          </>
        )}
        onPick={onArea}
        // Countries are built in: they show as you type, without waiting on the map.
        instant={(text, found) => {
          const have = new Set(found.map((a) => a.name.toLowerCase()));
          return matchCountries(text).filter((c) => !have.has(c.name.toLowerCase()));
        }}
        typed={(name) => ({ key: `typed:${name.toLowerCase()}`, name, country: null, label: null, lat: null, lon: null, bbox: null })}
      />
    </div>
  );
}

/** A search box with a few results under it. */
export function Search<T extends { key: string }>({
  url,
  placeholder,
  label,
  render,
  onPick,
  disabled,
  typed,
  instant,
}: {
  url: (q: string) => string;
  placeholder: string;
  label: string;
  render: (r: T) => React.ReactNode;
  onPick: (r: T) => void;
  disabled?: boolean;
  /** When set, what was typed can be used as it is ("Use “Lisbon”", or Go on the keyboard with nothing found). */
  typed?: (text: string) => T;
  /** Results known right away, shown while the search runs and after it (minus any it found). */
  instant?: (text: string, found: T[]) => T[];
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<{ q: string; items: T[] } | null>(null);
  const text = q.trim();

  useEffect(() => {
    if (text.length < 2) return;
    let live = true;
    // A newer word cancels the older search, so slow answers don't pile up behind it.
    const ac = new AbortController();
    const t = setTimeout(() => {
      api<{ results: T[] }>(url(text), { signal: ac.signal })
        .then((r) => live && setResults({ q: text, items: r.results.slice(0, 4) }))
        .catch(() => live && setResults({ q: text, items: [] }));
    }, 280);
    return () => {
      live = false;
      clearTimeout(t);
      ac.abort();
    };
    // The url builder is a fresh function each render; what it depends on is in the component's key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  const looked = text.length >= 2 && results?.q === text;
  const found = text.length >= 2 && results ? results.items : [];
  const quick = instant && text.length >= 2 ? instant(text, looked ? found : []) : [];
  // While a search runs, what's known right away leads; once it's back, its answers do.
  const shown = (looked ? [...found, ...quick] : quick.length ? quick : found).slice(0, 5);
  const pick = (r: T) => {
    onPick(r);
    setQ("");
    setResults(null);
  };
  // With the keyboard up there's little room: bring what was found into view under the box.
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (looked) end.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [looked, shown.length]);
  return (
    <>
      <div className="relative">
        <Icon name="search" size={18} className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-muted" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter" || text.length < 2 || disabled) return;
            e.preventDefault();
            const top = looked ? shown[0] : undefined;
            if (top) pick(top);
            else if (typed) pick(typed(text));
          }}
          enterKeyHint="go"
          placeholder={placeholder}
          aria-label={label}
          autoComplete="off"
          className="h-12 w-full rounded-2xl border border-line bg-surface pr-4 pl-11 text-[16px] outline-none focus:border-ink"
        />
      </div>
      {shown.length > 0 && (
        <ul className="mt-1 rounded-2xl bg-surface p-1 shadow-book">
          {shown.map((r) => (
            <li key={r.key}>
              <button
                disabled={disabled}
                onClick={() => pick(r)}
                className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left active:bg-surface-2 disabled:opacity-50"
              >
                {render(r)}
              </button>
            </li>
          ))}
        </ul>
      )}
      {text.length >= 2 && !looked && <p className="mt-2 px-1 text-[14px] text-muted">{shown.length ? "Looking on the map…" : "Looking…"}</p>}
      {looked && !shown.length && !typed && <p className="mt-2 px-1 text-[14px] text-muted">Nothing found. Try the exact name?</p>}
      {looked && typed && (
        <button
          disabled={disabled}
          onClick={() => pick(typed(text))}
          className="mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-[15px] text-ink-2 active:bg-surface-2 disabled:opacity-50"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-dashed border-line">
            <Icon name="plus" size={15} />
          </span>
          {shown.length ? `Use “${text}”` : `Not on the map. Use “${text}”`}
        </button>
      )}
      <div ref={end} />
    </>
  );
}
