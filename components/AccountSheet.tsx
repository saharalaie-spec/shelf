"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api, plural } from "@/lib/client";
import { Sheet } from "./Sheet";
import { Button, Icon, Switch, useHydrated } from "./ui";

export type Profile = { id: string; name: string | null; handle: string | null; isPublic: boolean };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profile: Profile;
  contact: string;
  count: number;
  privateCount: number;
  onProfile: (patch: Partial<Profile>) => void;
};

export function AccountSheet({ open, onOpenChange, ...rest }: Props) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="You">
      <AccountBody {...rest} />
    </Sheet>
  );
}

const HANDLE_RE = /^[a-z0-9][a-z0-9_.]{1,18}[a-z0-9]$/;

function AccountBody({ profile, contact, count, privateCount, onProfile }: Omit<Props, "open" | "onOpenChange">) {
  const [draft, setDraft] = useState(profile.name ?? "");
  const [leaving, setLeaving] = useState<"here" | "everywhere" | null>(null);
  const { name } = profile;

  // Save as you type (debounced), so closing the sheet never loses an edit.
  useEffect(() => {
    const n = draft.trim() || null;
    if (n === name) return;
    const t = setTimeout(() => {
      onProfile({ name: n });
      api("/api/me", { method: "PATCH", body: { name: n ?? "" } }).catch(() => {});
    }, 400);
    return () => clearTimeout(t);
  }, [draft, name, onProfile]);

  const signOut = async (everywhere: boolean) => {
    setLeaving(everywhere ? "everywhere" : "here");
    await api("/api/auth/logout", { body: { everywhere } }).catch(() => {});
    window.location.reload();
  };

  return (
    <div className="overflow-y-auto px-5 pb-safe" data-vaul-no-drag="">
      <p className="text-[15px] text-muted">
        {contact} · {plural(count, "book")}
      </p>
      <label className="mt-5 mb-1.5 block text-[14px] text-muted">Your name</label>
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        placeholder="First name"
        autoComplete="given-name"
        maxLength={40}
        className="h-12 w-full rounded-2xl border border-line bg-surface px-4 text-[17px] outline-none focus:border-ink"
      />

      <p className="mt-7 mb-2 text-[13px] font-medium tracking-wide text-muted uppercase">Who sees your shelf</p>
      <ProfileSettings profile={profile} privateCount={privateCount} onProfile={onProfile} />

      <Button variant="secondary" className="mt-7 w-full" loading={leaving === "here"} disabled={leaving !== null} onClick={() => signOut(false)}>
        Sign out
      </Button>
      <Button variant="ghost" className="mt-1 mb-2 w-full text-[15px]" loading={leaving === "everywhere"} disabled={leaving !== null} onClick={() => signOut(true)}>
        Sign out on all devices
      </Button>
    </div>
  );
}

function ProfileSettings({
  profile,
  privateCount,
  onProfile,
}: {
  profile: Profile;
  privateCount: number;
  onProfile: (patch: Partial<Profile>) => void;
}) {
  const hydrated = useHydrated();
  const [saving, setSaving] = useState(false);
  const [handle, setHandle] = useState(profile.handle ?? "");
  const [error, setError] = useState<string>();
  const [copied, setCopied] = useState(false);
  const ref = profile.handle ?? profile.id;
  const host = hydrated ? window.location.host : "";
  const url = hydrated ? `${window.location.origin}/u/${ref}` : "";

  const setPublic = async (isPublic: boolean) => {
    setSaving(true);
    onProfile({ isPublic });
    try {
      const saved = await api<{ handle?: string | null }>("/api/me", { method: "PATCH", body: { isPublic } });
      if (saved.handle) {
        onProfile({ handle: saved.handle });
        setHandle(saved.handle);
      }
      toast(isPublic ? "Your profile is public" : "Only friends can see your shelf now");
    } catch (err) {
      onProfile({ isPublic: !isPublic });
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const saveHandle = async () => {
    const next = handle.trim().toLowerCase().replace(/^@/, "");
    if (next === (profile.handle ?? "")) return;
    if (next && !HANDLE_RE.test(next)) {
      setError("3–20 letters, numbers, dots or underscores.");
      return;
    }
    try {
      const saved = await api<{ handle: string | null }>("/api/me", { method: "PATCH", body: { handle: next || null } });
      onProfile({ handle: saved.handle });
      setHandle(saved.handle ?? "");
      setError(undefined);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const copy = async () => {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
    toast("Profile link copied");
  };

  return (
    <div className="overflow-hidden rounded-2xl bg-paper">
      <label className="flex cursor-pointer items-center gap-3 px-4 py-3.5">
        <Icon name={profile.isPublic ? "globe" : "lock"} size={20} className="shrink-0 text-ink-2" />
        <span className="min-w-0 flex-1">
          <span className="block text-[16px] font-medium">Public profile</span>
          <span className="block text-[13px] leading-snug text-muted">
            {profile.isPublic ? "Anyone with your link can see your shelf." : "Off: only friends can see your shelf."}
          </span>
        </span>
        <Switch checked={profile.isPublic} onChange={setPublic} label="Public profile" disabled={saving} />
      </label>

      {profile.isPublic && (
        <div className="border-t border-line/70 px-4 py-3.5">
          <div className="flex h-11 items-center rounded-xl border border-line bg-surface pr-1 pl-3 focus-within:border-ink">
            <span className="shrink-0 text-[15px] text-muted">{host ? `${host}/u/` : "/u/"}</span>
            <input
              value={handle}
              onChange={(e) => {
                setHandle(e.target.value);
                setError(undefined);
              }}
              onBlur={saveHandle}
              onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
              placeholder="yourname"
              aria-label="Profile link name"
              autoCapitalize="off"
              autoComplete="off"
              spellCheck={false}
              maxLength={20}
              className="h-full min-w-0 flex-1 bg-transparent text-[15px] outline-none"
            />
            <button
              onClick={copy}
              disabled={!url || handle.trim() !== (profile.handle ?? "")}
              className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-surface-2 px-3 text-[14px] font-medium active:scale-95 disabled:opacity-50"
            >
              <Icon name={copied ? "check" : "copy"} size={15} />
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          {error ? (
            <p className="mt-1.5 text-[13px] text-accent">{error}</p>
          ) : (
            <p className="mt-1.5 text-[13px] text-muted">Your profile isn’t listed or searchable; people need the link.</p>
          )}
        </div>
      )}

      <Link href={`/u/${ref}`} className="flex items-center gap-3 border-t border-line/70 px-4 py-3.5 active:bg-surface-2">
        <Icon name="eye" size={20} className="shrink-0 text-ink-2" />
        <span className="min-w-0 flex-1">
          <span className="block text-[16px] font-medium">See what friends see</span>
          <span className="block text-[13px] text-muted">
            {privateCount ? `${plural(privateCount, "private book")} hidden` : "Mark a book private from its page"}
          </span>
        </span>
        <Icon name="chevron" size={16} className="shrink-0 text-muted" />
      </Link>
    </div>
  );
}
