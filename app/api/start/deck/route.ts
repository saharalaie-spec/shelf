import { AuthError, requireUser } from "@/lib/auth";
import { readJson, route } from "@/lib/api";
import { suggestEnabled, tasteDeck } from "@/lib/suggest";

/** The getting-started deck: well-known things near your taste to say Loved it, Want to, or Not for me. */
export const POST = route(async (req: Request) => {
  const user = await requireUser();
  if (!suggestEnabled()) throw new AuthError("Ideas aren’t set up here yet.", 404);
  const body = await readJson<{ fresh: boolean }>(req);
  return Response.json({ cards: await tasteDeck(user.id, { fresh: body.fresh === true }) });
});
