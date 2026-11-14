import { appleTeamId } from "@/lib/config";

/**
 * Tells iPhones which links open in the Trove app instead of Safari: invites (/f/…), friends' pages (/u/…) and shared
 * lists (/s/…). Needs APPLE_TEAM_ID, and the app's Associated Domains (applinks:mytrove.me); see APP.md.
 */
export function GET() {
  const team = appleTeamId();
  if (!team) return new Response("Not set up", { status: 404 });
  return Response.json({
    applinks: {
      details: [{ appIDs: [`${team}.me.mytrove.app`], components: [{ "/": "/f/*" }, { "/": "/u/*" }, { "/": "/s/*" }] }],
    },
  });
}
