import Link from "next/link";
import { Icon, Logo } from "./ui";

/** What a non-friend sees. The same whether or not the person exists, so it never confirms who's on Trove. */
export function PrivateTrove() {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-6 pb-safe">
      <header className="flex h-16 items-center pt-[env(safe-area-inset-top)]">
        <Link href="/" className="flex items-center gap-2">
          <Logo size={24} />
          <span className="font-serif text-[19px] font-semibold tracking-tight">Trove</span>
        </Link>
      </header>
      <main className="flex flex-1 flex-col items-center justify-center pb-[12vh] text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-surface-2 text-ink-2">
          <Icon name="lock" size={28} />
        </span>
        <h1 className="mt-6 font-serif text-[32px] leading-tight font-medium tracking-tight">This trove is private</h1>
        <p className="mt-2 max-w-xs text-[16px] text-muted">
          Only friends can see it. If you know them, ask for their Trove invite link.
        </p>
        <Link href="/" className="mt-8 inline-flex h-12 items-center rounded-full bg-accent px-6 text-[16px] font-medium text-accent-ink active:scale-[0.97]">
          Go to your trove
        </Link>
      </main>
    </div>
  );
}
