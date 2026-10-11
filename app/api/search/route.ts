import { AuthError, requireUser } from "@/lib/auth";
import { route } from "@/lib/api";
import { findBooks, searchText } from "@/lib/books";

export const GET = route(async (req: Request) => {
  await requireUser();
  const params = new URL(req.url).searchParams;
  const isbn = params.get("isbn")?.replace(/[^0-9X]/gi, "");
  const q = (params.get("q") ?? "").trim().slice(0, 200);
  if (!isbn && q.length < 2) return Response.json({ results: [] });
  try {
    return Response.json({ results: isbn ? await findBooks({ isbn }, 1) : await searchText(q, 8) });
  } catch (err) {
    console.warn("Book search failed:", (err as Error).message);
    throw new AuthError("Couldn’t reach the book catalog.", 502);
  }
});
