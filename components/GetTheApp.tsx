"use client";

import { useState } from "react";
import { inApp } from "@/lib/native";
import { Icon, useHydrated } from "./ui";

const onIPhone = () => /iP(hone|od)/.test(navigator.userAgent);

/**
 * On an iPhone's browser, Trove first offers its app (where typing doesn't jump around), with the website one tap
 * away. After installing, tapping the same link again opens it in the app. Shows nothing elsewhere, in the app
 * itself, or before IOS_APP_URL is set.
 */
export function GetTheApp({ appUrl, children, invitedBy }: { appUrl: string | null; children: React.ReactNode; invitedBy?: string | null }) {
  const hydrated = useHydrated();
  const [web, setWeb] = useState(false);
  if (!appUrl || !hydrated || web || inApp() || !onIPhone()) return <>{children}</>;
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-6 pb-safe text-center">
      <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-[18px] bg-paper shadow-book">
        <span className="block h-8 w-[30px] rounded-[50%] bg-accent" aria-hidden />
      </span>
      <h1 className="mt-6 font-serif text-[30px] leading-tight font-medium tracking-tight text-balance">
        {invitedBy ? `${invitedBy} invited you to Trove` : "Trove is best in the app"}
      </h1>
      <p className="mt-3 text-[16px] leading-snug text-muted">
        Get the free iPhone app{invitedBy ? `, then tap ${invitedBy}’s link again to be friends` : ""}.
      </p>
      <a
        href={appUrl}
        className="mt-8 inline-flex h-14 w-full items-center justify-center gap-2 rounded-full bg-accent text-[17px] font-medium text-accent-ink active:scale-[0.98]"
      >
        <Icon name="share" size={18} />
        Get the app
      </a>
      <button onClick={() => setWeb(true)} className="mt-3 h-11 text-[15px] font-medium text-ink-2 active:opacity-60">
        Continue on the website
      </button>
    </main>
  );
}
