"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/client";
import type { AreaHit } from "@/lib/types";
import { Icon } from "./ui";

/** Places start with a city: pick one from the map, and it's saved as one of your places. */
export function CitySearch({ onCity }: { onCity: (d: { id: string; name: string }) => void }) {
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
  return (
    <div className="mt-5">
      <p className="mb-2 px-1 text-[15px] font-medium">First, which city?</p>
      <Search
        url={(q) => `/api/search?kind=area&q=${encodeURIComponent(q)}`}
        placeholder="Search cities"
        label="Which city?"
        disabled={saving}
        render={(a: AreaHit) => (
          <>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#3d5a3c] text-white">
              <Icon name="pin" size={17} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-medium">{a.name}</span>
              <span className="block truncate text-[13px] text-muted">{[a.label, a.country].filter(Boolean).join(" · ")}</span>
            </span>
          </>
        )}
        onPick={pick}
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
}: {
  url: (q: string) => string;
  placeholder: string;
  label: string;
  render: (r: T) => React.ReactNode;
  onPick: (r: T) => void;
  disabled?: boolean;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<{ q: string; items: T[] } | null>(null);
  const text = q.trim();

  useEffect(() => {
    if (text.length < 2) return;
    let live = true;
    const t = setTimeout(() => {
      api<{ results: T[] }>(url(text))
        .then((r) => live && setResults({ q: text, items: r.results.slice(0, 4) }))
        .catch(() => live && setResults({ q: text, items: [] }));
    }, 280);
    return () => {
      live = false;
      clearTimeout(t);
    };
    // The url builder is a fresh function each render; what it depends on is in the component's key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  const shown = text.length >= 2 && results ? results.items : [];
  return (
    <>
      <div className="relative">
        <Icon name="search" size={18} className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-muted" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
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
                onClick={() => {
                  onPick(r);
                  setQ("");
                  setResults(null);
                }}
                className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left active:bg-surface-2 disabled:opacity-50"
              >
                {render(r)}
              </button>
            </li>
          ))}
        </ul>
      )}
      {text.length >= 2 && results?.q === text && !results.items.length && (
        <p className="mt-2 px-1 text-[14px] text-muted">Nothing found. Try the exact name?</p>
      )}
    </>
  );
}
