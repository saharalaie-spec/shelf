import { requireUser } from "@/lib/auth";
import { route } from "@/lib/api";
import { markStarted } from "@/lib/start";

/** Getting started is done (or skipped): home from now on. */
export const POST = route(async () => {
  const user = await requireUser();
  await markStarted(user.id);
  return Response.json({ ok: true });
});
