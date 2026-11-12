import { Capacitor } from "@capacitor/core";

/**
 * Running inside the Trove app (iPhone), rather than in a browser. There the phone's own keyboard handling resizes the
 * app above the keyboard, so the website's workarounds for it stay off.
 */
export const inApp = () => typeof window !== "undefined" && Capacitor.isNativePlatform();
