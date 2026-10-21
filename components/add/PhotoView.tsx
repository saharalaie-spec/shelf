"use client";

import { useState } from "react";
import { api } from "@/lib/client";
import type { Candidate, Kind } from "@/lib/types";
import { Button, Icon, Spinner } from "../ui";

/** Shrink the photo before upload: faster, and plenty of detail to read spines. */
async function downscale(file: File, max = 1600): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.85);
}

const COPY: Record<Kind, { title: string; hint: string; reading: string; camera: boolean }> = {
  book: {
    title: "Take a photo of your bookshelf",
    hint: "Spines facing out, as straight-on as you can. A stack of covers or a reading-app screenshot works too.",
    reading: "Reading the spines…",
    camera: true,
  },
  podcast: {
    title: "Screenshot your podcast app",
    hint: "Your library in Spotify, Apple Podcasts or Overcast. One screenshot, every show.",
    reading: "Reading the shows…",
    camera: false,
  },
  place: {
    title: "Screenshot a list of spots",
    hint: "A saved list in Google or Apple Maps, a travel note, a guidebook page.",
    reading: "Reading the places…",
    camera: false,
  },
  screen: {
    title: "Screenshot a watchlist",
    hint: "Netflix, Letterboxd, IMDb or any streaming app. A photo of your DVDs works too.",
    reading: "Reading the titles…",
    camera: false,
  },
};

export function PhotoView({ kind, onReview }: { kind: Kind; onReview: (items: Candidate[]) => void }) {
  const copy = COPY[kind];
  const [preview, setPreview] = useState<string>();
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string>();

  const onFile = async (file?: File) => {
    if (!file) return;
    setError(undefined);
    try {
      const image = await downscale(file);
      setPreview(image);
      setReading(true);
      const { items } = await api<{ items: Candidate[] }>("/api/ai/photo", { body: { image, kind } });
      if (!items.length) throw new Error("Couldn’t make out any titles. Try a closer, sharper photo.");
      onReview(items);
    } catch (err) {
      setError((err as Error).message);
      setReading(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col px-5 pb-safe">
      <label className="relative flex min-h-0 flex-1 cursor-pointer flex-col items-center justify-center overflow-hidden rounded-3xl border border-dashed border-line bg-paper/40 text-center">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="Your photo" className={`absolute inset-0 h-full w-full object-cover transition ${reading ? "scale-105 blur-[2px] brightness-75" : ""}`} />
        ) : (
          <div className="flex flex-col items-center gap-3 p-8 text-muted">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-surface-2 text-ink">
              <Icon name="camera" size={30} />
            </span>
            <span className="text-[17px] font-medium text-ink">{copy.title}</span>
            <span className="max-w-[16rem] text-[14px]">{copy.hint}</span>
          </div>
        )}
        {reading && (
          <div className="relative flex items-center gap-2 rounded-full bg-black/60 px-4 py-2 text-[15px] text-white backdrop-blur">
            <Spinner /> {copy.reading}
          </div>
        )}
        <input
          type="file"
          accept="image/*"
          // Books are photographed; apps are screenshotted, so offer the photo library first.
          capture={copy.camera ? "environment" : undefined}
          className="sr-only"
          disabled={reading}
          onChange={(e) => onFile(e.target.files?.[0])}
        />
      </label>
      {error && <p className="mt-3 text-center text-[14px] text-link">{error}</p>}
      {preview && !reading && (
        <Button variant="secondary" className="mt-3 w-full" onClick={() => setPreview(undefined)}>
          Try another photo
        </Button>
      )}
    </div>
  );
}
