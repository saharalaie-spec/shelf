"use client";

import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useEffect, useEffectEvent, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/client";
import { guessCountry, parseIdentifier } from "@/lib/identifier";
import { VOCAB } from "@/lib/kinds";
import type { Friend, IncomingRequest, OutgoingRequest } from "@/lib/social";
import { KINDS } from "@/lib/types";
import { Sheet } from "./Sheet";
import { Avatar, Button, Icon } from "./ui";

type Data = { friends: Friend[]; incoming: IncomingRequest[]; outgoing: OutgoingRequest[]; inviteUrl: string };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  name: string | null;
  onName: (name: string) => void;
  /** Keeps the badge on the Friends button in step. */
  onPending: (count: number) => void;
};

export function FriendsSheet({ open, onOpenChange, name, onName, onPending }: Props) {
  // Kept across opens so the sheet shows the last list instantly while it refreshes.
  const [data, setData] = useState<Data | null>(null);

  const apply = (d: Data) => {
    setData(d);
    onPending(d.incoming.length);
  };
  const reload = () => api<Data>("/api/friends").then(apply);
  const loaded = useEffectEvent(apply);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    api<Data>("/api/friends")
      .then((d) => !cancelled && loaded(d))
      .catch((err) => toast.error(err.message));
    return () => {
      cancelled = true;
    };
  }, [open]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Friends" tall>
      <FriendsBody data={data} setData={setData} name={name} onName={onName} reload={reload} onPending={onPending} />
    </Sheet>
  );
}

type BodyProps = {
  data: Data | null;
  setData: React.Dispatch<React.SetStateAction<Data | null>>;
  name: string | null;
  onName: (name: string) => void;
  reload: () => Promise<void>;
  onPending: (count: number) => void;
};

function FriendsBody({ data, setData, name, onName, reload, onPending }: BodyProps) {
  const [busy, setBusy] = useState<string | null>(null);

  const respond = async (req: IncomingRequest, action: "accept" | "decline") => {
    setBusy(req.id);
    try {
      await api(`/api/friends/requests/${req.id}`, { body: { action } });
      const incoming = data!.incoming.filter((r) => r.id !== req.id);
      setData((d) => d && { ...d, incoming });
      onPending(incoming.length);
      if (action === "accept") toast(`You and ${req.from.name ?? "your new friend"} are friends now`);
      await reload();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const cancel = async (req: OutgoingRequest) => {
    setData((d) => d && { ...d, outgoing: d.outgoing.filter((r) => r.id !== req.id) });
    try {
      await api(`/api/friends/requests/${req.id}`, { body: { action: "cancel" } });
    } catch (err) {
      toast.error((err as Error).message);
      reload().catch(() => {});
    }
  };

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-safe" data-vaul-no-drag="">
      {!name && <NamePrompt onName={onName} />}
      <InviteCard url={data?.inviteUrl ?? null} name={name} />
      <AskForm onSent={() => reload().catch(() => {})} />

      <AnimatePresence initial={false}>
        {data && data.incoming.length > 0 && (
          <motion.section key="incoming" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
            <Heading>Requests</Heading>
            <ul className="space-y-2">
              {data.incoming.map((r) => (
                <motion.li
                  key={r.id}
                  layout
                  exit={{ opacity: 0, x: 40 }}
                  className="flex items-center gap-3 rounded-2xl bg-paper p-3"
                >
                  <Avatar name={r.from.name} size={44} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[16px] font-medium">{r.from.name ?? "Someone"}</p>
                    <p className="truncate text-[13px] text-muted">{r.hint}</p>
                  </div>
                  <button
                    onClick={() => respond(r, "decline")}
                    disabled={busy === r.id}
                    aria-label="Decline"
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted active:bg-surface-2"
                  >
                    <Icon name="x" size={18} />
                  </button>
                  <Button onClick={() => respond(r, "accept")} loading={busy === r.id} className="h-10 shrink-0 px-4 text-[15px]">
                    Accept
                  </Button>
                </motion.li>
              ))}
            </ul>
          </motion.section>
        )}
      </AnimatePresence>

      <Heading>{data && data.friends.length > 0 ? `Friends · ${data.friends.length}` : "Friends"}</Heading>
      {!data ? (
        <div className="space-y-2">
          {[0, 1].map((i) => (
            <div key={i} className="flex items-center gap-3 p-1">
              <div className="skeleton h-11 w-11 rounded-full" />
              <div className="flex-1 space-y-1.5">
                <div className="skeleton h-3.5 w-1/3 rounded" />
                <div className="skeleton h-3 w-1/2 rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : data.friends.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line px-4 py-5 text-center text-[15px] text-muted">
          No friends yet. Send your invite link to the people you swap recommendations with.
        </p>
      ) : (
        <ul className="-mx-2">
          {data.friends.map((f) => (
            <li key={f.id}>
              <Link href={`/u/${f.handle ?? f.id}`} className="flex items-center gap-3 rounded-2xl px-2 py-2.5 active:bg-surface-2">
                <Avatar name={f.name} size={44} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[16px] font-medium">{f.name ?? "Trove member"}</span>
                  <span className="block truncate text-[13px] text-muted">
                    {f.now ? `${VOCAB[f.now.kind].nowVerb} ${f.now.title}` : summary(f.counts)}
                  </span>
                </span>
                <Icon name="chevron" size={16} className="shrink-0 text-muted" />
              </Link>
            </li>
          ))}
        </ul>
      )}

      {data && data.outgoing.length > 0 && (
        <>
          <Heading>Waiting to hear back</Heading>
          <ul className="-mx-2">
            {data.outgoing.map((r) => (
              <li key={r.id} className="flex items-center gap-3 px-2 py-2">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-2 text-muted">
                  <Icon name="addPerson" size={17} />
                </span>
                <span className="min-w-0 flex-1 truncate text-[15px] text-ink-2">{r.display}</span>
                <button onClick={() => cancel(r)} className="h-9 rounded-full px-3 text-[14px] font-medium text-muted active:bg-surface-2">
                  Cancel
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      <p className="mt-6 mb-3 flex gap-2 text-[13px] leading-snug text-muted">
        <Icon name="lock" size={15} className="mt-px shrink-0" />
        Friends see everything you add: books, podcasts, movies and shows. Anything you mark private stays yours.
      </p>
    </div>
  );
}

/** Friends see your name on requests and your profile, so ask for one before you invite anyone. */
function NamePrompt({ onName }: { onName: (name: string) => void }) {
  const [draft, setDraft] = useState("");
  const save = (e: React.FormEvent) => {
    e.preventDefault();
    const n = draft.trim();
    if (!n) return;
    onName(n);
    api("/api/me", { method: "PATCH", body: { name: n } }).catch((err) => toast.error(err.message));
  };
  return (
    <form onSubmit={save} className="mb-4 rounded-3xl border border-dashed border-line p-4">
      <label htmlFor="your-name" className="block text-[16px] font-medium">
        What should friends call you?
      </label>
      <p className="text-[13px] text-muted">Your name shows on requests and on your profile.</p>
      <div className="mt-3 flex gap-2">
        <input
          id="your-name"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="First name"
          autoComplete="given-name"
          maxLength={40}
          className="h-12 min-w-0 flex-1 rounded-2xl border border-line bg-surface px-4 text-[16px] outline-none focus:border-ink"
        />
        <Button type="submit" disabled={!draft.trim()} className="px-5">
          Save
        </Button>
      </div>
    </form>
  );
}

function InviteCard({ url, name }: { url: string | null; name: string | null }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    if (!url) return;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
    toast("Invite link copied");
  };

  const share = async () => {
    if (!url) return;
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Be my friend on Trove",
          text: `${name ? `${name} here. ` : ""}Let’s swap books, podcasts, shows and places on Trove:`,
          url,
        });
        return;
      } catch (err) {
        if ((err as DOMException).name === "AbortError") return;
      }
    }
    copy();
  };

  return (
    <section className="rounded-3xl bg-paper p-5">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-accent text-accent-ink">
          <Icon name="people" size={22} />
        </span>
        <div className="min-w-0">
          <p className="font-serif text-[20px] leading-tight font-medium">Invite friends</p>
          <p className="text-[14px] text-muted">Whoever opens your link can add you in one tap.</p>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-[1fr_auto] gap-2">
        <Button onClick={share} disabled={!url} icon={<Icon name="share" size={18} />}>
          Send invite link
        </Button>
        <Button variant="secondary" onClick={copy} disabled={!url} icon={<Icon name={copied ? "check" : "copy"} size={17} />}>
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
    </section>
  );
}

function AskForm({ onSent }: { onSent: () => void }) {
  const [value, setValue] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string>();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const country = guessCountry();
    if (!parseIdentifier(value, country)) {
      setError("Enter a phone number or email.");
      return;
    }
    setSending(true);
    setError(undefined);
    try {
      const res = await api<{ status: "sent" | "friends" }>("/api/friends", { body: { identifier: value, country } });
      toast(res.status === "friends" ? "You’re friends now" : "Request sent. They’ll see it in Trove.");
      setValue("");
      onSent();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSending(false);
    }
  };

  return (
    <form onSubmit={submit} className="mt-5" noValidate>
      <label htmlFor="ask-friend" className="mb-1.5 block text-[14px] text-muted">
        Or ask by phone number or email
      </label>
      <div className="flex gap-2">
        <input
          id="ask-friend"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(undefined);
          }}
          placeholder="Phone number or email"
          inputMode="email"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          className="h-12 min-w-0 flex-1 rounded-2xl border border-line bg-surface px-4 text-[16px] outline-none focus:border-ink"
        />
        <Button type="submit" variant="secondary" loading={sending} disabled={!value.trim()} className="px-5">
          Ask
        </Button>
      </div>
      {error ? (
        <p className="mt-1.5 text-[13px] text-accent">{error}</p>
      ) : (
        <p className="mt-1.5 text-[13px] text-muted">Not on Trove yet? They’ll see it when they join.</p>
      )}
    </form>
  );
}

function Heading({ children }: { children: React.ReactNode }) {
  return <h3 className="mt-7 mb-2 text-[13px] font-medium tracking-wide text-muted uppercase">{children}</h3>;
}

function summary(c: Friend["counts"]) {
  const parts = KINDS.filter((k) => c[k]).map((k) => VOCAB[k].noun(c[k]));
  return parts.length ? parts.join(" · ") : "Nothing shared yet";
}
