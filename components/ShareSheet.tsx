"use client";

import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { api, shelfCount, shelfTitle } from "@/lib/client";
import type { Book, Status } from "@/lib/types";
import { BookCover } from "./BookCover";
import { SectionTabs } from "./SectionTabs";
import { Sheet } from "./Sheet";
import { Button, Icon } from "./ui";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  books: Book[];
  initialStatus: Status;
  initialCategory: string | null;
  name: string | null;
  onName: (name: string | null) => void;
};

export function ShareSheet({ open, onOpenChange, ...rest }: Props) {
  // Links are stable per section and category; remember them across opens.
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

function ShareBody({ books: all, initialStatus, initialCategory, name, onName, links, setLinks }: BodyProps) {
  const [status, setStatus] = useState<Status>(initialStatus);
  const [scope, setScope] = useState<string | null>(initialCategory);
  const [draftName, setDraftName] = useState("");
  const [copied, setCopied] = useState(false);
  const inflight = useRef(new Set<string>());
  // Share links never include private books, so neither does anything shown here.
  const books = all.filter((b) => !b.private);

  const inSection = books.filter((b) => b.status === status);
  const counts: Record<Status, number> = { read: 0, reading: 0, want: 0 };
  for (const b of books) counts[b.status]++;
  const tally = new Map<string, number>();
  for (const b of inSection) for (const c of b.categories) tally.set(c, (tally.get(c) ?? 0) + 1);
  const categories = [...tally.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  // A category picked in one section may not exist in another.
  const category = scope && tally.has(scope) ? scope : null;

  // Fetch (or create) the link as soon as a scope is picked, so Share is instant.
  const scopeKey = `${status}|${category ?? ""}`;
  useEffect(() => {
    if (links[scopeKey] || inflight.current.has(scopeKey)) return;
    inflight.current.add(scopeKey);
    api<{ url: string }>("/api/shares", { body: { status, category: category ?? "" } })
      .then(({ url }) => setLinks((l) => ({ ...l, [scopeKey]: url })))
      .catch((err) => toast.error(err.message))
      .finally(() => inflight.current.delete(scopeKey));
  }, [scopeKey, status, category, links, setLinks]);

  const url = links[scopeKey];
  const shown = category ? inSection.filter((b) => b.categories.includes(category)) : inSection;
  const hidden = all.filter((b) => b.private && b.status === status && (!category || b.categories.includes(category))).length;
  const displayName = name ?? (draftName.trim() || null);
  const title = shelfTitle(displayName, category, status);

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
        await navigator.share({ title, text: `${title}: ${shelfCount(shown.length, status)}`, url });
        return;
      } catch (err) {
        if ((err as DOMException).name === "AbortError") return;
      }
    }
    copy();
  };

  return (
    <div className="overflow-y-auto pb-safe" data-vaul-no-drag="">
        <div className="px-5 pt-1">
          <SectionTabs value={status} counts={counts} onChange={setStatus} layoutId="share-status-pill" />
        </div>
        <div className="no-scrollbar flex gap-2 overflow-x-auto px-5 pt-3 pb-4">
          <ScopeChip active={!category} onClick={() => setScope(null)} label="Everything" count={inSection.length} />
          {categories.map(([c, n]) => (
            <ScopeChip key={c} active={category === c} onClick={() => setScope(c)} label={c} count={n} />
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
          <p className="mt-0.5 text-center text-[14px] text-muted">{shelfCount(shown.length, status)}</p>
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
        <p className="mx-5 mb-2 text-center text-[13px] text-muted">
          Anyone with the link can see these books. No app needed.
          {hidden > 0 && ` ${hidden === 1 ? "Your private book is" : `Your ${hidden} private books are`} left out.`}
        </p>
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
