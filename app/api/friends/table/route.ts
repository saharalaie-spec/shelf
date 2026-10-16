import { requireUser } from "@/lib/auth";
import { route } from "@/lib/api";
import { friendsTable } from "@/lib/table";

/** What your friends are into, grouped by the thing. */
export const GET = route(async () => {
  const user = await requireUser();
  return Response.json(await friendsTable(user.id));
});
