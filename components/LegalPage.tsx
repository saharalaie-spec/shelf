import Link from "next/link";
import { Wordmark } from "./ui";

/** Where people can reach whoever runs Trove: CONTACT_EMAIL, else FEEDBACK_EMAIL. */
export const contactEmail = () => process.env.CONTACT_EMAIL?.trim() || process.env.FEEDBACK_EMAIL?.trim() || null;

/** The privacy policy and terms: plain reading pages, open to anyone, signed in or not. */
export function LegalPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-2xl px-6 pb-16" style={{ paddingTop: "env(safe-area-inset-top)" }}>
      <Link href="/" className="mt-8 inline-flex items-center gap-2" aria-label="Trove">
        <Wordmark size={26} />
      </Link>
      <h1 className="mt-6 font-serif text-[34px] leading-tight font-medium tracking-tight">{title}</h1>
      <p className="mt-1 text-[14px] text-muted">Last updated {updated}</p>
      <div className="mt-8 space-y-4 text-[16px] leading-relaxed text-ink-2 [&_a]:text-link [&_a]:underline [&_a]:underline-offset-2 [&_h2]:mt-10 [&_h2]:font-serif [&_h2]:text-[22px] [&_h2]:font-medium [&_h2]:text-ink [&_li]:ml-5 [&_li]:list-disc [&_strong]:font-semibold [&_strong]:text-ink [&_ul]:space-y-1.5">
        {children}
      </div>
      <p className="mt-12 flex gap-5 text-[14px] text-muted">
        <Link href="/privacy" className="underline underline-offset-2">
          Privacy
        </Link>
        <Link href="/terms" className="underline underline-offset-2">
          Terms
        </Link>
        <Link href="/" className="underline underline-offset-2">
          Trove
        </Link>
      </p>
    </main>
  );
}

/** "email hello@…" as a link, or the in-app route when no address is set. */
export function Contact() {
  const email = contactEmail();
  return email ? (
    <>
      email <a href={`mailto:${email}`}>{email}</a>
    </>
  ) : (
    <>use &ldquo;Send feedback&rdquo; in your account in the app</>
  );
}
