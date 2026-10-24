"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

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

/** Adds what was just said to what's there, capitalizing a fresh start. */
export const appendSaid = (text: string, said: string) => (text.trim() ? `${text.trim()} ${said}` : said.replace(/^./, (c) => c.toUpperCase()));

/**
 * Talk instead of type, where the browser can listen. `talk(onSaid)` hands over each finished phrase; `interim` is
 * the phrase still being heard. Listening keeps going through pauses until `stop()`, which hands over the phrase still
 * being heard too (unless `keep` is false, for when the caller already took it), and stops when the component goes.
 */
export function useDictation() {
  const [interim, setInterim] = useState("");
  const [listening, setListening] = useState(false);
  const [canTalk] = useState(() => Boolean(recognizer()));
  const rec = useRef<Recognition | null>(null);
  const wanted = useRef(false);
  const said = useRef<((said: string) => void) | null>(null);
  const pending = useRef("");

  const stop = (keep = true) => {
    wanted.current = false;
    rec.current?.stop();
    const rest = pending.current.trim();
    if (keep && rest) said.current?.(rest);
    pending.current = "";
    setListening(false);
    setInterim("");
  };

  useEffect(
    () => () => {
      wanted.current = false;
      rec.current?.stop();
    },
    [],
  );

  const talk = (onSaid: (said: string) => void) => {
    const Ctor = recognizer();
    if (!Ctor) return;
    const r = new Ctor();
    r.continuous = true;
    r.interimResults = true;
    r.lang = navigator.language || "en-US";
    said.current = onSaid;
    r.onresult = (e) => {
      let heard = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) {
          const phrase = res[0].transcript.trim();
          if (phrase) onSaid(phrase);
        } else heard += res[0].transcript;
      }
      pending.current = heard;
      setInterim(heard);
    };
    // Browsers stop after a pause; keep listening until they tap stop.
    r.onend = () => {
      if (wanted.current) {
        try {
          r.start();
          return;
        } catch {}
      }
      pending.current = "";
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

  return { canTalk, listening, interim, talk, stop };
}
