"use client";

import { motion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { api, trackAction } from "@/lib/client";
import { Avatar, Button, Icon, Wordmark } from "./ui";

type Props = {
  token: string;
  inviter: { name: string | null; photo: string | null };
  viewerName: string | null;
  own: boolean;
  /** Just joined: start from the inviter's trove instead of landing on it. */
  newcomer: boolean;
};

/** Someone's invite link, opened by a signed-in person: one tap and you're friends. */
export function Invite({ token, inviter, viewerName, own, newcomer }: Props) {
  const router = useRouter();
  const [joining, setJoining] = useState(false);
  // New here? Ask for a name, so the inviter's friend list doesn't say "Trove member".
  const [name, setName] = useState("");
  const needsName = !viewerName;
  const who = inviter.name ?? "Your friend";

  const accept = async () => {
    setJoining(true);
    try {
      if (needsName && name.trim()) await api("/api/me", { method: "PATCH", body: { name: name.trim() } });
      const { ref } = await api<{ ref: string }>(`/api/invites/${token}`, { body: {} });
      toast(`You and ${inviter.name ?? "your friend"} are friends now`);
      router.replace(newcomer ? `/start?from=${encodeURIComponent(ref)}` : `/u/${ref}`);
    } catch (err) {
      toast.error((err as Error).message);
      setJoining(false);
    }
  };

  const copy = async () => {
    await navigator.clipboard.writeText(window.location.href);
    trackAction("invite_share", "copy");
    toast("Invite link copied");
  };

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-6 pb-safe">
      <header className="flex h-16 items-center pt-[env(safe-area-inset-top)]">
        <Link href="/" className="flex items-center gap-2">
          <Wordmark size={24} />
        </Link>
      </header>
      <motion.main
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        className="flex flex-1 flex-col items-center justify-center pb-[10vh] text-center"
      >
        <Avatar name={inviter.name} photo={inviter.photo} size={80} />
        {own ? (
          <>
            <h1 className="mt-6 font-serif text-[32px] leading-tight font-medium tracking-tight text-balance">This is your invite link</h1>
            <p className="mt-2 max-w-xs text-[16px] text-muted">
              Send it to friends. Whoever opens it can become your friend with one tap.
            </p>
            <Button onClick={copy} className="mt-8 w-full" icon={<Icon name="copy" size={18} />}>
              Copy link
            </Button>
            <Link href="/" className="mt-2 flex h-12 w-full items-center justify-center rounded-full text-[16px] font-medium text-ink-2 active:bg-surface-2">
              Back to your trove
            </Link>
          </>
        ) : (
          <>
            <h1 className="mt-6 font-serif text-[32px] leading-tight font-medium tracking-tight text-balance">
              {who} wants to be friends
            </h1>
            <p className="mt-2 max-w-xs text-[16px] text-muted">
              You’ll see each other’s books, podcasts, movies and shows. Anything marked private stays private.
            </p>
            {needsName && (
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && accept()}
                placeholder="Your first name"
                aria-label="Your first name"
                autoComplete="given-name"
                maxLength={40}
                className="mt-8 h-14 w-full rounded-2xl border border-line bg-surface px-4 text-center text-[17px] outline-none focus:border-ink"
              />
            )}
            <Button
              onClick={accept}
              loading={joining}
              disabled={needsName && !name.trim()}
              className={`${needsName ? "mt-3" : "mt-8"} h-14 w-full`}
              icon={<Icon name="people" size={19} />}
            >
              Become friends
            </Button>
            <Link href="/" className="mt-2 flex h-12 w-full items-center justify-center rounded-full text-[16px] font-medium text-ink-2 active:bg-surface-2">
              Not now
            </Link>
          </>
        )}
      </motion.main>
    </div>
  );
}
