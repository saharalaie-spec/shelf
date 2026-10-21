"use client";

import type { Hit } from "@/lib/types";
import { Icon, type IconName } from "./ui";

/** How each kind of spot looks: an icon on a color, standing in for a cover. */
const STYLE: Record<string, { icon: IconName; color: string }> = {
  // The collection earth tones: the icon tells them apart.
  "Food & Drink": { icon: "food", color: "var(--tint-podcast)" },
  Cafés: { icon: "coffee", color: "var(--tint-book)" },
  "Bars & Nightlife": { icon: "glass", color: "var(--tint-deep)" },
  "Museums & Culture": { icon: "museum", color: "var(--tint-screen)" },
  Sights: { icon: "camera", color: "var(--tint-place)" },
  "Beaches & Nature": { icon: "leaf", color: "var(--tint-place)" },
  Shopping: { icon: "bag", color: "var(--tint-book)" },
  Stays: { icon: "bed", color: "var(--tint-screen)" },
  Activities: { icon: "sparkle", color: "var(--tint-deep)" },
};
const FALLBACK = { icon: "pin" as IconName, color: "var(--tint-screen)" };

export const spotStyle = (categories: string[]) => STYLE[categories.find((c) => STYLE[c]) ?? ""] ?? FALLBACK;

/** A square tile with the spot's kind, sized by its container. */
export function SpotTile({
  spot,
  size = 48,
  className = "",
}: {
  spot: Pick<Hit, "categories">;
  size?: number;
  className?: string;
}) {
  const { icon, color } = spotStyle(spot.categories);
  return (
    <span
      aria-hidden
      className={`flex shrink-0 items-center justify-center rounded-[28%] text-ink-2 shadow-book ring-1 ring-line/70 ring-inset ${className}`}
      style={{ width: size, height: size, background: color }}
    >
      <Icon name={icon} size={Math.round(size * 0.46)} />
    </span>
  );
}

/** "Restaurant · Ruzafa": what it is and where, for list rows. */
export function spotLine(spot: Pick<Hit, "author" | "place" | "categories">) {
  return [spot.place?.type ?? spot.categories[0], spot.author].filter(Boolean).join(" · ");
}
