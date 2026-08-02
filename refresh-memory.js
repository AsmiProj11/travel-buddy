# Security Testing

Two layers: an automated script for anyone-can-run checks, and a few manual
steps for anything that needs a real logged-in account (admin-gating, the
daily cap) — those genuinely can't be tested without a real session token,
so there's no way to automate them from outside.

## 1. Automated: `scripts/security-check.sh`

```bash
./scripts/security-check.sh https://your-app.vercel.app
```

This hits your live endpoints the way an attacker's first move would —
no login, forged tokens, wrong origin — and checks that each one is
rejected with the right status code. It also checks that security headers
are actually present on the response (not just written in `vercel.json`;
config typos happen) and that raw source files aren't accidentally served.

Run it after every deploy. A clean pass means the *obvious* attack surface
is closed — it doesn't mean "hacker-proof" (see the honesty note at the
bottom).

## 2. Manual: things that need a real login

You need a real Supabase access token for these, since that's the whole
point — the endpoint should behave differently for a logged-in stranger vs.
you as admin.

**Get your token:** open the deployed app in Chrome, log in, open DevTools
→ Application → Local Storage → your site → find the key starting with
`sb-...-auth-token` → copy the `access_token` value from inside it.

**Test 1 — a logged-in non-admin can't refresh memory:**
```bash
curl -i -X POST https://your-app.vercel.app/api/refresh-memory \
  -H "Origin: https://your-app.vercel.app" \
  -H "Authorization: Bearer PASTE_A_NON_ADMIN_TOKEN"
```
Expect `403` with `"This action is limited to the app admin."` — test this
with a second throwaway account that is *not* in `ADMIN_EMAILS`.

**Test 2 — the admin refresh works once, then is blocked same-day:**
```bash
curl -i -X POST https://your-app.vercel.app/api/refresh-memory \
  -H "Origin: https://your-app.vercel.app" \
  -H "Authorization: Bearer PASTE_YOUR_ADMIN_TOKEN"
# run it again immediately —
curl -i -X POST https://your-app.vercel.app/api/refresh-memory \
  -H "Origin: https://your-app.vercel.app" \
  -H "Authorization: Bearer PASTE_YOUR_ADMIN_TOKEN"
```
First call: `200` with a summary. Second call: `429` — "already run today."

**Test 3 — the daily AI cap actually triggers:**
Temporarily set `DAILY_AI_LIMIT_PER_USER=2` in Vercel, redeploy, use the app
(scan or search) 3 times in a row with an uncached place each time. The 3rd
should fail with the daily-limit message. Set the env var back to your real
value (e.g. 30) and redeploy afterward.

**Test 4 — a logged-in non-admin can't see the admin dashboard data:**
```bash
curl -i https://your-app.vercel.app/api/admin-stats \
  -H "Origin: https://your-app.vercel.app" \
  -H "Authorization: Bearer PASTE_A_NON_ADMIN_TOKEN"
```
Expect `403`. This one matters more than the others — this endpoint uses the
Supabase service role key, which bypasses every Row Level Security rule in
the database. If this check ever fails open, every user's data is exposed,
not just the admin's.

## What a clean result actually tells you (and doesn't)

**It confirms:** unauthenticated requests are rejected, forged tokens are
rejected, cross-origin requests are rejected, non-admins can't trigger bulk
AI regeneration, the daily cap is real and enforced server-side, and your
security headers are actually live on the deployed site — not just present
in a config file that might not have taken effect.

**It does not confirm:** that Supabase, Vercel, or Anthropic themselves have
no vulnerabilities (you're trusting their security, same as any app built
on managed infrastructure); that there's no bug elsewhere in the ~1,500
lines of app code neither of us has formally audited; or that the app is
safe from a sufficiently motivated, resourced attacker. "Passed these
checks" means the obvious, known attack paths are closed — it's a real
baseline, not a guarantee. For anything handling payment data or facing
serious adversaries, a professional penetration test is the honest next
step; for a personal/small-group travel app, this checklist is
proportionate.
