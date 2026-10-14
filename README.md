# Shelf

Every book, podcast and show you love, in one place, shared with your friends.

- **Three collections: Books, Podcasts, Movies & TV.** After you sign in, a home screen shows one card per collection with your counts, a few covers and what you're in the middle of. Tap a card to go in; tap the collection's name at the top to jump to another one.
- **Three sections in each.** Read / Reading / Want to read, Listened / Listening / Up next, and Watched / Watching / Watchlist. In-progress items get a one-tap **Finished** (or **Done**, **Watched**) button, and anything can be moved from its details sheet. Adding something that's already in another section moves it there.
- **Sign in with a code.** Phone number or email, then a 6-digit code. No passwords. You stay signed in for 400 days.
- **Add with as little effort as possible.**
  - Type a title and press Enter to add the top match, then type the next. The field clears and keeps focus. "Dune 2021" picks the right year.
  - Paste a list: one per line, messy is fine, and "Title by Author" helps.
  - Say them out loud (dictation, in browsers that support it).
  - Snap or screenshot: a bookshelf photo, a screenshot of your Spotify or Apple Podcasts library, or of a Netflix or Letterboxd watchlist. Claude reads the titles (needs `ANTHROPIC_API_KEY`).
  - Scan book barcodes. Each scanned book goes straight onto your shelf.
  - Import:
    - books from a Goodreads or StoryGraph export;
    - podcast subscriptions as OPML (Overcast, Pocket Casts, Castro…);
    - movies & TV from Letterboxd (watched.csv, watchlist.csv), IMDb (ratings or watchlist) or Netflix's viewing history.

    Imports put each item in the right section where the file says, for example a watchlist goes to Watchlist.

  The add sheet has an **Add to** picker (it starts on the section you're looking at), and every bulk method ends on one review screen, where you untick or swap any wrong match.
- **Catalogs:**
  - Books come from Open Library, with Google Books as the fallback.
  - Podcasts come from Apple's podcast directory, and each one links to Spotify and Apple Podcasts.
  - Movies & TV come from TMDB when `TMDB_API_KEY` is set, and otherwise from iTunes and TVmaze, which need no key. Each one has a "Where to watch" link.
- **Categories are automatic.** They come from the catalog's subjects and genres, so a philosophy book lands in *Philosophy* and a show in *TV* and *Drama*. You can change them, or add your own, on any item.
- **Share a link.** Share any section, whole or one category: "Sahar's Philosophy shelf", "What Sahar's listening to", "Sahar's watchlist". Your friend opens a normal web page with no app and no account, and link previews show a cover collage. The page ends with a "Make your own shelf" invitation; that's where the "get the app" hook will go.
- **Friends.** Friendships go both ways, and both people agree. Tap the people icon to:
  - send your invite link: whoever opens it becomes your friend with one tap, signing up first if they're new;
  - or ask by phone number or email. If they're not on Shelf yet, the request waits until they join, and the answer never reveals whether a number is registered.

  Friends see everything you add, in every collection, unless you make it private. Tap anything of theirs to put it on your own list (Want to read, Up next, Watchlist).
- **Private items.** Everything is visible to friends by default. Switch on **Private** on any book, podcast, movie or show and only you will ever see it. It's left out of what friends see, of your public profile, and of share links, including links you sent before.
- **Your profile is private unless you make it public.** By default only friends can see your shelf, and anyone else opening your profile link sees "This shelf is private". The page looks the same whether or not the account exists. In **You → Who sees your shelf** you can switch on a public profile at `/u/yourname`. It isn't listed anywhere and is hidden from search engines. **See what friends see** previews it.

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

After that, every push to `main` goes live by itself. Optional extras, in the same Environment Variables screen: `ANTHROPIC_API_KEY` turns on reading photos and screenshots, `TMDB_API_KEY` improves movie & TV search, and the Twilio or Resend keys below send real codes (then remove `ALLOW_DEV_CODES`). **Variables only take effect after a redeploy** (Deployments → ⋯ → Redeploy).

## Configuration

Copy `.env.example` to `.env.local`. Everything is optional in development.

| What | Variables |
| --- | --- |
| Text login codes | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` (or `TWILIO_MESSAGING_SERVICE_SID`) |
| Email login codes | `RESEND_API_KEY`, `EMAIL_FROM` |
| Code-signing secret | `AUTH_SECRET` (optional: one is generated and kept in the database if unset) |
| Public URL | `APP_URL` (optional on Vercel, which provides its own) |
| Hosted database | `DATABASE_URL` + `DATABASE_AUTH_TOKEN`, or `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN` (any libSQL database; defaults to `data/shelf.db` locally) |
| Reading photos and screenshots | `ANTHROPIC_API_KEY` |
| Better movie & TV matches and posters | `TMDB_API_KEY` (optional: free from themoviedb.org; without it, iTunes and TVmaze are used) |
| Google Books fallback | `GOOGLE_BOOKS_API_KEY` |

Without a texting or email provider, production sign-in only works for the numbers and emails listed in `ALLOW_DEV_CODES` (comma-separated, phone numbers starting with `+` and the country code), and their codes go to the server log, never the screen. `ALLOW_DEV_CODES=1` instead shows every code on screen, which lets anyone sign in as anyone: only use it for a throwaway demo, and afterwards use **You → Sign out on all devices**.

## How it's built

Next.js 16 (App Router) with React 19 and Tailwind CSS 4, plus [vaul](https://vaul.emilkowal.ski/) sheets, [sonner](https://sonner.emilkowal.ski/) toasts and [motion](https://motion.dev/) animations. Data is stored in SQLite through libSQL.

```
app/page.tsx              signed out → Login, signed in → Home (one card per collection)
app/[kind]/               /books, /podcasts, /movies: one collection's shelf (ShelfApp)
app/s/[slug]/             the public share page + its link-preview image
app/u/[ref]/              a profile: friends (or anyone, if public) see every collection
app/f/[token]/            an invite link: sign in, then one tap to become friends
app/api/auth/*            start (send code) · verify (check code, set session) · logout
app/api/books, search, match, shares, me, ai/photo
app/api/friends, friends/requests/[id], invites/[token]
components/Login.tsx      phone/email → 6-digit code (auto-submits, SMS autofill on iOS/Android)
components/ShelfApp.tsx   one collection: cover grid, category chips, add/share/item sheets
components/add/*          one view per way of adding books, plus the shared review screen
lib/auth.ts               codes (hashed, 10-min expiry, 5 tries, resend limits) and sessions
lib/social.ts             who can see whom, friend requests, invite links, profile settings
lib/kinds.ts              each collection's words: section names, nouns, share titles, empty states
lib/catalog.ts            search & matching for every collection, dispatching to:
lib/books.ts                books (Open Library → Google Books)
lib/podcasts.ts             podcasts (Apple's directory)
lib/screen.ts               movies & TV (TMDB, or iTunes + TVmaze)
lib/fixture-*.ts            offline catalogs for tests (BOOKS_PROVIDER=fixture)
lib/categories.ts         catalog subjects → friendly categories
lib/parse.ts              pasted lists, dictation, CSV and OPML exports → candidate titles
lib/db.ts                 schema and migrations (applied automatically on first run)
```

Share links are unguessable, one per section or category, and stay live: anything you add later shows up on links you've already sent. Private items are filtered out on the server for everyone except their owner, so they never reach a friend's browser.

## Before a public launch

- Add per-IP rate limiting on `/api/auth/start` (or use Twilio Verify's fraud protection) so nobody can run up your SMS bill.
- Connect Twilio and/or Resend and remove `ALLOW_DEV_CODES`.
