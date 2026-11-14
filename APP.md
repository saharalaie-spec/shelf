# The Trove app (iPhone)

The app is a native shell around the live site, https://mytrove.me (`capacitor.config.ts`). Everything merged to
main reaches the app the same way it reaches the website. Only changes to the shell itself (this folder's `ios/`,
`capacitor.config.ts`, the plugins in `package.json`) need a new build in Xcode.

Inside the app, the phone's own keyboard handling shrinks the app above the keyboard, so nothing jumps while typing
(`lib/native.ts` turns the website's workarounds off there).

## One-time setup on the Mac

1. **Xcode**: install it from the Mac App Store (free, large). Open it once and let it install its iOS components.
2. **Node.js**: install the LTS version from nodejs.org.
3. **The code**: install GitHub Desktop (desktop.github.com), sign in, and clone `saharalaie-spec/shelf`.
4. **Terminal**, in the cloned folder (GitHub Desktop → Repository → Open in Terminal):

   ```
   npm ci
   npm run app:sync
   npm run app:open
   ```

   The last one opens the app in Xcode.

## Run it on your iPhone (no Apple approval needed)

1. In Xcode, click **App** at the top of the left sidebar → **Signing & Capabilities** → **Team**: add your Apple ID
   and pick it. (Once the Developer Program approves you, pick that team instead.)
2. Plug the iPhone into the Mac. On the iPhone: Settings → Privacy & Security → **Developer Mode** → on (it restarts).
3. In Xcode's top bar, choose your iPhone, then press **▶** (Run).
4. The first time, the iPhone asks you to trust the developer: Settings → General → VPN & Device Management → your
   Apple ID → Trust.

With a free Apple ID, the app stays installed for 7 days at a time; press ▶ again to renew it. TestFlight (below)
doesn't have that limit.

## TestFlight (after the Developer Program approves you)

1. **App Store Connect** (appstoreconnect.apple.com) → Apps → **+** → New App: platform iOS, name **Trove**, bundle
   ID **me.mytrove.app**, SKU `trove-ios`.
2. In Xcode, pick **Any iOS Device** in the top bar, then **Product → Archive**. When it's done, **Distribute App →
   App Store Connect → Upload**.
3. In App Store Connect → the app → **TestFlight**: add yourself (and anyone helping test) as an internal tester.
4. On the iPhone, install the **TestFlight** app and accept the invite.

Each new shell build: raise the build number (Xcode → App → General → Build), archive, upload.

## Invite links that send people to the app

Two settings in Vercel (Environment Variables), then redeploy:

- `IOS_APP_URL`: where to get the app (the TestFlight public link, later the App Store link). With it set, an
  invite link or the sign-in page opened in an iPhone's browser first offers **Get the app**, with **Continue on
  the website** one tap away. Unset, nothing changes.
- `APPLE_TEAM_ID`: the Team ID from developer.apple.com → Account → Membership (10 letters and digits). It turns on
  https://mytrove.me/.well-known/apple-app-site-association, which tells iPhones that invites (`/f/…`), friends'
  pages (`/u/…`) and shared lists (`/s/…`) open in the app when it's installed.

And once in Xcode, with the paid Developer team picked (a free Personal Team can't do this): App → Signing &
Capabilities → **+ Capability** → **Associated Domains** → add `applinks:mytrove.me`. Build and upload as usual.

Then someone invited taps the link → gets the app → taps the same link again → it opens in the app, on the invite.

## Not yet built

- Push notifications (messages, new friends, invitees joining): needs an APNs key from the Developer account.
