import { requireUser } from "@/lib/auth";
import { route } from "@/lib/api";
import { addSampleFriend } from "@/lib/sample-friend";

/** Adds Juno, the sample friend, so there's something on your Table before real friends join. */
export const POST = route(async () => {
  const user = await requireUser();
  await addSampleFriend(user.id);
  return Response.json({ ok: true });
});
