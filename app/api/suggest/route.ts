import { AuthError, requireUser } from "@/lib/auth";
import { readJson, route } from "@/lib/api";
import { isMood, suggest, suggestEnabled } from "@/lib/suggest";
import { isKind, type Kind } from "@/lib/types";

/** A few "something else" picks in one collection, from your taste map and your friends. */
export const POST = route(async (req: Request) => {
  const user = await requireUser();
  if (!suggestEnabled()) throw new AuthError("Suggestions aren’t set up here yet.", 404);
  const body = await readJson<{ kind: Kind; mood: string; fresh: boolean; destinationId: string | null }>(req);
  if (!isKind(body.kind)) throw new AuthError("Unknown collection.");
  const result = await suggest(user.id, body.kind, isMood(body.mood) ? body.mood : "any", {
    fresh: body.fresh === true,
    destinationId: typeof body.destinationId === "string" ? body.destinationId : null,
  });
  return Response.json(result);
});
