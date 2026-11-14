import { Share } from "@capacitor/share";
import { inApp } from "./native";

/** The subject an emailed invite or link gets. */
export const SUBJECT = "Trove";

/**
 * The phone's share sheet. In the app it's the native one, which uses the title as the email subject; in a browser,
 * Safari's (which may leave the subject empty when sharing to Mail, hence `emailLink` too). Returns false when there's
 * no share sheet, so the caller can copy the link instead; throws nothing when someone closes it.
 */
export async function shareLink({ title = SUBJECT, text, url }: { title?: string; text: string; url: string }): Promise<boolean> {
  if (inApp()) {
    try {
      await Share.share({ title, text, url, dialogTitle: title });
    } catch {
      // Closed without sharing.
    }
    return true;
  }
  if (!navigator.share) return false;
  try {
    await navigator.share({ title, text, url });
  } catch (err) {
    if ((err as DOMException).name !== "AbortError") return false;
  }
  return true;
}

/** A new email with the subject already filled in, and the text and link as its body. */
export const emailLink = ({ subject = SUBJECT, text, url }: { subject?: string; text: string; url: string }) =>
  `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(`${text} ${url}`)}`;
