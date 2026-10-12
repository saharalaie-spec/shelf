import type { Metadata } from "next";
import { cache } from "react";
import { getCurrentUser } from "@/lib/auth";
import { databaseUrl, signInChannels } from "@/lib/config";
import { listBooks } from "@/lib/shelf";
import { accessTo, findPerson, pendingBetween } from "@/lib/social";
import type { Status } from "@/lib/types";
import { Login } from "@/components/Login";
import { PrivateShelf } from "@/components/PrivateShelf";
import { ProfileShelf, type Relation } from "@/components/ProfileShelf";
import { SetupNeeded } from "@/components/SetupNeeded";

/** Who's looking, whose profile it is, and whether they may see it. Shared by metadata and the page. */
const load = cache(async (ref: string) => {
  const [viewer, person] = await Promise.all([getCurrentUser(), findPerson(ref)]);
  const access = person ? await accessTo(viewer?.id ?? null, person) : "none";
  return { viewer, person, access };
});

export async function generateMetadata({ params }: PageProps<"/u/[ref]">): Promise<Metadata> {
  if (!databaseUrl()) return {};
  const { person, access } = await load((await params).ref);
  // Profiles are reachable by link only; keep them out of search engines either way.
  const robots = { index: false, follow: false };
  if (!person || access === "none") return { title: "Private shelf · Shelf", robots };
  const title = `${person.name ?? "A reader"} on Shelf`;
  const description = `Books ${person.name ?? "this reader"} has read, is reading and wants to read.`;
  return { title, description, robots, openGraph: { title, description, siteName: "Shelf" } };
}

export default async function ProfilePage({ params }: PageProps<"/u/[ref]">) {
  if (!databaseUrl()) return <SetupNeeded />;
  const { viewer, person, access } = await load((await params).ref);

  if (!person || access === "none") {
    // Maybe a friend on a new device: let them sign in right here.
    if (!viewer) {
      return (
        <Login channels={signInChannels()} heading="This shelf is private" subheading="Only friends can see it. If that’s you, sign in." />
      );
    }
    return <PrivateShelf />;
  }

  const [books, own] = await Promise.all([
    listBooks(person.id),
    viewer ? listBooks(viewer.id, { includePrivate: true }) : Promise.resolve([]),
  ]);

  let relation: Relation;
  if (access === "self") relation = { kind: "self", hiddenCount: own.filter((b) => b.private).length };
  else if (access === "friend") relation = { kind: "friend" };
  else if (!viewer) relation = { kind: "signed-out" };
  else {
    const pending = await pendingBetween(viewer, person.id);
    relation = pending.receivedId
      ? { kind: "asked-you", requestId: pending.receivedId }
      : pending.sentId
        ? { kind: "requested" }
        : { kind: "stranger" };
  }

  const mine: Record<string, Status> = access === "self" ? {} : Object.fromEntries(own.map((b) => [b.key, b.status]));
  return (
    <ProfileShelf
      person={{ id: person.id, name: person.name, handle: person.handle, isPublic: person.isPublic }}
      books={books}
      relation={relation}
      mine={mine}
      channels={signInChannels()}
    />
  );
}
