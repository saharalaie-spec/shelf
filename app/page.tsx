import { getCurrentUser } from "@/lib/auth";
import { databaseUrl, signInChannels } from "@/lib/config";
import { summarize } from "@/lib/shelf";
import { incomingRequests } from "@/lib/social";
import { Home } from "@/components/Home";
import { Login } from "@/components/Login";
import { SetupNeeded } from "@/components/SetupNeeded";

export default async function HomePage() {
  if (!databaseUrl()) return <SetupNeeded />;
  const user = await getCurrentUser();
  if (!user) return <Login channels={signInChannels()} />;
  const [summaries, incoming] = await Promise.all([summarize(user.id, { includePrivate: true }), incomingRequests(user)]);
  return (
    <Home
      user={{
        id: user.id,
        name: user.name,
        contact: user.email ?? user.phone ?? "",
        handle: user.handle,
        isPublic: user.isPublic,
      }}
      pendingRequests={incoming.length}
      summaries={summaries}
    />
  );
}
