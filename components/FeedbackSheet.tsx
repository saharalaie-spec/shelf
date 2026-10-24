"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/client";
import { Sheet } from "./Sheet";
import { Button, Icon } from "./ui";
import { appendSaid, useDictation } from "./useDictation";

/** Feedback in as few taps as possible: talk (or type), read it back, send. */
export function FeedbackSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const page = usePathname();
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const { canTalk, listening, interim, talk, stop } = useDictation();
  // Stop listening when the sheet goes away.
  const change = (o: boolean) => {
    if (!o) stop();
    onOpenChange(o);
  };

  const send = async () => {
    // Anything still being heard goes too.
    const said = interim ? appendSaid(text, interim) : text;
    stop(false);
    setText(said);
    setSending(true);
    try {
      await api("/api/feedback", { body: { text: said, page } });
      toast("Thank you. Got it.");
      setText("");
      onOpenChange(false);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSending(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={change} title="Send feedback">
      <div className="px-5 pb-safe">
        <p className="text-[15px] leading-snug text-muted">
          What’s confusing, missing or lovely? {canTalk ? "Tap the mic and just talk." : "Type it, or use the mic on your keyboard."} It goes straight to
          the person building Trove.
        </p>
        {canTalk && (
          <button
            onClick={listening ? () => stop() : () => talk((said) => setText((t) => appendSaid(t, said)))}
            aria-pressed={listening}
            aria-label={listening ? "Stop listening" : "Talk"}
            className={`mx-auto mt-5 flex h-20 w-20 items-center justify-center rounded-full bg-accent text-accent-ink transition-transform active:scale-95 ${listening ? "animate-pulse" : ""}`}
          >
            <Icon name={listening ? "x" : "mic"} size={30} />
          </button>
        )}
        {canTalk && <p className="mt-2 text-center text-[13px] text-muted">{listening ? "Listening… tap to stop" : "Tap to talk"}</p>}
        <textarea
          value={interim ? `${text}${text ? " " : ""}${interim}` : text}
          onChange={(e) => !listening && setText(e.target.value)}
          // Tapping the text to fix a word stops listening, keeping everything heard so far.
          onFocus={() => listening && stop()}
          readOnly={listening}
          placeholder={canTalk ? "Your words show up here. You can edit them before sending." : "What should we know?"}
          aria-label="Your feedback"
          rows={5}
          maxLength={4000}
          className="mt-4 block w-full resize-none rounded-2xl border border-line bg-surface px-4 py-3 text-[16px] leading-snug outline-none placeholder:text-muted focus:border-ink"
        />
        <Button onClick={send} loading={sending} disabled={!text.trim() && !interim.trim()} className="mt-3 mb-3 w-full" icon={<Icon name="arrow" size={18} />}>
          Send
        </Button>
      </div>
    </Sheet>
  );
}
