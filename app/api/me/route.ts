import { AuthError, requireUser } from "@/lib/auth";
import { readJson, route } from "@/lib/api";
import { updateProfile } from "@/lib/social";

/** Your name, whether your profile is public, and its link (`/u/<handle>`). */
export const PATCH = route(async (req: Request) => {
  const user = await requireUser();
  const body = await readJson<{ name: string; isPublic: boolean; handle: string | null }>(req);
  if (body.isPublic !== undefined && typeof body.isPublic !== "boolean") throw new AuthError("isPublic must be true or false.");
  if (body.handle !== undefined && body.handle !== null && typeof body.handle !== "string") throw new AuthError("Unknown link.");
  const saved = await updateProfile(user.id, {
    name: body.name === undefined ? undefined : String(body.name),
    isPublic: body.isPublic,
    handle: body.handle,
  });
  return Response.json(saved);
});
