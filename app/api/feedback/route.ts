import { requireUser } from "@/lib/auth";
import { readJson, route } from "@/lib/api";
import { saveFeedback } from "@/lib/feedback";

/** A few words for whoever runs Trove. */
export const POST = route(async (req: Request) => {
  const user = await requireUser();
  const body = await readJson<{ text: string; page: string }>(req);
  await saveFeedback(user, typeof body.text === "string" ? body.text : "", typeof body.page === "string" ? body.page : null);
  return Response.json({ ok: true });
});
