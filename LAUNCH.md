# Launch checklist

The last step before inviting people: the accounts, keys and the domain. Do them in this order; some need the one
before. Every key goes in Vercel (Project → Settings → Environment Variables), never in a chat or the code. After
adding or changing any, redeploy (Deployments → ⋯ → Redeploy).

Prices are what these services list as of late 2026; check each one's pricing page before paying.

## 1. The domain (paid, about $10–20 a year)

- [ ] Buy a domain, e.g. at Vercel (Project → Settings → Domains → Buy), Cloudflare or Namecheap.
- [ ] Add it to the Vercel project (Settings → Domains) and follow its DNS steps.
- [ ] Set `APP_URL` to it, like `https://trove.example`, so invite and share links use it.

Needed before email codes (step 2), which are sent from an address at your domain.

## 2. Sign-in codes (needed: without them, nobody new can sign in)

Pick one or both.

- [ ] **Email** with Resend (free for the first few thousand emails a month): create an account at resend.com, add and
  verify your domain from step 1, create an API key. Set `RESEND_API_KEY` and `EMAIL_FROM` (like
  `Trove <hello@trove.example>`).
- [ ] **Text messages** with Twilio (paid per message, plus a phone number each month; US numbers also need a one-time
  sender registration, which can take days to be approved): create an account at twilio.com, buy a number, register
  it for messaging. Set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` and `TWILIO_FROM` (or
  `TWILIO_MESSAGING_SERVICE_SID`).
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

## 7. Last checks on your phone

- [ ] Sign in as a brand-new person, from an invite link.
- [ ] Search a newer book (e.g. typing "Take the lead betsy myers").
- [ ] Go out → say what you're after: picks come with a "via …" source.
- [ ] Remove Trove from your home screen and add it again, for the new icon.
