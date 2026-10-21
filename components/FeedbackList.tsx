"use client";

import Link from "next/link";
import { toast } from "sonner";
import type { Feedback } from "@/lib/feedback";
import { Button, Icon, Logo, useHydrated } from "./ui";

/** Feedback as plain text: each note with who and where, and everything copyable at once. */
export function FeedbackList({ items }: { items: Feedback[] }) {
  const hydrated = useHydrated();
  const where = (page: string | null) => (page === "/" ? "Home" : page);
  const when = (at: number) => (hydrated ? new Date(at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "");
  const asText = (f: Feedback) => `${when(f.at)} · ${[f.name, f.contact].filter(Boolean).join(" · ") || "Someone"}${f.page ? ` · ${where(f.page)}` : ""}\n${f.text}`;
  const copyAll = async () => {
    await navigator.clipboard.writeText(items.map(asText).join("\n\n"));
    toast(`Copied ${items.length} ${items.length === 1 ? "note" : "notes"}`);
  };

  return (
    <div className="mx-auto min-h-dvh w-full max-w-2xl px-5 pb-16">
      <header className="flex h-16 items-center justify-between pt-[env(safe-area-inset-top)]">
        <Link href="/" className="flex items-center gap-2">
          <Logo size={24} />
          <span className="font-serif text-[19px] font-semibold tracking-tight">Trove</span>
        </Link>
        {items.length > 0 && (
          <Button variant="secondary" className="h-10 px-4 text-[14px]" onClick={copyAll} icon={<Icon name="copy" size={16} />}>
            Copy all
          </Button>
        )}
      </header>
      <h1 className="mt-4 font-serif text-[34px] leading-tight font-medium tracking-tight">Feedback</h1>
      <p className="mt-1 text-[15px] text-muted">{items.length ? `${items.length} ${items.length === 1 ? "note" : "notes"}, newest first.` : "Nothing yet."}</p>
      <ul className="mt-6 space-y-3">
        {items.map((f) => (
          <li key={f.id} className="rounded-2xl bg-surface p-4 shadow-book">
            <p className="text-[13px] text-muted">
              {[when(f.at), [f.name, f.contact].filter(Boolean).join(" · ") || "Someone (account deleted)", where(f.page)].filter(Boolean).join(" · ")}
            </p>
            <p className="mt-1.5 text-[16px] leading-snug whitespace-pre-wrap">{f.text}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
