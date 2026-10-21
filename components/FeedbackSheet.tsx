"use client";

import { usePathname } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/client";
import { Sheet } from "./Sheet";
import { Button, Icon } from "./ui";

// The Web Speech API isn't in TypeScript's DOM types yet; this is the slice we use.
type Recognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
};

const recognizer = () => {
  if (typeof window === "undefined") return null;
  const w = window as unknown as Record<string, (new () => Recognition) | undefined>;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

/** Feedback in as few taps as possible: talk (or type), read it back, send. */
export function FeedbackSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const page = usePathname();
  const [text, setText] = useState("");
  const [interim, setInterim] = useState("");
  const [listening, setListening] = useState(false);
  const [sending, setSending] = useState(false);
  const [canTalk] = useState(() => Boolean(recognizer()));
  const rec = useRef<Recognition | null>(null);
  const wanted = useRef(false);

  const stop = () => {
    wanted.current = false;
    rec.current?.stop();
    setListening(false);
    setInterim("");
  };
  // Stop listening when the sheet goes away.
  const change = (o: boolean) => {
    if (!o) stop();
    onOpenChange(o);
  };

  const talk = () => {
    const Ctor = recognizer();
    if (!Ctor) return;
    const r = new Ctor();
    r.continuous = true;
    r.interimResults = true;
    r.lang = navigator.language || "en-US";
    r.onresult = (e) => {
      let pending = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) {
          const said = res[0].transcript.trim();
          if (said) setText((t) => (t.trim() ? `${t.trim()} ${said}` : said.replace(/^./, (c) => c.toUpperCase())));
        } else pending += res[0].transcript;
      }
      setInterim(pending);
    };
    // Browsers stop after a pause; keep listening until they tap stop.
    r.onend = () => {
      if (wanted.current) {
        try {
          r.start();
          return;
        } catch {}
      }
      setListening(false);
      setInterim("");
    };
    r.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        wanted.current = false;
        toast.error("Microphone access is off for Trove. Allow it in your browser settings, or type instead.");
      }
    };
    wanted.current = true;
    rec.current = r;
    r.start();
    setListening(true);
    navigator.vibrate?.(15);
  };

  const send = async () => {
    stop();
    setSending(true);
    try {
      await api("/api/feedback", { body: { text, page } });
      toast("Thank you. Got it.");
      setText("");
      onOpenChange(false);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSending(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={change} title="Send feedback">
      <div className="px-5 pb-safe">
        <p className="text-[15px] leading-snug text-muted">
          What’s confusing, missing or lovely? {canTalk ? "Tap the mic and just talk." : "Type it, or use the mic on your keyboard."} It goes straight to
          the person building Trove.
        </p>
        {canTalk && (
          <button
            onClick={listening ? stop : talk}
            aria-pressed={listening}
            aria-label={listening ? "Stop listening" : "Talk"}
            className={`mx-auto mt-5 flex h-20 w-20 items-center justify-center rounded-full bg-accent text-accent-ink transition-transform active:scale-95 ${listening ? "animate-pulse" : ""}`}
          >
            <Icon name={listening ? "x" : "mic"} size={30} />
          </button>
        )}
        {canTalk && <p className="mt-2 text-center text-[13px] text-muted">{listening ? "Listening… tap to stop" : "Tap to talk"}</p>}
        <textarea
          value={interim ? `${text}${text ? " " : ""}${interim}` : text}
          onChange={(e) => !listening && setText(e.target.value)}
          readOnly={listening}
          placeholder={canTalk ? "Your words show up here. You can edit them before sending." : "What should we know?"}
          aria-label="Your feedback"
          rows={5}
          maxLength={4000}
          className="mt-4 block w-full resize-none rounded-2xl border border-line bg-surface px-4 py-3 text-[16px] leading-snug outline-none placeholder:text-muted focus:border-ink"
        />
        <Button onClick={send} loading={sending} disabled={!text.trim()} className="mt-3 mb-3 w-full" icon={<Icon name="arrow" size={18} />}>
          Send
        </Button>
      </div>
    </Sheet>
  );
}
