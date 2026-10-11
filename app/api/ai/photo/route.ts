import { AuthError, requireUser } from "@/lib/auth";
import { aiEnabled, booksFromPhoto } from "@/lib/ai";
import { readJson, route } from "@/lib/api";

const TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export const POST = route(async (req: Request) => {
  await requireUser();
  if (!aiEnabled()) throw new AuthError("Photo recognition isn't set up on this server.", 501);
  const body = await readJson<{ image: string }>(req);
  const m = String(body.image ?? "").match(/^data:(image\/[a-z]+);base64,(.+)$/);
  const mediaType = m?.[1] as (typeof TYPES)[number] | undefined;
  if (!m || !mediaType || !TYPES.includes(mediaType)) throw new AuthError("Send a JPEG, PNG or WebP photo.");
  if (m[2].length > 7_000_000) throw new AuthError("That photo is too large.");
  return Response.json({ items: await booksFromPhoto(m[2], mediaType) });
});
