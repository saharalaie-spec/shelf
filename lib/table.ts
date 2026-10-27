import "server-only";
import { db } from "./db";
import { photoUrl } from "./photos";
import { isKind, isStatus, type Area, type BBox, type Kind, type PlaceInfo, type Status } from "./types";

/**
 * The Table: what your friends are into, grouped by the thing rather than the person, so it reads the same
 * with 5 friends or 300. Nothing is ranked by engagement: things that involve you come first, then what your
 * circle is into, then what the most friends are into, then the newest.
 */

/** How far back each part of the Table looks. */
const IN_PROGRESS_DAYS = 120;
const FINISHED_DAYS = 14;
const PLACES_DAYS = 30;
const DAY = 24 * 60 * 60 * 1000;
/** Per section; the page shows the first few and "See all" for the rest. */
const PER_SECTION = 30;

export type TableFriend = { id: string; name: string | null; photo: string | null; circle: boolean; status: Status; at: number };

export type TableItem = {
  key: string;
  kind: Kind;
  workKey: string;
  title: string;
  author: string | null;
  year: number | null;
  coverUrl: string | null;
  categories: string[];
  place?: PlaceInfo;
  /** Circle first, then most recent. */
  friends: TableFriend[];
  latest: number;
  /** Where it is on your own lists, if it is. */
  mine: Status | null;
  /** A friend has it because you recommended it. */
  yourPick: boolean;
};

export type TablePlace = {
  key: string;
  name: string;
  /** Enough to make the same destination when you save a spot. */
  destination: Area & { label: string | null };
  spots: TableItem[];
  friends: TableFriend[];
  latest: number;
  /** You have a destination of the same name. */
  yours: boolean;
};

export type FriendsTable = {
  friendCount: number;
  watching: TableItem[];
  reading: TableItem[];
  listening: TableItem[];
  finished: TableItem[];
  places: TablePlace[];
};

/** "The Name of the Wind!" and "the name of the wind" are the same thing. */
export const sameThing = (kind: string, title: string) =>
  `${kind}:${title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()}`;

function parseJson<T>(raw: unknown, fallback: T): T {
  if (raw == null) return fallback;
  try {
    return JSON.parse(String(raw)) as T;
  } catch {
    return fallback;
  }
}

export async function friendsTable(userId: string, now = Date.now()): Promise<FriendsTable> {
  const client = await db();
  const [friendCount, rows, mine, myDestinations] = await Promise.all([
    client.execute({ sql: "SELECT COUNT(*) AS n FROM friendships WHERE user_id = ?", args: [userId] }),
    // Only friends who share what they're into; never private or quiet items.
    client.execute({
      sql: `SELECT b.kind, b.status, b.status_at, b.added_at, b.work_key, b.title, b.author, b.year, b.cover_url,
                   b.categories, b.geo, b.rec_user_id, u.id AS friend_id, u.name AS friend_name, u.photo_at AS friend_photo_at,
                   d.name AS dest_name, d.country AS dest_country, d.label AS dest_label, d.lat AS dest_lat,
                   d.lon AS dest_lon, d.bbox AS dest_bbox,
                   EXISTS (SELECT 1 FROM circle c WHERE c.user_id = f.user_id AND c.friend_id = u.id) AS in_circle
            FROM friendships f
            JOIN users u ON u.id = f.friend_id AND u.share_activity = 1
            JOIN books b ON b.user_id = u.id AND b.private = 0 AND b.quiet = 0
            LEFT JOIN destinations d ON d.id = b.destination_id
            WHERE f.user_id = ?
              AND ((b.kind != 'place' AND b.status = 'reading' AND b.status_at > ?)
                OR (b.kind != 'place' AND b.status = 'read' AND b.status_at > ?)
                OR (b.kind = 'place' AND max(b.added_at, b.status_at) > ?))`,
      args: [userId, now - IN_PROGRESS_DAYS * DAY, now - FINISHED_DAYS * DAY, now - PLACES_DAYS * DAY],
    }),
    client.execute({ sql: "SELECT kind, work_key, title, status FROM books WHERE user_id = ?", args: [userId] }),
    client.execute({ sql: "SELECT lower(name) AS name FROM destinations WHERE user_id = ?", args: [userId] }),
  ]);

  // What's on your own lists, by catalog key and by title (the same book can come from different catalogs).
  const myStatus = new Map<string, Status>();
  for (const r of mine.rows) {
    if (!isStatus(r.status)) continue;
    myStatus.set(String(r.work_key), r.status);
    myStatus.set(sameThing(String(r.kind), String(r.title)), r.status);
  }
  const myPlaces = new Set(myDestinations.rows.map((r) => String(r.name)));

  const items = new Map<string, TableItem>();
  const places = new Map<string, TablePlace & { spotMap: Map<string, TableItem> }>();

  const addFriend = (list: TableFriend[], f: TableFriend) => {
    const existing = list.find((x) => x.id === f.id);
    if (!existing) list.push(f);
    else if (f.at > existing.at) Object.assign(existing, f);
  };

  for (const r of rows.rows) {
    if (!isKind(r.kind) || !isStatus(r.status)) continue;
    const kind = r.kind;
    const status = r.status;
    const at = Number(kind === "place" ? Math.max(Number(r.added_at), Number(r.status_at)) : r.status_at);
    const friend: TableFriend = {
      id: String(r.friend_id),
      name: r.friend_name ? String(r.friend_name) : null,
      photo: photoUrl(String(r.friend_id), r.friend_photo_at),
      circle: Boolean(r.in_circle),
      status,
      at,
    };
    const workKey = String(r.work_key);
    const title = String(r.title);
    const base = {
      kind,
      workKey,
      title,
      author: r.author ? String(r.author) : null,
      year: r.year == null ? null : Number(r.year),
      coverUrl: r.cover_url ? String(r.cover_url) : null,
      categories: parseJson<string[]>(r.categories, []),
      ...(r.geo ? { place: parseJson<PlaceInfo | undefined>(r.geo, undefined) } : {}),
    };
    const mineStatus = myStatus.get(workKey) ?? myStatus.get(sameThing(kind, title)) ?? null;
    const yourPick = String(r.rec_user_id ?? "") === userId;

    if (kind === "place") {
      const name = r.dest_name ? String(r.dest_name) : "Elsewhere";
      const pkey = name.toLowerCase();
      let group = places.get(pkey);
      if (!group) {
        group = {
          key: pkey,
          name,
          destination: {
            name,
            country: r.dest_country ? String(r.dest_country) : null,
            label: r.dest_label ? String(r.dest_label) : null,
            lat: r.dest_lat == null ? null : Number(r.dest_lat),
            lon: r.dest_lon == null ? null : Number(r.dest_lon),
            bbox: parseJson<BBox | null>(r.dest_bbox, null),
          },
          spots: [],
          spotMap: new Map(),
          friends: [],
          latest: 0,
          yours: myPlaces.has(pkey),
        };
        places.set(pkey, group);
      }
      const skey = sameThing(kind, title);
      let spot = group.spotMap.get(skey);
      if (!spot) {
        spot = { key: skey, ...base, friends: [], latest: 0, mine: mineStatus, yourPick: false };
        group.spotMap.set(skey, spot);
      }
      addFriend(spot.friends, friend);
      spot.latest = Math.max(spot.latest, at);
      spot.yourPick ||= yourPick;
      addFriend(group.friends, friend);
      group.latest = Math.max(group.latest, at);
      continue;
    }

    // Someone who finished it and someone still on it are both "into" it; sections go by the most common.
    const key = sameThing(kind, title);
    let item = items.get(key);
    if (!item) {
      item = { key, ...base, friends: [], latest: 0, mine: mineStatus, yourPick: false };
      items.set(key, item);
    }
    addFriend(item.friends, friend);
    item.latest = Math.max(item.latest, at);
    item.yourPick ||= yourPick;
    if (!item.coverUrl && base.coverUrl) item.coverUrl = base.coverUrl;
  }

  const byFriends = (a: TableFriend, b: TableFriend) => Number(b.circle) - Number(a.circle) || b.at - a.at;
  const circleCount = (fs: TableFriend[]) => fs.filter((f) => f.circle).length;
  const order = (a: { friends: TableFriend[]; latest: number; mine?: Status | null; yourPick?: boolean; yours?: boolean },
                 b: typeof a) =>
    Number(Boolean(b.mine || b.yourPick || b.yours)) - Number(Boolean(a.mine || a.yourPick || a.yours)) ||
    circleCount(b.friends) - circleCount(a.friends) ||
    b.friends.length - a.friends.length ||
    b.latest - a.latest;

  const sections: Record<"watching" | "reading" | "listening" | "finished", TableItem[]> = {
    watching: [],
    reading: [],
    listening: [],
    finished: [],
  };
  for (const item of items.values()) {
    item.friends.sort(byFriends);
    const onIt = item.friends.filter((f) => f.status === "reading").length;
    const done = item.friends.length - onIt;
    if (done > onIt) sections.finished.push(item);
    else sections[item.kind === "screen" ? "watching" : item.kind === "podcast" ? "listening" : "reading"].push(item);
  }
  const placeList = [...places.values()].map(({ spotMap, ...p }) => {
    const spots = [...spotMap.values()];
    for (const s of spots) s.friends.sort(byFriends);
    p.friends.sort(byFriends);
    return { ...p, spots: spots.sort(order) };
  });

  return {
    friendCount: Number(friendCount.rows[0].n),
    watching: sections.watching.sort(order).slice(0, PER_SECTION),
    reading: sections.reading.sort(order).slice(0, PER_SECTION),
    listening: sections.listening.sort(order).slice(0, PER_SECTION),
    finished: sections.finished.sort(order).slice(0, PER_SECTION),
    places: placeList.sort(order).slice(0, PER_SECTION),
  };
}
