import { AuthError, requireUser } from "@/lib/auth";
import { route } from "@/lib/api";
import { MAX_PHOTO_BYTES, removePhoto, savePhoto } from "@/lib/photos";

/** Your profile photo: send one to set it. */
export const POST = route(async (req: Request) => {
  const user = await requireUser();
  const form = await req.formData().catch(() => null);
  const file = form?.get("photo");
  if (!(file instanceof Blob) || !file.size) throw new AuthError("Choose a photo.");
  if (file.size > MAX_PHOTO_BYTES) throw new AuthError("That photo is too big. Try another.");
  const photo = await savePhoto(user.id, new Uint8Array(await file.arrayBuffer()));
  if (!photo) throw new AuthError("That doesn’t look like a photo. Try a JPEG or PNG.");
  return Response.json({ photo });
});

export const DELETE = route(async () => {
  const user = await requireUser();
  await removePhoto(user.id);
  return Response.json({ photo: null });
});
