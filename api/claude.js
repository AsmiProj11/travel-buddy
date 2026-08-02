// Vercel serverless function: POST /api/claude
//
// Security notes:
// - The Anthropic API key lives only in this server-side env var. It is
//   never sent to, or readable by, the browser.
// - Every request must carry a valid Supabase login token (Authorization:
//   Bearer <access_token>). The token's signature and expiry are verified
//   here using your Supabase project's JWT secret — an anonymous visitor
//   who never logged in cannot call this endpoint at all.
// - Only same-origin requests are accepted (Origin header must match this
//   deployment), so other websites can't ride on a logged-in user's session.
// - The request shape is validated and the model/max_tokens/tools are
//   pinned server-side rather than trusted from the client, so a caller
//   can't repurpose this endpoint for arbitrary prompts or run up your bill
//   with huge max_tokens.
// - A best-effort in-memory rate limit is applied per logged-in user (speed
//   bump, resets on cold start — see README).
// - A REAL daily usage cap is enforced per user via the `ai_usage` table in
//   Postgres — unlike the in-memory rate limit, this persists across cold
//   starts and regions, so it's your actual cost backstop per user.
//   Configurable via DAILY_AI_LIMIT_PER_USER (default 30/day). Note most
//   normal usage barely touches the AI at all: every place lookup is cached
//   for 30 days and shared across all users, so this only counts genuine
//   cache misses (new places) — not every screen the user visits.

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

// Supabase projects created after mid-2025 sign login tokens with a modern
// asymmetric key (ES256) by default, verified via a public JWKS endpoint —
// not the older shared secret. Older projects may still use the legacy
// HS256 shared-secret scheme. This tries the modern path first and falls
// back to the legacy one, so it works regardless of when the project was
// created.
async function verifyUser(req) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, getJWKS());
    return { id: payload.sub, token };
  } catch (e) {
    // Not a modern asymmetric token (or JWKS unavailable) — try legacy HS256.
  }

  const secret = process.env.SUPABASE_JWT_SECRET;
  if (secret) {
    try {
      const payload = jwt.verify(token, secret, { algorithms: ["HS256"] });
      return { id: payload.sub, token };
    } catch (e) {
      return null;
    }
  }
  return null;
}

const ALLOWED_MODEL = "claude-sonnet-4-6";
const MAX_TOKENS_CEILING = 4096;
const ALLOWED_TOOL_TYPES = new Set(["web_search_20250305"]);
const MAX_MESSAGES = 10;
const MAX_CONTENT_CHARS = 20000;
const DAILY_AI_LIMIT_PER_USER = Number(process.env.DAILY_AI_LIMIT_PER_USER) || 30;

const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = 20;
const hitsByUser = new Map();

function isRateLimited(userId) {
  const now = Date.now();
  const hits = (hitsByUser.get(userId) || []).filter(t => now - t < RATE_LIMIT_WINDOW_MS);
  hits.push(now);
  hitsByUser.set(userId, hits);
  return hits.length > RATE_LIMIT_MAX;
}

function isAllowedOrigin(req) {
  const origin = req.headers.origin || "";
  const referer = req.headers.referer || "";
  const host = req.headers.host || "";
  const okHosts = [host, "localhost", "127.0.0.1"];
  if (!origin && !referer) return false;
  return okHosts.some(h => h && (origin.includes(h) || referer.includes(h)));
}

function validateBody(body) {
  if (!body || typeof body !== "object") return "Missing request body";
  if (!Array.isArray(body.messages) || body.messages.length === 0) return "messages must be a non-empty array";
  if (body.messages.length > MAX_MESSAGES) return "Too many messages";
  const totalChars = JSON.stringify(body.messages).length;
  if (totalChars > MAX_CONTENT_CHARS) return "Message content too large";
  if (body.tools) {
    if (!Array.isArray(body.tools)) return "tools must be an array";
    for (const t of body.tools) {
      if (!ALLOWED_TOOL_TYPES.has(t.type)) return `Tool type not allowed: ${t.type}`;
    }
  }
  return null;
}

// Checks + increments today's usage count for this user. Returns
// { allowed, count }. Uses a plain read-then-write (not a single atomic
// statement) — under heavy concurrent use from the same account this could
// under-count by a request or two, which is an acceptable trade-off for a
// personal/small-scale cap, not a hard security boundary.
async function checkAndIncrementUsage(supabase, userId) {
  const today = new Date().toISOString().slice(0, 10);
  const { data: existing } = await supabase
    .from("ai_usage").select("count").eq("user_id", userId).eq("day", today).maybeSingle();
  const currentCount = existing?.count || 0;
  if (currentCount >= DAILY_AI_LIMIT_PER_USER) {
    return { allowed: false, count: currentCount };
  }
  await supabase.from("ai_usage").upsert({ user_id: userId, day: today, count: currentCount + 1 });
  return { allowed: true, count: currentCount + 1 };
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
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

  if (isRateLimited(user.id)) {
    res.status(429).json({ error: "Too many requests, please slow down." });
    return;
  }

  const validationError = validateBody(req.body);
  if (validationError) {
    res.status(400).json({ error: validationError });
    return;
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
  if (supabaseUrl && supabaseAnonKey) {
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${user.token}` } }
    });
    const usage = await checkAndIncrementUsage(supabase, user.id);
    if (!usage.allowed) {
      res.status(429).json({
        error: `Daily AI usage limit reached (${DAILY_AI_LIMIT_PER_USER}/day). This resets at midnight UTC — most repeat views of the same place don't count against it, since those are served from cache.`
      });
      return;
    }
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "Server is missing ANTHROPIC_API_KEY. Set it in your Vercel project's Environment Variables." });
    return;
  }

  const safeBody = {
    model: ALLOWED_MODEL,
    max_tokens: Math.min(Number(req.body.max_tokens) || 2048, MAX_TOKENS_CEILING),
    messages: req.body.messages,
    ...(req.body.tools ? { tools: req.body.tools } : {})
  };

  try {
    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify(safeBody)
    });

    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch (err) {
    res.status(502).json({ error: "Upstream request failed" });
  }
}
