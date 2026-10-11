import { AuthError, requireUser } from "@/lib/auth";
import { readJson, route } from "@/lib/api";
import { removeBook, updateCategories } from "@/lib/shelf";

export const PATCH = route(async (req: Request, ctx: RouteContext<"/api/books/[id]">) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const body = await readJson<{ categories: string[] }>(req);
  if (!Array.isArray(body.categories)) throw new AuthError("categories must be a list.");
  const categories = await updateCategories(user.id, id, body.categories.map(String));
  if (!categories) throw new AuthError("Book not found.", 404);
  return Response.json({ categories });
});

export const DELETE = route(async (_req: Request, ctx: RouteContext<"/api/books/[id]">) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  await removeBook(user.id, id);
  return Response.json({ ok: true });
});
