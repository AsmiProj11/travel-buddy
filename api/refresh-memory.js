// Vercel serverless function: POST /api/refresh-memory
//
// This is the ONLY place in the app that bulk-regenerates AI content —
// everything else (camera scan, search, viewing a saved place) reads from
// the shared cache first and only calls the AI on a genuine cache miss or
// after 30 days of staleness. This endpoint exists for one person (the
// admin) to deliberately refresh what's in that shared cache.
//
// It is intentionally NOT available to regular users: letting any signed-in
// visitor trigger a bulk multi-place regeneration would turn a single click
// into an unbounded AI bill. Access is restricted to the email addresses
// listed in ADMIN_EMAILS.

import jwt from "jsonwebtoken";
import { createClient } from "@supabase/supabase-js";

const MODEL = "claude-sonnet-4-6";
const PLACE_REFRESH_BATCH = 5; // keep small — serverless functions have a duration limit
function isAllowedOrigin(req) {
  const origin = req.headers.origin || "";
  const referer = req.headers.referer || "";
  const host = req.headers.host || "";
  const okHosts = [host, "localhost", "127.0.0.1"];
  if (!origin && !referer) return false;
  return okHosts.some(h => h && (origin.includes(h) || referer.includes(h)));
}

function verifyUser(req) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return null;
  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret) return null;
  try {
    const payload = jwt.verify(token, secret, { algorithms: ["HS256"] });
    return { id: payload.sub, email: (payload.email || "").toLowerCase(), token };
  } catch (e) {
    return null;
  }
}

function isAdmin(email) {
  const list = (process.env.ADMIN_EMAILS || "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
  return email && list.includes(email);
}

// Persistent once-per-day cap, stored in the database rather than in-memory
// — an in-memory counter would reset on every serverless cold start and
// stop being "once per day" in practice. Keyed per admin user, in case
// there's ever more than one.
async function checkAndRecordDailyRun(supabase, userId) {
  const key = `admin-refresh-last:${userId}`;
  const { data } = await supabase.from("shared_cache").select("value").eq("cache_key", key).maybeSingle();
  const today = new Date().toISOString().slice(0, 10);
  if (data?.value === today) return false; // already run today
  await supabase.from("shared_cache").upsert({ cache_key: key, value: today, updated_at: new Date().toISOString() });
  return true;
}

function extractJSON(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON found in AI response");
  return JSON.parse(text.slice(start, end + 1));
}

async function callAnthropic({ prompt, tools, max_tokens = 3072 }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("Server is missing ANTHROPIC_API_KEY");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens,
      messages: [{ role: "user", content: prompt }],
      ...(tools ? { tools } : {})
    })
  });
  if (!res.ok) throw new Error(`Anthropic API error ${res.status}`);
  const data = await res.json();
  const text = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("\n");
  return extractJSON(text);
}

function contentPrompt(name, category) {
  return `Research the travel destination "${name}" (category: ${category}) using web search so the information is accurate and current. Then respond with ONLY a single valid JSON object, no markdown fences, no commentary before or after, matching exactly this shape:

{
 "name": string,
 "category": string,
 "tagline": string (under 12 words),
 "overview": string (3-4 sentences),
 "history": { "builtBy": string, "yearBuilt": string, "reason": string, "facts": [string, string, string] },
 "whyFamous": string (2-3 sentences),
 "location": { "city": string, "state": string, "country": string, "lat": number, "lng": number },
 "hours": { "today": string, "weekly": [{"day": string, "hours": string}], "closedDays": string },
 "tickets": { "domestic": string, "foreign": string, "children": string, "senior": string, "special": string },
 "bestTime": { "season": string, "weather": string, "crowdLevel": string, "sunriseSunset": string },
 "photoSpots": [string, string, string],
 "nearbyAttractions": [{"name": string, "distanceKm": number, "travelTimeMin": number, "rating": number}],
 "nearbyRestaurants": [{"name": string, "cuisine": string, "priceRange": string, "rating": number}],
 "nearbyHotels": [{"name": string, "tier": string, "distanceKm": number, "rating": number}]
}`;
}

function popularDestinationsPrompt() {
  return `Using web search, name 6 currently popular travel landmarks worth featuring on a travel app's home screen — a mix of globally iconic sites and a couple of places trending right now. Respond with ONLY valid JSON, no markdown fences, no commentary:

{"places": [{"name": string, "category": string (one of: monument, museum, religious site, historical building, other)}]}`;
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  // GET is a lightweight "am I admin?" check the UI uses to decide whether
  // to even show the Refresh Memory button. It reveals nothing except a
  // boolean for the calling user's own account — the actual refresh action
  // below (POST) is independently re-verified and gated the same way, so
  // this endpoint can't be used to grant access, only to ask about it.
  if (req.method === "GET") {
    if (!isAllowedOrigin(req)) { res.status(403).json({ error: "Forbidden" }); return; }
    const user = verifyUser(req);
    if (!user) { res.status(401).json({ error: "Sign in required" }); return; }
    res.status(200).json({ isAdmin: isAdmin(user.email) });
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  if (!isAllowedOrigin(req)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const user = verifyUser(req);
  if (!user) {
    res.status(401).json({ error: "Sign in required" });
    return;
  }
  if (!isAdmin(user.email)) {
    res.status(403).json({ error: "This action is limited to the app admin." });
    return;
  }

  const url = process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    res.status(500).json({ error: "Server is missing Supabase configuration" });
    return;
  }
  // Acts as the calling (admin) user — shared_cache policies already allow
  // any authenticated user to read/write it, so no elevated service-role
  // credential is needed here.
  const supabase = createClient(url, anonKey, { global: { headers: { Authorization: `Bearer ${user.token}` } } });

  const canRunToday = await checkAndRecordDailyRun(supabase, user.id);
  if (!canRunToday) {
    res.status(429).json({ error: "Refresh Memory can only be run once per day — already run today. Try again tomorrow." });
    return;
  }

  const result = { popularRefreshed: false, placesRefreshed: 0, placesStillStale: 0, errors: [] };

  // Task 1: regenerate the "Popular destinations" home-screen list —
  // this is the "new places" half of the request.
  try {
    const popularData = await callAnthropic({
      prompt: popularDestinationsPrompt(),
      tools: [{ type: "web_search_20250305", name: "web_search" }],
      max_tokens: 1024
    });
    await supabase.from("shared_cache").upsert({
      cache_key: "popular-destinations",
      value: JSON.stringify(popularData),
      updated_at: new Date().toISOString()
    });
    result.popularRefreshed = true;
  } catch (e) {
    result.errors.push("Popular destinations: " + e.message);
  }

  // Task 2: refresh the stalest existing place guides — the "updated
  // information of places" half of the request. Only "place:<slug>" keys,
  // not "place:<slug>:<lang>" translation entries.
  try {
    const { data: staleRows } = await supabase
      .from("shared_cache")
      .select("cache_key, value, updated_at")
      .like("cache_key", "place:%")
      .not("cache_key", "like", "place:%:%")
      .order("updated_at", { ascending: true })
      .limit(PLACE_REFRESH_BATCH);

    for (const row of staleRows || []) {
      try {
        const parsed = JSON.parse(row.value);
        const name = parsed?.data?.name;
        const category = parsed?.data?.category || "landmark";
        if (!name) continue;
        const freshData = await callAnthropic({
          prompt: contentPrompt(name, category),
          tools: [{ type: "web_search_20250305", name: "web_search" }],
          max_tokens: 4096
        });
        await supabase.from("shared_cache").upsert({
          cache_key: row.cache_key,
          value: JSON.stringify({ data: freshData, syncedAt: new Date().toISOString() }),
          updated_at: new Date().toISOString()
        });
        result.placesRefreshed++;
      } catch (e) {
        result.errors.push(`${row.cache_key}: ${e.message}`);
      }
    }

    const { count } = await supabase
      .from("shared_cache")
      .select("cache_key", { count: "exact", head: true })
      .like("cache_key", "place:%")
      .not("cache_key", "like", "place:%:%");
    result.placesStillStale = Math.max(0, (count || 0) - result.placesRefreshed);
  } catch (e) {
    result.errors.push("Place refresh batch: " + e.message);
  }

  res.status(200).json(result);
}
