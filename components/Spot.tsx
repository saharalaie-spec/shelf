"use client";

import type { Hit } from "@/lib/types";
import { Icon, type IconName } from "./ui";

/** How each kind of spot looks: an icon on a color, standing in for a cover. */
const STYLE: Record<string, { icon: IconName; color: string }> = {
  "Food & Drink": { icon: "food", color: "#a24a28" },
  Cafés: { icon: "coffee", color: "#7d5536" },
  "Bars & Nightlife": { icon: "glass", color: "#5b3a5e" },
  "Museums & Culture": { icon: "museum", color: "#34466b" },
  Sights: { icon: "camera", color: "#285a5f" },
  "Beaches & Nature": { icon: "leaf", color: "#2f6447" },
  Shopping: { icon: "bag", color: "#8f6420" },
  Stays: { icon: "bed", color: "#4b5960" },
  Activities: { icon: "sparkle", color: "#7a2e2e" },
};
const FALLBACK = { icon: "pin" as IconName, color: "#3d5a3c" };

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
