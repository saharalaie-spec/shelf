import { requireUser } from "@/lib/auth";
import { readJson, route } from "@/lib/api";
import { sendThanks } from "@/lib/thanks";

/** Tell the friend who recommended this that you loved it. */
export const POST = route(async (req: Request, ctx: RouteContext<"/api/items/[id]/thanks">) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const body = await readJson<{ message: string }>(req);
  return Response.json(await sendThanks(user.id, id, typeof body.message === "string" ? body.message : null));
});
