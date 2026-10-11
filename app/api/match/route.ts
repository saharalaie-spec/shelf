import { AuthError, requireUser } from "@/lib/auth";
import { readJson, route } from "@/lib/api";
import { matchCandidates } from "@/lib/books";
import type { Candidate } from "@/lib/types";

export const POST = route(async (req: Request) => {
  await requireUser();
  const body = await readJson<{ items: Candidate[] }>(req);
  const items = (Array.isArray(body.items) ? body.items : [])
    .filter((c) => c && typeof c.title === "string" && c.title.trim())
    .slice(0, 25)
    .map((c) => ({
      title: c.title.trim().slice(0, 200),
      author: typeof c.author === "string" && c.author.trim() ? c.author.trim().slice(0, 120) : undefined,
      isbn: typeof c.isbn === "string" && c.isbn ? c.isbn.replace(/[^0-9X]/gi, "") : undefined,
    }));
  if (!items.length) throw new AuthError("Nothing to look up.");
  return Response.json({ results: await matchCandidates(items) });
});
