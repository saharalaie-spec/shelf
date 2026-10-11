import { Logo } from "./ui";

/** Shown on a fresh deployment until a database is connected. */
export function SetupNeeded() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-6 pt-[max(3rem,12vh)] pb-safe">
      <div className="mb-10 flex items-center gap-2.5">
        <Logo />
        <span className="font-serif text-[22px] font-semibold tracking-tight">Shelf</span>
      </div>
      <h1 className="font-serif text-[36px] leading-[1.1] font-medium tracking-tight">Almost live</h1>
      <p className="mt-3 text-[17px] text-muted">
        Shelf is deployed, but it needs a database to keep shelves in. On Vercel:
      </p>
      <ol className="mt-6 space-y-4 text-[16px] text-ink-2">
        {[
          <>Open this project and go to <b className="font-medium text-ink">Storage</b>.</>,
          <>Choose <b className="font-medium text-ink">Create Database → Turso</b> (free), and connect it to this project.</>,
          <>Go to <b className="font-medium text-ink">Deployments</b> and redeploy the latest one.</>,
        ].map((step, i) => (
          <li key={i} className="flex gap-3">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-2 text-[13px] font-semibold text-ink">
              {i + 1}
            </span>
            <span>{step}</span>
          </li>
        ))}
      </ol>
      <p className="mt-8 text-[14px] text-muted">
        Any libSQL database works: set <code className="font-mono text-ink-2">DATABASE_URL</code> and{" "}
        <code className="font-mono text-ink-2">DATABASE_AUTH_TOKEN</code> instead.
      </p>
    </main>
  );
}
