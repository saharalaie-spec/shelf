import { requireUser } from "@/lib/auth";
import { route } from "@/lib/api";
import { friendsIn } from "@/lib/friend-places";

/** `?dest=<your place>`: friends who know it, and the spots they share there. */
export const GET = route(async (req: Request) => {
  const user = await requireUser();
  const dest = new URL(req.url).searchParams.get("dest") ?? "";
  return Response.json({ friends: await friendsIn(user.id, dest) });
});
