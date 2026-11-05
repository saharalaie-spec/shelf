"use client";

import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useEffect, useEffectEvent, useState } from "react";
import { toast } from "sonner";
import { api, trackAction } from "@/lib/client";
import { guessCountry, parseIdentifier } from "@/lib/identifier";
import { isSampleId, SAMPLE_FRIEND_NAME } from "@/lib/sample";
import { VOCAB } from "@/lib/kinds";
import type { Friend, IncomingRequest, OutgoingRequest } from "@/lib/social";
import { KINDS } from "@/lib/types";
import { Avatar, Button, Icon } from "./ui";

type Data = {
  friends: Friend[];
  incoming: IncomingRequest[];
  outgoing: OutgoingRequest[];
  inviteUrl: string;
};

type Props = {
  name: string | null;
  onName: (name: string) => void;
  /** Keeps the requests count in step. */
  onPending: (count: number) => void;
  /** Your friends changed, so Lately should refresh. */
  onTableChange: () => void;
};

/** Inviting people, answering requests, and your friends. */
export function FriendsPanel({ name, onName, onPending, onTableChange }: Props) {
  const [data, setData] = useState<Data | null>(null);

  const apply = (d: Data) => {
    setData(d);
    onPending(d.incoming.length);
  };
  const reload = () => api<Data>("/api/friends").then(apply);
  const loaded = useEffectEvent(apply);

  useEffect(() => {
    let cancelled = false;
    api<Data>("/api/friends")
      .then((d) => !cancelled && loaded(d))
      .catch((err) => toast.error(err.message));
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <FriendsBody data={data} setData={setData} name={name} onName={onName} reload={reload} onPending={onPending} onTableChange={onTableChange} />
  );
}

type BodyProps = {
  data: Data | null;
  setData: React.Dispatch<React.SetStateAction<Data | null>>;
  name: string | null;
  onName: (name: string) => void;
  reload: () => Promise<void>;
  onPending: (count: number) => void;
  onTableChange: () => void;
};

function FriendsBody({ data, setData, name, onName, reload, onPending, onTableChange }: BodyProps) {
  const [busy, setBusy] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  const q = filter.trim().toLowerCase();
  const shown = data ? data.friends.filter((f) => !q || (f.name ?? "").toLowerCase().includes(q)) : [];

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

  const hasFriends = (data?.friends.length ?? 0) > 0;
  const invite = (
    <InviteCard
      url={data?.inviteUrl ?? null}
      name={name}
      outgoing={data?.outgoing ?? []}
      onCancel={cancel}
      onSent={() => reload().catch(() => {})}
      first={!hasFriends}
    />
  );

  // What needs an answer first, then your friends, then adding more. With nobody yet, adding comes first.
  return (
    <div className="pb-safe">
      {!name && <NamePrompt onName={onName} />}

      <AnimatePresence initial={false}>
        {data && data.incoming.length > 0 && (
          <motion.section key="incoming" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
            <Heading first>Requests · {data.incoming.length}</Heading>
            <ul className="space-y-2">
              {data.incoming.map((r) => (
                <motion.li
                  key={r.id}
                  layout
                  exit={{ opacity: 0, x: 40 }}
                  className="flex items-center gap-3 rounded-2xl bg-surface p-3 shadow-book"
                >
                  <Avatar name={r.from.name} photo={r.from.photo} size={44} />
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

      {!hasFriends && data && (
        <>
          <div className={data.incoming.length ? "mt-7" : ""}>{invite}</div>
          {!data.friends.some((f) => isSampleId(f.id)) && (
            <SampleCard
              onAdded={() => {
                reload().catch(() => {});
                onTableChange();
              }}
            />
          )}
        </>
      )}

      {!data ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-3 p-1">
              <div className="skeleton h-11 w-11 rounded-full" />
              <div className="flex-1 space-y-1.5">
                <div className="skeleton h-3.5 w-1/3 rounded" />
                <div className="skeleton h-3 w-1/2 rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        hasFriends && (
          <>
            <Heading first={!data.incoming.length}>Friends · {data.friends.length}</Heading>
            {data.friends.length > 12 && (
              <input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Find a friend"
                aria-label="Find a friend"
                className="mb-2 h-11 w-full rounded-2xl border border-line bg-surface px-4 text-[16px] outline-none focus:border-ink"
              />
            )}
            <ul className="-mx-2">
              {shown.map((f) => (
                <li key={f.id}>
                  <Link href={`/u/${f.handle ?? f.id}`} className="flex min-w-0 items-center gap-3 rounded-2xl px-2 py-2.5 active:bg-surface-2">
                    <Avatar name={f.name} photo={f.photo} size={44} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[16px] font-medium">
                        {f.name ?? "Trove member"}
                        {isSampleId(f.id) && <span className="ml-1.5 text-[12px] font-normal text-muted">Imaginary friend</span>}
                      </span>
                      <span className="block truncate text-[13px] text-muted">
                        {f.now ? `${VOCAB[f.now.kind].nowVerb} ${f.now.title}` : summary(f.counts)}
                      </span>
                      {(f.fromThem > 0 || f.fromMe > 0) && <span className="block truncate text-[13px] text-ink-2">{swapLine(f)}</span>}
                    </span>
                    <Icon name="chevron" size={16} className="shrink-0 text-muted" />
                  </Link>
                </li>
              ))}
            </ul>

            <Heading>Add friends</Heading>
            {invite}
          </>
        )
      )}

      <p className="mt-8 mb-3 flex gap-2 text-[12px] leading-snug text-muted">
        <Icon name="lock" size={14} className="mt-px shrink-0" />
        Friends see what you add, except anything you mark private.
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

function InviteCard({
  url,
  name,
  outgoing,
  onCancel,
  onSent,
  first,
}: {
  url: string | null;
  name: string | null;
  /** Requests you've sent that haven't been answered. */
  outgoing: OutgoingRequest[];
  onCancel: (r: OutgoingRequest) => void;
  onSent: () => void;
  /** Nobody yet: the card leads the page, with its own title. */
  first: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [asking, setAsking] = useState(false);

  const copy = async () => {
    if (!url) return;
    await navigator.clipboard.writeText(url);
    trackAction("invite_share", "copy");
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
        trackAction("invite_share", "share");
        return;
      } catch (err) {
        if ((err as DOMException).name === "AbortError") return;
      }
    }
    copy();
  };

  return (
    <section className="rounded-3xl bg-surface p-4 shadow-book">
      {first && (
        <div className="mb-4 flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent text-accent-ink">
            <Icon name="people" size={22} />
          </span>
          <div className="min-w-0">
            <p className="font-serif text-[20px] leading-tight font-medium">Invite friends</p>
            <p className="text-[14px] text-muted">Whoever opens your link can add you in one tap.</p>
          </div>
        </div>
      )}
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <Button onClick={share} disabled={!url} icon={<Icon name="share" size={18} />}>
          Send invite link
        </Button>
        <Button variant="secondary" onClick={copy} disabled={!url} icon={<Icon name={copied ? "check" : "copy"} size={17} />}>
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      {asking ? (
        <AskForm onSent={onSent} />
      ) : (
        <button
          onClick={() => setAsking(true)}
          className="mt-1 flex h-11 w-full items-center justify-center gap-1.5 rounded-full text-[14px] font-medium text-ink-2 active:bg-surface-2"
        >
          <Icon name="addPerson" size={16} /> Add by phone or email
        </button>
      )}
      {outgoing.length > 0 && (
        <div className="mt-3 border-t border-line pt-3">
          <p className="mb-1 text-[13px] text-muted">Waiting to hear back</p>
          <ul>
            {outgoing.map((r) => (
              <li key={r.id} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-[15px] text-ink-2">{r.display}</span>
                <button onClick={() => onCancel(r)} className="h-9 rounded-full px-3 text-[14px] font-medium text-muted active:bg-surface-2">
                  Cancel
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
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
    <form onSubmit={submit} className="mt-3" noValidate>
      <label htmlFor="ask-friend" className="sr-only">
        Their phone number or email
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
          // Opened by tapping "Add by phone or email", so they're here to type.
          autoFocus
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
        <p className="mt-1.5 text-[13px] text-link">{error}</p>
      ) : (
        <p className="mt-1.5 text-[13px] text-muted">Not on Trove yet? They’ll see it when they join.</p>
      )}
    </form>
  );
}

/** Juno, so there's something to see before your friends join. */
export function SampleCard({ onAdded, compact }: { onAdded: () => void; compact?: boolean }) {
  const [adding, setAdding] = useState(false);
  const add = async () => {
    setAdding(true);
    try {
      await api("/api/friends/sample", { method: "POST" });
      toast(`${SAMPLE_FRIEND_NAME} is your friend now. See what she’s into on Lately.`);
      onAdded();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setAdding(false);
    }
  };
  return (
    <section className={`rounded-3xl border border-dashed border-line p-4 ${compact ? "mt-5 text-left" : "mt-5"}`}>
      <p className="text-[16px] font-medium">Add {SAMPLE_FRIEND_NAME}, an imaginary friend</p>
      <p className="mt-0.5 text-[14px] leading-snug text-muted">
        Her books, podcasts, shows and spots grow from your taste, so you can see how Trove works with friends.
        Remove her anytime.
      </p>
      <Button variant="secondary" onClick={add} loading={adding} className="mt-3 w-full">
        Add {SAMPLE_FRIEND_NAME}
      </Button>
    </section>
  );
}

function Heading({ children, aside, first }: { children: React.ReactNode; aside?: React.ReactNode; first?: boolean }) {
  return (
    <div className={`${first ? "" : "mt-7"} mb-2 flex items-baseline justify-between gap-2`}>
      <h3 className="text-[13px] font-medium tracking-wide text-muted uppercase">{children}</h3>
      {aside}
    </div>
  );
}

/** "You saved 3 of their picks · they saved 1 of yours" */
function swapLine(f: Friend) {
  const pick = (n: number) => `${n.toLocaleString()} ${n === 1 ? "pick" : "picks"}`;
  return [
    f.fromThem > 0 && `You saved ${pick(f.fromThem)} from them`,
    f.fromMe > 0 && `${f.fromThem > 0 ? "they" : "They"} saved ${f.fromMe.toLocaleString()} of yours`,
  ]
    .filter(Boolean)
    .join(" · ");
}

function summary(c: Friend["counts"]) {
  const parts = KINDS.filter((k) => c[k]).map((k) => VOCAB[k].noun(c[k]));
  return parts.length ? parts.join(" · ") : "Nothing shared yet";
}
