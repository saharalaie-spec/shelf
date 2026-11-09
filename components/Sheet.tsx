"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { Drawer } from "vaul";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
  /** Tall sheets keep a fixed height so content can change without the sheet jumping. */
  tall?: boolean;
  hideTitle?: boolean;
  headerRight?: ReactNode;
  headerLeft?: ReactNode;
};

/** The keyboard counts as open once it takes this much of the screen; smaller changes are the browser's bars. */
const KEYBOARD = 120;
/** Space kept above the sheet while typing, so its top edge still shows. */
const TOP_GAP = 12;

/**
 * Keeps an open sheet in the part of the screen the phone keyboard leaves free: its bottom sits on the keyboard and it
 * shrinks to fit, so whatever you're typing in stays in view instead of the page jumping around it. Sets `--room`
 * (the height free above the keyboard) for anything inside that floats over the sheet.
 */
function useAboveKeyboard(open: boolean, tall: boolean | undefined): CSSProperties | undefined {
  /** How far up the keyboard reaches and the height free above it; null while it's down. */
  const [keyboard, setKeyboard] = useState<{ below: number; room: number } | null>(null);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!open || !vv) return;
    const fit = () => {
      const below = Math.max(0, window.innerHeight - vv.offsetTop - vv.height);
      const typing = below > KEYBOARD && vv.scale < 1.01;
      const room = Math.round(Math.min(vv.height - TOP_GAP, window.innerHeight * 0.92));
      setKeyboard(typing ? { below: Math.round(below), room } : null);
      // The sheet is about to get shorter: bring the box being typed in back into view within it.
      const focused = document.activeElement;
      if (typing && focused instanceof HTMLElement && focused.closest("[data-vaul-drawer]")) {
        requestAnimationFrame(() => requestAnimationFrame(() => focused.scrollIntoView({ block: "nearest" })));
      }
    };
    const first = requestAnimationFrame(fit);
    vv.addEventListener("resize", fit);
    vv.addEventListener("scroll", fit);
    return () => {
      cancelAnimationFrame(first);
      vv.removeEventListener("resize", fit);
      vv.removeEventListener("scroll", fit);
    };
  }, [open]);
  if (!open || !keyboard) return undefined;
  const { below, room } = keyboard;
  return {
    bottom: below,
    maxHeight: room,
    ...(tall ? { height: room } : {}),
    ["--room" as string]: `${room}px`,
  };
}

/** Bottom sheet: drag to dismiss on touch, click-away on desktop. */
export function Sheet({ open, onOpenChange, title, children, tall, hideTitle, headerLeft, headerRight }: Props) {
  const aboveKeyboard = useAboveKeyboard(open, tall);
  return (
    // Vaul's own keyboard handling moves the sheet and the page in turn, which is the jumping; useAboveKeyboard does it.
    <Drawer.Root open={open} onOpenChange={onOpenChange} repositionInputs={false}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-40 bg-black/35 backdrop-blur-[2px]" />
        <Drawer.Content
          style={aboveKeyboard}
          aria-describedby={undefined}
          className={`fixed inset-x-0 bottom-0 z-50 mx-auto flex w-full max-w-xl flex-col rounded-t-[28px] bg-surface outline-none ${
            tall ? "h-[92dvh]" : "max-h-[92dvh]"
          }`}
        >
          <div className="mx-auto mt-2.5 h-1.5 w-10 shrink-0 rounded-full bg-line" aria-hidden />
          <div className={`flex shrink-0 items-center gap-2 px-5 pt-2 ${hideTitle ? "sr-only" : "h-12"}`}>
            {headerLeft}
            <Drawer.Title className="flex-1 truncate font-serif text-[21px] font-medium tracking-tight">{title}</Drawer.Title>
            {headerRight}
          </div>
          {children}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
