"use client";

import type { Hit } from "@/lib/types";
import { Icon, type IconName } from "./ui";

/** How each kind of spot looks: an icon on a color, standing in for a cover. */
const STYLE: Record<string, { icon: IconName; color: string }> = {
  // Stones, with Trove's navy for the night: the icon tells them apart.
  "Food & Drink": { icon: "food", color: "#806a5e" },
  Cafés: { icon: "coffee", color: "#77695b" },
  "Bars & Nightlife": { icon: "glass", color: "#1e2b47" },
  "Museums & Culture": { icon: "museum", color: "#5b6066" },
  Sights: { icon: "camera", color: "#6e7264" },
  "Beaches & Nature": { icon: "leaf", color: "#727a6c" },
  Shopping: { icon: "bag", color: "#857868" },
  Stays: { icon: "bed", color: "#6b6863" },
  Activities: { icon: "sparkle", color: "#3a4660" },
};
const FALLBACK = { icon: "pin" as IconName, color: "#5b6066" };

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
      className={`flex shrink-0 items-center justify-center rounded-[28%] text-white shadow-book ${className}`}
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
