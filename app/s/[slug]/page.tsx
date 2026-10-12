import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { shelfCount, shelfTitle } from "@/lib/client";
import { getSharedShelf } from "@/lib/shelf";
import { SharedShelf } from "@/components/SharedShelf";

export async function generateMetadata({ params }: PageProps<"/s/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const shelf = await getSharedShelf(slug);
  if (!shelf) return { title: "Shelf not found" };
  const title = shelfTitle(shelf.ownerName, shelf.category, shelf.status);
  const sample = shelf.books.slice(0, 3).map((b) => b.title).join(", ");
  const description = `${shelfCount(shelf.books.length, shelf.status)}${sample ? `, including ${sample}` : ""}.`;
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
      title={shelfTitle(shelf.ownerName, shelf.category, shelf.status)}
      ownerName={shelf.ownerName}
      status={shelf.status}
      category={shelf.category}
      books={shelf.books}
      viewerSignedIn={Boolean(viewer)}
    />
  );
}
