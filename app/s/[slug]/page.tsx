import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { shelfCount, shelfTitle } from "@/lib/kinds";
import { getSharedShelf } from "@/lib/shelf";
import { SharedShelf } from "@/components/SharedShelf";

export async function generateMetadata({ params }: PageProps<"/s/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const shelf = await getSharedShelf(slug);
  if (!shelf) return { title: "Shelf not found" };
  const title = shelfTitle(shelf.ownerName, shelf.category, shelf.status, shelf.kind);
  const sample = shelf.items.slice(0, 3).map((b) => b.title).join(", ");
  const description = `${shelfCount(shelf.items.length, shelf.status, shelf.kind)}${sample ? `, including ${sample}` : ""}.`;
  return {
    title: `${title} · Shelf`,
    description,
    openGraph: { title, description, type: "website", siteName: "Shelf" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function SharedShelfPage({ params }: PageProps<"/s/[slug]">) {
  const { slug } = await params;
  const [shelf, viewer] = await Promise.all([getSharedShelf(slug, { countView: true }), getCurrentUser()]);
  if (!shelf) notFound();
  return (
    <SharedShelf
      title={shelfTitle(shelf.ownerName, shelf.category, shelf.status, shelf.kind)}
      kind={shelf.kind}
      ownerName={shelf.ownerName}
      status={shelf.status}
      category={shelf.category}
      items={shelf.items}
      destinations={shelf.destinations}
      viewerSignedIn={Boolean(viewer)}
    />
  );
}
