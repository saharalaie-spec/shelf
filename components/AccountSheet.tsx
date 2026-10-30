"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/client";
import { FeedbackSheet } from "./FeedbackSheet";
import { Sheet } from "./Sheet";
import { Avatar, Button, Icon, Switch, useHydrated } from "./ui";

export type Profile = {
  id: string;
  name: string | null;
  handle: string | null;
  isPublic: boolean;
  shareActivity: boolean;
  photo: string | null;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profile: Profile;
  contact: string;
  /** "46 books": how much is in the collection on screen. */
  countLabel: string;
  privateCount: number;
  onProfile: (patch: Partial<Profile>) => void;
};

export function AccountSheet({ open, onOpenChange, ...rest }: Props) {
  const [feedback, setFeedback] = useState(false);
  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange} title="You">
        <AccountBody
          {...rest}
          onFeedback={() => {
            onOpenChange(false);
            // One sheet at a time: open it once this one has slid away.
            setTimeout(() => setFeedback(true), 320);
          }}
        />
      </Sheet>
      <FeedbackSheet open={feedback} onOpenChange={setFeedback} />
    </>
  );
}

const PHOTO_PX = 800;

/** A square, centered crop of the photo, shrunk to PHOTO_PX and saved as JPEG (so an iPhone's HEIC works too). */
async function squarePhoto(file: File): Promise<Blob> {
  const image = await createImageBitmap(file);
  const side = Math.min(image.width, image.height);
  const out = Math.min(PHOTO_PX, side);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = out;
  canvas.getContext("2d")!.drawImage(image, (image.width - side) / 2, (image.height - side) / 2, side, side, 0, 0, out, out);
  image.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn’t read that photo."))), "image/jpeg", 0.86),
  );
}

/** Your photo: tap to add or change it, hold to see it large. */
function PhotoPicker({ name, photo, onPhoto }: { name: string | null; photo: string | null; onPhoto: (photo: string | null) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const upload = async (file: File) => {
    setBusy(true);
    try {
      const form = new FormData();
      form.append("photo", await squarePhoto(file).catch(() => file), "photo.jpg");
      const res = await fetch("/api/me/photo", { method: "POST", body: form });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Couldn’t save that photo. Try again.");
      onPhoto(body.photo);
      toast("Photo saved");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    const before = photo;
    onPhoto(null);
    try {
      await api("/api/me/photo", { method: "DELETE" });
    } catch (err) {
      onPhoto(before);
      toast.error((err as Error).message);
    }
  };

  return (
    <div className="flex items-center gap-4">
      <button
        onClick={() => input.current?.click()}
        disabled={busy}
        aria-label={photo ? "Change your photo" : "Add a photo"}
        className={`relative shrink-0 rounded-full transition-transform active:scale-95 ${busy ? "opacity-60" : ""}`}
      >
        {photo ? (
          <Avatar name={name} photo={photo} size={72} />
        ) : (
          <span className="flex h-[72px] w-[72px] items-center justify-center rounded-full border border-dashed border-line bg-surface-2 text-muted">
            <Icon name="camera" size={26} />
          </span>
        )}
      </button>
      <div className="min-w-0">
        <button onClick={() => input.current?.click()} disabled={busy} className="block text-[16px] font-medium text-ink active:opacity-60">
          {busy ? "Saving…" : photo ? "Change photo" : "Add a photo"}
        </button>
        {photo ? (
          <button onClick={remove} disabled={busy} className="mt-0.5 block text-[14px] text-muted active:opacity-60">
            Remove
          </button>
        ) : (
          <p className="mt-0.5 text-[13px] leading-snug text-muted">Friends see it on requests and your profile.</p>
        )}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) upload(file);
        }}
      />
    </div>
  );
}

const HANDLE_RE = /^[a-z0-9][a-z0-9_.]{1,18}[a-z0-9]$/;

function AccountBody({
  profile,
  contact,
  countLabel,
  privateCount,
  onProfile,
  onFeedback,
}: Omit<Props, "open" | "onOpenChange"> & { onFeedback: () => void }) {
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
      <PhotoPicker name={name} photo={profile.photo} onPhoto={(photo) => onProfile({ photo })} />
      <p className="mt-4 text-[15px] text-muted">
        {contact} · {countLabel}
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

      <p className="mt-7 mb-2 text-[13px] font-medium tracking-wide text-muted uppercase">Who sees your trove</p>
      <ProfileSettings profile={profile} privateCount={privateCount} onProfile={onProfile} />

      <Button variant="secondary" className="mt-7 w-full" onClick={onFeedback} icon={<Icon name="mic" size={18} />}>
        Send feedback
      </Button>
      <Button variant="secondary" className="mt-2 w-full" loading={leaving === "here"} disabled={leaving !== null} onClick={() => signOut(false)}>
        Sign out
      </Button>
      <Button variant="ghost" className="mt-1 w-full text-[15px]" loading={leaving === "everywhere"} disabled={leaving !== null} onClick={() => signOut(true)}>
        Sign out on all devices
      </Button>
      <DeleteAccount />
    </div>
  );
}

/** Deleting your account, behind one clear confirmation. */
function DeleteAccount() {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const remove = async () => {
    setDeleting(true);
    try {
      await api("/api/me", { method: "DELETE" });
      // Signed out now: home shows the sign-in screen, and signing in again starts a brand-new account.
      router.replace("/");
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message);
      setDeleting(false);
    }
  };

  if (!asking) {
    return (
      <button onClick={() => setAsking(true)} className="mt-4 mb-4 block w-full py-2 text-center text-[14px] font-medium text-link active:opacity-60">
        Delete account
      </button>
    );
  }
  return (
    <div
      ref={(el) => el?.scrollIntoView({ behavior: "smooth", block: "nearest" })}
      className="mt-4 mb-4 rounded-2xl border border-accent/40 p-4"
      role="alertdialog"
      aria-label="Delete your account?"
    >
      <p className="text-[16px] font-medium">Delete your account?</p>
      <p className="mt-1 text-[14px] leading-snug text-muted">
        Everything goes: your lists, places, share links, friends and notes. It can’t be undone. Things friends saved from
        you stay on their lists.
      </p>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={() => setAsking(false)} disabled={deleting}>
          Keep it
        </Button>
        <Button variant="accent" onClick={remove} loading={deleting}>
          Delete
        </Button>
      </div>
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

  const setActivity = async (shareActivity: boolean) => {
    onProfile({ shareActivity });
    try {
      await api("/api/me", { method: "PATCH", body: { shareActivity } });
      toast(shareActivity ? "Friends see what you’re into on their Table" : "You’re off friends’ Table");
    } catch (err) {
      onProfile({ shareActivity: !shareActivity });
      toast.error((err as Error).message);
    }
  };

  const setPublic = async (isPublic: boolean) => {
    setSaving(true);
    onProfile({ isPublic });
    try {
      const saved = await api<{ handle?: string | null }>("/api/me", { method: "PATCH", body: { isPublic } });
      if (saved.handle) {
        onProfile({ handle: saved.handle });
        setHandle(saved.handle);
      }
      toast(isPublic ? "Your profile is public" : "Only friends can see your trove now");
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
      <label className="flex cursor-pointer items-center gap-3 border-b border-line/70 px-4 py-3.5">
        <Icon name="people" size={20} className="shrink-0 text-ink-2" />
        <span className="min-w-0 flex-1">
          <span className="block text-[16px] font-medium">Show what I’m into</span>
          <span className="block text-[13px] leading-snug text-muted">
            {profile.shareActivity
              ? "What you start and finish shows on friends’ Table."
              : "Off: you’re not on friends’ Table. Your lists don’t change."}
          </span>
        </span>
        <Switch checked={profile.shareActivity} onChange={setActivity} label="Show what I’m into" />
      </label>
      <label className="flex cursor-pointer items-center gap-3 px-4 py-3.5">
        <Icon name={profile.isPublic ? "globe" : "lock"} size={20} className="shrink-0 text-ink-2" />
        <span className="min-w-0 flex-1">
          <span className="block text-[16px] font-medium">Public profile</span>
          <span className="block text-[13px] leading-snug text-muted">
            {profile.isPublic ? "Anyone with your link can see your trove." : "Off: only friends can see your trove."}
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
            <p className="mt-1.5 text-[13px] text-link">{error}</p>
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
            {privateCount ? `${privateCount.toLocaleString()} private hidden here` : "Anything can be made private from its page"}
          </span>
        </span>
        <Icon name="chevron" size={16} className="shrink-0 text-muted" />
      </Link>
    </div>
  );
}
