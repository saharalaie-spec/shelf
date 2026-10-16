import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth";
import { databaseUrl, signInChannels } from "@/lib/config";
import { incomingRequests } from "@/lib/social";
import { friendsTable } from "@/lib/table";
import { FriendsPage } from "@/components/FriendsPage";
import { Login } from "@/components/Login";
import { SetupNeeded } from "@/components/SetupNeeded";

export const metadata: Metadata = { title: "Friends · Trove" };

/** What your friends are into, and the people themselves. */
export default async function Friends() {
  if (!databaseUrl()) return <SetupNeeded />;
  const user = await getCurrentUser();
  if (!user) return <Login channels={signInChannels()} />;
  const [table, incoming] = await Promise.all([friendsTable(user.id), incomingRequests(user)]);
  return <FriendsPage name={user.name} pendingRequests={incoming.length} initialTable={table} />;
}
