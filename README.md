# Shelf

Every book you've read, in one place, and one link to share them.

- **Sign in with a code.** Phone number or email, then a 6-digit code. No passwords. You stay signed in for 400 days.
- **Add books with as little effort as possible.**
  - Type a title and press Enter to add the top match, then type the next. The field clears and keeps focus.
  - Paste a list: one per line, messy is fine, and "Title by Author" helps.
  - Say them out loud (dictation, in browsers that support it).
  - Scan barcodes. Each scanned book goes straight onto your shelf.
  - Snap your shelf: one photo, and Claude reads the spines (needs `ANTHROPIC_API_KEY`).
  - Import a Goodreads or StoryGraph export. Only books marked as read come in.

  Every bulk method ends on one review screen, where you untick or swap any wrong match.
- **Categories are automatic.** They come from the catalog's subjects, so a philosophy book lands in *Philosophy*. You can change them, or add your own, on any book.
- **Share a link.** Share the whole shelf or one category ("Sahar's Philosophy shelf"). Your friend opens a normal web page with no app and no account, and link previews show a cover collage. The page ends with a "Make your own shelf" invitation; that's where the "get the app" hook will go.

## Run it

```bash
npm install
npm run dev            # http://localhost:3000
```

With no SMS or email provider configured, dev mode **shows the login code on screen** (and logs it in the terminal), so you can sign in right away.

Book search uses [Open Library](https://openlibrary.org/developers/api) (free, no key). To work offline, use `npm run dev:offline`, which uses a small built-in catalog instead.

To try it on your phone, run `npx next dev --experimental-https` and open the "Network" address it prints from a phone on the same Wi-Fi (accept the self-signed certificate warning). Camera scanning and dictation only work over https.

```bash
npm test               # unit tests (parsing, categories, phone/email, matching)
npm run lint
npm run build
```

## Put it online (Vercel, free, works from your phone)

1. **Merge the pull request** into `main`. Vercel publishes `main` as the live site.
2. Go to [vercel.com/new](https://vercel.com/new), sign in with GitHub, and **import the `shelf` repository**. Leave every setting as it is and tap **Deploy**.
3. Open the site it gives you. You'll see an **Almost live** page: the app needs a database.
   In the Vercel project, open **Storage → Create Database → Turso**, create the free database and connect it to the project. This adds `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` for you.
4. Still in the project, open **Settings → Environment Variables** and add
   `ALLOW_DEV_CODES` = your phone number starting with `+` and your country code, for example `+14155550123`. You can add your email too, separated by a comma.
   This lets you sign in before Twilio or Resend is connected: your code isn't shown on screen; it's written to the project's **Logs**, which only you can open. Anyone else who tries to sign in gets "not set up yet". Friends opening your share links never need to sign in.
5. Open **Deployments** and tap **⋯ → Redeploy** on the latest one. Then, on your phone:
   open the site, enter your number, switch to the Vercel project's **Logs** tab and find the line "Login code for +1 …", then type the code. You stay signed in for 400 days. In Safari, **Share → Add to Home Screen** makes Shelf open like an app.

After that, every push to `main` goes live by itself. Optional extras, in the same Environment Variables screen: `ANTHROPIC_API_KEY` turns on "Snap your shelf", and the Twilio or Resend keys below send real codes (then remove `ALLOW_DEV_CODES`). **Variables only take effect after a redeploy** (Deployments → ⋯ → Redeploy).

## Configuration

Copy `.env.example` to `.env.local`. Everything is optional in development.

| What | Variables |
| --- | --- |
| Text login codes | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` (or `TWILIO_MESSAGING_SERVICE_SID`) |
| Email login codes | `RESEND_API_KEY`, `EMAIL_FROM` |
| Code-signing secret | `AUTH_SECRET` (optional: one is generated and kept in the database if unset) |
| Public URL | `APP_URL` (optional on Vercel, which provides its own) |
| Hosted database | `DATABASE_URL` + `DATABASE_AUTH_TOKEN`, or `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN` (any libSQL database; defaults to `data/shelf.db` locally) |
| Shelf photo | `ANTHROPIC_API_KEY` |
| Google Books fallback | `GOOGLE_BOOKS_API_KEY` |

Without a texting or email provider, production sign-in only works for the numbers and emails listed in `ALLOW_DEV_CODES` (comma-separated, phone numbers starting with `+` and the country code), and their codes go to the server log, never the screen. `ALLOW_DEV_CODES=1` instead shows every code on screen, which lets anyone sign in as anyone: only use it for a throwaway demo, and afterwards use **You → Sign out on all devices**.

## How it's built

Next.js 16 (App Router) with React 19 and Tailwind CSS 4, plus [vaul](https://vaul.emilkowal.ski/) sheets, [sonner](https://sonner.emilkowal.ski/) toasts and [motion](https://motion.dev/) animations. Data is stored in SQLite through libSQL.

```
app/page.tsx              signed out → Login, signed in → ShelfApp
app/s/[slug]/             the public share page + its link-preview image
app/api/auth/*            start (send code) · verify (check code, set session) · logout
app/api/books, search, match, shares, me, ai/photo
components/Login.tsx      phone/email → 6-digit code (auto-submits, SMS autofill on iOS/Android)
components/ShelfApp.tsx   the shelf: cover grid, category chips, add/share/book sheets
components/add/*          one view per way of adding books, plus the shared review screen
lib/auth.ts               codes (hashed, 10-min expiry, 5 tries, resend limits) and sessions
lib/books.ts              catalog search & matching (Open Library → Google Books → offline list)
lib/categories.ts         catalog subjects → friendly categories
lib/parse.ts              pasted lists, dictation and CSV exports → candidate titles
lib/db.ts                 schema (created automatically on first run)
```

Share links are unguessable, one per shelf or category, and stay live: books you add later show up on links you've already sent.

## Before a public launch

- Add per-IP rate limiting on `/api/auth/start` (or use Twilio Verify's fraud protection) so nobody can run up your SMS bill.
- Connect Twilio and/or Resend and remove `ALLOW_DEV_CODES`.
