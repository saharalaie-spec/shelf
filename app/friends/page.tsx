import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth";
import { databaseUrl, signInChannels } from "@/lib/config";
import { unreadCount } from "@/lib/messages";
import { incomingRequests } from "@/lib/social";
import { refreshSampleFriendFor } from "@/lib/sample-friend";
import { friendsTable } from "@/lib/table";
import { FriendsPage, type FriendsTab } from "@/components/FriendsPage";
import { Login } from "@/components/Login";
import { SetupNeeded } from "@/components/SetupNeeded";

export const metadata: Metadata = { title: "Friends · Trove" };

const TABS = new Set<FriendsTab>(["table", "people", "messages"]);

/** What your friends are into, the people themselves, and your messages with them. */
export default async function Friends({ searchParams }: PageProps<"/friends">) {
  if (!databaseUrl()) return <SetupNeeded />;
  const user = await getCurrentUser();
  if (!user) return <Login channels={signInChannels()} />;
  await refreshSampleFriendFor(user.id);
  const [table, incoming, unread] = await Promise.all([friendsTable(user.id), incomingRequests(user), unreadCount(user.id)]);
  const tab = (await searchParams).tab;
  return (
    <FriendsPage
      name={user.name}
      pendingRequests={incoming.length}
      unreadMessages={unread}
      initialTable={table}
      initialTab={typeof tab === "string" && TABS.has(tab as FriendsTab) ? (tab as FriendsTab) : null}
    />
  );
}
