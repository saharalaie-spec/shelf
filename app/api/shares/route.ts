import { requireUser } from "@/lib/auth";
import { origin, readJson, route } from "@/lib/api";
import { getOrCreateShare } from "@/lib/shelf";
import { isStatus, type Status } from "@/lib/types";

export const POST = route(async (req: Request) => {
  const user = await requireUser();
  const body = await readJson<{ category: string | null; status: Status }>(req);
  const category = typeof body.category === "string" ? body.category.slice(0, 60) : "";
  const slug = await getOrCreateShare(user.id, isStatus(body.status) ? body.status : "read", category);
  return Response.json({ slug, url: `${origin(req)}/s/${slug}` });
});
