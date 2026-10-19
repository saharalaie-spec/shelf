import { requireUser } from "@/lib/auth";
import { readJson, route } from "@/lib/api";
import { markThanksSeen } from "@/lib/thanks";

/** Put away notes from friends. */
export const POST = route(async (req: Request) => {
  const user = await requireUser();
  const body = await readJson<{ ids: string[] }>(req);
  await markThanksSeen(user.id, Array.isArray(body.ids) ? body.ids.filter((i) => typeof i === "string") : []);
  return Response.json({ ok: true });
});
