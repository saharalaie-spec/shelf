"use client";

import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useState } from "react";
import { VOCAB } from "@/lib/kinds";
import { KINDS, type Kind } from "@/lib/types";
import { Icon, KIND_ICON } from "./ui";

/** The collection's name in the header; tap it to jump to another collection or back home. */
export function KindMenu({ kind }: { kind: Kind }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="-ml-1 flex h-10 items-center gap-1 rounded-full px-1.5 font-serif text-[21px] font-medium tracking-tight active:bg-surface-2"
      >
        {VOCAB[kind].label}
        <Icon name="down" size={17} className={`text-muted transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} aria-hidden />
            <motion.nav
              role="menu"
              initial={{ opacity: 0, y: -6, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.97 }}
              transition={{ type: "spring", stiffness: 500, damping: 34 }}
              style={{ transformOrigin: "top left" }}
              className="absolute top-12 left-0 z-40 w-60 overflow-hidden rounded-2xl bg-surface p-1.5 shadow-float"
            >
              {KINDS.map((k) => (
                <Link
                  key={k}
                  role="menuitem"
                  href={`/${VOCAB[k].slug}`}
                  onClick={() => setOpen(false)}
                  className={`flex h-12 items-center gap-3 rounded-xl px-3 text-[16px] font-medium ${k === kind ? "bg-surface-2" : "active:bg-surface-2"}`}
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-full text-white" style={{ background: VOCAB[k].tint }}>
                    <Icon name={KIND_ICON[k]} size={17} />
                  </span>
                  <span className="flex-1">{VOCAB[k].label}</span>
                  {k === kind && <Icon name="check" size={17} className="text-muted" />}
                </Link>
              ))}
              <div className="my-1 h-px bg-line/70" />
              <Link
                role="menuitem"
                href="/"
                onClick={() => setOpen(false)}
                className="flex h-11 items-center gap-3 rounded-xl px-3 text-[15px] text-ink-2 active:bg-surface-2"
              >
                <span className="flex h-8 w-8 items-center justify-center">
                  <Icon name="home" size={19} />
                </span>
                Your trove
              </Link>
            </motion.nav>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
