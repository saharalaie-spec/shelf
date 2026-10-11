import { requireUser } from "@/lib/auth";
import { readJson, route } from "@/lib/api";
import { setName } from "@/lib/shelf";

export const PATCH = route(async (req: Request) => {
  const user = await requireUser();
  const body = await readJson<{ name: string }>(req);
  const name = await setName(user.id, String(body.name ?? ""));
  return Response.json({ name });
});
