import type { Metadata } from "next";
import { after } from "next/server";
import { cache } from "react";
import { track } from "@/lib/activity";
import { getCurrentUser } from "@/lib/auth";
import { fillCovers } from "@/lib/covers";
import { databaseUrl, signInChannels } from "@/lib/config";
import { listDestinations } from "@/lib/destinations";
import { listItems } from "@/lib/trove";
import { accessTo, findPerson, pendingBetween } from "@/lib/social";
import type { Status } from "@/lib/types";
import { CameVia } from "@/components/CameVia";
import { Login } from "@/components/Login";
import { PrivateTrove } from "@/components/PrivateTrove";
import { ProfileTrove, type Relation } from "@/components/ProfileTrove";
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
  if (!person || access === "none") return { title: "Private profile · Trove", robots };
  const title = `${person.name ?? "Someone"} on Trove`;
  const description = `Books, podcasts, movies, shows and places ${person.name ?? "this person"} loves.`;
  return { title, description, robots, openGraph: { title, description, siteName: "Trove" } };
}

export default async function ProfilePage({ params, searchParams }: PageProps<"/u/[ref]">) {
  if (!databaseUrl()) return <SetupNeeded />;
  const { viewer, person, access } = await load((await params).ref);

  if (!person || access === "none") {
    // Maybe a friend on a new device: let them sign in right here.
    if (!viewer) {
      return (
        <Login channels={signInChannels()} heading="This trove is private" subheading="Only friends can see it. If that’s you, sign in." />
      );
    }
    return <PrivateTrove />;
  }

  // A friend's things without covers get them too, after the page is sent.
  after(() => fillCovers(person.id));
  const [books, own, destinations] = await Promise.all([
    listItems(person.id),
    viewer ? listItems(viewer.id, { includePrivate: true }) : Promise.resolve([]),
    listDestinations(person.id),
  ]);

  let relation: Relation;
  if (access === "self") relation = { kind: "self", hiddenCount: own.filter((b) => b.private).length };
  else if (access === "friend") {
    relation = { kind: "friend" };
    await track("friend_trove", { userId: viewer!.id, ref: person.id });
  }
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
    <>
      {!viewer && <CameVia via={`profile:${person.handle ?? person.id}`} />}
      <ProfileTrove
        person={{ id: person.id, name: person.name, handle: person.handle, isPublic: person.isPublic, photo: person.photo }}
        items={books}
        destinations={destinations}
        relation={relation}
        mine={mine}
        channels={signInChannels()}
        focusPlace={typeof (await searchParams).place === "string" ? String((await searchParams).place) : null}
      />
    </>
  );
}
