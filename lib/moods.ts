import type { Kind } from "./types";

/** Books, podcasts and screen go by mood; places go by the occasion. */
export const MOODS = ["any", "lighter", "deeper", "short", "surprise"] as const;
export const OCCASIONS = ["any", "date", "friends", "family", "celebrate", "solo"] as const;
export type Mood = (typeof MOODS)[number] | (typeof OCCASIONS)[number];
export const moodsFor = (kind: Kind): readonly Mood[] => (kind === "place" ? OCCASIONS : MOODS);
export const isMood = (m: unknown, kind: Kind): m is Mood => moodsFor(kind).includes(m as Mood);
