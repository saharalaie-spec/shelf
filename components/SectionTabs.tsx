"use client";

import { motion } from "motion/react";
import { STATUS_LABEL } from "@/lib/client";
import { STATUSES, type Status } from "@/lib/types";

/** Read · Reading · Want to read, as a segmented control with a sliding pill. */
export function SectionTabs({
  value,
  counts,
  onChange,
  layoutId = "section-pill",
}: {
  value: Status;
  counts?: Record<Status, number>;
  onChange: (s: Status) => void;
  layoutId?: string;
}) {
  return (
    <div className="flex gap-1 rounded-full bg-surface-2 p-1 text-[14px] font-medium" role="tablist">
      {STATUSES.map((s) => (
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
            {STATUS_LABEL[s]}
            {counts && <span className="tabular-nums opacity-60">{counts[s]}</span>}
          </span>
        </button>
      ))}
    </div>
  );
}
