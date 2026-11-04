"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ago, api } from "@/lib/client";
import type { Conversation } from "@/lib/messages";
import { Avatar, useHydrated } from "./ui";

/** Everyone you've written with in Trove, latest first, with what's new. */
export function MessagesList() {
  const hydrated = useHydrated();
  const [conversations, setConversations] = useState<Conversation[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    api<{ conversations: Conversation[] }>("/api/messages")
      .then((r) => !cancelled && setConversations(r.conversations))
      .catch((err) => toast.error(err.message));
    return () => {
      cancelled = true;
    };
  }, []);

  if (!conversations) {
    return (
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center gap-3 p-1">
            <div className="skeleton h-11 w-11 rounded-full" />
            <div className="flex-1 space-y-1.5">
              <div className="skeleton h-3.5 w-1/3 rounded" />
              <div className="skeleton h-3 w-2/3 rounded" />
            </div>
          </div>
        ))}
      </div>
    );
  }
  if (!conversations.length) {
    return (
      <p className="rounded-2xl border border-dashed border-line px-4 py-5 text-center text-[15px] leading-snug text-muted">
        Tap <span className="font-medium text-ink-2">Ask</span> on anything a friend has, on Lately or their page, and
        your conversation shows up here.
      </p>
    );
  }
  return (
    <ul className="-mx-2">
      {conversations.map(({ friend, last, unread }) => (
        <li key={friend.id}>
          <Link href={`/messages/${friend.id}`} className="flex items-center gap-3 rounded-2xl px-2 py-2.5 active:bg-surface-2">
            <Avatar name={friend.name} photo={friend.photo} size={44} />
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline justify-between gap-2">
                <span className={`truncate text-[16px] ${unread ? "font-semibold" : "font-medium"}`}>{friend.name ?? "Trove member"}</span>
                <span className="shrink-0 text-[12px] text-muted">{hydrated ? ago(last.at) : ""}</span>
              </span>
              <span className="flex items-center gap-2">
                <span className={`min-w-0 flex-1 truncate text-[14px] ${unread ? "text-ink" : "text-muted"}`}>
                  {last.mine ? "You: " : ""}
                  {last.body}
                </span>
                {unread > 0 && (
                  <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-accent px-1.5 text-[11px] font-semibold text-accent-ink">
                    {unread}
                  </span>
                )}
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
