import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  // Fails loudly at build/runtime rather than silently breaking auth —
  // easier to debug than a mysterious blank login screen.
  console.error(
    "Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Set them in your .env file (local) or Vercel Environment Variables (deployed)."
  );
}

// The anon key is safe to ship in the browser bundle by design — it can
// only do what your Row Level Security policies (supabase/schema.sql)
// allow, which is: each user reads/writes their own rows only.
export const supabase = createClient(url, anonKey);
