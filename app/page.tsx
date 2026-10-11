import { aiEnabled } from "@/lib/ai";
import { getCurrentUser } from "@/lib/auth";
import { databaseUrl, signInChannels } from "@/lib/config";
import { listBooks } from "@/lib/shelf";
import { Login } from "@/components/Login";
import { SetupNeeded } from "@/components/SetupNeeded";
import { ShelfApp } from "@/components/ShelfApp";

export default async function Home() {
  if (!databaseUrl()) return <SetupNeeded />;
  const user = await getCurrentUser();
  if (!user) return <Login channels={signInChannels()} />;
  const books = await listBooks(user.id);
  return (
    <ShelfApp
      user={{ name: user.name, contact: user.email ?? user.phone ?? "" }}
      initialBooks={books}
      features={{ photo: aiEnabled() }}
    />
  );
}
