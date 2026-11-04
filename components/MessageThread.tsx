"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/client";
import { VOCAB } from "@/lib/kinds";
import type { Correspondent, Message } from "@/lib/messages";
import { Cover } from "./Cover";
import { SpotTile } from "./Spot";
import { Avatar, Button, Icon, useHydrated } from "./ui";

const CHECK_EVERY_MS = 8000;
const GAP_MS = 30 * 60 * 1000;

const when = (at: number) => {
  const d = new Date(at);
  const today = new Date().toDateString() === d.toDateString();
  return today
    ? d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
    : d.toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
};

/** You and one friend: what you've asked each other, newest at the bottom, and a box to write back. */
export function MessageThread({
  friend,
  initial,
  canSend,
  sample,
}: {
  friend: Correspondent;
  initial: Message[];
  /** Still friends: only friends can write. */
  canSend: boolean;
  /** Juno answers by herself. */
  sample: boolean;
}) {
  const hydrated = useHydrated();
  const [messages, setMessages] = useState(initial);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const name = friend.name ?? "Your friend";

  const reload = () =>
    api<{ messages: Message[] }>(`/api/messages/${friend.id}`)
      .then((r) => setMessages(r.messages))
      .catch(() => {});

  // New replies show up while it's open, and when you come back to it.
  useEffect(() => {
    const check = () => document.visibilityState === "visible" && reload();
    const t = setInterval(check, CHECK_EVERY_MS);
    document.addEventListener("visibilitychange", check);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", check);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [friend.id]);

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  const send = async () => {
    const body = text.trim();
    if (!body) return;
    setSending(true);
    try {
      await api("/api/messages", { body: { to: friend.id, body } });
      setText("");
      await reload();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col">
      <header className="sticky top-0 z-20 flex h-16 items-center gap-2 bg-paper/85 px-3 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
        <Link href="/friends?tab=messages" aria-label="Messages" className="flex h-10 w-10 items-center justify-center rounded-full active:bg-surface-2">
          <Icon name="back" size={20} />
        </Link>
        <Link href={`/u/${friend.handle ?? friend.id}`} className="flex min-w-0 items-center gap-2.5 rounded-full py-1 pr-3 active:bg-surface-2">
          <Avatar name={friend.name} photo={friend.photo} size={36} />
          <span className="truncate text-[17px] font-medium">{name}</span>
        </Link>
      </header>

      <main className="flex-1 px-4 pt-2 pb-4">
        {!messages.length && <p className="mt-10 text-center text-[15px] text-muted">Say hi, or ask {name} about something of theirs.</p>}
        <ol className="space-y-1.5">
          {messages.map((m, i) => {
            const prev = messages[i - 1];
            const stamp = !prev || m.at - prev.at > GAP_MS;
            return (
              <li key={m.id}>
                {stamp && hydrated && <p className="mt-4 mb-1 text-center text-[12px] text-muted">{when(m.at)}</p>}
                <div className={`flex ${m.mine ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[82%] rounded-3xl px-4 py-2.5 text-[16px] leading-snug whitespace-pre-wrap ${
                      m.mine ? "rounded-br-lg bg-accent text-accent-ink" : "rounded-bl-lg bg-surface text-ink shadow-book"
                    }`}
                  >
                    {m.item && (
                      <span className={`mb-2 flex items-center gap-2.5 rounded-2xl p-2 ${m.mine ? "bg-accent-ink/10" : "bg-surface-2"}`}>
                        {m.item.kind === "place" ? (
                          <SpotTile spot={{ categories: [] }} size={36} />
                        ) : (
                          <Cover book={m.item} shape={VOCAB[m.item.kind].shape} className="w-8 shrink-0" rounded="rounded-[3px]" />
                        )}
                        <span className="min-w-0">
                          <span className="block truncate text-[14px] font-medium">{m.item.title}</span>
                          {m.item.author && <span className="block truncate text-[12px] opacity-70">{m.item.author}</span>}
                        </span>
                      </span>
                    )}
                    {m.body}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
        <div ref={end} />
      </main>

      <footer className="sticky bottom-0 border-t border-line bg-paper/90 px-3 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-xl">
        {canSend ? (
          <>
            <div className="flex items-end gap-2">
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={`Message ${name}`}
                aria-label={`Message ${name}`}
                rows={1}
                maxLength={1000}
                className="max-h-32 min-h-11 min-w-0 flex-1 resize-none rounded-3xl border border-line bg-surface px-4 py-2.5 text-[16px] leading-snug outline-none [field-sizing:content] focus:border-ink"
              />
              <Button onClick={send} loading={sending} disabled={!text.trim()} className="h-11 shrink-0 px-4 text-[15px]">
                Send
              </Button>
            </div>
            {sample && <p className="mt-1.5 px-2 text-[12px] text-muted">Juno is a sample friend: she answers by herself.</p>}
          </>
        ) : (
          <p className="py-2 text-center text-[14px] text-muted">You’re no longer friends with {name}, so you can’t write back.</p>
        )}
      </footer>
    </div>
  );
}
