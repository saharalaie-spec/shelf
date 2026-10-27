import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getCurrentUser } from "@/lib/auth";
import { databaseUrl, signInChannels } from "@/lib/config";
import { areFriends, findInviter, profileRef } from "@/lib/social";
import { CameVia } from "@/components/CameVia";
import { Invite } from "@/components/Invite";
import { Login } from "@/components/Login";
import { SetupNeeded } from "@/components/SetupNeeded";

const inviterFor = cache(findInviter);

export async function generateMetadata({ params }: PageProps<"/f/[token]">): Promise<Metadata> {
  if (!databaseUrl()) return {};
  const inviter = await inviterFor((await params).token);
  const robots = { index: false, follow: false };
  if (!inviter) return { title: "Trove", robots };
  const title = `${inviter.name ?? "A friend"} invited you to Trove`;
  const description = "Be friends on Trove and see each other’s favorite books, podcasts, shows and places.";
  return { title, description, robots, openGraph: { title, description, siteName: "Trove" } };
}

export default async function InvitePage({ params }: PageProps<"/f/[token]">) {
  if (!databaseUrl()) return <SetupNeeded />;
  const { token } = await params;
  const [inviter, viewer] = await Promise.all([inviterFor(token), getCurrentUser()]);

  if (!inviter) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 text-center">
        <h1 className="font-serif text-[30px] leading-tight font-medium tracking-tight">This invite link doesn’t work</h1>
        <p className="mt-2 text-[16px] text-muted">Ask your friend to send it again.</p>
        <Link href="/" className="mt-8 inline-flex h-12 items-center rounded-full bg-accent px-6 text-[16px] font-medium text-accent-ink">
          Go to Trove
        </Link>
      </main>
    );
  }

  if (!viewer) {
    return (
      <>
        <CameVia via={`invite:${token}`} />
        <Login
          channels={signInChannels()}
          heading={`${inviter.name ?? "A friend"} invited you to Trove`}
          subheading="Sign in to be friends and see each other’s books."
        />
      </>
    );
  }

  if (viewer.id !== inviter.id && (await areFriends(viewer.id, inviter.id))) redirect(`/u/${profileRef(inviter)}`);
  return (
    <Invite token={token} inviter={{ name: inviter.name, photo: inviter.photo }} viewerName={viewer.name} own={viewer.id === inviter.id} newcomer={!viewer.started} />
  );
}
