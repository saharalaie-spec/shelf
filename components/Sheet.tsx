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

// ---------- iPhone: the page holds still while you type in a sheet ----------

const isIOS = () =>
  typeof navigator !== "undefined" && (/iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));

const NOT_TYPED = new Set(["checkbox", "radio", "button", "submit", "reset", "range", "file", "color", "image", "hidden"]);
function textField(target: EventTarget | null): HTMLInputElement | HTMLTextAreaElement | null {
  const el = target instanceof Element ? target.closest("input, textarea") : null;
  if (el instanceof HTMLTextAreaElement) return el;
  if (el instanceof HTMLInputElement && !NOT_TYPED.has(el.type)) return el;
  return null;
}
const inSheet = (el: Element) => Boolean(el.closest("[data-vaul-drawer]"));
const keyboardUp = () => {
  const vv = window.visualViewport;
  return vv ? window.innerHeight - vv.height > KEYBOARD : false;
};

/**
 * Safari scrolls the page to show a box as it gets focus, even inside a sheet; with the sheet also rising above the
 * keyboard (useAboveKeyboard), the two fight and the box jumps around. So, while a sheet is open on an iPhone: the
 * page behind it is pinned in place, and a box is focused from far above where it is (for one frame), so Safari sees
 * nothing to scroll to; the sheet then brings it into view on its own.
 */
let pinned = 0;
let pinnedAt: { y: number; style: Pick<CSSStyleDeclaration, "position" | "top" | "left" | "right" | "width"> } | null = null;

function pinPage() {
  if (pinned++ > 0) return;
  const body = document.body.style;
  // In Safari itself the sheet library already pins it (not from the home screen, where Trove runs as an app).
  if (body.position === "fixed") return;
  const y = window.scrollY;
  pinnedAt = { y, style: { position: body.position, top: body.top, left: body.left, right: body.right, width: body.width } };
  Object.assign(body, { position: "fixed", top: `${-y}px`, left: "0px", right: "0px", width: "100%" });
}

function unpinPage() {
  if (--pinned > 0 || !pinnedAt) return;
  Object.assign(document.body.style, pinnedAt.style);
  window.scrollTo(0, pinnedAt.y);
  pinnedAt = null;
}

function useStillPage(open: boolean) {
  useEffect(() => {
    if (!open || !isIOS()) return;
    pinPage();
    // Focusing from far above: Safari finds the box already in view, so it doesn't scroll.
    const lift = (field: HTMLElement) => {
      field.style.transform = "translateY(-2000px)";
      requestAnimationFrame(() => {
        field.style.transform = "";
      });
    };
    const onTouchEnd = (e: TouchEvent) => {
      const field = textField(e.target);
      if (!field || !inSheet(field)) return;
      // Already typing here: the tap moves the cursor, so leave it be.
      if (document.activeElement === field && keyboardUp()) return;
      e.preventDefault();
      if (document.activeElement === field) field.blur();
      lift(field);
      field.focus({ preventScroll: true });
      try {
        field.setSelectionRange(field.value.length, field.value.length);
      } catch {
        // Some kinds of box don't have a cursor position.
      }
    };
    // The keyboard's own up and down arrows move focus without a tap.
    const onFocus = (e: FocusEvent) => {
      const field = textField(e.target);
      if (field && inSheet(field)) lift(field);
    };
    // Last resort: whatever scrolled the pinned page, put it back.
    const onScroll = () => {
      if (pinnedAt && (window.scrollY || window.scrollX)) window.scrollTo(0, 0);
    };
    document.addEventListener("touchend", onTouchEnd, { capture: true, passive: false });
    document.addEventListener("focusin", onFocus, true);
    window.addEventListener("scroll", onScroll);
    return () => {
      document.removeEventListener("touchend", onTouchEnd, { capture: true });
      document.removeEventListener("focusin", onFocus, true);
      window.removeEventListener("scroll", onScroll);
      unpinPage();
    };
  }, [open]);
}

/** Bottom sheet: drag to dismiss on touch, click-away on desktop. */
export function Sheet({ open, onOpenChange, title, children, tall, hideTitle, headerLeft, headerRight }: Props) {
  const aboveKeyboard = useAboveKeyboard(open, tall);
  useStillPage(open);
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
