"use client";

import { useMemo, useRef, useState } from "react";
import { vocab } from "@/lib/kinds";
import { parseList } from "@/lib/parse";
import type { Candidate, Kind } from "@/lib/types";
import { Button, Icon } from "../ui";

export function PasteView({ kind, onReview }: { kind: Kind; onReview: (items: Candidate[]) => void }) {
  const v = vocab(kind);
  const [text, setText] = useState("");
  const items = useMemo(() => parseList(text), [text]);
  const ref = useRef<HTMLTextAreaElement>(null);
  const [canPaste] = useState(() => typeof navigator !== "undefined" && Boolean(navigator.clipboard?.readText));

  const pasteFromClipboard = async () => {
    try {
      const clip = await navigator.clipboard.readText();
      if (clip) setText((t) => (t.trim() ? `${t.trimEnd()}\n${clip}` : clip));
    } catch {}
    ref.current?.focus();
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col px-5">
      <div className="flex items-center justify-between pb-3">
        <p className="text-[15px] text-muted">One per line. Messy is fine.</p>
        {canPaste && (
          <button onClick={pasteFromClipboard} className="flex h-9 items-center gap-1.5 rounded-full bg-surface-2 px-3.5 text-[14px] font-medium active:scale-95">
            <Icon name="copy" size={16} /> Paste
          </button>
        )}
      </div>
      <textarea
        ref={ref}
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        data-vaul-no-drag=""
        placeholder={v.pastePlaceholder}
        className="min-h-0 flex-1 resize-none rounded-2xl border border-line bg-paper/40 p-4 text-[17px] leading-relaxed outline-none placeholder:text-muted/70 focus:border-ink"
      />
      <div className="pt-3 pb-safe">
        <Button className="w-full" disabled={!items.length} onClick={() => onReview(items)}>
          {items.length ? `Find ${v.noun(items.length)}` : `Find ${v.many}`}
        </Button>
      </div>
    </div>
  );
}
