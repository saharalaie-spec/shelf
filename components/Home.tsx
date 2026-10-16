"use client";

import { motion } from "motion/react";
import Link from "next/link";
import { useCallback, useState } from "react";
import { VOCAB } from "@/lib/kinds";
import type { TodayCandidates } from "@/lib/today";
import type { Summary } from "@/lib/trove";
import { KINDS, STATUSES, type Kind } from "@/lib/types";
import { AccountSheet, type Profile } from "./AccountSheet";
import { Cover } from "./Cover";
import { SpotTile } from "./Spot";
import { TodayCard } from "./TodayCard";
import { AvatarButton, FriendsButton } from "./HeaderButtons";
import { Icon, KIND_ICON, Logo } from "./ui";

type Props = {
  user: Profile & { contact: string };
  pendingRequests: number;
  summaries: Record<Kind, Summary>;
  today: TodayCandidates;
};

/** Where you land after signing in: one card per collection. */
export function Home({ user, pendingRequests, summaries, today }: Props) {
  const [profile, setProfile] = useState<Profile>({
    id: user.id,
    name: user.name,
    handle: user.handle,
    isPublic: user.isPublic,
    shareActivity: user.shareActivity,
  });
  const [account, setAccount] = useState(false);
  const updateProfile = useCallback((patch: Partial<Profile>) => setProfile((p) => ({ ...p, ...patch })), []);

  const totals = KINDS.map((k) => STATUSES.reduce((n, s) => n + summaries[k].counts[s], 0));
  const total = totals.reduce((a, b) => a + b, 0);
  const hidden = KINDS.reduce((n, k) => n + summaries[k].hidden, 0);

  return (
    <div className="mx-auto min-h-dvh w-full max-w-3xl pb-16">
      <header className="flex h-16 items-center justify-between px-5 pt-[env(safe-area-inset-top)]">
        <div className="flex items-center gap-2">
          <Logo size={24} />
          <span className="font-serif text-[19px] font-semibold tracking-tight">Trove</span>
        </div>
        <div className="flex items-center gap-1">
          <FriendsButton pending={pendingRequests} />
          <AvatarButton name={profile.name} contact={user.contact} onClick={() => setAccount(true)} />
        </div>
      </header>

      <section className="px-5 pt-4 pb-6">
        <motion.h1
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="font-serif text-[38px] leading-[1.05] font-medium tracking-tight"
        >
          {profile.name ? `Hi, ${profile.name}` : "Your trove"}
        </motion.h1>
        <p className="mt-2 text-[16px] text-muted">
          {total ? "Pick a collection to add to or browse." : "Pick a collection and add a few favorites."}
        </p>
      </section>

      <TodayCard candidates={today} />

      <ul className="grid gap-3 px-5 sm:grid-cols-2">
        {KINDS.map((kind, i) => (
          <motion.li
            key={kind}
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 + i * 0.07, type: "spring", stiffness: 320, damping: 30 }}
          >
            <KindCard kind={kind} summary={summaries[kind]} />
          </motion.li>
        ))}
      </ul>

      <p className="mx-5 mt-6 flex gap-2 text-[13px] leading-snug text-muted">
        <Icon name="people" size={15} className="mt-px shrink-0" />
        Everything you add is visible to your friends. Make anything private from its page.
      </p>
      <AccountSheet
        open={account}
        onOpenChange={setAccount}
        profile={profile}
        contact={user.contact}
        countLabel={
          KINDS.map((k, i) => (totals[i] ? VOCAB[k].noun(totals[i]) : null))
            .filter(Boolean)
            .join(" · ") || "Nothing added yet"
        }
        privateCount={hidden}
        onProfile={updateProfile}
      />
    </div>
  );
}

function KindCard({ kind, summary }: { kind: Kind; summary: Summary }) {
  const v = VOCAB[kind];
  const { counts, covers, now } = summary;
  const total = counts.read + counts.reading + counts.want;
  const parts =
    kind === "place"
      ? // "20 spots in 4 places"
        [total && `${v.noun(total)}${summary.areas ? ` in ${summary.areas} ${summary.areas === 1 ? "place" : "places"}` : ""}`]
      : [
          counts.read && `${counts.read.toLocaleString()} ${v.sections.read.toLowerCase()}`,
          counts.reading && `${counts.reading.toLocaleString()} ${v.sections.reading.toLowerCase()}`,
          counts.want && `${counts.want.toLocaleString()} ${v.countSuffix.want}`,
        ];
  const summaryLine = parts.filter(Boolean).join(" · ");
  const square = v.shape === "square";
  const empty = !total;

  return (
    <Link
      href={`/${v.slug}`}
      className="relative flex h-48 overflow-hidden rounded-[28px] p-5 text-[#f6efe2] shadow-book transition-transform duration-200 active:scale-[0.98] sm:h-64"
      style={{ background: `linear-gradient(150deg, ${v.tint}, color-mix(in oklab, ${v.tint} 70%, black))` }}
    >
      <div className="relative z-10 flex min-w-0 flex-1 flex-col">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15">
          <Icon name={KIND_ICON[kind]} size={20} />
        </span>
        <h2 className="mt-auto font-serif text-[30px] leading-none font-medium tracking-tight">{v.label}</h2>
        <p className="mt-2 truncate text-[14px] text-white/75">
          {empty
            ? {
                book: "Add the books you’ve read",
                podcast: "Add the shows you love",
                screen: "Add what you’ve watched",
                place: "Add the spots you loved",
              }[kind]
            : summaryLine}
        </p>
        {now && (
          <p className="mt-0.5 truncate text-[14px] text-white/95">
            {v.nowVerb} {now}
          </p>
        )}
      </div>

      {/* A small fan of the latest covers in the top corner, clear of the text below. */}
      <div className="pointer-events-none absolute top-5 right-5 h-[88px] w-[150px]" aria-hidden>
        {(empty ? [null, null, null] : covers.slice(0, 3)).map((c, i, arr) => {
          const offset = arr.length - 1 - i;
          return (
            <div
              key={c?.key ?? i}
              className="absolute top-0"
              style={{
                right: offset * 34,
                width: square ? 66 : 56,
                transform: `rotate(${(offset - 1) * 7}deg) translateY(${offset * 4}px)`,
                zIndex: 10 - offset,
              }}
            >
              {c && kind === "place" ? (
                <SpotTile spot={c} size={66} className="!shadow-none" />
              ) : c ? (
                <Cover book={c} shape={v.shape} rounded={square ? "rounded-[7px]" : "rounded-[4px]"} />
              ) : (
                <div className={`${square ? "aspect-square rounded-[7px]" : "aspect-[2/3] rounded-[4px]"} border border-white/25 bg-white/10`} />
              )}
            </div>
          );
        })}
      </div>
    </Link>
  );
}
