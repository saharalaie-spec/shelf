"use client";

import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { Icon } from "./ui";

/** The people icon, to the Friends page, with a badge for friend requests waiting on you. */
export function FriendsButton({ pending }: { pending: number }) {
  return (
    <Link
      href="/friends"
      aria-label={pending ? `Friends, ${pending} new ${pending === 1 ? "request" : "requests"}` : "Friends"}
      className="relative flex h-10 w-10 items-center justify-center rounded-full bg-surface-2 transition-transform active:scale-95"
    >
      <Icon name="people" size={19} />
      <AnimatePresence>
        {pending > 0 && (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
            className="absolute -top-0.5 -right-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-accent px-1 text-[11px] font-semibold text-accent-ink tabular-nums"
          >
            {pending}
          </motion.span>
        )}
      </AnimatePresence>
    </Link>
  );
}

/** Your initial; opens the account sheet. */
export function AvatarButton({ name, contact, onClick }: { name: string | null; contact: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label="Account"
      className="ml-1 flex h-10 w-10 items-center justify-center rounded-full bg-accent font-serif text-[16px] text-accent-ink transition-transform active:scale-95"
    >
      {(name ?? contact).replace(/^\+/, "").charAt(0).toUpperCase() || "?"}
    </button>
  );
}
