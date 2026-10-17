import { AuthError, requireUser } from "@/lib/auth";
import { origin, readJson, route } from "@/lib/api";
import {
  accessTo,
  findPerson,
  incomingRequests,
  inviteToken,
  listFriends,
  outgoingRequests,
  requestByIdentifier,
  requestByUserId,
} from "@/lib/social";
import { starterPicks } from "@/lib/start";

export const GET = route(async (req: Request) => {
  const user = await requireUser();
  const [friends, incoming, outgoing, token, picks] = await Promise.all([
    listFriends(user.id),
    incomingRequests(user),
    outgoingRequests(user.id),
    inviteToken(user.id),
    starterPicks(user.id),
  ]);
  return Response.json({ friends, incoming, outgoing, inviteUrl: `${origin(req)}/f/${token}`, picks });
});

/** Ask to be friends: by phone number or email, or by user id from a public profile. */
export const POST = route(async (req: Request) => {
  const user = await requireUser();
  const body = await readJson<{ identifier: string; country: string; userId: string }>(req);
  if (typeof body.userId === "string") {
    // Only public profiles show an Add friend button; private ones don't admit they exist.
    const target = await findPerson(body.userId);
    if (!target || (await accessTo(user.id, target)) === "none") throw new AuthError("That person isn’t on Trove.", 404);
    return Response.json(await requestByUserId(user, target.id));
  }
  if (typeof body.identifier !== "string") throw new AuthError("Enter a phone number or email.");
  const country = typeof body.country === "string" ? body.country : undefined;
  return Response.json(await requestByIdentifier(user, body.identifier, country));
});
