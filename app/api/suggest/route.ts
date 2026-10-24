import { track } from "@/lib/activity";
import { AuthError, requireUser } from "@/lib/auth";
import { readJson, route } from "@/lib/api";
import { cleanArea } from "@/lib/destinations";
import { isMood } from "@/lib/moods";
import { suggest, suggestEnabled } from "@/lib/suggest";
import { isKind, type Kind } from "@/lib/types";

/** A few "something else" picks in one collection, from your taste map and your friends, or three for what you describe. */
export const POST = route(async (req: Request) => {
  const user = await requireUser();
  if (!suggestEnabled()) throw new AuthError("Suggestions aren’t set up here yet.", 404);
  const body = await readJson<{ kind: Kind; mood: string; fresh: boolean; destinationId: string | null; area: unknown; format: unknown; wish: unknown }>(req);
  if (!isKind(body.kind)) throw new AuthError("Unknown collection.");
  const result = await suggest(user.id, body.kind, isMood(body.mood, body.kind) ? body.mood : "any", {
    fresh: body.fresh === true,
    destinationId: typeof body.destinationId === "string" ? body.destinationId : null,
    place: cleanArea(body.area),
    format: body.format === "movie" || body.format === "tv" ? body.format : null,
    wish: typeof body.wish === "string" ? body.wish : null,
  });
  await track(typeof body.wish === "string" && body.wish.trim() ? "ask" : "ideas", { userId: user.id, ref: body.kind });
  return Response.json(result);
});
