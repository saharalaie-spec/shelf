import { AuthError, requireUser } from "@/lib/auth";
import { readJson, route } from "@/lib/api";
import { deleteDestination, renameDestination } from "@/lib/destinations";

export const PATCH = route(async (req: Request, ctx: RouteContext<"/api/destinations/[id]">) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const { name } = await readJson<{ name: string }>(req);
  if (typeof name !== "string") throw new AuthError("Give the place a name.");
  return Response.json({ destination: await renameDestination(user.id, id, name) });
});

/** Deletes the destination and every spot in it. */
export const DELETE = route(async (_req: Request, ctx: RouteContext<"/api/destinations/[id]">) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  await deleteDestination(user.id, id);
  return Response.json({ ok: true });
});
