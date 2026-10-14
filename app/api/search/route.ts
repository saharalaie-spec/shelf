import { AuthError, requireUser } from "@/lib/auth";
import { route } from "@/lib/api";
import { lookupIsbn, searchCatalog } from "@/lib/catalog";
import { vocab } from "@/lib/kinds";
import { isKind } from "@/lib/types";

export const GET = route(async (req: Request) => {
  await requireUser();
  const params = new URL(req.url).searchParams;
  const kindParam = params.get("kind");
  const kind = isKind(kindParam) ? kindParam : "book";
  const isbn = params.get("isbn")?.replace(/[^0-9X]/gi, "");
  const q = (params.get("q") ?? "").trim().slice(0, 200);
  if (!isbn && q.length < 2) return Response.json({ results: [] });
  try {
    return Response.json({ results: isbn ? await lookupIsbn(isbn) : await searchCatalog(kind, q, 8) });
  } catch (err) {
    console.warn(`${kind} search failed:`, (err as Error).message);
    throw new AuthError(`Couldn’t reach ${vocab(kind).catalog}.`, 502);
  }
});
