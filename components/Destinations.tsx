"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/client";
import type { AreaHit, Destination } from "@/lib/types";
import { Sheet } from "./Sheet";
import { Button, Icon } from "./ui";

export type Dest = Destination & { count: number };

/** "City in Spain", "Country", "Region in Portugal": what the map says a place is. */
const describe = (a: Pick<AreaHit, "label" | "country">) =>
  [a.label, a.country].filter(Boolean).join(a.label ? " in " : "") || "As you typed it";

/**
 * Choose where spots go: one of your destinations, a city, region or country from the map, or any name you
 * like ("Road trip 2024" works too). Creating one saves it right away.
 */
export function DestinationPicker({
  destinations,
  current,
  onPicked,
}: {
  destinations: Dest[];
  current: string | null;
  onPicked: (d: Dest, created: boolean) => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<AreaHit[]>([]);
  const [resultsFor, setResultsFor] = useState("");
  const [saving, setSaving] = useState<string | null>(null);
  const query = q.trim();

  useEffect(() => {
    if (query.length < 2) return;
    const ac = new AbortController();
    const t = setTimeout(async () => {
      try {
        const data = await api<{ results: AreaHit[] }>(`/api/search?kind=area&q=${encodeURIComponent(query)}`, { signal: ac.signal });
        setResults(data.results);
        setResultsFor(query);
      } catch {
        if (!ac.signal.aborted) {
          setResults([]);
          setResultsFor(query);
        }
      }
    }, 200);
    return () => {
      clearTimeout(t);
      ac.abort();
    };
  }, [query]);

  const mine = destinations.filter((d) => !query || d.name.toLowerCase().includes(query.toLowerCase()));
  const loading = query.length >= 2 && resultsFor !== query;

  const create = async (area: Omit<AreaHit, "key"> & { key?: string }) => {
    setSaving(area.key ?? "typed");
    try {
      const { destination } = await api<{ destination: Dest }>("/api/destinations", {
        body: { name: area.name, country: area.country, label: area.label, lat: area.lat, lon: area.lon, bbox: area.bbox },
      });
      const existing = destinations.find((d) => d.id === destination.id);
      onPicked(existing ?? destination, !existing);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="px-5 pt-1 pb-3">
        <div className="flex h-14 items-center gap-3 rounded-2xl bg-surface-2 px-4 transition-shadow focus-within:shadow-[0_0_0_2px_var(--ink)]">
          <Icon name="pin" className="shrink-0 text-muted" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter" || query.length < 2) return;
              e.preventDefault();
              const top = results[0];
              if (top && resultsFor === query) create(top);
              else create({ name: query, country: null, label: null, lat: null, lon: null, bbox: null });
            }}
            enterKeyHint="go"
            placeholder="A city, region or country"
            aria-label="Where"
            autoComplete="off"
            className="h-full min-w-0 flex-1 bg-transparent text-[17px] outline-none placeholder:text-muted"
          />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-safe" data-vaul-no-drag="">
        {mine.length > 0 && (
          <>
            <p className="px-3 pb-1 text-[13px] font-medium tracking-wide text-muted uppercase">Your places</p>
            <ul className="pb-3">
              {mine.map((d) => (
                <li key={d.id}>
                  <button
                    onClick={() => onPicked(d, false)}
                    className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left active:bg-surface-2 ${d.id === current ? "bg-surface-2/70" : ""}`}
                  >
                    <PinBadge />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[16px] font-medium">{d.name}</span>
                      <span className="block truncate text-[14px] text-muted">
                        {d.count ? `${d.count} ${d.count === 1 ? "spot" : "spots"}` : "No spots yet"}
                        {d.country && d.country !== d.name ? ` · ${d.country}` : ""}
                      </span>
                    </span>
                    {d.id === current && <Icon name="check" size={18} className="text-ink" />}
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
        {query.length >= 2 && (
          <>
            <p className="px-3 pb-1 text-[13px] font-medium tracking-wide text-muted uppercase">On the map</p>
            <ul>
              {loading && !results.length && <li className="px-3 py-3 text-[15px] text-muted">Looking…</li>}
              {results.map((a) => (
                <li key={a.key}>
                  <button
                    onClick={() => create(a)}
                    disabled={saving !== null}
                    className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left active:bg-surface-2"
                  >
                    <PinBadge globe={a.label === "Country"} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[16px] font-medium">{a.name}</span>
                      <span className="block truncate text-[14px] text-muted">{describe(a)}</span>
                    </span>
                    {saving === a.key && <Icon name="check" size={18} className="text-muted" />}
                  </button>
                </li>
              ))}
              {!loading && (
                <li>
                  <button
                    onClick={() => create({ name: query, country: null, label: null, lat: null, lon: null, bbox: null })}
                    disabled={saving !== null}
                    className="mt-1 flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-[15px] text-ink-2 active:bg-surface-2"
                  >
                    <span className="flex h-10 w-10 items-center justify-center rounded-full border border-dashed border-line">
                      <Icon name="plus" size={16} />
                    </span>
                    Use “{query}” as its name
                  </button>
                </li>
              )}
            </ul>
          </>
        )}
        {!mine.length && query.length < 2 && (
          <p className="px-3 pt-2 text-[15px] leading-relaxed text-muted">
            Where were these spots? A country like Spain, a city like Valencia, or anything you like to group them by.
          </p>
        )}
      </div>
    </div>
  );
}

function PinBadge({ globe }: { globe?: boolean }) {
  return (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-accent-ink">
      <Icon name={globe ? "globe2" : "pin"} size={19} />
    </span>
  );
}

/** Rename or delete a destination. Deleting takes its spots with it, so it asks first. */
export function DestinationSheet({
  destination,
  count,
  onClose,
  onRenamed,
  onDeleted,
}: {
  destination: Dest | null;
  count: number;
  onClose: () => void;
  onRenamed: (d: Dest) => void;
  onDeleted: (d: Dest) => void;
}) {
  const [shown, setShown] = useState(destination);
  if (destination && destination !== shown) setShown(destination);
  const d = destination ?? shown;
  return (
    <Sheet open={Boolean(destination)} onOpenChange={(o) => !o && onClose()} title={d?.name ?? "Place"}>
      {d && <DestinationBody key={d.id} destination={d} count={count} onClose={onClose} onRenamed={onRenamed} onDeleted={onDeleted} />}
    </Sheet>
  );
}

function DestinationBody({
  destination,
  count,
  onClose,
  onRenamed,
  onDeleted,
}: {
  destination: Dest;
  count: number;
  onClose: () => void;
  onRenamed: (d: Dest) => void;
  onDeleted: (d: Dest) => void;
}) {
  const [name, setName] = useState(destination.name);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const rename = async (e: React.FormEvent) => {
    e.preventDefault();
    const next = name.trim();
    if (!next || next === destination.name) return onClose();
    setBusy(true);
    try {
      const res = await api<{ destination: Destination }>(`/api/destinations/${destination.id}`, { method: "PATCH", body: { name: next } });
      onRenamed({ ...destination, ...res.destination });
      onClose();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await api(`/api/destinations/${destination.id}`, { method: "DELETE" });
      onDeleted(destination);
      onClose();
      toast(`Deleted ${destination.name}`);
    } catch (err) {
      toast.error((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <form onSubmit={rename} className="px-5 pb-safe">
      <label htmlFor="destination-name" className="mb-1.5 block text-[14px] text-muted">
        Name
      </label>
      <input
        id="destination-name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={80}
        className="h-12 w-full rounded-2xl border border-line bg-surface px-4 text-[17px] outline-none focus:border-ink"
      />
      <Button type="submit" className="mt-4 w-full" loading={busy && !confirming}>
        Save
      </Button>
      {confirming ? (
        <div className="mt-4 rounded-2xl bg-surface-2 p-4">
          <p className="text-[15px]">
            Delete {destination.name} and {count === 1 ? "its spot" : `all ${count} of its spots`}? This can’t be undone.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button type="button" variant="secondary" onClick={() => setConfirming(false)}>
              Keep it
            </Button>
            <Button type="button" variant="accent" loading={busy} onClick={remove}>
              Delete
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => (count ? setConfirming(true) : remove())}
          className="mt-2 mb-2 flex h-12 w-full items-center justify-center gap-2 rounded-full text-[15px] font-medium text-link active:bg-surface-2"
        >
          <Icon name="trash" size={18} /> Delete {destination.name}
        </button>
      )}
    </form>
  );
}
