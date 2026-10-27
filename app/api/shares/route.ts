import { requireUser } from "@/lib/auth";
import { origin, readJson, route } from "@/lib/api";
import { getOrCreateShare } from "@/lib/trove";
import { isKind, isShareStatus, type Kind, type ShareStatus } from "@/lib/types";

export const POST = route(async (req: Request) => {
  const user = await requireUser();
  const body = await readJson<{ kind: Kind; category: string | null; status: ShareStatus }>(req);
  const category = typeof body.category === "string" ? body.category.slice(0, 60) : "";
  const kind = isKind(body.kind) ? body.kind : "book";
  // Places are shared per destination, not per section. Anything else: one section, or "all" of it.
  const status = kind !== "place" && isShareStatus(body.status) ? body.status : "read";
  const slug = await getOrCreateShare(user.id, kind, status, category);
  return Response.json({ slug, url: `${origin(req)}/s/${slug}` });
});
