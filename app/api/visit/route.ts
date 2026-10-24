import { getCurrentUser } from "@/lib/auth";
import { arrivedVia, isVia } from "@/lib/activity";
import { readJson, route } from "@/lib/api";

/** Someone not signed in opened a friend's link (see CameVia). */
export const POST = route(async (req: Request) => {
  const { via } = await readJson<{ via: string }>(req);
  if (isVia(via) && !(await getCurrentUser())) await arrivedVia(via);
  return Response.json({ ok: true });
});
