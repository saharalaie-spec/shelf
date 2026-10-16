"use client";

import { motion } from "motion/react";
import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/client";
import type { FriendsTable } from "@/lib/table";
import { FriendsPanel } from "./FriendsPanel";
import { FriendsTableView } from "./FriendsTable";
import { Logo } from "./ui";

type Tab = "table" | "people";

type Props = {
  name: string | null;
  pendingRequests: number;
  initialTable: FriendsTable;
};

/** The friends section: the Table (what friends are into) and People (invites, requests, your circle). */
export function FriendsPage({ name: initialName, pendingRequests, initialTable }: Props) {
  const [name, setName] = useState(initialName);
  const [pending, setPending] = useState(pendingRequests);
  const [table, setTable] = useState(initialTable);
  // Requests waiting, or nobody to show yet: start on People.
  const [tab, setTab] = useState<Tab>(pendingRequests > 0 || initialTable.friendCount === 0 ? "people" : "table");

  const reloadTable = () => api<FriendsTable>("/api/friends/table").then(setTable).catch(() => {});

  return (
    <div className="mx-auto min-h-dvh w-full max-w-3xl pb-24">
      <header className="sticky top-0 z-20 bg-paper/85 px-5 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur-xl">
        <div className="flex h-12 items-center gap-1.5">
          <Link href="/" aria-label="Your trove" className="-ml-1.5 flex h-10 w-9 shrink-0 items-center justify-center rounded-full active:bg-surface-2">
            <Logo size={24} />
          </Link>
          <h1 className="font-serif text-[24px] font-semibold tracking-tight">Friends</h1>
        </div>
        <div className="flex gap-1 rounded-full bg-surface-2 p-1 text-[14px] font-medium" role="tablist">
          {(
            [
              ["table", "Lately"],
              ["people", pending ? `People · ${pending} new` : "People"],
            ] as const
          ).map(([t, label]) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className="relative flex h-9 flex-1 items-center justify-center rounded-full"
            >
              {tab === t && (
                <motion.span
                  layoutId="friends-tab-pill"
                  className="absolute inset-0 rounded-full bg-surface shadow-book"
                  transition={{ type: "spring", bounce: 0.15, duration: 0.4 }}
                />
              )}
              <span className={`relative ${tab === t ? "text-ink" : "text-muted"}`}>{label}</span>
            </button>
          ))}
        </div>
        <div className="h-3" />
      </header>

      <main className="px-5 pt-3">
        {tab === "table" ? (
          <>
            <p className="mb-5 text-[15px] text-muted">What your friends are into lately. Your circle comes first.</p>
            <FriendsTableView table={table} onFindFriends={() => setTab("people")} />
          </>
        ) : (
          <FriendsPanel name={name} onName={setName} onPending={setPending} onCircle={reloadTable} />
        )}
      </main>
    </div>
  );
}
