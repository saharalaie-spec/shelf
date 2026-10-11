"use client";

import { useEffect, useState } from "react";
import { api, plural } from "@/lib/client";
import { Sheet } from "./Sheet";
import { Button } from "./ui";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  name: string | null;
  contact: string;
  count: number;
  onName: (name: string | null) => void;
};

export function AccountSheet({ open, onOpenChange, ...rest }: Props) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="You">
      <AccountBody {...rest} />
    </Sheet>
  );
}

function AccountBody({ name, contact, count, onName }: Omit<Props, "open" | "onOpenChange">) {
  const [draft, setDraft] = useState(name ?? "");
  const [leaving, setLeaving] = useState<"here" | "everywhere" | null>(null);

  // Save as you type (debounced), so closing the sheet never loses an edit.
  useEffect(() => {
    const n = draft.trim() || null;
    if (n === name) return;
    const t = setTimeout(() => {
      onName(n);
      api("/api/me", { method: "PATCH", body: { name: n ?? "" } }).catch(() => {});
    }, 400);
    return () => clearTimeout(t);
  }, [draft, name, onName]);

  const signOut = async (everywhere: boolean) => {
    setLeaving(everywhere ? "everywhere" : "here");
    await api("/api/auth/logout", { body: { everywhere } }).catch(() => {});
    window.location.reload();
  };

  return (
    <div className="px-5 pb-safe">
        <p className="text-[15px] text-muted">
          {contact} · {plural(count, "book")}
        </p>
        <label className="mt-5 mb-1.5 block text-[14px] text-muted">Name on your shared shelves</label>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          placeholder="First name"
          autoComplete="given-name"
          maxLength={40}
          className="h-12 w-full rounded-2xl border border-line bg-surface px-4 text-[17px] outline-none focus:border-ink"
        />
        <Button variant="secondary" className="mt-6 w-full" loading={leaving === "here"} disabled={leaving !== null} onClick={() => signOut(false)}>
          Sign out
        </Button>
        <Button variant="ghost" className="mt-1 mb-2 w-full text-[15px]" loading={leaving === "everywhere"} disabled={leaving !== null} onClick={() => signOut(true)}>
          Sign out on all devices
        </Button>
    </div>
  );
}
