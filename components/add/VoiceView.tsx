"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { vocab } from "@/lib/kinds";
import { parseList } from "@/lib/parse";
import type { Candidate, Kind } from "@/lib/types";
import { Button, Icon } from "../ui";

// The Web Speech API isn't in TypeScript's DOM types yet; this is the slice we use.
type Recognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
};

/** Pauses, commas and "next" separate titles. Not "and": think War and Peace. */
const splitSpoken = (t: string) =>
  t
    .split(/\s*(?:[,;.]|\bnext\b|\bthen\b|\balso\b)\s*/i)
    .map((s) => s.trim())
    .filter((s) => s.length > 1)
    .map((s) => s.replace(/^./, (c) => c.toUpperCase()));

export function VoiceView({ kind, onReview }: { kind: Kind; onReview: (items: Candidate[]) => void }) {
  const v = vocab(kind);
  const [listening, setListening] = useState(false);
  const [lines, setLines] = useState<string[]>([]);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string>();
  const rec = useRef<Recognition | null>(null);
  const wanted = useRef(false);

  const start = () => {
    const w = window as unknown as Record<string, new () => Recognition>;
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) return setError("Dictation isn’t available in this browser.");
    const r = new Ctor();
    r.continuous = true;
    r.interimResults = true;
    r.lang = navigator.language || "en-US";
    r.onresult = (e) => {
      let pending = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) {
          const parts = splitSpoken(res[0].transcript);
          if (parts.length) {
            setLines((ls) => [...ls, ...parts]);
            navigator.vibrate?.(15);
          }
        } else pending += res[0].transcript;
      }
      setInterim(pending);
    };
    // Browsers stop listening after a silence; keep going until the user taps stop.
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
        setError("Microphone access is blocked. Allow it in your browser settings, or paste a list instead.");
      }
    };
    setError(undefined);
    wanted.current = true;
    rec.current = r;
    r.start();
    setListening(true);
  };

  const stop = () => {
    wanted.current = false;
    rec.current?.stop();
    setListening(false);
    setInterim("");
  };

  useEffect(
    () => () => {
      wanted.current = false;
      rec.current?.abort();
    },
    [],
  );

  const items = parseList(lines.join("\n"));

  return (
    <div className="flex min-h-0 flex-1 flex-col px-5">
      <div className="flex flex-col items-center pt-4 pb-6">
        <button
          onClick={listening ? stop : start}
          aria-label={listening ? "Stop listening" : "Start listening"}
          className="relative flex h-24 w-24 items-center justify-center rounded-full transition-transform active:scale-95"
        >
          {listening && (
            <>
              <motion.span className="absolute inset-0 rounded-full bg-accent/25" animate={{ scale: [1, 1.45], opacity: [0.7, 0] }} transition={{ repeat: Infinity, duration: 1.4, ease: "easeOut" }} />
              <motion.span className="absolute inset-0 rounded-full bg-accent/20" animate={{ scale: [1, 1.25], opacity: [0.8, 0] }} transition={{ repeat: Infinity, duration: 1.4, delay: 0.5, ease: "easeOut" }} />
            </>
          )}
          <span className={`relative flex h-24 w-24 items-center justify-center rounded-full shadow-float transition-colors ${listening ? "bg-accent text-accent-ink" : "bg-ink text-paper"}`}>
            {listening ? <span className="h-7 w-7 rounded-md bg-current" /> : <Icon name="mic" size={36} />}
          </span>
        </button>
        <p className="mt-5 text-center text-[16px] text-muted">
          {listening ? "Listening… say a title, pause, say the next." : lines.length ? "Tap to keep going." : `Tap and start naming ${v.many}.`}
        </p>
        {error && <p className="mt-2 text-center text-[14px] text-link">{error}</p>}
      </div>

      <ul className="min-h-0 flex-1 space-y-1.5 overflow-y-auto" data-vaul-no-drag="">
        <AnimatePresence initial={false}>
          {lines.map((line, i) => (
            <motion.li
              key={`${i}-${line}`}
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="flex items-center gap-3 rounded-2xl bg-surface-2 py-2 pr-2 pl-4"
            >
              <span className="flex-1 text-[16px]">{line}</span>
              <button onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} aria-label={`Remove ${line}`} className="flex h-8 w-8 items-center justify-center rounded-full text-muted active:bg-line">
                <Icon name="x" size={16} />
              </button>
            </motion.li>
          ))}
        </AnimatePresence>
        {interim && <li className="px-4 py-2 text-[16px] text-muted italic">{interim}…</li>}
      </ul>

      <div className="pt-3 pb-safe">
        <Button
          className="w-full"
          disabled={!items.length}
          onClick={() => {
            stop();
            onReview(items);
          }}
        >
          {items.length ? `Find ${v.noun(items.length)}` : `Find ${v.many}`}
        </Button>
      </div>
    </div>
  );
}
