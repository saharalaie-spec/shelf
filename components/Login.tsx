"use client";

import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useEffect, useEffectEvent, useMemo, useRef, useState, useTransition } from "react";
import { getCountries, parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js/min";
import {
  dialCode,
  formatPhoneAsYouType,
  guessCountry,
  looksLikeEmail,
  parseIdentifier,
  type Identifier,
} from "@/lib/identifier";
import { Button, Icon, Wordmark, useHydrated } from "./ui";

type Mode = "phone" | "email";
// The key predates the name Trove; keeping it keeps the remembered number or email.
const REMEMBER_KEY = "shelf:last-login";
const RESEND_SECONDS = 20;

const ease = [0.32, 0.72, 0, 1] as const;

/** Which ways of receiving a code this server can deliver. */
export type Channels = Record<Mode, boolean>;

/** Where the code went when there's no texting/email provider (see lib/delivery.ts). */
type Delivery = { devCode?: string; codeInLogs?: boolean };

type Intro = {
  /** Replaces the sign-in headline, e.g. on an invite or a private profile. */
  heading?: string;
  subheading?: string;
};

export function Login({ channels, heading, subheading, compact }: { channels: Channels; compact?: boolean } & Intro) {
  const [step, setStep] = useState<"enter" | "code">("enter");
  const [to, setTo] = useState<Identifier | null>(null);
  const [delivery, setDelivery] = useState<Delivery>({});

  return (
    <main className={`mx-auto flex w-full max-w-md flex-col px-6 pb-safe ${compact ? "pt-4" : "min-h-dvh pt-[max(3rem,12vh)]"}`}>
      {!compact && (
        <div className="mb-10 flex items-center gap-2.5">
          <Wordmark size={28} />
        </div>
      )}
      <AnimatePresence mode="wait" initial={false}>
        {step === "enter" ? (
          <motion.div
            key="enter"
            initial={{ opacity: 0, x: -24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            transition={{ duration: 0.28, ease }}
          >
            <EnterStep
              channels={channels}
              heading={heading}
              subheading={subheading}
              onSent={(identifier, sent) => {
                setTo(identifier);
                setDelivery(sent);
                setStep("code");
              }}
            />
          </motion.div>
        ) : (
          <motion.div
            key="code"
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 24 }}
            transition={{ duration: 0.28, ease }}
          >
            <CodeStep to={to!} delivery={delivery} onDelivery={setDelivery} onBack={() => setStep("enter")} />
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}

function EnterStep({
  channels,
  heading,
  subheading,
  onSent,
}: { channels: Channels; onSent: (to: Identifier, delivery: Delivery) => void } & Intro) {
  const [mode, setMode] = useState<Mode>(channels.phone || !channels.email ? "phone" : "email");
  const both = channels.phone && channels.email;
  const none = !channels.phone && !channels.email;
  const [country, setCountry] = useState<CountryCode>("US");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string>();
  const [sending, setSending] = useState(false);
  const phoneRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);

  // Remember how this person signed in last time, so returning is one tap.
  // (Browser-only values, so they're read after hydration.)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCountry(guessCountry());
    try {
      const last = JSON.parse(localStorage.getItem(REMEMBER_KEY) ?? "null");
      if (last?.mode === "email" && channels.email) {
        setMode("email");
        setEmail(last.value ?? "");
      } else if (last?.mode === "phone" && channels.phone) {
        setPhone(last.value ?? "");
        if (last.country) setCountry(last.country);
      }
    } catch {}
  }, [channels.email, channels.phone]);

  const parsed = useMemo(
    () => (mode === "phone" ? parseIdentifier(phone, country) : parseIdentifier(email)),
    [mode, phone, email, country],
  );

  const switchMode = (next: Mode, carry?: string) => {
    if (!channels[next]) return;
    setMode(next);
    setError(undefined);
    if (carry !== undefined) (next === "email" ? setEmail : setPhone)(carry);
    requestAnimationFrame(() => (next === "email" ? emailRef : phoneRef).current?.focus());
  };

  const onPhoneChange = (raw: string) => {
    setError(undefined);
    // Typed a letter or @? They meant email; take them there without losing a keystroke.
    if (looksLikeEmail(raw) && channels.email) return switchMode("email", raw);
    // Autofilled "+44 7700 900123": adopt the number's own country and show it nationally.
    if (raw.startsWith("+")) {
      const p = parsePhoneNumberFromString(raw);
      if (p?.isValid() && p.country) {
        setCountry(p.country);
        setPhone(p.formatNational());
        return;
      }
    }
    // Only reformat while typing forward, so backspace never fights the formatter.
    setPhone(raw.length > phone.length ? formatPhoneAsYouType(raw, country) : raw);
  };

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!parsed || sending) {
      if (!parsed) setError(mode === "phone" ? "Check the number." : "Check the email address.");
      return;
    }
    setSending(true);
    setError(undefined);
    try {
      const res = await fetch("/api/auth/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: parsed.value, country }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      try {
        localStorage.setItem(
          REMEMBER_KEY,
          JSON.stringify({ mode, value: mode === "phone" ? phone : email, country }),
        );
      } catch {}
      onSent(data.to, { devCode: data.devCode, codeInLogs: data.codeInLogs });
    } catch (err) {
      setError((err as Error).message || "Couldn't send the code.");
      setSending(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate>
      <h1 className="font-serif text-[40px] leading-[1.05] font-medium tracking-tight text-balance">
        {heading ?? "Where curious minds open new worlds for one another."}
      </h1>
      <p className="mt-4 text-[17px] text-muted">
        {subheading ?? `Sign in with your ${both ? "phone or email" : mode === "phone" ? "phone number" : "email address"}.`} No
        passwords, ever.
      </p>

      {none && (
        <p className="mt-6 rounded-2xl border border-dashed border-line p-4 text-[14px] text-ink-2">
          Sign-in codes aren&rsquo;t switched on for this server yet. Its owner needs to add a texting or email provider,
          or set <code className="font-mono">ALLOW_DEV_CODES</code> to their phone number, then redeploy.
        </p>
      )}

      <div className={`mt-9 gap-1 rounded-full bg-surface-2 p-1 text-[15px] font-medium ${both ? "flex" : "hidden"}`} role="tablist">
        {(["phone", "email"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => switchMode(m)}
            className="relative flex h-10 flex-1 items-center justify-center gap-2 rounded-full"
          >
            {mode === m && (
              <motion.span
                layoutId="mode-pill"
                className="absolute inset-0 rounded-full bg-surface shadow-book"
                transition={{ type: "spring", bounce: 0.15, duration: 0.4 }}
              />
            )}
            <span className={`relative flex items-center gap-2 ${mode === m ? "text-ink" : "text-muted"}`}>
              <Icon name={m === "phone" ? "phone" : "mail"} size={17} />
              {m === "phone" ? "Phone" : "Email"}
            </span>
          </button>
        ))}
      </div>

      <div
        className={`${both ? "mt-3" : "mt-9"} flex h-16 items-center rounded-2xl border bg-surface transition-colors focus-within:border-ink ${
          error ? "border-accent" : "border-line"
        }`}
      >
        {mode === "phone" ? (
          <>
            <label className="relative flex h-full shrink-0 items-center gap-1.5 border-r border-line pr-3 pl-4 text-[17px]">
              <span aria-hidden>{flag(country)}</span>
              <span className="text-ink-2 tabular-nums">{dialCode(country)}</span>
              <CountrySelect value={country} onChange={setCountry} />
            </label>
            <input
              ref={phoneRef}
              key="phone"
              autoFocus
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="Phone number"
              value={phone}
              onChange={(e) => onPhoneChange(e.target.value)}
              className="h-full min-w-0 flex-1 bg-transparent px-3 text-[19px] tracking-wide outline-none placeholder:text-muted/70"
            />
          </>
        ) : (
          <input
            ref={emailRef}
            key="email"
            autoFocus
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="you@example.com"
            value={email}
            onChange={(e) => {
              setError(undefined);
              setEmail(e.target.value);
            }}
            className="h-full min-w-0 flex-1 bg-transparent px-4 text-[19px] outline-none placeholder:text-muted/70"
          />
        )}
      </div>

      <div className="mt-2 min-h-6 text-[14px] text-link" aria-live="polite">
        {error}
      </div>

      <Button type="submit" className="mt-2 w-full" loading={sending} disabled={!parsed || none}>
        Send me a code
      </Button>
      <p className="mt-4 text-center text-[13px] text-muted">
        We&rsquo;ll {mode === "phone" ? "text" : "email"} you a 6-digit code. That&rsquo;s it.
      </p>
    </form>
  );
}

function CountrySelect({ value, onChange }: { value: CountryCode; onChange: (c: CountryCode) => void }) {
  // Country names come from the visitor's own locale, which the server can't know; list them after hydration.
  const hydrated = useHydrated();
  const options = useMemo(() => {
    if (!hydrated) return [{ code: value, name: value }];
    const names = new Intl.DisplayNames(undefined, { type: "region" });
    return getCountries()
      .map((c) => ({ code: c, name: names.of(c) ?? c }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [hydrated, value]);
  // The native picker is the smoothest on phones; it sits invisibly over the flag.
  return (
    <select
      aria-label="Country"
      value={value}
      onChange={(e) => onChange(e.target.value as CountryCode)}
      className="absolute inset-0 cursor-pointer opacity-0"
    >
      {options.map((o) => (
        <option key={o.code} value={o.code}>
          {`${o.name} (${dialCode(o.code)})`}
        </option>
      ))}
    </select>
  );
}

function flag(country: string) {
  return String.fromCodePoint(...[...country].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

function CodeStep({
  to,
  delivery: { devCode, codeInLogs },
  onDelivery,
  onBack,
}: {
  to: Identifier;
  delivery: Delivery;
  onDelivery: (d: Delivery) => void;
  onBack: () => void;
}) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string>();
  const [shakeKey, setShakeKey] = useState(0);
  const [verifying, setVerifying] = useState(false);
  const [done, setDone] = useState(false);
  const [, startTransition] = useTransition();
  const [cooldown, setCooldown] = useState(RESEND_SECONDS);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const verify = async (value: string) => {
    setVerifying(true);
    setError(undefined);
    try {
      const res = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: to.value, code: value }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setDone(true);
      startTransition(() => router.refresh());
    } catch (err) {
      setError((err as Error).message);
      setShakeKey((k) => k + 1);
      setCode("");
      setVerifying(false);
      navigator.vibrate?.(40);
      inputRef.current?.focus();
    }
  };

  // Submit the moment the sixth digit lands — no button to hunt for.
  const enter = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 6);
    setError(undefined);
    setCode(digits);
    if (digits.length === 6 && !verifying && !done) verify(digits);
  };

  // Android Chrome can read the code straight from the SMS (WebOTP).
  const onSmsCode = useEffectEvent(enter);
  useEffect(() => {
    if (to.kind !== "phone" || !("OTPCredential" in window)) return;
    const ac = new AbortController();
    navigator.credentials
      .get({ otp: { transport: ["sms"] }, signal: ac.signal } as CredentialRequestOptions)
      .then((cred) => {
        const otp = (cred as unknown as { code?: string } | null)?.code;
        if (otp) onSmsCode(otp);
      })
      .catch(() => {});
    return () => ac.abort();
  }, [to.kind]);

  const resend = async () => {
    setCooldown(RESEND_SECONDS);
    setError(undefined);
    const res = await fetch("/api/auth/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: to.value }),
    });
    const data = await res.json();
    if (!res.ok) setError(data.error);
    else onDelivery({ devCode: data.devCode, codeInLogs: data.codeInLogs });
    inputRef.current?.focus();
  };

  return (
    <div>
      <button
        type="button"
        onClick={onBack}
        className="-ml-2 mb-6 flex h-10 items-center gap-1 rounded-full pr-3 pl-2 text-[15px] text-muted active:bg-surface-2"
      >
        <Icon name="back" size={18} /> Back
      </button>
      <h1 className="font-serif text-[36px] leading-[1.1] font-medium tracking-tight">
        {codeInLogs ? "Enter your code" : `Check your ${to.kind === "phone" ? "messages" : "inbox"}`}
      </h1>
      <p className="mt-3 text-[17px] text-muted">
        {codeInLogs ? "Enter the code for " : "Enter the code we sent to "}
        <span className="font-medium text-ink">{to.display}</span>
      </p>

      <div key={shakeKey} className={`relative mt-8 ${shakeKey ? "animate-shake" : ""}`}>
        <input
          ref={inputRef}
          autoFocus
          value={code}
          onChange={(e) => enter(e.target.value)}
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          maxLength={6}
          disabled={verifying || done}
          aria-label="6-digit code"
          className="absolute inset-0 z-10 w-full cursor-text bg-transparent text-[16px] text-transparent caret-transparent outline-none selection:bg-transparent"
        />
        <div className="grid grid-cols-6 gap-2" aria-hidden>
          {Array.from({ length: 6 }, (_, i) => {
            const char = code[i];
            const active = i === code.length && !verifying && !done;
            return (
              <div
                key={i}
                className={`flex aspect-[4/5] items-center justify-center rounded-2xl border bg-surface font-serif text-[30px] tabular-nums transition-colors ${
                  done ? "border-good text-good" : error ? "border-accent" : active ? "border-ink" : "border-line"
                }`}
              >
                {char ? (
                  <motion.span initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
                    {char}
                  </motion.span>
                ) : active ? (
                  <span className="h-7 w-[2px] animate-caret rounded bg-ink" />
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-3 min-h-6 text-[14px] text-link" aria-live="polite">
        {done ? <span className="text-good">You&rsquo;re in. Opening your trove…</span> : error}
      </div>

      <div className="mt-3 text-[15px] text-muted">
        {cooldown > 0 ? (
          <span>Didn&rsquo;t get it? You can resend in {cooldown}s</span>
        ) : (
          <button type="button" onClick={resend} className="font-medium text-ink underline-offset-4 hover:underline">
            Send a new code
          </button>
        )}
      </div>

      {devCode && (
        <button
          type="button"
          onClick={() => enter(devCode)}
          className="mt-8 flex w-full items-center justify-between gap-3 rounded-2xl border border-dashed border-line px-4 py-3 text-left text-[14px] text-muted active:bg-surface-2"
        >
          <span>
            <span className="block font-medium text-ink-2">Dev mode: no {to.kind === "phone" ? "SMS" : "email"} provider set up</span>
            Your code is <span className="font-mono text-ink">{devCode}</span>
          </span>
          <span className="rounded-full bg-surface-2 px-3 py-1.5 font-medium text-ink">Fill</span>
        </button>
      )}

      {codeInLogs && (
        <p className="mt-8 rounded-2xl border border-dashed border-line px-4 py-3 text-[14px] text-muted">
          <span className="block font-medium text-ink-2">No {to.kind === "phone" ? "texting" : "email"} provider connected yet</span>
          Your code is in the server log. On Vercel: your project → <b className="font-medium text-ink-2">Logs</b>, then look
          for &ldquo;Login code&rdquo;.
        </p>
      )}
    </div>
  );
}
