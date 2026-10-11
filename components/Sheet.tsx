"use client";

import type { ReactNode } from "react";
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

/** Bottom sheet: drag to dismiss on touch, click-away on desktop. */
export function Sheet({ open, onOpenChange, title, children, tall, hideTitle, headerLeft, headerRight }: Props) {
  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-40 bg-black/35 backdrop-blur-[2px]" />
        <Drawer.Content
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
