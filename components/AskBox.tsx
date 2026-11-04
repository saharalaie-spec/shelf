"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/client";
import type { MessageItem } from "@/lib/messages";
import type { Status } from "@/lib/types";
import { Button } from "./ui";

/** The opening question, by where it is on their list: finished, in the middle of it, or still to come. */
export function askAbout(item: { kind: MessageItem["kind"]; title: string }, status: Status, name: string | null) {
  const to = (q: string) => (name ? `${name}, ${q.charAt(0).toLowerCase()}${q.slice(1)}` : q);
  if (item.kind === "place") return to(status === "read" ? `How was ${item.title}?` : `Have you made it to ${item.title} yet?`);
  if (status === "reading") return to(`How are you finding ${item.title}?`);
  if (status === "want") return to(`What put ${item.title} on your list?`);
  return to(`What did you think of ${item.title}?`);
}

/**
 * Ask a friend about something, right where you are: the question is written for you, you can change it, and it goes
 * to them in Trove (Friends → Messages), not out to another app.
 */
export function AskBox({
  friend,
  item,
  status,
  onDone,
}: {
  friend: { id: string; name: string | null };
  item: MessageItem;
  /** Where it is on their list, for the question. */
  status: Status;
  onDone: () => void;
}) {
  const router = useRouter();
  const [text, setText] = useState(() => askAbout(item, status, friend.name));
  const [sending, setSending] = useState(false);

  const send = async () => {
    if (!text.trim()) return;
    setSending(true);
    try {
      await api("/api/messages", { body: { to: friend.id, body: text, item } });
      toast(`Sent to ${friend.name ?? "your friend"}`, {
        action: { label: "Open", onClick: () => router.push(`/messages/${friend.id}`) },
      });
      onDone();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="mt-1 mb-2 rounded-2xl bg-surface-2 p-2.5">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        aria-label={`Message to ${friend.name ?? "your friend"}`}
        rows={2}
        maxLength={1000}
        autoFocus
        className="w-full resize-none rounded-xl border border-line bg-surface px-3 py-2 text-[16px] leading-snug outline-none focus:border-ink"
      />
      <div className="mt-2 flex items-center justify-end gap-2">
        <button onClick={onDone} className="h-9 rounded-full px-3 text-[14px] font-medium text-muted active:bg-surface">
          Cancel
        </button>
        <Button onClick={send} loading={sending} disabled={!text.trim()} className="h-9 px-4 text-[14px]">
          Send
        </Button>
      </div>
    </div>
  );
}
