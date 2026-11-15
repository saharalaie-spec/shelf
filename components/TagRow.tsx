"use client";

import { useState } from "react";
import { Sheet } from "./Sheet";
import { Icon } from "./ui";

/**
 * Tags to filter by, on a single line: All, the most common few that fit, and "More" for the full list in a sheet.
 * The one picked always shows on the line.
 */
export function TagRow({
  tags,
  total,
  value,
  onChange,
  className = "",
}: {
  tags: [string, number][];
  total: number;
  value: string | null;
  onChange: (tag: string | null) => void;
  className?: string;
}) {
  const [all, setAll] = useState(false);
  // A tag on every one of them filters nothing, so it goes last.
  tags = [...tags.filter(([, n]) => n < total), ...tags.filter(([, n]) => n >= total)];
  // Two tags when their names are short enough to fit on a phone's line in full; otherwise one, never cut short.
  const FEW = tags.length > 1 && tags[0][0].length + tags[1][0].length <= 16 ? 2 : 1;
  const shown = tags.slice(0, FEW);
  if (value && !shown.some(([t]) => t === value)) shown.splice(FEW - 1, 1, tags.find(([t]) => t === value)!);
  const rest = tags.length - shown.length;
  const pick = (t: string | null) => {
    onChange(t);
    setAll(false);
  };
  return (
    <>
      <div className={`flex items-center gap-2 overflow-hidden ${className}`}>
        <TagChip active={!value} label="All" count={total} onClick={() => pick(null)} fixed />
        {shown.map(([t, n]) => (
          <TagChip key={t} active={value === t} label={t} count={n} onClick={() => pick(value === t ? null : t)} />
        ))}
        {rest > 0 && (
          <button
            onClick={() => setAll(true)}
            className="flex h-8 shrink-0 items-center gap-1 rounded-full px-2.5 text-[13px] font-medium whitespace-nowrap text-link active:scale-95"
          >
            More <span className="tabular-nums">({rest})</span>
          </button>
        )}
      </div>
      <Sheet open={all} onOpenChange={setAll} title="Tags">
        <ul className="max-h-[60dvh] overflow-y-auto px-3 pb-safe" data-vaul-no-drag="">
          {[["All", total] as [string, number], ...tags].map(([t, n], i) => {
            const on = i === 0 ? !value : value === t;
            return (
              <li key={t}>
                <button
                  onClick={() => pick(i === 0 ? null : t)}
                  className={`flex w-full items-center justify-between rounded-2xl px-3 py-3 text-left text-[16px] active:bg-surface-2 ${on ? "font-semibold" : ""}`}
                >
                  <span className="truncate">{t}</span>
                  <span className="flex shrink-0 items-center gap-2 text-[14px] text-muted tabular-nums">
                    {n}
                    {on && <Icon name="check" size={16} className="text-ink" />}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </Sheet>
    </>
  );
}

function TagChip({ active, label, count, onClick, fixed }: { active: boolean; label: string; count: number; onClick: () => void; fixed?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`flex h-8 max-w-[42%] min-w-0 items-center ${fixed ? "shrink-0" : "shrink"} gap-1.5 rounded-full px-3 text-[13px] font-medium transition-colors active:scale-95 ${
        active ? "bg-accent text-accent-ink" : "bg-surface-2 text-ink-2"
      }`}
    >
      <span className="truncate">{label}</span>
      <span className={`shrink-0 tabular-nums ${active ? "text-paper/60" : "text-muted"}`}>{count}</span>
    </button>
  );
}
