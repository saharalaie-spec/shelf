"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { api } from "@/lib/client";
import { isBookBarcode } from "@/lib/parse";
import type { BookHit } from "@/lib/types";
import { BookCover } from "../BookCover";
import type { ShelfActions } from "../ShelfApp";
import { Icon, Spinner } from "../ui";

type Detector = { detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]> };
type DetectorCtor = new (opts: { formats: string[] }) => Detector;
type Scan = { code: string; book: BookHit | null; state: "looking" | "added" | "already" | "missing" };

/** The browser's own barcode reader when it has one (Chrome/Android), else a WebAssembly one (iOS Safari, Firefox). */
async function loadDetector(): Promise<DetectorCtor> {
  const native = (window as unknown as { BarcodeDetector?: DetectorCtor & { getSupportedFormats?: () => Promise<string[]> } }).BarcodeDetector;
  if (native) {
    const formats: string[] = (await native.getSupportedFormats?.().catch(() => [])) ?? [];
    if (formats.includes("ean_13")) return native;
  }
  const { BarcodeDetector } = await import("barcode-detector/ponyfill");
  return BarcodeDetector as unknown as DetectorCtor;
}

export function ScanView({ shelf }: { shelf: ShelfActions }) {
  const video = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<"starting" | "scanning" | "blocked" | "unavailable">("starting");
  const [scans, setScans] = useState<Scan[]>([]);
  const [manual, setManual] = useState("");
  const seen = useRef(new Set<string>());

  const update = (code: string, patch: Partial<Scan>) =>
    setScans((s) => s.map((x) => (x.code === code ? { ...x, ...patch } : x)));

  const onCode = async (code: string) => {
    if (seen.current.has(code)) return;
    seen.current.add(code);
    navigator.vibrate?.(30);
    setScans((s) => [{ code, book: null, state: "looking" }, ...s]);
    try {
      const { results } = await api<{ results: BookHit[] }>(`/api/search?isbn=${code}`);
      const book = results[0];
      if (!book) return update(code, { state: "missing" });
      if (shelf.keys.has(book.key)) return update(code, { book, state: "already" });
      // Scanning a book means you've got it in hand: add straight away, no extra tap.
      const added = await shelf.add([book], { quiet: true });
      update(code, { book, state: added.length ? "added" : "already" });
    } catch {
      seen.current.delete(code);
      update(code, { state: "missing" });
    }
  };
  const onDetected = useEffectEvent(onCode);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let stopped = false;
    let timer = 0;
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) return setStatus("unavailable");
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
      } catch (err) {
        return setStatus((err as DOMException).name === "NotAllowedError" ? "blocked" : "unavailable");
      }
      if (stopped || !video.current) return stream.getTracks().forEach((t) => t.stop());
      video.current.srcObject = stream;
      await video.current.play().catch(() => {});
      const Ctor = await loadDetector().catch(() => null);
      if (stopped) return;
      if (!Ctor) return setStatus("unavailable");
      const detector = new Ctor({ formats: ["ean_13"] });
      setStatus("scanning");
      const tick = async () => {
        if (stopped) return;
        try {
          if (video.current && video.current.readyState >= 2) {
            for (const c of await detector.detect(video.current)) {
              if (isBookBarcode(c.rawValue)) onDetected(c.rawValue);
            }
          }
        } catch {}
        timer = window.setTimeout(tick, 180);
      };
      tick();
    })();
    return () => {
      stopped = true;
      clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const submitManual = (e: React.FormEvent) => {
    e.preventDefault();
    const code = manual.replace(/[^0-9X]/gi, "");
    if (code.length === 10 || code.length === 13) {
      onCode(code);
      setManual("");
    }
  };

  const addedCount = scans.filter((s) => s.state === "added").length;

  return (
    <div className="flex min-h-0 flex-1 flex-col px-5">
      <div className="relative aspect-[4/3] w-full shrink-0 overflow-hidden rounded-3xl bg-black">
        <video ref={video} playsInline muted className="h-full w-full object-cover" />
        {status === "scanning" && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="relative h-[38%] w-[72%] rounded-2xl border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]">
              <motion.div
                className="absolute inset-x-3 h-0.5 rounded bg-accent shadow-[0_0_12px_var(--accent)]"
                animate={{ top: ["15%", "85%", "15%"] }}
                transition={{ repeat: Infinity, duration: 2.4, ease: "easeInOut" }}
              />
            </div>
          </div>
        )}
        {status !== "scanning" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-8 text-center text-white/85">
            {status === "starting" ? (
              <>
                <Spinner />
                <span className="text-[15px]">Starting camera…</span>
              </>
            ) : (
              <>
                <Icon name="camera" size={32} />
                <span className="text-[15px]">
                  {status === "blocked"
                    ? "Camera access is blocked. Allow it in your browser settings, or type the ISBN below."
                    : "No camera here. Type the ISBN from the back cover below."}
                </span>
              </>
            )}
          </div>
        )}
      </div>

      <form onSubmit={submitManual} className="mt-3 flex h-12 items-center gap-2 rounded-2xl bg-surface-2 px-4">
        <input
          value={manual}
          onChange={(e) => setManual(e.target.value)}
          inputMode="numeric"
          placeholder="Or type an ISBN"
          aria-label="ISBN"
          className="h-full min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-muted"
        />
        <button type="submit" aria-label="Look up ISBN" className="flex h-8 w-8 items-center justify-center rounded-full bg-ink text-paper active:scale-95">
          <Icon name="arrow" size={16} />
        </button>
      </form>

      <div className="flex items-center justify-between pt-4 pb-2">
        <p className="text-[13px] font-medium tracking-wide text-muted uppercase">
          {scans.length ? `${addedCount} added` : "Barcodes go straight onto your shelf"}
        </p>
      </div>
      <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto pb-safe" data-vaul-no-drag="">
        <AnimatePresence initial={false}>
          {scans.map((s) => (
            <motion.li key={s.code} layout initial={{ opacity: 0, y: -12, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} className="flex items-center gap-3 rounded-2xl px-2 py-2">
              {s.book ? (
                <BookCover book={s.book} className="w-9 shrink-0" rounded="rounded-[3px]" />
              ) : (
                <div className="skeleton aspect-[2/3] w-9 shrink-0 rounded-[3px]" />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-[16px] font-medium">{s.book?.title ?? (s.state === "missing" ? "Not found" : "Looking up…")}</p>
                <p className="truncate text-[14px] text-muted">{s.book?.author ?? `ISBN ${s.code}`}</p>
              </div>
              <span className={`text-[13px] font-medium ${s.state === "added" ? "text-good" : "text-muted"}`}>
                {s.state === "added" ? "Added" : s.state === "already" ? "On your shelf" : s.state === "missing" ? "Try typing it" : ""}
              </span>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </div>
  );
}
