import { AuthError, requireUser } from "@/lib/auth";
import { readJson, route } from "@/lib/api";
import { addBooks, listBooks } from "@/lib/shelf";
import type { BookHit } from "@/lib/types";

export const GET = route(async () => {
  const user = await requireUser();
  return Response.json({ books: await listBooks(user.id) });
});

export const POST = route(async (req: Request) => {
  const user = await requireUser();
  const body = await readJson<{ books: (BookHit & { addedAt?: number })[] }>(req);
  const hits = (Array.isArray(body.books) ? body.books : []).filter(isHit).slice(0, 1000);
  if (!hits.length) throw new AuthError("No books to add.");
  const added = await addBooks(
    user.id,
    hits.map((h) => ({
      key: h.key.slice(0, 200),
      title: h.title.slice(0, 300),
      author: h.author?.slice(0, 200) ?? null,
      year: typeof h.year === "number" ? h.year : null,
      coverUrl: typeof h.coverUrl === "string" && /^https:\/\//.test(h.coverUrl) ? h.coverUrl : null,
      categories: Array.isArray(h.categories) ? h.categories.filter((c) => typeof c === "string").slice(0, 8) : [],
      addedAt: typeof h.addedAt === "number" ? h.addedAt : undefined,
    })),
  );
  return Response.json({ added });
});

function isHit(h: unknown): h is BookHit & { addedAt?: number } {
  const b = h as BookHit;
  return Boolean(b && typeof b.key === "string" && typeof b.title === "string" && b.title.trim());
}
