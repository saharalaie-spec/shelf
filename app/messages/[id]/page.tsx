import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { databaseUrl, signInChannels } from "@/lib/config";
import { readThread } from "@/lib/messages";
import { isSampleId } from "@/lib/sample";
import { areFriends, findPerson } from "@/lib/social";
import { Login } from "@/components/Login";
import { MessageThread } from "@/components/MessageThread";
import { SetupNeeded } from "@/components/SetupNeeded";

export const metadata: Metadata = { title: "Messages · Trove", robots: { index: false, follow: false } };

/** You and one friend. Only the two of you can open it; for anyone else it doesn't exist. */
export default async function Conversation({ params }: PageProps<"/messages/[id]">) {
  if (!databaseUrl()) return <SetupNeeded />;
  const user = await getCurrentUser();
  if (!user) return <Login channels={signInChannels()} />;
  const friend = await findPerson((await params).id);
  if (!friend || friend.id === user.id) notFound();
  const [friends, messages] = await Promise.all([areFriends(user.id, friend.id), readThread(user.id, friend.id)]);
  if (!friends && !messages.length) notFound();
  return (
    <MessageThread
      friend={{ id: friend.id, name: friend.name, handle: friend.handle, photo: friend.photo }}
      initial={messages}
      canSend={friends}
      sample={isSampleId(friend.id)}
    />
  );
}
