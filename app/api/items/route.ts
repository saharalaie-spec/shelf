import { AuthError, requireUser } from "@/lib/auth";
import { readJson, route } from "@/lib/api";
import { addItems, listItems } from "@/lib/shelf";
import { isKind, isStatus, type Hit, type Kind, type Status } from "@/lib/types";

type Incoming = Hit & { addedAt?: number; statusAt?: number; status?: Status; private?: boolean };

export const GET = route(async (req: Request) => {
  const user = await requireUser();
  const kind = new URL(req.url).searchParams.get("kind");
  return Response.json({ items: await listItems(user.id, { kind: isKind(kind) ? kind : undefined, includePrivate: true }) });
});

export const POST = route(async (req: Request) => {
  const user = await requireUser();
  const body = await readJson<{ kind: Kind; items: Incoming[] }>(req);
  if (!isKind(body.kind)) throw new AuthError("Unknown collection.");
  const hits = (Array.isArray(body.items) ? body.items : []).filter(isHit).slice(0, 2000);
  if (!hits.length) throw new AuthError("Nothing to add.");
  const added = await addItems(
    user.id,
    body.kind,
    hits.map((h) => ({
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
    })),
  );
  return Response.json({ added });
});

function isHit(h: unknown): h is Incoming {
  const b = h as Hit;
  return Boolean(b && typeof b.key === "string" && typeof b.title === "string" && b.title.trim());
}
