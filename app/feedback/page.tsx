import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { databaseUrl, isOwner } from "@/lib/config";
import { listFeedback } from "@/lib/feedback";
import { FeedbackList } from "@/components/FeedbackList";

export const metadata: Metadata = { title: "Feedback · Trove", robots: { index: false, follow: false } };

/** What people have said, newest first. Only for whoever runs Trove (OWNERS). */
export default async function FeedbackPage() {
  if (!databaseUrl()) notFound();
  const user = await getCurrentUser();
  if (!user || !isOwner(user)) notFound();
  return <FeedbackList items={await listFeedback()} />;
}
