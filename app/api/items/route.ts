import { after } from "next/server";
import { AuthError, requireUser } from "@/lib/auth";
import { readJson, route } from "@/lib/api";
import { fillCovers } from "@/lib/covers";
import { findOrCreateDestination, getDestination, type NewDestination } from "@/lib/destinations";
import { accessTo, findPerson } from "@/lib/social";
import { addItems, listItems } from "@/lib/trove";
import { isKind, isStatus, type Hit, type Kind, type PlaceInfo, type RecBy, type Status } from "@/lib/types";

type Incoming = Hit & {
  addedAt?: number;
  statusAt?: number;
  status?: Status;
  private?: boolean;
  note?: string;
  recBy?: { id?: unknown; name?: unknown } | null;
};

export const GET = route(async (req: Request) => {
  const user = await requireUser();
  const kind = new URL(req.url).searchParams.get("kind");
  return Response.json({ items: await listItems(user.id, { kind: isKind(kind) ? kind : undefined, includePrivate: true }) });
});

export const POST = route(async (req: Request) => {
  const user = await requireUser();
  const body = await readJson<{ kind: Kind; items: Incoming[]; destinationId: string; destination: NewDestination }>(req);
  if (!isKind(body.kind)) throw new AuthError("Unknown collection.");
  // Spots go into one of your destinations: by id, or by name (saving a friend's spot finds or makes yours).
  let destinationId: string | null = null;
  if (body.kind === "place") {
    if (typeof body.destinationId === "string") {
      destinationId = (await getDestination(user.id, body.destinationId))?.id ?? null;
    } else if (body.destination && typeof body.destination.name === "string") {
      const d = body.destination;
      destinationId = (
        await findOrCreateDestination(user.id, {
          name: d.name,
          country: typeof d.country === "string" ? d.country : null,
          label: typeof d.label === "string" ? d.label : null,
          lat: typeof d.lat === "number" ? d.lat : null,
          lon: typeof d.lon === "number" ? d.lon : null,
          bbox: Array.isArray(d.bbox) ? d.bbox : null,
        })
      ).id;
    }
    if (!destinationId) throw new AuthError("Pick a place first.", 404);
  }
  const hits = (Array.isArray(body.items) ? body.items : []).filter(isHit).slice(0, 2000);
  if (!hits.length) throw new AuthError("Nothing to add.");
  // "Recommended by" a friend only counts for people whose trove this user can actually see.
  const people = new Map<string, RecBy | null>();
  const recFor = async (r: Incoming["recBy"]): Promise<RecBy | null> => {
    if (typeof r?.id === "string" && r.id !== user.id) {
      if (!people.has(r.id)) {
        const person = await findPerson(r.id);
        const ok = person && person.id === r.id && (await accessTo(user.id, person)) !== "none";
        people.set(r.id, ok ? { id: person.id, name: person.name ?? "A friend" } : null);
      }
      return people.get(r.id) ?? null;
    }
    return typeof r?.name === "string" && r.name.trim() ? { id: null, name: r.name } : null;
  };
  const recs = await Promise.all(hits.map((h) => recFor(h.recBy)));
  const added = await addItems(
    user.id,
    body.kind,
    hits.map((h, i) => ({
      key: h.key.slice(0, 200),
      title: h.title.slice(0, 300),
      author: h.author?.slice(0, 200) ?? null,
      year: typeof h.year === "number" ? h.year : null,
      coverUrl: typeof h.coverUrl === "string" && /^https:\/\//.test(h.coverUrl) ? h.coverUrl : null,
      categories: Array.isArray(h.categories) ? h.categories.filter((c) => typeof c === "string").slice(0, 8) : [],
      addedAt: typeof h.addedAt === "number" ? h.addedAt : undefined,
      statusAt: typeof h.statusAt === "number" ? h.statusAt : undefined,
      status: isStatus(h.status) ? h.status : "read",
      private: h.private === true,
      note: typeof h.note === "string" ? h.note : null,
      place: cleanPlace(h.place),
      recBy: recs[i],
    })),
    { destinationId },
  );
  // Saved without a cover (typed in, or a catalog with no image): look one up, after answering.
  if (body.kind !== "place" && hits.some((h) => !h.coverUrl)) after(() => fillCovers(user.id));
  return Response.json({ added });
});

function cleanPlace(p: unknown): PlaceInfo | undefined {
  const g = p as PlaceInfo | undefined;
  if (!g || typeof g.lat !== "number" || typeof g.lon !== "number" || Math.abs(g.lat) > 90 || Math.abs(g.lon) > 180) {
    return undefined;
  }
  return {
    lat: g.lat,
    lon: g.lon,
    type: typeof g.type === "string" ? g.type.slice(0, 60) : null,
    address: typeof g.address === "string" ? g.address.slice(0, 200) : null,
  };
}

function isHit(h: unknown): h is Incoming {
  const b = h as Hit;
  return Boolean(b && typeof b.key === "string" && typeof b.title === "string" && b.title.trim());
}
