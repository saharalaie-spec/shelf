import { signOut } from "@/lib/auth";
import { readJson, route } from "@/lib/api";

export const POST = route(async (req: Request) => {
  const body = await readJson<{ everywhere: boolean }>(req);
  await signOut({ everywhere: body.everywhere === true });
  return Response.json({ ok: true });
});
