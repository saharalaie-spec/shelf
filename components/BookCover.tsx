"use client";

import { useState } from "react";
import type { BookHit } from "@/lib/types";
import { Icon } from "./ui";

const PALETTE = ["#2f4b3a", "#34466b", "#7a2e2e", "#9a6c22", "#4b5960", "#5b3a5e", "#8a4b2f", "#285a5f", "#6b5b3a", "#3d3a4f"];

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

type Props = {
  book: Pick<BookHit, "title" | "author" | "coverUrl">;
  className?: string;
  rounded?: string;
  /** Shows a lock: a private book only its owner can see. */
  locked?: boolean;
};

/** The real cover when we have one; otherwise a typeset cover so the shelf always looks like books. */
export function BookCover({ book, className = "", rounded = "rounded-[5px]", locked }: Props) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const showImage = book.coverUrl && !failed;

  return (
    <div className={`@container relative aspect-[2/3] overflow-hidden ${rounded} shadow-book ${className}`}>
      {(!showImage || !loaded) && <TypeCover book={book} />}
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
      {/* spine crease */}
      <div className="pointer-events-none absolute inset-y-0 left-0 w-[6%] bg-gradient-to-r from-black/25 via-white/10 to-transparent" />
      {locked && (
        <span className="absolute top-[5%] right-[6%] flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm">
          <Icon name="lock" size={13} />
          <span className="sr-only">Private</span>
        </span>
      )}
    </div>
  );
}

function TypeCover({ book }: { book: Props["book"] }) {
  const bg = PALETTE[hash(book.title + (book.author ?? "")) % PALETTE.length];
  return (
    <div className="absolute inset-0 flex flex-col justify-between p-[9cqw] text-[#f6efe2]" style={{ background: bg }}>
      <div className="h-px w-[30%] bg-[#f6efe2]/40" />
      <div className="font-serif text-[13cqw] leading-[1.08] font-medium [overflow-wrap:anywhere] line-clamp-5">{book.title}</div>
      <div className="text-[7.5cqw] tracking-wide uppercase opacity-75 line-clamp-2">{book.author ?? ""}</div>
    </div>
  );
}
