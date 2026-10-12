import { aiEnabled } from "@/lib/ai";
import { getCurrentUser } from "@/lib/auth";
import { databaseUrl, signInChannels } from "@/lib/config";
import { listBooks } from "@/lib/shelf";
import { incomingRequests } from "@/lib/social";
import { Login } from "@/components/Login";
import { SetupNeeded } from "@/components/SetupNeeded";
import { ShelfApp } from "@/components/ShelfApp";

export default async function Home() {
  if (!databaseUrl()) return <SetupNeeded />;
  const user = await getCurrentUser();
  if (!user) return <Login channels={signInChannels()} />;
  const [books, incoming] = await Promise.all([listBooks(user.id, { includePrivate: true }), incomingRequests(user)]);
  return (
    <ShelfApp
      user={{
        id: user.id,
        name: user.name,
        contact: user.email ?? user.phone ?? "",
        handle: user.handle,
        isPublic: user.isPublic,
      }}
      pendingRequests={incoming.length}
      initialBooks={books}
      features={{ photo: aiEnabled() }}
    />
  );
}
