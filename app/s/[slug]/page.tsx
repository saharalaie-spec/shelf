import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { troveCount, troveTitle } from "@/lib/kinds";
import { getSharedTrove } from "@/lib/trove";
import { SharedTrove } from "@/components/SharedTrove";

export async function generateMetadata({ params }: PageProps<"/s/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const shared = await getSharedTrove(slug);
  if (!shared) return { title: "Not found · Trove" };
  const title = troveTitle(shared.ownerName, shared.category, shared.status, shared.kind);
  const sample = shared.items.slice(0, 3).map((b) => b.title).join(", ");
  const description = `${troveCount(shared.items.length, shared.status, shared.kind)}${sample ? `, including ${sample}` : ""}.`;
  return {
    title: `${title} · Trove`,
    description,
    openGraph: { title, description, type: "website", siteName: "Trove" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function SharedTrovePage({ params }: PageProps<"/s/[slug]">) {
  const { slug } = await params;
  const [shared, viewer] = await Promise.all([getSharedTrove(slug, { countView: true }), getCurrentUser()]);
  if (!shared) notFound();
  return (
    <SharedTrove
      title={troveTitle(shared.ownerName, shared.category, shared.status, shared.kind)}
      kind={shared.kind}
      ownerName={shared.ownerName}
      status={shared.status}
      category={shared.category}
      items={shared.items}
      destinations={shared.destinations}
      viewerSignedIn={Boolean(viewer)}
    />
  );
}
