"use client";

import type { Hit } from "@/lib/types";
import { Icon, type IconName } from "./ui";

/** How each kind of spot looks: an icon on a color, standing in for a cover. */
const STYLE: Record<string, { icon: IconName; color: string }> = {
  // Shades of Trove's olive and clay, with stone between: the icon tells them apart.
  "Food & Drink": { icon: "food", color: "#9e6148" },
  Cafés: { icon: "coffee", color: "#6e5646" },
  "Bars & Nightlife": { icon: "glass", color: "#2f3329" },
  "Museums & Culture": { icon: "museum", color: "#4f5450" },
  Sights: { icon: "camera", color: "#5e6a51" },
  "Beaches & Nature": { icon: "leaf", color: "#727a5c" },
  Shopping: { icon: "bag", color: "#8a7255" },
  Stays: { icon: "bed", color: "#6b6a62" },
  Activities: { icon: "sparkle", color: "#85503c" },
};
const FALLBACK = { icon: "pin" as IconName, color: "#4c5342" };

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
