import { AuthError, requireUser } from "@/lib/auth";
import { readJson, route } from "@/lib/api";
import { updateProfile } from "@/lib/social";

/** Your name, whether your profile is public, its link (`/u/<handle>`), and whether friends see what you're into. */
export const PATCH = route(async (req: Request) => {
  const user = await requireUser();
  const body = await readJson<{ name: string; isPublic: boolean; handle: string | null; shareActivity: boolean }>(req);
  if (body.isPublic !== undefined && typeof body.isPublic !== "boolean") throw new AuthError("isPublic must be true or false.");
  if (body.shareActivity !== undefined && typeof body.shareActivity !== "boolean") {
    throw new AuthError("shareActivity must be true or false.");
  }
  if (body.handle !== undefined && body.handle !== null && typeof body.handle !== "string") throw new AuthError("Unknown link.");
  const saved = await updateProfile(user.id, {
    name: body.name === undefined ? undefined : String(body.name),
    isPublic: body.isPublic,
    handle: body.handle,
    shareActivity: body.shareActivity,
  });
  return Response.json(saved);
});
