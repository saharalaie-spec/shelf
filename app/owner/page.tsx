import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { databaseUrl, isOwner } from "@/lib/config";
import { listFeedback } from "@/lib/feedback";
import { Icon, Wordmark } from "@/components/ui";

export const metadata: Metadata = { title: "Owner · Trove", robots: { index: false, follow: false } };

/**
 * For whoever runs Trove (OWNERS): the numbers and the feedback, kept out of the app itself. Anyone else gets a 404, so
 * the page doesn't even say it exists.
 */
export default async function OwnerPage() {
  if (!databaseUrl()) notFound();
  const user = await getCurrentUser();
  if (!user || !isOwner(user)) notFound();
  const notes = (await listFeedback()).length;
  const links = [
    { href: "/numbers", icon: "sparkle", title: "Numbers", line: "Who’s joining, how invites turn into friends, and who’s active." },
    { href: "/feedback", icon: "mic", title: "Feedback", line: notes ? `${notes} ${notes === 1 ? "note" : "notes"} from people using Trove.` : "Nothing yet." },
  ] as const;
  return (
    <div className="mx-auto min-h-dvh w-full max-w-2xl px-5 pb-16">
      <header className="flex h-16 items-center pt-[env(safe-area-inset-top)]">
        <Link href="/" aria-label="Your trove">
          <Wordmark size={24} />
        </Link>
      </header>
      <h1 className="mt-4 font-serif text-[34px] leading-tight font-medium tracking-tight">Owner</h1>
      <p className="mt-1 text-[15px] text-muted">Only you can open this page. Bookmark it to get back here.</p>
      <ul className="mt-6 space-y-3">
        {links.map((l) => (
          <li key={l.href}>
            <Link href={l.href} className="flex items-center gap-4 rounded-2xl bg-surface p-4 shadow-book active:scale-[0.99]">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-surface-2 text-ink-2">
                <Icon name={l.icon} size={20} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[17px] font-medium">{l.title}</span>
                <span className="block text-[14px] leading-snug text-muted">{l.line}</span>
              </span>
              <Icon name="chevron" size={17} className="shrink-0 text-muted" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
