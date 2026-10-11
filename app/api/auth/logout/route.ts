import { signOut } from "@/lib/auth";
import { route } from "@/lib/api";

export const POST = route(async () => {
  await signOut();
  return Response.json({ ok: true });
});
