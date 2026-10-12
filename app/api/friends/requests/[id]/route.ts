import { AuthError, requireUser } from "@/lib/auth";
import { readJson, route } from "@/lib/api";
import { respondToRequest } from "@/lib/social";

const ACTIONS = ["accept", "decline", "cancel"] as const;

export const POST = route(async (req: Request, ctx: RouteContext<"/api/friends/requests/[id]">) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const { action } = await readJson<{ action: (typeof ACTIONS)[number] }>(req);
  if (!action || !ACTIONS.includes(action)) throw new AuthError("Unknown action.");
  await respondToRequest(user, id, action);
  return Response.json({ ok: true });
});
