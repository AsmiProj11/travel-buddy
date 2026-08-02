# Travel Buddy

A standalone, installable version of the Travel Buddy prototype — point your
camera at something and get a full travel guide, browse Roam Radar for
what's nearby, get notified when you're near a saved place.

## What you need
- A free [Vercel](https://vercel.com) account (or Netlify — steps are similar)
- A free [GitHub](https://github.com) account
- A free [Supabase](https://supabase.com) account — this is your login system
  and database (like the account system behind WhatsApp/Zomato, minus the
  scale). Free tier covers a personal prototype easily.
- An Anthropic API key from https://console.anthropic.com (Settings → API Keys).
  This is the only thing that costs money, and it's pay-as-you-go — a prototype
  used by one person costs a few cents to a few dollars a month depending on use.

## 1. Set up Supabase (auth + database)
1. Go to [supabase.com](https://supabase.com) → **New Project**. Pick any name/region and a database password (save it somewhere).
2. Once it's ready, open **SQL Editor** → **New query**, paste in the contents of `supabase/schema.sql` from this project, and run it. This creates the tables that hold saved places, view history, and cached guides — with Row Level Security so users can only ever see their own data.
3. Go to **Project Settings → API**. You'll need three values from here in step 3 below:
   - **Project URL**
   - **anon / public** key
   - Under **JWT Settings**, the **JWT Secret**
4. Optional but recommended for a smoother demo: **Authentication → Providers → Email** → turn off "Confirm email" so new accounts can log in immediately instead of waiting on a confirmation email. Turn it back on before letting real strangers sign up.

## 2. Push this folder to GitHub
```bash
cd travel-buddy-app
git init
git add .
git commit -m "Travel Buddy"
gh repo create travel-buddy --public --source=. --push
# (or create a repo on github.com and follow its "push an existing repo" instructions)
```

## 3. Deploy to Vercel
1. Go to vercel.com → **Add New Project** → import your `travel-buddy` GitHub repo.
2. Vercel auto-detects Vite — leave the build settings as default.
3. Before deploying, open **Environment Variables** and add all six:
   - `ANTHROPIC_API_KEY` — from console.anthropic.com
   - `SUPABASE_JWT_SECRET` — from Supabase Project Settings → API
   - `VITE_SUPABASE_URL` — your Supabase Project URL
   - `VITE_SUPABASE_ANON_KEY` — your Supabase anon/public key
   - `ADMIN_EMAILS` — your own email (see "AI usage controls" below)
   - `DAILY_AI_LIMIT_PER_USER` — optional, defaults to 30 if unset
4. Click **Deploy**. In about a minute you'll get a live URL like
   `https://travel-buddy-yourname.vercel.app`.

This URL is a real HTTPS site — required for GPS and notifications to work,
and needed before you can install it as an app.

## AI usage controls

Two independent safeguards keep AI usage predictable:

- **Per-user daily cap** — every account is limited to `DAILY_AI_LIMIT_PER_USER`
  (default 30) genuine AI calls per day. Most app usage never counts against
  this at all: every place lookup is cached for 30 days and shared across
  every user, so only real cache misses (a landmark nobody's looked up
  recently) touch the AI. Roam Radar's nearby-places list uses free
  OpenStreetMap data and never calls the AI at all.
- **Refresh Memory** — a button on the Profile page, visible only to the
  email(s) listed in `ADMIN_EMAILS`, limited to once per day. It re-syncs
  the shared place-guide cache (the 5 stalest entries) and regenerates the
  "Popular destinations" home-screen list. This is the *only* place in the
  app that bulk-refreshes AI content — nothing else does this automatically.

## 4. Install it on your phone

**Android (Chrome):**
1. Open your Vercel URL in Chrome.
2. Tap the **⋮** menu → **Add to Home screen** → **Install**.
3. It now opens full-screen from your home screen like a normal app.

**iPhone (Safari — must be Safari, not Chrome):**
1. Open your Vercel URL in Safari.
2. Tap the **Share** icon (square with an arrow) → **Add to Home Screen** → **Add**.
3. It appears as an app icon; opening it launches full-screen, no browser bar.

## 5. First run
- Create an account on the login screen (or sign in if you already made one).
- Tap **Scan something now** and allow camera access to identify a landmark.
- Open **Roam Radar** from the home dashboard and allow location access to
  see what's nearby.
- In **Profile**, turn on **Nearby place alerts** and allow notifications —
  you'll get a real push notification (even if the app isn't open) when you
  come within 1.5 km of a place you've saved.

## Viewing your users' data (the "admin" side)
Open your project on [supabase.com](https://supabase.com) → **Table Editor**.
- `auth.users` (under Authentication) — every account that's signed up.
- `user_data` — every user's saved places, view history, and settings, one
  row per item. Filter by `user_id` to see one person's data.
- `shared_cache` — the shared pool of AI-generated place guides everyone draws from.

This is your admin panel — no extra dashboard needed for a prototype. If you
later want a custom in-app admin screen instead of using Supabase's UI
directly, that's a reasonable next step, but isn't necessary to get started.

## Local development (optional)
```bash
npm install
cp .env.example .env   # fill in your real values
npm run dev
```
Note: `npm run dev` runs the frontend only — API calls will fail locally
because there's no serverless function running. To test the full flow
locally, install the Vercel CLI (`npm i -g vercel`) and run `vercel dev`
instead, with the same `.env` values.

## Security & Privacy

**What's protected:**
- Passwords are never handled by this app's own code — Supabase Auth stores
  them hashed and manages login sessions, the same category of service
  WhatsApp/Zomato-style apps build on rather than writing themselves.
- Every user's saved places, view history, and settings live in Postgres
  behind Row Level Security — the database itself enforces that a user can
  only read or write their own rows, not just the app's UI logic.
- `/api/claude` now requires a valid, signed, non-expired login token on
  every request (verified server-side against your Supabase JWT secret) —
  an anonymous visitor who never logged in can't call it at all. It also
  only accepts same-origin requests, pins the model and a max token ceiling
  server-side, only allows the web-search tool, and rate-limits per user.
- Your Anthropic API key and Supabase JWT secret live only in Vercel's
  server-side environment variables — never sent to or readable from the browser.
- Security headers (`vercel.json`) block the site from being embedded in
  another site's frame (clickjacking protection) and restrict camera/
  geolocation to your own domain.
- Photos are re-encoded through a canvas on-device before upload, which
  strips EXIF metadata — many phone photos otherwise embed the exact GPS
  coordinates of where they were taken.

**What flows off a user's device (and why):** the photo they scan, their
search text, and their GPS coordinates (only when Roam Radar or location
alerts are on) are sent — via the `/api/claude` proxy — to Anthropic's API
so it can identify places and research travel details. Their email and
saved-place data are sent to Supabase to power login and sync. Nothing goes
anywhere else, and the proxy itself logs no request content.

**Known limitations of this setup** (fine for a personal or small-group
prototype, worth strengthening before a public launch):
- The rate limiter is in-memory per serverless instance — it resets on cold
  starts and isn't shared across regions. For real protection at scale, swap
  it for [Vercel KV](https://vercel.com/docs/storage/vercel-kv) or
  [Upstash Redis](https://upstash.com/).
- Email confirmation is off by default in the setup steps above, for a
  smoother demo — turn it back on in Supabase before letting strangers sign up,
  so people can't create accounts with emails they don't own.
- Set a spending limit on your Anthropic key in the console as a backstop.
- Anyone with your Supabase **service_role** key (different from the anon
  key used here) bypasses Row Level Security entirely — never put it in
  client code or commit it anywhere; this project doesn't use it.
- As the project owner you can see every user's data via Supabase's
  dashboard by design (that's the "admin" access you asked for) — if you
  ever have real users, say so in a privacy policy and treat that access
  responsibly.

