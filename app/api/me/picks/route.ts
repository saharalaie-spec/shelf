import { AuthError, requireUser } from "@/lib/auth";
import { readJson, route } from "@/lib/api";
import { setStarterPicks } from "@/lib/start";

/** The few things you pick for people who join through your invite link. */
export const PUT = route(async (req: Request) => {
  const user = await requireUser();
  const body = await readJson<{ itemIds: string[] }>(req);
  if (!Array.isArray(body.itemIds) || body.itemIds.some((id) => typeof id !== "string")) throw new AuthError("Pick some things.");
  return Response.json({ itemIds: await setStarterPicks(user.id, body.itemIds) });
});
