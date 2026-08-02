// Vercel serverless function: GET /api/admin-stats
//
// This is the most privileged endpoint in the app. Every other endpoint
// (including Refresh Memory) acts AS the calling user and is therefore
// still bound by Row Level Security — a user_data row belonging to someone
// else is invisible to them no matter what. This endpoint is different: it
// uses the Supabase SERVICE ROLE KEY, which bypasses Row Level Security
// entirely, because the whole point is to let the admin see across all
// users. That's exactly why access here is checked just as strictly as
// Refresh Memory (same ADMIN_EMAILS gate), and why the service role key
// must NEVER be used anywhere except inside a function like this one that
// starts with an admin check.

import jwt from "jsonwebtoken";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { createClient } from "@supabase/supabase-js";

let jwks = null;
function getJWKS() {
  if (!jwks) {
    const url = process.env.VITE_SUPABASE_URL;
    jwks = createRemoteJWKSet(new URL(`${url}/auth/v1/.well-known/jwks.json`));
  }
  return jwks;
}

async function verifyUser(req) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getJWKS());
    return { id: payload.sub, email: (payload.email || "").toLowerCase() };
  } catch (e) {}
  const secret = process.env.SUPABASE_JWT_SECRET;
  if (secret) {
    try {
      const payload = jwt.verify(token, secret, { algorithms: ["HS256"] });
      return { id: payload.sub, email: (payload.email || "").toLowerCase() };
    } catch (e) {
      return null;
    }
  }
  return null;
}

function isAdmin(email) {
  const list = (process.env.ADMIN_EMAILS || "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
  return email && list.includes(email);
}

function isAllowedOrigin(req) {
  const origin = req.headers.origin || "";
  const referer = req.headers.referer || "";
  const host = req.headers.host || "";
  const okHosts = [host, "localhost", "127.0.0.1"];
  if (!origin && !referer) return false;
  return okHosts.some(h => h && (origin.includes(h) || referer.includes(h)));
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  if (!isAllowedOrigin(req)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const user = await verifyUser(req);
  if (!user) {
    res.status(401).json({ error: "Sign in required" });
    return;
  }
  if (!isAdmin(user.email)) {
    res.status(403).json({ error: "This action is limited to the app admin." });
    return;
  }

  const url = process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    res.status(500).json({ error: "Server is missing SUPABASE_SERVICE_ROLE_KEY" });
    return;
  }
  // Service-role client — bypasses RLS. Only ever constructed here, after
  // the admin check above, and never sent to the browser.
  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

  try {
    // Every signed-up account. perPage caps at 1000 here — fine for a
    // personal/small-scale app; a project with more users than that would
    // need to page through results instead.
    const { data: userList, error: userErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (userErr) throw userErr;

    const today = new Date().toISOString().slice(0, 10);

    const [{ data: savedRows }, { data: usageRows }] = await Promise.all([
      admin.from("user_data").select("user_id, value").eq("data_key", "saved-places"),
      admin.from("ai_usage").select("user_id, count").eq("day", today)
    ]);

    const savedByUser = {};
    const placeCounts = {};
    for (const row of savedRows || []) {
      let places = [];
      try { places = JSON.parse(row.value) || []; } catch (e) {}
      savedByUser[row.user_id] = places.length;
      for (const p of places) {
        if (p?.name) placeCounts[p.name] = (placeCounts[p.name] || 0) + 1;
      }
    }

    const usageByUser = {};
    let aiUsageToday = 0;
    for (const row of usageRows || []) {
      usageByUser[row.user_id] = row.count;
      aiUsageToday += row.count;
    }

    const users = (userList?.users || []).map(u => ({
      id: u.id,
      email: u.email,
      createdAt: u.created_at,
      lastSignIn: u.last_sign_in_at || null,
      savedCount: savedByUser[u.id] || 0,
      aiCallsToday: usageByUser[u.id] || 0
    })).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const topPlaces = Object.entries(placeCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const totalSavedPlaces = Object.values(savedByUser).reduce((a, b) => a + b, 0);

    res.status(200).json({
      totalUsers: users.length,
      totalSavedPlaces,
      aiUsageToday,
      aiDailyCap: Number(process.env.DAILY_AI_LIMIT_PER_USER) || 30,
      topPlaces,
      users
    });
  } catch (e) {
    res.status(500).json({ error: e.message || "Failed to load admin stats" });
  }
}
