import { requireUser } from "@/lib/auth";
import { readJson, route } from "@/lib/api";
import { markNoticesSeen } from "@/lib/notices";

/** Put away news about friends. */
export const POST = route(async (req: Request) => {
  const user = await requireUser();
  const body = await readJson<{ ids: string[] }>(req);
  await markNoticesSeen(user.id, Array.isArray(body.ids) ? body.ids.filter((i) => typeof i === "string") : []);
  return Response.json({ ok: true });
});
