import { AuthError, requireUser } from "@/lib/auth";
import { readJson, route } from "@/lib/api";
import { matchCandidates } from "@/lib/catalog";
import { isKind, isStatus, type Candidate, type Kind } from "@/lib/types";

export const POST = route(async (req: Request) => {
  await requireUser();
  const body = await readJson<{ kind: Kind; items: Candidate[] }>(req);
  const kind = isKind(body.kind) ? body.kind : "book";
  const items = (Array.isArray(body.items) ? body.items : [])
    .filter((c) => c && typeof c.title === "string" && c.title.trim())
    .slice(0, 25)
    .map((c) => ({
      title: c.title.trim().slice(0, 200),
      author: typeof c.author === "string" && c.author.trim() ? c.author.trim().slice(0, 120) : undefined,
      isbn: typeof c.isbn === "string" && c.isbn ? c.isbn.replace(/[^0-9X]/gi, "") : undefined,
      year: typeof c.year === "number" && Number.isFinite(c.year) ? c.year : undefined,
      format: c.format === "movie" || c.format === "tv" ? c.format : undefined,
      status: isStatus(c.status) ? c.status : undefined,
    }));
  if (!items.length) throw new AuthError("Nothing to look up.");
  return Response.json({ results: await matchCandidates(kind, items) });
});
