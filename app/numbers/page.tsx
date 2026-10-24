import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { databaseUrl, isOwner } from "@/lib/config";
import { loadNumbers } from "@/lib/numbers";
import { NumbersView } from "@/components/NumbersView";

export const metadata: Metadata = { title: "Numbers · Trove", robots: { index: false, follow: false } };

/** Who's joining, how invites convert, who's active. Only for whoever runs Trove (OWNERS). */
export default async function NumbersPage() {
  if (!databaseUrl()) notFound();
  const user = await getCurrentUser();
  if (!user || !isOwner(user)) notFound();
  return <NumbersView numbers={await loadNumbers()} />;
}
