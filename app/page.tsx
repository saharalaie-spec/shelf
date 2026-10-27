import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { fillCovers } from "@/lib/covers";
import { databaseUrl, isOwner, signInChannels } from "@/lib/config";
import { listDestinations } from "@/lib/destinations";
import { refreshSampleFriendFor } from "@/lib/sample-friend";
import { suggestEnabled } from "@/lib/suggest";
import { unseenThanks } from "@/lib/thanks";
import { todayCandidates } from "@/lib/today";
import { summarize } from "@/lib/trove";
import { incomingRequests } from "@/lib/social";
import { Home } from "@/components/Home";
import { Login } from "@/components/Login";
import { SetupNeeded } from "@/components/SetupNeeded";

export default async function HomePage() {
  if (!databaseUrl()) return <SetupNeeded />;
  const user = await getCurrentUser();
  if (!user) return <Login channels={signInChannels()} />;
  // New here: get started first (it can be skipped).
  if (!user.started) redirect("/start");
  await refreshSampleFriendFor(user.id);
  // Anything saved without a cover gets one looked up, after the page is sent.
  after(() => fillCovers(user.id));
  const [summaries, incoming, destinations, thanks] = await Promise.all([
    summarize(user.id, { includePrivate: true }),
    incomingRequests(user),
    listDestinations(user.id, { includePrivate: true, includeEmpty: true }),
    unseenThanks(user.id),
  ]);
  const today = await todayCandidates(user.id, new Map(destinations.map((d) => [d.id, d.name])));
  return (
    <Home
      user={{
        id: user.id,
        name: user.name,
        contact: user.email ?? user.phone ?? "",
        handle: user.handle,
        isPublic: user.isPublic,
        shareActivity: user.shareActivity,
        owner: isOwner(user),
      }}
      pendingRequests={incoming.length}
      summaries={summaries}
      today={today}
      thanks={thanks}
      suggest={suggestEnabled()}
    />
  );
}
