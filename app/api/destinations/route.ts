import { AuthError, requireUser } from "@/lib/auth";
import { readJson, route } from "@/lib/api";
import { findOrCreateDestination, listDestinations, type NewDestination } from "@/lib/destinations";

export const GET = route(async () => {
  const user = await requireUser();
  return Response.json({ destinations: await listDestinations(user.id, { includePrivate: true, includeEmpty: true }) });
});

/** Adds a destination (or returns the one with that name you already have). */
export const POST = route(async (req: Request) => {
  const user = await requireUser();
  const body = await readJson<NewDestination>(req);
  if (typeof body.name !== "string") throw new AuthError("Give the place a name.");
  const destination = await findOrCreateDestination(user.id, {
    name: body.name,
    country: typeof body.country === "string" ? body.country : null,
    label: typeof body.label === "string" ? body.label : null,
    lat: typeof body.lat === "number" ? body.lat : null,
    lon: typeof body.lon === "number" ? body.lon : null,
    bbox: Array.isArray(body.bbox) ? body.bbox : null,
  });
  return Response.json({ destination: { ...destination, count: 0 } });
});
