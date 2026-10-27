"use client";

import { motion } from "motion/react";
import { STATUSES, type Status } from "@/lib/types";

/**
 * Read · Reading · Want to read (or each collection's own words), as a segmented control with a sliding pill. Other
 * options can join the sections, like "All" when sharing.
 */
export function SectionTabs<T extends string = Status>({
  value,
  options = STATUSES as readonly string[] as readonly T[],
  labels,
  counts,
  onChange,
  layoutId = "section-pill",
}: {
  value: T;
  /** Which to offer (places only have Been and Want to go). */
  options?: readonly T[];
  labels: Record<T, string>;
  counts?: Record<T, number>;
  onChange: (s: T) => void;
  layoutId?: string;
}) {
  return (
    <div className="flex gap-1 rounded-full bg-surface-2 p-1 text-[14px] font-medium" role="tablist">
      {options.map((s) => (
        <button
          key={s}
          role="tab"
          aria-selected={value === s}
          onClick={() => onChange(s)}
          className="relative flex h-9 flex-1 items-center justify-center rounded-full whitespace-nowrap"
        >
          {value === s && (
            <motion.span
              layoutId={layoutId}
              className="absolute inset-0 rounded-full bg-surface shadow-book"
              transition={{ type: "spring", bounce: 0.15, duration: 0.4 }}
            />
          )}
          <span className={`relative flex items-center gap-1.5 ${value === s ? "text-ink" : "text-muted"}`}>
            {labels[s]}
            {counts && <span className="tabular-nums opacity-60">{counts[s]}</span>}
          </span>
        </button>
      ))}
    </div>
  );
}
