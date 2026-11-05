import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { databaseUrl, siteUrl } from "@/lib/config";
import { giveJuno } from "@/lib/sample-friend";
import { inviteToken } from "@/lib/social";
import { startFrom } from "@/lib/start";
import { suggestEnabled } from "@/lib/suggest";
import { listItems } from "@/lib/trove";
import { Start } from "@/components/Start";
import { SetupNeeded } from "@/components/SetupNeeded";

export const metadata: Metadata = { title: "Get started · Trove" };

/** Getting started: two things you loved per collection, the inviter's trove (if invited), a quick deck, then inviting friends. */
export default async function StartPage({ searchParams }: PageProps<"/start">) {
  if (!databaseUrl()) return <SetupNeeded />;
  const user = await getCurrentUser();
  if (!user) redirect("/");
  // Everyone who joins has Juno, an imaginary friend; her taste grows from what they pick here.
  if (!user.started) await giveJuno(user.id);
  const from = (await searchParams).from;
  const ref = typeof from === "string" ? from : null;
  const [start, own, token] = await Promise.all([
    startFrom(user.id, ref),
    listItems(user.id, { includePrivate: true }),
    inviteToken(user.id),
  ]);
  return (
    <Start
      name={user.name}
      from={start}
      invited={Boolean(ref && start && (start.friend.id === ref || start.friend.handle === ref))}
      mine={own.map((i) => ({ id: i.id, key: i.key, kind: i.kind, title: i.title, status: i.status }))}
      features={{ deck: suggestEnabled() }}
      inviteToken={token}
      siteUrl={siteUrl()}
    />
  );
}
