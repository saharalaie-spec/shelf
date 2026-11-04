import { requireUser } from "@/lib/auth";
import { route } from "@/lib/api";
import { readThread } from "@/lib/messages";

/** Everything between you and one friend; reading it marks their messages as read. */
export const GET = route(async (_req: Request, ctx: RouteContext<"/api/messages/[id]">) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  return Response.json({ messages: await readThread(user.id, id) });
});
