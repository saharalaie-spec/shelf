import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { aiEnabled } from "@/lib/ai";
import { getCurrentUser } from "@/lib/auth";
import { databaseUrl, signInChannels } from "@/lib/config";
import { kindFromSlug, vocab } from "@/lib/kinds";
import { listDestinations } from "@/lib/destinations";
import { listItems } from "@/lib/shelf";
import { incomingRequests } from "@/lib/social";
import { Login } from "@/components/Login";
import { SetupNeeded } from "@/components/SetupNeeded";
import { ShelfApp } from "@/components/ShelfApp";

export async function generateMetadata({ params }: PageProps<"/[kind]">): Promise<Metadata> {
  const kind = kindFromSlug((await params).kind);
  return kind ? { title: `${vocab(kind).label} · Shelf` } : {};
}

/** One collection: /books, /podcasts, /movies or /places. */
export default async function CollectionPage({ params }: PageProps<"/[kind]">) {
  const kind = kindFromSlug((await params).kind);
  if (!kind) notFound();
  if (!databaseUrl()) return <SetupNeeded />;
  const user = await getCurrentUser();
  if (!user) return <Login channels={signInChannels()} />;
  const [items, incoming, destinations] = await Promise.all([
    listItems(user.id, { kind, includePrivate: true }),
    incomingRequests(user),
    kind === "place" ? listDestinations(user.id, { includePrivate: true, includeEmpty: true }) : Promise.resolve([]),
  ]);
  return (
    <ShelfApp
      // A fresh shelf per collection, so state never leaks from one to the next.
      key={kind}
      kind={kind}
      user={{
        id: user.id,
        name: user.name,
        contact: user.email ?? user.phone ?? "",
        handle: user.handle,
        isPublic: user.isPublic,
      }}
      pendingRequests={incoming.length}
      initialItems={items}
      initialDestinations={destinations}
      features={{ photo: aiEnabled() }}
    />
  );
}
