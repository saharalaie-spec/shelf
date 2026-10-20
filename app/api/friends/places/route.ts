import { AuthError, requireUser } from "@/lib/auth";
import { readJson, route } from "@/lib/api";
import { cleanArea } from "@/lib/destinations";
import { friendsIn } from "@/lib/friend-places";

/** Friends who know a place (any city from the map), and the spots they share there. */
export const POST = route(async (req: Request) => {
  const user = await requireUser();
  const area = cleanArea((await readJson<{ area: unknown }>(req)).area);
  if (!area) throw new AuthError("Which place?");
  return Response.json({ friends: await friendsIn(user.id, area) });
});
