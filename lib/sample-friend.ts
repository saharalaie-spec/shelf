import "server-only";
import { db } from "./db";
import { findOrCreateDestination } from "./destinations";
import { SAMPLE_FRIEND_ID, SAMPLE_FRIEND_NAME } from "./sample";
import { areFriends, befriend } from "./social";
import { addItems, type NewItem } from "./trove";
import type { Area, Kind } from "./types";

/**
 * Juno: a sample friend with a full trove, so the Friends page, the Table and the Today card have something in
 * them before your real friends join. She can't sign in (no phone or email), and you remove her like any friend.
 * Her dates are kept recent, so she always looks like someone who's into things right now.
 */

const DAY = 24 * 60 * 60 * 1000;
const cover = (isbn: string) => `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg?default=false`;

type Seed = Omit<NewItem, "addedAt" | "statusAt" | "author" | "year" | "coverUrl" | "categories"> & {
  author?: string | null;
  year?: number | null;
  coverUrl?: string | null;
  categories?: string[];
  /** How many days ago it went into its section. */
  daysAgo: number;
};

const SEEDS: Record<Exclude<Kind, "place">, Seed[]> = {
  book: [
    { key: "sample:book:piranesi", title: "Piranesi", author: "Susanna Clarke", year: 2020, coverUrl: cover("9781635575637"), categories: ["Fantasy", "Fiction"], status: "reading", daysAgo: 3 },
    { key: "sample:book:tomorrow", title: "Tomorrow, and Tomorrow, and Tomorrow", author: "Gabrielle Zevin", year: 2022, coverUrl: cover("9780593321201"), categories: ["Fiction"], status: "reading", daysAgo: 9 },
    { key: "sample:book:klara", title: "Klara and the Sun", author: "Kazuo Ishiguro", year: 2021, coverUrl: cover("9780593318171"), categories: ["Science Fiction", "Fiction"], status: "read", daysAgo: 2, note: "Quietly devastating. Read it in two sittings." },
    { key: "sample:book:educated", title: "Educated", author: "Tara Westover", year: 2018, coverUrl: cover("9780399590504"), categories: ["Biography & Memoir"], status: "read", daysAgo: 40 },
    { key: "sample:book:overstory", title: "The Overstory", author: "Richard Powers", year: 2018, coverUrl: cover("9780393635522"), categories: ["Fiction"], status: "want", daysAgo: 12 },
    { key: "sample:book:copperhead", title: "Demon Copperhead", author: "Barbara Kingsolver", year: 2022, coverUrl: cover("9780063251922"), categories: ["Fiction", "Classics"], status: "want", daysAgo: 20 },
  ],
  podcast: [
    { key: "sample:pod:daily", title: "The Daily", author: "The New York Times", categories: ["News"], status: "reading", daysAgo: 1 },
    { key: "sample:pod:huberman", title: "Huberman Lab", author: "Scicomm Media", categories: ["Health & Fitness", "Science"], status: "reading", daysAgo: 6 },
    { key: "sample:pod:serial", title: "Serial", author: "Serial Productions & The New York Times", categories: ["True Crime"], status: "read", daysAgo: 5 },
    { key: "sample:pod:99pi", title: "99% Invisible", author: "Roman Mars", categories: ["Arts", "Society & Culture"], status: "read", daysAgo: 60 },
    { key: "sample:pod:hardcore", title: "Hardcore History", author: "Dan Carlin", categories: ["History"], status: "want", daysAgo: 15 },
  ],
  screen: [
    { key: "sample:screen:severance", title: "Severance", author: "TV · Apple TV+", year: 2022, categories: ["Drama", "Science Fiction"], status: "reading", daysAgo: 2 },
    { key: "sample:screen:bear", title: "The Bear", author: "TV · FX", year: 2022, categories: ["Comedy", "Drama"], status: "reading", daysAgo: 11 },
    { key: "sample:screen:pastlives", title: "Past Lives", author: "Movie · Celine Song", year: 2023, categories: ["Drama", "Romance"], status: "read", daysAgo: 4, note: "Bring tissues." },
    { key: "sample:screen:shogun", title: "Shōgun", author: "TV · FX", year: 2024, categories: ["Drama", "History"], status: "read", daysAgo: 8 },
    { key: "sample:screen:perfectdays", title: "Perfect Days", author: "Movie · Wim Wenders", year: 2023, categories: ["Drama"], status: "want", daysAgo: 7 },
    { key: "sample:screen:slowhorses", title: "Slow Horses", author: "TV · Apple TV+", year: 2022, categories: ["Thriller"], status: "want", daysAgo: 25 },
  ],
};

type SpotSeed = Seed & { place: { lat: number; lon: number; type: string; address: string | null } };

const PLACES: { area: Area & { label: string }; spots: SpotSeed[] }[] = [
  {
    area: { name: "Lisbon", country: "Portugal", label: "City", lat: 38.7223, lon: -9.1393, bbox: [-9.23, 38.69, -9.09, 38.8] },
    spots: [
      { key: "sample:spot:pasteis-belem", title: "Pastéis de Belém", author: "Belém", categories: ["Cafés"], status: "read", daysAgo: 6, note: "Get them warm, with cinnamon.", place: { lat: 38.6975, lon: -9.2032, type: "Bakery", address: "R. de Belém 84" } },
      { key: "sample:spot:senhora-monte", title: "Miradouro da Senhora do Monte", author: "Graça", categories: ["Sights"], status: "read", daysAgo: 6, note: "Go at sunset.", place: { lat: 38.7193, lon: -9.1326, type: "Viewpoint", address: null } },
      { key: "sample:spot:time-out", title: "Time Out Market", author: "Cais do Sodré", categories: ["Food & Drink"], status: "read", daysAgo: 7, place: { lat: 38.7069, lon: -9.1458, type: "Food hall", address: "Av. 24 de Julho 49" } },
      { key: "sample:spot:lx-factory", title: "LX Factory", author: "Alcântara", categories: ["Shopping", "Activities"], status: "want", daysAgo: 3, place: { lat: 38.7036, lon: -9.1784, type: "Creative hub", address: "R. Rodrigues de Faria 103" } },
    ],
  },
  {
    area: { name: "Valencia", country: "Spain", label: "City", lat: 39.4699, lon: -0.3763, bbox: [-0.43, 39.42, -0.27, 39.57] },
    spots: [
      { key: "sample:spot:casa-montana", title: "Casa Montaña", author: "El Cabanyal", categories: ["Food & Drink"], status: "read", daysAgo: 18, note: "Order the anchovies.", place: { lat: 39.4636, lon: -0.3305, type: "Restaurant", address: "C/ de Josep Benlliure 69" } },
      { key: "sample:spot:mercado-central", title: "Mercado Central", author: "Ciutat Vella", categories: ["Food & Drink", "Shopping"], status: "read", daysAgo: 18, place: { lat: 39.4737, lon: -0.3788, type: "Market", address: null } },
      { key: "sample:spot:malvarrosa", title: "Playa de la Malvarrosa", author: "La Malva-rosa", categories: ["Beaches & Nature"], status: "want", daysAgo: 10, place: { lat: 39.4794, lon: -0.3238, type: "Beach", address: null } },
    ],
  },
  {
    area: { name: "Tokyo", country: "Japan", label: "City", lat: 35.6762, lon: 139.6503, bbox: [139.56, 35.53, 139.92, 35.82] },
    spots: [
      { key: "sample:spot:golden-gai", title: "Golden Gai", author: "Shinjuku", categories: ["Bars & Nightlife"], status: "want", daysAgo: 4, place: { lat: 35.6938, lon: 139.7046, type: "Bar district", address: null } },
      { key: "sample:spot:meiji", title: "Meiji Jingu", author: "Shibuya", categories: ["Sights"], status: "want", daysAgo: 4, place: { lat: 35.6764, lon: 139.6993, type: "Shrine", address: null } },
    ],
  },
];

const toNew = (s: Seed, now: number): NewItem => {
  const at = now - s.daysAgo * DAY;
  const { daysAgo: _, ...rest } = s;
  return { author: null, year: null, coverUrl: null, categories: [], ...rest, addedAt: at, statusAt: at };
};

/** Makes Juno if she isn't here yet, and keeps her dates recent. */
async function ensureSampleFriend(now = Date.now()) {
  const client = await db();
  const exists = (await client.execute({ sql: "SELECT 1 FROM users WHERE id = ?", args: [SAMPLE_FRIEND_ID] })).rows[0];
  if (!exists) {
    await client.execute({
      sql: `INSERT INTO users (id, name, created_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING`,
      args: [SAMPLE_FRIEND_ID, SAMPLE_FRIEND_NAME, now],
    });
    for (const kind of ["book", "podcast", "screen"] as const) {
      await addItems(SAMPLE_FRIEND_ID, kind, SEEDS[kind].map((s) => toNew(s, now)));
    }
    for (const { area, spots } of PLACES) {
      const d = await findOrCreateDestination(SAMPLE_FRIEND_ID, area);
      await addItems(SAMPLE_FRIEND_ID, "place", spots.map((s) => toNew(s, now)), { destinationId: d.id });
    }
    return;
  }
  // Once a week, slide her dates forward so what she's "on now" stays now.
  const last = (await client.execute({ sql: "SELECT max(status_at) AS t FROM books WHERE user_id = ?", args: [SAMPLE_FRIEND_ID] }))
    .rows[0];
  const newest = Number(last?.t ?? 0);
  const shift = now - newest - DAY;
  if (shift > 7 * DAY) {
    await client.execute({
      sql: "UPDATE books SET added_at = added_at + ?, status_at = status_at + ? WHERE user_id = ?",
      args: [shift, shift, SAMPLE_FRIEND_ID],
    });
  }
}

/** Adds Juno as your friend. */
export async function addSampleFriend(userId: string) {
  await ensureSampleFriend();
  await befriend(userId, SAMPLE_FRIEND_ID);
}

/** Keeps Juno's dates fresh, for people who have her as a friend. Cheap when there's nothing to do. */
export async function refreshSampleFriendFor(userId: string) {
  if (await areFriends(userId, SAMPLE_FRIEND_ID)) await ensureSampleFriend();
}
