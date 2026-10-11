"use client";

import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { api, plural, shelfTitle } from "@/lib/client";
import type { Book } from "@/lib/types";
import { BookCover } from "./BookCover";
import { Sheet } from "./Sheet";
import { Button, Icon } from "./ui";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  books: Book[];
  categories: [string, number][];
  initialCategory: string | null;
  name: string | null;
  onName: (name: string | null) => void;
};

export function ShareSheet({ open, onOpenChange, ...rest }: Props) {
  // Links are stable per category; remember them across opens.
  const [links, setLinks] = useState<Record<string, string>>({});
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Share your shelf">
      <ShareBody {...rest} links={links} setLinks={setLinks} />
    </Sheet>
  );
}

type BodyProps = Omit<Props, "open" | "onOpenChange"> & {
  links: Record<string, string>;
  setLinks: React.Dispatch<React.SetStateAction<Record<string, string>>>;
};

function ShareBody({ books, categories, initialCategory, name, onName, links, setLinks }: BodyProps) {
  const [scope, setScope] = useState<string | null>(initialCategory);
  const [draftName, setDraftName] = useState("");
  const [copied, setCopied] = useState(false);
  const inflight = useRef(new Set<string>());

  // Fetch (or create) the link as soon as a scope is picked, so Share is instant.
  const scopeKey = scope ?? "";
  useEffect(() => {
    if (links[scopeKey] || inflight.current.has(scopeKey)) return;
    inflight.current.add(scopeKey);
    api<{ url: string }>("/api/shares", { body: { category: scopeKey } })
      .then(({ url }) => setLinks((l) => ({ ...l, [scopeKey]: url })))
      .catch((err) => toast.error(err.message))
      .finally(() => inflight.current.delete(scopeKey));
  }, [scopeKey, links, setLinks]);

  const url = links[scopeKey];
  const shown = scope ? books.filter((b) => b.categories.includes(scope)) : books;
  const displayName = name ?? (draftName.trim() || null);
  const title = shelfTitle(displayName, scope);

  const saveName = () => {
    const n = draftName.trim();
    if (!n || n === name) return;
    onName(n);
    api("/api/me", { method: "PATCH", body: { name: n } }).catch(() => {});
  };

  const copy = async () => {
    if (!url) return;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
    toast("Link copied");
  };

  const share = async () => {
    if (!url) return;
    saveName();
    if (navigator.share) {
      try {
        await navigator.share({ title, text: `${title}: ${plural(shown.length, "book")} I’ve read`, url });
        return;
      } catch (err) {
        if ((err as DOMException).name === "AbortError") return;
      }
    }
    copy();
  };

  return (
    <div className="overflow-y-auto pb-safe" data-vaul-no-drag="">
        <div className="no-scrollbar flex gap-2 overflow-x-auto px-5 pt-1 pb-4">
          <ScopeChip active={!scope} onClick={() => setScope(null)} label="Everything" count={books.length} />
          {categories.map(([c, n]) => (
            <ScopeChip key={c} active={scope === c} onClick={() => setScope(c)} label={c} count={n} />
          ))}
        </div>

        <div className="mx-5 overflow-hidden rounded-3xl bg-paper p-5">
          <div className="flex h-28 items-end justify-center">
            {shown.slice(0, 5).map((b, i, arr) => {
              const mid = (arr.length - 1) / 2;
              return (
                <motion.div
                  key={b.id}
                  layout
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: Math.abs(i - mid) * 5, rotate: (i - mid) * 5 }}
                  transition={{ type: "spring", stiffness: 300, damping: 24 }}
                  className="-mx-2.5 w-[4.4rem]"
                  style={{ zIndex: 10 - Math.abs(Math.round(i - mid)) }}
                >
                  <BookCover book={b} />
                </motion.div>
              );
            })}
          </div>
          <p className="mt-5 text-center font-serif text-[22px] leading-tight font-medium tracking-tight">{title}</p>
          <p className="mt-0.5 text-center text-[14px] text-muted">{plural(shown.length, "book")}</p>
        </div>

        {!name && (
          <div className="mx-5 mt-4">
            <label className="mb-1.5 block text-[14px] text-muted">Your name, so friends know whose shelf this is</label>
            <input
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              onBlur={saveName}
              onKeyDown={(e) => e.key === "Enter" && (e.currentTarget.blur(), share())}
              placeholder="First name"
              autoComplete="given-name"
              maxLength={40}
              className="h-12 w-full rounded-2xl border border-line bg-surface px-4 text-[17px] outline-none focus:border-ink"
            />
          </div>
        )}

        <div className="mx-5 mt-4 flex h-12 items-center gap-2 rounded-2xl bg-surface-2 pr-1.5 pl-4">
          <Icon name="link" size={18} className="shrink-0 text-muted" />
          <span className="min-w-0 flex-1 truncate text-[15px] text-ink-2">{url ? url.replace(/^https?:\/\//, "") : "Making your link…"}</span>
          <button onClick={copy} disabled={!url} className="flex h-9 items-center gap-1.5 rounded-xl bg-surface px-3 text-[14px] font-medium active:scale-95 disabled:opacity-50">
            <Icon name={copied ? "check" : "copy"} size={15} />
            {copied ? "Copied" : "Copy"}
          </button>
        </div>

        <div className="mx-5 mt-4 mb-2 grid grid-cols-[1fr_auto] gap-2">
          <Button onClick={share} disabled={!url} icon={<Icon name="share" size={18} />}>
            Share link
          </Button>
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            aria-disabled={!url}
            className="inline-flex h-12 items-center rounded-full bg-surface-2 px-5 text-[16px] font-medium active:scale-[0.97]"
          >
            Preview
          </a>
        </div>
        <p className="mx-5 mb-2 text-center text-[13px] text-muted">Anyone with the link can see these books. No app needed.</p>
    </div>
  );
}

function ScopeChip({ active, label, count, onClick }: { active: boolean; label: string; count: number; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex h-9 shrink-0 items-center gap-1.5 rounded-full px-4 text-[14px] font-medium whitespace-nowrap transition-colors active:scale-95 ${
        active ? "bg-ink text-paper" : "bg-surface-2 text-ink-2"
      }`}
    >
      {label}
      <span className={active ? "text-paper/60" : "text-muted"}>{count}</span>
    </button>
  );
}
