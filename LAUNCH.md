# Launch checklist

The last step before inviting people: the accounts, keys and the domain. Do them in this order; some need the one
before. Every key goes in Vercel (Project → Settings → Environment Variables), never in a chat or the code. After
adding or changing any, redeploy (Deployments → ⋯ → Redeploy).

Prices are what these services list as of late 2026; check each one's pricing page before paying.

## Next steps, in order

Who does each: **you** (accounts, money, testing) or **Claude** (code).

1. **Sign-in by text message.** You: start the Twilio sign-up and toll-free number (step 2 below) now, since the
   carriers' approval takes days. Claude: the privacy policy and terms pages, and the consent line on the sign-in
   screen, which the approval asks for.
2. **Sign-in by email.** You: Resend, with mytrove.me (step 2). Quick, and a backup for text.
3. **Apple Developer Program** (step 7). You: enroll as an individual ($99 a year); approval takes a day or two.
4. **Phone features.** Claude, once the Apple account is approved: push notifications (messages, new friends,
   invitees joining), invite links that open the app, the iPhone share sheet. You: one key and the Team ID from the
   Apple account.
5. **TestFlight public link** (step 7). You: upload a build from Xcode; Claude: the steps. Then share one link with
   your first friends; no App Store yet.
6. **Brand.** Claude: "Keep what you love. Find what's next." and the new mission on the sign-in screen, the app
   description and BRAND.md.
7. **North-star metric.** Claude: "weekly next-finders" on the Numbers page.
8. **Google Maps** (step 3). Claude: city search on Google first; you: the Google Cloud key.
9. **App Store**, when you're ready to go public (step 7).

## 1. The domain (paid, about $10–20 a year)

- [x] Buy a domain: **mytrove.me**, at Vercel.
- [x] Add it to the Vercel project (Settings → Domains).
- [ ] Set `APP_URL` to `https://mytrove.me` and redeploy, so invite and share links use it.

Needed before email codes (step 2), which are sent from an address at your domain.

## 2. Sign-in codes (needed: without them, nobody new can sign in)

Pick one or both.

- [ ] **Email** with Resend (free for the first few thousand emails a month): create an account at resend.com, add and
  verify your domain from step 1, create an API key. Set `RESEND_API_KEY` and `EMAIL_FROM` (like
  `Trove <hello@trove.example>`).
- [ ] **Text messages** with Twilio (paid per message, plus a phone number each month). US carriers only deliver texts
  from a registered sender, and approval takes days to a few weeks, so start early:
  - [ ] Create an account at twilio.com and upgrade it from trial (a trial only texts numbers you verify yourself).
  - [ ] Buy a **toll-free number** (Phone Numbers → Buy a number → Toll-free). For one-time codes it's the simplest
    to get approved, and doesn't need a registered business.
  - [ ] Submit its **toll-free verification** (Messaging → Regulatory Compliance, or the number's page). It asks for:
    the use case ("one-time sign-in codes"), a sample message ("Your Trove code is 123456"), how people agree to get
    texts (the line under the phone box on mytrove.me), and links to the privacy policy and terms. Those pages and
    that line are being added (next steps, 1); submit once they're live.
  - [ ] Set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` and `TWILIO_FROM` (the toll-free number, like `+18885550123`),
    then redeploy. Texts may wait in Twilio until the verification is approved.
- [ ] Remove `ALLOW_DEV_CODES` once codes really arrive.
- [ ] Test with a number or email that has never used Trove.

## 3. Google Cloud (one project for both keys)

- [ ] Create a project at console.cloud.google.com.
- [ ] **Books API** (free): APIs & Services → Library → Books API → Enable. Create an API key (Credentials → Create
  credentials → API key), restrict it to the Books API. Set `GOOGLE_BOOKS_API_KEY`. Makes book search find what Open
  Library doesn't have.
- [ ] **Places API (New)** (needs billing turned on; Google gives a monthly free allowance, then charges per search):
  enable it, create a second key restricted to it. Set `GOOGLE_PLACES_API_KEY`. Makes spot search and Go out's ideas
  use Google Maps. Set a budget alert (Billing → Budgets & alerts) so a surprise can't happen.
- [ ] **To build first:** city search ("Where?" in Go out, New place) on Google too. Today it uses the free map,
  with built-in cities and countries as backup, even when the key is set; ask for this change before adding the key.

## 4. Claude (paid by use)

- [ ] `ANTHROPIC_API_KEY` from console.anthropic.com: reading photos and screenshots, ideas, "say what you're after",
  and researching places on the web.
- [ ] In the Console, check Settings → Capabilities: web search is on (it is unless someone turned it off).
- [ ] Set a monthly spend limit (Settings → Limits). Web search costs extra per search (Go out's research uses up to 3
  per request).

## 5. Free extras

- [ ] `TMDB_API_KEY` from themoviedb.org (free): better movie & TV search and posters.
- [ ] `FEEDBACK_EMAIL`: to get feedback by email as well as on `/feedback`.

## 6. Already set, double-check

- [ ] `OWNERS`: your number (opens `/owner`, `/numbers`, `/feedback`).
- [ ] `NOT_COUNTED`: any test accounts, so they stay out of the numbers.
- [ ] The database (`TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`, or `DATABASE_URL` and `DATABASE_AUTH_TOKEN`).
- [ ] Vercel's Hobby plan is free but meant for non-commercial use; if Trove starts making money, move to Pro (paid
  monthly).

## 7. The iPhone app (see APP.md)

- [x] The app runs on your own iPhone from Xcode (free Apple ID; renew every 7 days with ▶).
- [ ] **Apple Developer Program**: enroll as an individual at developer.apple.com ($99 a year).
- [ ] **TestFlight public link**: App Store Connect → the app → TestFlight → External Testing → add a group, add the
  build, turn on the public link. Apple checks the first build (about a day). Builds expire after 90 days: upload a
  fresh one from Xcode before then; the link stays the same.
- [ ] **App Store**, when ready: screenshots, description, privacy policy and support links, a sign-in for Apple's
  reviewers, then submit for review (usually 1–3 days).

## 8. Last checks on your phone

- [ ] Sign in as a brand-new person, from an invite link.
- [ ] Search a newer book (e.g. typing "Take the lead betsy myers").
- [ ] Go out → say what you're after: picks come with a "via …" source.
- [ ] Remove Trove from your home screen and add it again, for the new icon.
