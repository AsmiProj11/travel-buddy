// Vercel serverless function: POST /api/gemini
//
// Security notes (unchanged from the Anthropic version):
// - The Gemini API key lives only in this server-side env var. It is
//   never sent to, or readable by, the browser.
// - Every request must carry a valid Supabase login token (Authorization:
//   Bearer <access_token>). The token's signature and expiry are verified
//   here — an anonymous visitor who never logged in cannot call this
//   endpoint at all.
// - Only same-origin requests are accepted, so other websites can't ride
//   on a logged-in user's session.
// - The request shape is validated and the model/max-output-tokens/tools
//   are pinned server-side rather than trusted from the client.
// - A best-effort in-memory rate limit (speed bump) plus a REAL persistent
//   daily cap per user (via the `ai_usage` table) are both enforced.

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

// gemini-3.5-flash is Google's current general-purpose default (as of mid-
// 2026): strong multimodal + agentic quality at a moderate price. Swap to
// gemini-3.1-flash-lite here for a cheaper, lighter-weight tier if quality
// is sufficient for your use case — check ai.google.dev/gemini-api/docs
// for current model names before changing this, Google retires models on
// a regular cadence.
const ALLOWED_MODEL = "gemini-3.5-flash";
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${ALLOWED_MODEL}:generateContent`;
const MAX_OUTPUT_TOKENS_CEILING = 4096;
const MAX_PARTS = 6;
const MAX_TEXT_CHARS = 20000; // generous for any prompt this app sends
const MAX_IMAGE_BASE64_CHARS = 3_000_000; // ~2.2MB raw — well above what the app's own client-side photo compression (1600px, JPEG q0.85) ever produces
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

// Validates against Gemini's request shape: { contents: [{ role, parts }],
// tools?: [{ google_search: {} }] }. Only a single user turn with text
// and/or one inline image is expected from this app — reject anything
// wider, which also caps how much a caller could get billed per request.
function validateBody(body) {
  if (!body || typeof body !== "object") return "Missing request body";
  if (!Array.isArray(body.contents) || body.contents.length === 0) return "contents must be a non-empty array";
  if (body.contents.length > 1) return "Only a single turn is supported";
  const parts = body.contents[0]?.parts;
  if (!Array.isArray(parts) || parts.length === 0) return "contents[0].parts must be a non-empty array";
  if (parts.length > MAX_PARTS) return "Too many parts";

  let textChars = 0;
  for (const part of parts) {
    if (typeof part.text === "string") {
      textChars += part.text.length;
    } else if (part.inline_data) {
      const dataLen = (part.inline_data.data || "").length;
      if (dataLen > MAX_IMAGE_BASE64_CHARS) return "Image too large";
      if (!part.inline_data.mime_type || !part.inline_data.mime_type.startsWith("image/")) return "Only image inline_data is allowed";
    } else {
      return "Unrecognized part shape";
    }
  }
  if (textChars > MAX_TEXT_CHARS) return "Text content too large";
  if (body.tools) {
    if (!Array.isArray(body.tools)) return "tools must be an array";
    for (const t of body.tools) {
      const keys = Object.keys(t || {});
      if (keys.length !== 1 || keys[0] !== "google_search") return "Only the google_search tool is allowed";
    }
  }
  return null;
}

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

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "Server is missing GEMINI_API_KEY. Set it in your Vercel project's Environment Variables." });
    return;
  }

  const safeBody = {
    contents: req.body.contents,
    generationConfig: {
      maxOutputTokens: Math.min(Number(req.body.maxOutputTokens) || 2048, MAX_OUTPUT_TOKENS_CEILING)
    },
    ...(req.body.tools ? { tools: req.body.tools } : {})
  };

  try {
    const upstream = await fetch(GEMINI_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey
      },
      body: JSON.stringify(safeBody)
    });

    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch (err) {
    res.status(502).json({ error: "Upstream request failed" });
  }
}
