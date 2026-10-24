import { requireUser } from "@/lib/auth";
import { CLIENT_ACTIONS, track, type Action } from "@/lib/activity";
import { readJson, route } from "@/lib/api";

/** Something the browser saw happen, for the numbers page: an invite shared, "Stuck on what's next?" opened. */
export const POST = route(async (req: Request) => {
  const user = await requireUser();
  const { action, ref } = await readJson<{ action: Action; ref: string }>(req);
  if (action && CLIENT_ACTIONS.has(action)) {
    await track(action, { userId: user.id, ref: typeof ref === "string" ? ref.slice(0, 40) : null });
  }
  return Response.json({ ok: true });
});
