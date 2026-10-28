import { readPhoto } from "@/lib/photos";

/** Someone's profile photo. Its URL changes with each new photo, so it can be cached for good. */
export async function GET(_req: Request, ctx: RouteContext<"/api/photos/[id]">) {
  const { id } = await ctx.params;
  const photo = await readPhoto(id);
  if (!photo) return new Response("No photo", { status: 404 });
  return new Response(photo.data as Uint8Array<ArrayBuffer>, {
    headers: {
      "Content-Type": photo.type,
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
