import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { aiEnabled } from "@/lib/ai";
import { getCurrentUser } from "@/lib/auth";
import { databaseUrl } from "@/lib/config";
import { startFrom } from "@/lib/start";
import { suggestEnabled } from "@/lib/suggest";
import { listItems } from "@/lib/trove";
import { Start } from "@/components/Start";
import { SetupNeeded } from "@/components/SetupNeeded";

export const metadata: Metadata = { title: "Get started · Trove" };

/** Getting started: from a friend's trove, one thing you loved per collection, then a quick deck. */
export default async function StartPage({ searchParams }: PageProps<"/start">) {
  if (!databaseUrl()) return <SetupNeeded />;
  const user = await getCurrentUser();
  if (!user) redirect("/");
  const from = (await searchParams).from;
  const [start, own] = await Promise.all([
    startFrom(user.id, typeof from === "string" ? from : null),
    listItems(user.id, { includePrivate: true }),
  ]);
  return (
    <Start
      name={user.name}
      from={start}
      mine={own.map((i) => ({ id: i.id, key: i.key, kind: i.kind, title: i.title, status: i.status }))}
      features={{ photo: aiEnabled(), deck: suggestEnabled() }}
    />
  );
}
