import Link from "next/link";
import { Logo } from "@/components/ui";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-8 text-center">
      <Logo size={40} />
      <h1 className="mt-6 font-serif text-[30px] font-medium tracking-tight">This shelf isn’t here</h1>
      <p className="mt-2 text-[16px] text-muted">The link may be mistyped, or the shelf was removed.</p>
      <Link href="/" className="mt-8 inline-flex h-12 items-center rounded-full bg-ink px-6 text-[16px] font-medium text-paper">
        Make your own shelf
      </Link>
    </main>
  );
}
