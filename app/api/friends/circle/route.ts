import { AuthError, requireUser } from "@/lib/auth";
import { readJson, route } from "@/lib/api";
import { setCircle } from "@/lib/social";

/** Add a friend to your circle, or take them out. Nobody is told either way. */
export const POST = route(async (req: Request) => {
  const user = await requireUser();
  const body = await readJson<{ friendId: string; on: boolean }>(req);
  if (typeof body.friendId !== "string" || typeof body.on !== "boolean") throw new AuthError("Pick a friend.");
  return Response.json({ inCircle: await setCircle(user.id, body.friendId, body.on) });
});
