# ── Server-side only (set in Vercel Environment Variables, never commit) ──

# Get a key at https://aistudio.google.com/apikey (free to start)
# Only used server-side by api/gemini.js and api/refresh-memory.js —
# never exposed to the browser.
GEMINI_API_KEY=your-gemini-api-key

# Supabase Project Settings -> API -> JWT Settings -> JWT Secret
# Used server-side by api/gemini.js to verify a request came from a
# logged-in user, without an extra network round-trip to Supabase.
SUPABASE_JWT_SECRET=your-jwt-secret

# Comma-separated list of emails allowed to use the "Refresh Memory" button
# (Profile page) and bulk-regenerate the shared AI content. Everyone else
# gets a friendly "limited to the app admin" message if they try.
ADMIN_EMAILS=you@example.com

# Optional. Max AI calls per user per day before they're blocked until the
# next day. Default 30 if unset. Most usage never counts against this —
# only genuine new lookups, since everything else is served from cache.
DAILY_AI_LIMIT_PER_USER=30

# ⚠️ EXTREMELY SENSITIVE — this key BYPASSES Row Level Security entirely.
# Anyone who obtains it can read or write every row in every table,
# including every user's private data. It powers the Admin Dashboard
# (/api/admin-stats.js) and MUST NEVER have a VITE_ prefix (that would ship
# it into the public browser bundle) or appear anywhere in client code.
# Supabase Project Settings -> API -> Project API keys -> service_role
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# ── Client-side (safe to expose — protected by Row Level Security) ──

# Supabase Project Settings -> API -> Project URL
VITE_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co

# Supabase Project Settings -> API -> Project API keys -> anon / public
VITE_SUPABASE_ANON_KEY=your-anon-key
