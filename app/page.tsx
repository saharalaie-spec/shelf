import { getCurrentUser } from "@/lib/auth";
import { databaseUrl, signInChannels } from "@/lib/config";
import { listDestinations } from "@/lib/destinations";
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
  const [summaries, incoming, destinations] = await Promise.all([
    summarize(user.id, { includePrivate: true }),
    incomingRequests(user),
    listDestinations(user.id, { includePrivate: true, includeEmpty: true }),
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
      }}
      pendingRequests={incoming.length}
      summaries={summaries}
      today={today}
    />
  );
}
