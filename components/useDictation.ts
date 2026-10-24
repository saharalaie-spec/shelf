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
 * the phrase still being heard. Listening keeps going through pauses until `stop()`, and stops when the component goes.
 */
export function useDictation() {
  const [interim, setInterim] = useState("");
  const [listening, setListening] = useState(false);
  const [canTalk] = useState(() => Boolean(recognizer()));
  const rec = useRef<Recognition | null>(null);
  const wanted = useRef(false);

  const stop = () => {
    wanted.current = false;
    rec.current?.stop();
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
    r.onresult = (e) => {
      let pending = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) {
          const said = res[0].transcript.trim();
          if (said) onSaid(said);
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

  return { canTalk, listening, interim, talk, stop };
}
