import { requireUser } from "@/lib/auth";
import { route } from "@/lib/api";
import { unfriend } from "@/lib/social";

export const DELETE = route(async (_req: Request, ctx: RouteContext<"/api/friends/[id]">) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  await unfriend(user.id, id);
  return Response.json({ ok: true });
});
