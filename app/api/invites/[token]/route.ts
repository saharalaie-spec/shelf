import { requireUser } from "@/lib/auth";
import { route } from "@/lib/api";
import { acceptInvite, profileRef } from "@/lib/social";

export const POST = route(async (_req: Request, ctx: RouteContext<"/api/invites/[token]">) => {
  const user = await requireUser();
  const { token } = await ctx.params;
  const inviter = await acceptInvite(user, token);
  return Response.json({ friend: inviter, ref: profileRef(inviter) });
});
