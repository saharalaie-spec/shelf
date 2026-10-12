"use client";

import { useState } from "react";
import { plural, STATUS_LABEL } from "@/lib/client";
import { parseLibraryExport, type ImportResult } from "@/lib/parse";
import type { Candidate } from "@/lib/types";
import { Button, Icon } from "../ui";

export function ImportView({ onReview }: { onReview: (items: Candidate[]) => void }) {
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string>();
  const [dragging, setDragging] = useState(false);

  const onFile = async (file?: File) => {
    if (!file) return;
    setError(undefined);
    const parsed = parseLibraryExport(await file.text());
    if (!parsed) return setError("That file doesn’t look like a library export. It needs a Title column.");
    if (!parsed.items.length) return setError("No read books in that file.");
    setResult(parsed);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-5 pb-safe" data-vaul-no-drag="">
      {result ? (
        <div className="rounded-3xl bg-surface-2 p-5">
          <p className="font-serif text-[28px] leading-tight">{plural(result.items.length, "book")} found</p>
          {result.counts.read + result.counts.reading + result.counts.want > 0 && (
            <p className="mt-1 text-[15px] text-ink-2">
              {(["read", "reading", "want"] as const)
                .filter((s) => result.counts[s])
                .map((s) => `${result.counts[s].toLocaleString()} ${STATUS_LABEL[s].toLowerCase()}`)
                .join(" · ")}
            </p>
          )}
          <p className="mt-1 text-[14px] text-muted">
            From {result.source === "goodreads" ? "Goodreads" : result.source === "storygraph" ? "StoryGraph" : "your file"}
            {result.skipped ? ` · skipped ${result.skipped} on other shelves` : ""}
          </p>
          <Button className="mt-4 w-full" onClick={() => onReview(result.items)}>
            Match and review
          </Button>
        </div>
      ) : (
        <ul className="space-y-3 text-[15px] text-ink-2">
          <li className="flex gap-3">
            <Source label="G" />
            <span>
              <b className="font-medium text-ink">Goodreads:</b> My Books → Import and export → <i>Export Library</i>.{" "}
              <a className="text-accent underline-offset-2 hover:underline" href="https://www.goodreads.com/review/import" target="_blank" rel="noreferrer">
                Open it
              </a>
            </span>
          </li>
          <li className="flex gap-3">
            <Source label="S" />
            <span>
              <b className="font-medium text-ink">StoryGraph:</b> Manage account → <i>Export StoryGraph Library</i>.
            </span>
          </li>
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
        {!result && <span className="text-[13px] text-muted">The .csv from Goodreads, StoryGraph, or any list with a Title column. Read, currently-reading and to-read shelves each go to their own section.</span>}
        <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
      </label>

      {error && <p className="mt-3 text-center text-[14px] text-accent">{error}</p>}
    </div>
  );
}

function Source({ label }: { label: string }) {
  return (
    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-2 font-serif text-[13px] font-semibold text-ink">{label}</span>
  );
}
