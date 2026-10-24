"use client";

import { useEffect } from "react";

// Once per page load, even if the effect runs twice: two first requests would each mint a browser id.
const sent = new Set<string>();

/** Notes that someone not signed in arrived on a friend's link, so a sign-up later knows who brought them. */
export function CameVia({ via }: { via: string }) {
  useEffect(() => {
    if (sent.has(via)) return;
    sent.add(via);
    fetch("/api/visit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ via }) }).catch(() => {});
  }, [via]);
  return null;
}
