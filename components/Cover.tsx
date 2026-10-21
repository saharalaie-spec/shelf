"use client";

import { useState } from "react";
import type { Hit } from "@/lib/types";
import { Icon } from "./ui";

const PALETTE = ["#4c5342", "#9e6148", "#2f3329", "#6e5646", "#5e6a51", "#8a7255", "#4f5450", "#85503c", "#6b6a62", "#3e4237"];

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

type Props = {
  book: Pick<Hit, "title" | "author" | "coverUrl">;
  /** Books and posters are 2:3; podcast art is square. */
  shape?: "portrait" | "square";
  className?: string;
  rounded?: string;
  /** Shows a lock: a private book only its owner can see. */
  locked?: boolean;
};

/** The real cover or artwork when we have one; otherwise a typeset one, so a grid always looks full. */
export function Cover({ book, shape = "portrait", className = "", rounded = "rounded-[5px]", locked }: Props) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const showImage = book.coverUrl && !failed;

  return (
    <div className={`@container relative overflow-hidden ${shape === "square" ? "aspect-square" : "aspect-[2/3]"} ${rounded} shadow-book ${className}`}>
      {(!showImage || !loaded) && <TypeCover book={book} square={shape === "square"} />}
      {showImage && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={book.coverUrl!}
          alt={book.title}
          loading="lazy"
          decoding="async"
          draggable={false}
          onLoad={(e) => {
            // Open Library serves a 1×1 placeholder for some missing covers.
            if (e.currentTarget.naturalWidth < 10) setFailed(true);
            else setLoaded(true);
          }}
          onError={() => setFailed(true)}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${loaded ? "opacity-100" : "opacity-0"}`}
        />
      )}
      {/* spine crease, for things that have spines */}
      {shape === "portrait" && (
        <div className="pointer-events-none absolute inset-y-0 left-0 w-[6%] bg-gradient-to-r from-black/25 via-white/10 to-transparent" />
      )}
      {locked && (
        <span className="absolute top-[5%] right-[6%] flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm">
          <Icon name="lock" size={13} />
          <span className="sr-only">Private</span>
        </span>
      )}
    </div>
  );
}

function TypeCover({ book, square }: { book: Props["book"]; square: boolean }) {
  const bg = PALETTE[hash(book.title + (book.author ?? "")) % PALETTE.length];
  return (
    <div className="absolute inset-0 flex flex-col justify-between p-[9cqw] text-[#f6efe2]" style={{ background: bg }}>
      <div className="h-px w-[30%] bg-[#f6efe2]/40" />
      <div className={`font-serif leading-[1.08] font-medium [overflow-wrap:anywhere] ${square ? "text-[12cqw] line-clamp-3" : "text-[13cqw] line-clamp-5"}`}>
        {book.title}
      </div>
      <div className="text-[7.5cqw] tracking-wide uppercase opacity-75 line-clamp-2">{book.author ?? ""}</div>
    </div>
  );
}
