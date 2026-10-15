"use client";

import { useState, type ReactNode } from "react";
import { vocab } from "@/lib/kinds";
import { parseImport, SOURCE_LABEL, type ImportResult } from "@/lib/parse";
import { STATUSES, type Candidate, type Kind } from "@/lib/types";
import { Button, Icon } from "../ui";

/** Where to find the export in each app, and what the drop zone accepts. */
const SOURCES: Record<Kind, { accept: string; hint: string; steps: [label: string, how: ReactNode][] }> = {
  book: {
    accept: ".csv,text/csv",
    hint: "The .csv from Goodreads, StoryGraph, or any list with a Title column. Read, currently-reading and to-read shelves each go to their own section.",
    steps: [
      [
        "Goodreads",
        <>
          My Books → Import and export → <i>Export Library</i>.{" "}
          <a className="text-accent underline-offset-2 hover:underline" href="https://www.goodreads.com/review/import" target="_blank" rel="noreferrer">
            Open it
          </a>
        </>,
      ],
      ["StoryGraph", <>Manage account → <i>Export StoryGraph Library</i>.</>],
    ],
  },
  podcast: {
    accept: ".opml,.xml,text/xml,text/x-opml,.csv,text/csv",
    hint: "An OPML file of your subscriptions, or any list with a Title column.",
    steps: [
      ["Overcast", <>Settings → <i>Export OPML</i>.</>],
      ["Pocket Casts", <>Profile → Settings → Import & export → <i>Export podcasts</i>.</>],
      ["Spotify, Apple Podcasts", <>They don’t export, so screenshot your library and use <i>Screenshot your app</i> instead.</>],
    ],
  },
  place: {
    accept: ".csv,text/csv,.json,application/json,application/geo+json",
    hint: "A saved list’s .csv, or Saved Places.json, from Google Takeout. They go into the place you picked, notes and all.",
    steps: [
      [
        "Google Maps",
        <>
          takeout.google.com → select only <i>Saved</i> (or <i>Maps (your places)</i>) → Export. Unzip it and pick a list’s
          .csv.
        </>,
      ],
      ["Any list", <>A spreadsheet with a Title or Name column, and Note if you have one.</>],
    ],
  },
  screen: {
    accept: ".csv,text/csv",
    hint: "watched.csv or watchlist.csv from Letterboxd, an IMDb ratings or watchlist export, or Netflix’s viewing history.",
    steps: [
      [
        "Letterboxd",
        <>
          Settings → Data → <i>Export your data</i>. Unzip it and pick <i>watched.csv</i>, then <i>watchlist.csv</i>.
        </>,
      ],
      ["IMDb", <>Your Ratings or Watchlist → ⋯ → <i>Export</i>.</>],
      ["Netflix", <>Account → Profile → Viewing activity → <i>Download all</i>.</>],
    ],
  },
};

export function ImportView({ kind, onReview }: { kind: Kind; onReview: (items: Candidate[]) => void }) {
  const v = vocab(kind);
  const source = SOURCES[kind];
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string>();
  const [dragging, setDragging] = useState(false);

  const onFile = async (file?: File) => {
    if (!file) return;
    setError(undefined);
    const parsed = parseImport(kind, await file.text(), file.name);
    if (!parsed) return setError("That file doesn’t look like an export we know. It needs a Title column.");
    if (!parsed.items.length) return setError(`No ${v.many} in that file.`);
    setResult(parsed);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-5 pb-safe" data-vaul-no-drag="">
      {result ? (
        <div className="rounded-3xl bg-surface-2 p-5">
          <p className="font-serif text-[28px] leading-tight">{v.noun(result.items.length)} found</p>
          {STATUSES.some((s) => result.counts[s]) && (
            <p className="mt-1 text-[15px] text-ink-2">
              {STATUSES.filter((s) => result.counts[s])
                .map((s) => `${result.counts[s].toLocaleString()} ${v.sections[s].toLowerCase()}`)
                .join(" · ")}
            </p>
          )}
          <p className="mt-1 text-[14px] text-muted">
            From {SOURCE_LABEL[result.source]}
            {result.skipped ? ` · skipped ${result.skipped.toLocaleString()} we don’t track` : ""}
          </p>
          <Button className="mt-4 w-full" onClick={() => onReview(result.items)}>
            Match and review
          </Button>
        </div>
      ) : (
        <ul className="space-y-3 text-[15px] text-ink-2">
          {source.steps.map(([label, how]) => (
            <li key={label} className="flex gap-3">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-2 font-serif text-[13px] font-semibold text-ink">
                {label.charAt(0)}
              </span>
              <span>
                <b className="font-medium text-ink">{label}:</b> {how}
              </span>
            </li>
          ))}
        </ul>
      )}

      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          onFile(e.dataTransfer.files[0]);
        }}
        className={`mt-5 flex cursor-pointer flex-col items-center gap-2 rounded-3xl border border-dashed text-center transition-colors ${
          result ? "p-4" : "p-8"
        } ${dragging ? "border-ink bg-surface-2" : "border-line bg-paper/40"}`}
      >
        {!result && (
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-2 text-ink">
            <Icon name="file" size={26} />
          </span>
        )}
        <span className="text-[16px] font-medium">{result ? "Use a different file" : "Choose your export file"}</span>
        {!result && <span className="text-[13px] text-muted">{source.hint}</span>}
        <input type="file" accept={source.accept} className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
      </label>

      {error && <p className="mt-3 text-center text-[14px] text-accent">{error}</p>}
    </div>
  );
}
