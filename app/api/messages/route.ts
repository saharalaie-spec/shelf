import { AuthError, requireUser } from "@/lib/auth";
import { readJson, route } from "@/lib/api";
import { listConversations, sendMessage, type MessageItem } from "@/lib/messages";
import { isKind } from "@/lib/types";

/** Everyone you've written with, latest first. */
export const GET = route(async () => {
  const user = await requireUser();
  return Response.json({ conversations: await listConversations(user.id) });
});

/** Sends a friend a message, optionally about something (a snapshot of it: kind, key, title, author, cover). */
export const POST = route(async (req: Request) => {
  const user = await requireUser();
  const body = await readJson<{ to: unknown; body: unknown; item: Partial<Record<keyof MessageItem, unknown>> | null }>(req);
  if (typeof body.to !== "string" || typeof body.body !== "string") throw new AuthError("Who to, and what?");
  const i = body.item;
  const str = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
  const title = i ? str(i.title, 200) : null;
  const item: MessageItem | null =
    i && title && isKind(i.kind)
      ? {
          kind: i.kind,
          key: str(i.key, 200) ?? "",
          title,
          author: str(i.author, 200),
          // Only an ordinary picture link.
          coverUrl: typeof i.coverUrl === "string" && /^https:\/\//.test(i.coverUrl) ? i.coverUrl.slice(0, 500) : null,
        }
      : null;
  await sendMessage(user.id, body.to, body.body, item);
  return Response.json({ ok: true });
});
