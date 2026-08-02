# Go-Live Checklist

Everything here that's a code/config change is already done in this project.
What's left is account setup and dashboard toggles that only you can do,
since they need your own logins. Go in order — each phase depends on the
last.

---

## Phase 1 — Accounts (~15 min)

- [ ] **GitHub** account — free, github.com
- [ ] **Vercel** account — free, sign up with your GitHub account (simplest)
- [ ] **Supabase** account — free, supabase.com
- [ ] **Google AI Studio** account — aistudio.google.com, get a Gemini API
      key (usage is pay-as-you-go past the free tier, no monthly minimum)

## Phase 2 — Supabase project (~10 min)

- [ ] Create a new Supabase project. Pick a region close to where most of
      your users will be (lower latency).
- [ ] **SQL Editor → New query** → paste and run `supabase/schema.sql`.
- [ ] **Authentication → Providers → Email**:
  - For testing: turn OFF "Confirm email" so you can log in immediately.
  - Before real users: turn it back ON.
- [ ] **Authentication → Policies**: confirm `user_data` and `shared_cache`
      both show "RLS enabled" with the policies from the schema file. This
      is the thing that actually keeps one user's data private from another
      — don't skip verifying it.
- [ ] **Authentication → Settings → Password requirements**: Supabase has a
      built-in "leaked password protection" toggle (checks new passwords
      against known breach databases) — turn it on.
- [ ] **Project Settings → API**: copy the three values you'll need next —
      Project URL, anon/public key, JWT Secret.
- [ ] **Project Settings → General**: set your Site URL to your future
      Vercel URL once you have it (Phase 3) — this matters for auth email
      links (password reset, confirmation) to point to the right place.

## Phase 3 — Deploy (~10 min)

- [ ] Push this project to a GitHub repo.
- [ ] Import it in Vercel, add all seven environment variables
      (`GEMINI_API_KEY`, `SUPABASE_JWT_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`,
      `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `ADMIN_EMAILS`,
      `DAILY_AI_LIMIT_PER_USER`) — see `.env.example` for where each comes
      from. Handle `SUPABASE_SERVICE_ROLE_KEY` with real care — it bypasses
      every privacy rule in the database.
- [ ] Deploy. Go back to Supabase → Project Settings → General → set Site
      URL to the real `https://your-app.vercel.app` URL.
- [ ] Open the deployed URL, create an account, confirm login → save a
      place → Roam Radar → nearby alert all work end to end.
- [ ] Run `./scripts/security-check.sh https://your-app.vercel.app` — it
      should report 0 failures. See `SECURITY_TESTING.md` for the manual
      follow-up tests (admin gating, the daily cap) it can't run by itself.

## Phase 4 — Spend & abuse protection (~5 min)

- [ ] **Google Cloud Console → Billing → Budgets & alerts**: set a
      monthly spend cap/alert on the project tied to your Gemini API key.
      This is your real financial backstop — the app's own rate limiter is
      a speed bump, not a guarantee.
- [ ] Check Google AI Studio's current free-tier daily request limits — if
      you're relying on the free tier, know where that ceiling is.

## Phase 5 — Monitoring (~10 min, optional but recommended)

- [ ] **Vercel → your project → Analytics** — free tier gives you basic
      traffic numbers with one click, no code change needed.
- [ ] **Error tracking**: for anything beyond a hobby project, add
      [Sentry](https://sentry.io) (free tier). Quick version:
      `npm install @sentry/react`, initialize it in `src/main.jsx`, and
      call `Sentry.captureException(error)` inside
      `ErrorBoundary.componentDidCatch`. This turns "something broke for a
      user and I never knew" into an actual alert.
- [ ] **Supabase → Logs**: skim the Auth and Postgres logs after your first
      real users show up — it's where you'll notice failed logins, RLS
      denials, or unexpected query patterns.

## Phase 6 — Legal basics (~30 min, before real strangers use it)

- [ ] The app now has a Privacy Policy & Terms screen (Profile → Privacy
      Policy & Terms) — **it's a placeholder**. Replace the text in
      `src/LegalScreen.jsx` with your actual policy. If you're not sure
      what to put, a free generator like termly.io or a similar privacy
      policy generator gets you a reasonable starting point — but for
      anything beyond a personal prototype, have an actual lawyer review
      it, especially the data you collect (email, location, photos) and
      which third parties process it (Google's Gemini API, Supabase, Vercel).
- [ ] If you'll have users in the EU, look into GDPR basics (right to
      deletion — you'd delete their `auth.users` row and their `user_data`
      rows; right to export — a simple `select * from user_data where
      user_id = ...`).
- [ ] Add a support/contact email somewhere in the app if you expect real
      users, so people have a way to reach you.

## Phase 7 — Custom domain (optional, ~15 min)

- [ ] Buy a domain (Namecheap, Google Domains, etc.) if "yourapp.vercel.app"
      isn't the vibe you want.
- [ ] Vercel → your project → Settings → Domains → add it, follow the DNS
      instructions Vercel gives you.
- [ ] Update Supabase's Site URL (Phase 2) to the new domain.

---

## What "professional" means here, honestly

This setup gives you: real auth, a real database with enforced per-user
privacy, a locked-down API, crash resilience, and the account-side
protections above. What it does *not* give you, if you're picturing scaling
past personal/small-group use: a CDN-level rate limiter (Vercel's Pro plan
or a service like Cloudflare adds this), or a dedicated support/moderation
workflow. Those are real next steps, not gaps in what's built — just beyond
what a solo/small-team prototype typically needs on day one.
