import type { CapacitorConfig } from "@capacitor/cli";

/**
 * The Trove app for iPhone: a native shell around the live site (Trove has a server, so the app loads it rather than
 * shipping a copy). Everything merged to main reaches the app as it does the website; only changes to this shell
 * (plugins, icon, settings here) need a new App Store build. See APP.md.
 */
const config: CapacitorConfig = {
  // Apple's ID for the app, from the domain reversed. Fixed once the app is registered: never change it.
  appId: "me.mytrove.app",
  appName: "Trove",
  // Shown only if the site can't be reached.
  webDir: "app-shell",
  server: {
    url: "https://mytrove.me",
    // Links to other sites (a podcast, a map) open in the browser, not inside the app.
    allowNavigation: ["mytrove.me", "www.mytrove.me"],
  },
  ios: {
    // The page handles the notch and home bar itself (env(safe-area-inset-*)).
    contentInset: "never",
    backgroundColor: "#F2F0EB",
  },
  plugins: {
    // The keyboard shrinks the app above it instead of covering it: no page jumping while typing.
    Keyboard: { resize: "native", resizeOnFullScreen: true },
    SplashScreen: { launchAutoHide: true, launchShowDuration: 600, backgroundColor: "#F2F0EB", showSpinner: false },
  },
};

export default config;
