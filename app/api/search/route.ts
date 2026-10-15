import { AuthError, requireUser } from "@/lib/auth";
import { route } from "@/lib/api";
import { browseCatalog, lookupIsbn, searchAreasCatalog, searchCatalog } from "@/lib/catalog";
import { getDestination } from "@/lib/destinations";
import { vocab } from "@/lib/kinds";
import { isKind } from "@/lib/types";

/**
 * `?kind=book|podcast|screen&q=` searches a catalog; `?kind=place&dest=<id>&q=` (or `&browse=<category>`)
 * finds spots inside one of your destinations; `?kind=area&q=` finds cities, regions and countries.
 */
export const GET = route(async (req: Request) => {
  const user = await requireUser();
  const params = new URL(req.url).searchParams;
  const kindParam = params.get("kind");
  const q = (params.get("q") ?? "").trim().slice(0, 200);
  try {
    if (kindParam === "area") {
      return Response.json({ results: q.length < 2 ? [] : await searchAreasCatalog(q, 8) });
    }
    const kind = isKind(kindParam) ? kindParam : "book";
    if (kind === "place") {
      const destination = await getDestination(user.id, params.get("dest") ?? "");
      if (!destination) throw new AuthError("Pick a place first.", 404);
      const browse = params.get("browse")?.slice(0, 60);
      if (browse) return Response.json({ results: await browseCatalog(browse, destination, 12) });
      return Response.json({ results: q.length < 2 ? [] : await searchCatalog(kind, q, 8, destination) });
    }
    const isbn = params.get("isbn")?.replace(/[^0-9X]/gi, "");
    if (!isbn && q.length < 2) return Response.json({ results: [] });
    return Response.json({ results: isbn ? await lookupIsbn(isbn) : await searchCatalog(kind, q, 8) });
  } catch (err) {
    if (err instanceof AuthError) throw err;
    console.warn(`${kindParam} search failed:`, (err as Error).message);
    const where = kindParam === "area" || kindParam === "place" ? "the map" : vocab(isKind(kindParam) ? kindParam : "book").catalog;
    throw new AuthError(`Couldn’t reach ${where}.`, 502);
  }
});
