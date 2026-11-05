import { requireUser } from "@/lib/auth";
import { route } from "@/lib/api";
import { addSampleFriend } from "@/lib/sample-friend";

/** Adds your Juno, an imaginary friend, so there's something on Lately before real friends join. */
export const POST = route(async () => {
  const user = await requireUser();
  await addSampleFriend(user.id);
  return Response.json({ ok: true });
});
