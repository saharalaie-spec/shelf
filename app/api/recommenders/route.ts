import { requireUser } from "@/lib/auth";
import { route } from "@/lib/api";
import { recommenders } from "@/lib/social";

/** Friends and names to offer for "who told you?". */
export const GET = route(async () => {
  const user = await requireUser();
  return Response.json(await recommenders(user.id));
});
