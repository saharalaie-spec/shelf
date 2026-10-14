import { AuthError, requireUser } from "@/lib/auth";
import { readJson, route } from "@/lib/api";
import { removeItem, updateItem } from "@/lib/shelf";
import { isStatus, type Status } from "@/lib/types";

export const PATCH = route(async (req: Request, ctx: RouteContext<"/api/items/[id]">) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const body = await readJson<{ categories: string[]; status: Status; private: boolean }>(req);
  if (body.categories !== undefined && !Array.isArray(body.categories)) throw new AuthError("categories must be a list.");
  if (body.status !== undefined && !isStatus(body.status)) throw new AuthError("Unknown status.");
  if (body.private !== undefined && typeof body.private !== "boolean") throw new AuthError("private must be true or false.");
  const saved = await updateItem(user.id, id, {
    categories: body.categories?.map(String),
    status: body.status,
    private: body.private,
  });
  if (!saved) throw new AuthError("Not found.", 404);
  return Response.json(saved);
});

export const DELETE = route(async (_req: Request, ctx: RouteContext<"/api/items/[id]">) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  await removeItem(user.id, id);
  return Response.json({ ok: true });
});
