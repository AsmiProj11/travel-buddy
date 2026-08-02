import React, { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "./lib/supabaseClient.js";
import LegalScreen from "./LegalScreen.jsx";
import AdminDashboard from "./AdminDashboard.jsx";
import {
  Camera, Image as ImageIcon, Search, MapPin, Clock, Ticket, Volume2,
  VolumeX, Star, Utensils, Building2, ShieldCheck, Sparkles, Route,
  Languages, Heart, Share2, Navigation, Bookmark, Map as MapIcon, User,
  Home as HomeIcon, X, Loader2, ChevronDown, ChevronUp, BadgeCheck,
  RefreshCw, Sunrise, Users, Sun, Moon, Info, Compass, Check, ArrowLeft,
  ParkingCircle, Wifi, Accessibility, Droplets, Radar, LocateFixed, RotateCw
} from "lucide-react";

const THEMES = {
  dark: {
    bg: "#241B10", surface: "#2E2316", surface2: "#3B2C1A",
    ink: "#F5E9CD", inkMuted: "#C2AD84", gold: "#E85B3B",
    teal: "#4FC2B8", border: "rgba(245,233,205,0.18)",
    danger: "#E85B3B", stage: "#150F09"
  },
  light: {
    bg: "#F3E7C9", surface: "#FBF3DF", surface2: "#EBDBAE",
    ink: "#3A2C1B", inkMuted: "#8A7550", gold: "#DD4B2E",
    teal: "#1E8C86", border: "rgba(58,44,27,0.22)",
    danger: "#C23B26", stage: "#E7D9AE"
  }
};

const POPULAR = [
  { name: "Taj Mahal", category: "monument", icon: Building2 },
  { name: "Eiffel Tower", category: "monument", icon: Building2 },
  { name: "Statue of Liberty", category: "monument", icon: Building2 },
  { name: "Burj Khalifa", category: "monument", icon: Building2 },
  { name: "Great Wall of China", category: "monument", icon: Route },
  { name: "Machu Picchu", category: "historical building", icon: Compass }
];

const LANGUAGES = [
  { code: "en", label: "English" }, { code: "hi", label: "Hindi" },
  { code: "fr", label: "French" }, { code: "es", label: "Spanish" },
  { code: "de", label: "German" }, { code: "ja", label: "Japanese" },
  { code: "ar", label: "Arabic" }
];

const FACILITY_ICONS = {
  Parking: ParkingCircle, Washrooms: Droplets, "Wheelchair access": Accessibility,
  "Drinking water": Droplets, Wifi: Wifi
};

function slugify(s) {
  return String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

// Re-encodes the photo through a canvas before it's sent anywhere. This
// strips EXIF metadata — phone photos frequently embed the exact GPS
// coordinates of where they were taken, plus device info — none of which
// the app needs and none of which should leave the device. It also caps
// the dimensions, which keeps uploads small.
async function fileToBase64(file) {
  const MAX_DIM = 1600;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    let { width, height } = bitmap;
    if (width > MAX_DIM || height > MAX_DIM) {
      const scale = MAX_DIM / Math.max(width, height);
      width = Math.round(width * scale);
      height = Math.round(height * scale);
    }
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(bitmap, 0, 0, width, height);
    return canvas.toDataURL("image/jpeg", 0.85).split(",")[1];
  } catch (e) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result.split(",")[1]);
      r.onerror = () => reject(new Error("Could not read file"));
      r.readAsDataURL(file);
    });
  }
}

function extractJSON(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON found in response");
  return JSON.parse(text.slice(start, end + 1));
}

async function callGemini({ text, image, tools, max_tokens = 2048 }) {
  const { data: { session } } = await supabase.auth.getSession();
  const parts = [];
  if (image) parts.push({ inline_data: { mime_type: image.mediaType, data: image.data } });
  parts.push({ text });

  const res = await fetch("/api/gemini", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {})
    },
    body: JSON.stringify({
      contents: [{ role: "user", parts }],
      maxOutputTokens: max_tokens,
      ...(tools ? { tools } : {})
    })
  });
  if (!res.ok) {
    let message = `The AI service returned an error (${res.status})`;
    try { const errBody = await res.json(); if (errBody?.error) message = errBody.error; } catch (e) {}
    throw new Error(message);
  }
  const data = await res.json();
  const candidate = data?.candidates?.[0];
  const candidateParts = candidate?.content?.parts || [];
  const textOut = candidateParts.filter(p => typeof p.text === "string").map(p => p.text).join("\n");
  if (!textOut) {
    const reason = candidate?.finishReason;
    if (reason === "SAFETY" || reason === "PROHIBITED_CONTENT") throw new Error("The AI declined to respond to this content.");
    if (reason === "MAX_TOKENS") throw new Error("The AI's response was cut off before finishing — try again.");
    throw new Error("The AI returned an empty response — try again.");
  }
  return textOut;
}

const IDENTIFY_PROMPT = `You are the vision engine for a travel guide app. Look at this photo and identify the single most prominent travel-relevant subject: a landmark, monument, museum, temple, church, restaurant dish, mountain, beach, waterfall, animal, flower, or artwork.

Respond with ONLY valid JSON, no markdown fences, no explanation:
{"name": "common name of the subject", "category": "one of: monument, museum, religious site, restaurant, food, mountain, beach, waterfall, animal, flower, artwork, historical building, other", "confidence": "high, medium, or low"}

If you cannot confidently identify anything travel-relevant, still return your best guess with confidence "low".`;

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
 "nearbyHotels": [{"name": string, "tier": string, "distanceKm": number, "rating": number}],
 "facilities": [string],
 "safetyTips": [string, string, string],
 "funFacts": [string, string, string],
 "itinerary": { "recommendedDuration": string, "combineWith": [string, string] }
}

Provide 3-4 items in each list. Facilities should be chosen from: Parking, Washrooms, Wheelchair access, Food court, Drinking water, Guides, ATM, Wifi. If this subject is food, an animal, or a plant rather than a place, still fill every field as best as reasonably possible (e.g. location = where it's best experienced, tickets = "Not applicable"). Keep every string concise.`;
}

function bearingDeg(lat1, lng1, lat2, lng2) {
  const toRad = d => (d * Math.PI) / 180;
  const toDeg = r => (r * 180) / Math.PI;
  const y = Math.sin(toRad(lng2 - lng1)) * Math.cos(toRad(lat2));
  const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) - Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lng2 - lng1));
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

function categoryIcon(category = "") {
  const c = category.toLowerCase();
  if (c.includes("food") || c.includes("restaurant") || c.includes("cafe")) return Utensils;
  if (c.includes("monument") || c.includes("museum") || c.includes("religious") || c.includes("historical")) return Building2;
  if (c.includes("art")) return Sparkles;
  return MapPin;
}

// Roam Radar's nearby-places discovery uses OpenStreetMap's free, keyless
// Overpass API instead of AI — this is pure map/POI data lookup, not a task
// that needs a language model, and it means browsing nearby places never
// spends an AI token. The trade-off vs. the earlier AI+web-search version:
// no ratings/reviews (OSM doesn't have those), and results are "everything
// tagged nearby" rather than an AI-curated famous+hidden-gem mix.
const OVERPASS_URL = "https://overpass-api.de/api/interpreter";

function overpassQuery(lat, lng, radiusM = 10000) {
  return `[out:json][timeout:25];
(
  node["tourism"~"^(museum|attraction|artwork|viewpoint|gallery|zoo)$"](around:${radiusM},${lat},${lng});
  node["historic"](around:${radiusM},${lat},${lng});
  node["amenity"~"^(restaurant|cafe|place_of_worship|marketplace|theatre)$"](around:${radiusM},${lat},${lng});
  node["leisure"~"^(park|garden)$"](around:${radiusM},${lat},${lng});
);
out center 60;`;
}

function osmCategory(tags = {}) {
  if (tags.amenity === "restaurant" || tags.amenity === "cafe") return "food";
  if (tags.amenity === "place_of_worship") return "religious site";
  if (tags.amenity === "marketplace") return "market";
  if (tags.amenity === "theatre") return "other";
  if (tags.leisure === "park" || tags.leisure === "garden") return "park";
  if (tags.tourism === "museum" || tags.tourism === "gallery") return "museum";
  if (tags.tourism === "viewpoint") return "viewpoint";
  if (tags.tourism === "artwork") return "artwork";
  if (tags.historic) return "historical building";
  if (tags.tourism === "attraction" || tags.tourism === "zoo") return "monument";
  return "other";
}

function osmBlurb(tags = {}) {
  if (tags.cuisine) return `${tags.cuisine.replace(/_/g, " ")} spot`;
  if (tags.historic) return `Historic ${tags.historic.replace(/_/g, " ")}`;
  if (tags.tourism) return tags.tourism.replace(/_/g, " ");
  if (tags.leisure) return tags.leisure.replace(/_/g, " ");
  if (tags.amenity) return tags.amenity.replace(/_/g, " ");
  return "Nearby spot";
}

function osmAddress(tags = {}) {
  const parts = [tags["addr:housenumber"], tags["addr:street"]].filter(Boolean);
  return parts.length ? parts.join(" ") : (tags["addr:city"] || null);
}

async function fetchOverpassPOIs(lat, lng) {
  const res = await fetch(OVERPASS_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: overpassQuery(lat, lng)
  });
  if (!res.ok) throw new Error("Map data service returned an error (" + res.status + ")");
  const data = await res.json();
  const places = (data.elements || [])
    .filter(el => el.tags && el.tags.name)
    .map(el => ({
      name: el.tags.name,
      category: osmCategory(el.tags),
      lat: el.lat, lng: el.lon,
      blurb: osmBlurb(el.tags),
      address: osmAddress(el.tags),
      openingHours: el.tags.opening_hours || null
    }));
  // De-dupe by name+category (Overpass can return near-duplicate nodes for
  // the same real-world place), then keep the 14 nearest.
  const seen = new Set();
  const deduped = places.filter(p => {
    const key = `${p.name}|${p.category}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  deduped.forEach(p => { p.distanceKm = distanceKm(lat, lng, p.lat, p.lng); });
  deduped.sort((a, b) => a.distanceKm - b.distanceKm);
  return deduped.slice(0, 14);
}

function translatePrompt(data, langLabel) {
  return `Translate every human-readable string value in this JSON travel guide object into ${langLabel}. Keep the exact same JSON shape and keys, translate all string and array-of-string values, keep numbers unchanged. Respond with ONLY the translated JSON object, no markdown fences, no commentary.

${JSON.stringify(data)}`;
}

function distanceKm(lat1, lng1, lat2, lng2) {
  if ([lat1, lng1, lat2, lng2].some(v => v === undefined || v === null || Number.isNaN(Number(v)))) return Infinity;
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function notifyUser(title, body) {
  try {
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      new Notification(title, { body, icon: undefined });
      return true;
    }
  } catch (e) {}
  return false;
}

function daysAgo(iso) {
  const ms = Date.now() - new Date(iso).getTime();
  return Math.floor(ms / (24 * 3600 * 1000));
}

function nextSyncLabel(iso) {
  const d = new Date(iso);
  d.setMonth(d.getMonth() + 1, 1);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function Stamp({ theme, syncedAt, fromCache }) {
  const date = new Date(syncedAt).toLocaleDateString(undefined, { month: "short", day: "2-digit", year: "numeric" });
  return (
    <div style={{
      border: `1.5px dashed ${theme.gold}`, borderRadius: 999, padding: "5px 12px",
      display: "inline-flex", alignItems: "center", gap: 6, transform: "rotate(-3deg)",
      color: theme.gold, fontFamily: "var(--font-mono)"
    }}>
      <BadgeCheck size={14} />
      <span style={{ fontSize: 11, letterSpacing: 0.5 }}>
        {fromCache ? "VERIFIED " : "FRESHLY SYNCED "}{date}
      </span>
    </div>
  );
}

function SectionCard({ theme, icon: Icon, title, children, defaultOpen = true, collapsible = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{
      background: theme.surface, border: `2px dashed ${theme.border}`, borderRadius: "16px 18px 14px 18px",
      padding: "13px 15px", marginBottom: 12
    }}>
      <button
        onClick={() => collapsible && setOpen(o => !o)}
        style={{
          width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
          background: "none", border: "none", padding: 0, cursor: collapsible ? "pointer" : "default"
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 9, color: theme.ink, fontFamily: "var(--font-display)", fontSize: 17.5, fontWeight: 700 }}>
          <span style={{
            width: 26, height: 26, borderRadius: "50%", background: theme.surface2,
            border: `1.5px solid ${theme.gold}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0
          }}>
            <Icon size={13} color={theme.gold} />
          </span>
          {title}
        </span>
        {collapsible && (open ? <ChevronUp size={16} color={theme.inkMuted} /> : <ChevronDown size={16} color={theme.inkMuted} />)}
      </button>
      {open && <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1.5px dashed ${theme.border}`, color: theme.ink }}>{children}</div>}
    </div>
  );
}

function Pill({ theme, children }) {
  return (
    <span style={{
      background: theme.surface2, color: theme.inkMuted, fontSize: 11.5,
      padding: "4px 9px", borderRadius: 999, marginRight: 6, marginBottom: 6,
      display: "inline-block", fontFamily: "var(--font-mono)"
    }}>{children}</span>
  );
}

function Row({ theme, label, value }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: `1px dashed ${theme.border}`, fontSize: 13.5 }}>
      <span style={{ color: theme.inkMuted }}>{label}</span>
      <span style={{ color: theme.ink, fontFamily: "var(--font-mono)", textAlign: "right" }}>{value}</span>
    </div>
  );
}

function ListCard({ theme, items, renderRight }) {
  return items.map((it, i) => (
    <div key={i} style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      padding: "8px 0", borderBottom: i < items.length - 1 ? `1px solid ${theme.border}` : "none"
    }}>
      <div>
        <div style={{ fontSize: 13.5, color: theme.ink }}>{it.name}</div>
        <div style={{ fontSize: 11.5, color: theme.inkMuted }}>{it.sub}</div>
      </div>
      <div style={{ fontSize: 12, color: theme.gold, fontFamily: "var(--font-mono)" }}>{renderRight(it)}</div>
    </div>
  ));
}

export default function App({ session, onLogout }) {
  const [mode, setMode] = useState("dark");
  const theme = THEMES[mode];
  const [tab, setTab] = useState("home");
  const [toast, setToast] = useState(null);

  const [capturedImage, setCapturedImage] = useState(null);
  const [identifying, setIdentifying] = useState(false);
  const [identifyError, setIdentifyError] = useState(null);

  const [place, setPlace] = useState(null);
  const [placeMeta, setPlaceMeta] = useState(null);
  const [loadingPlace, setLoadingPlace] = useState(false);
  const [loadError, setLoadError] = useState(null);

  const [savedPlaces, setSavedPlaces] = useState([]);
  const [recentViews, setRecentViews] = useState([]);

  const [lang, setLang] = useState("en");
  const [translating, setTranslating] = useState(false);
  const [displayPlace, setDisplayPlace] = useState(null);

  const [speaking, setSpeaking] = useState(false);

  const [alertsEnabled, setAlertsEnabled] = useState(false);
  const [notifPermission, setNotifPermission] = useState(
    typeof Notification !== "undefined" ? Notification.permission : "unsupported"
  );
  const [nearbyPlace, setNearbyPlace] = useState(null);
  const notifiedRef = useRef({});
  const watchIdRef = useRef(null);

  const [myLocation, setMyLocation] = useState(null);
  const [locationStatus, setLocationStatus] = useState("idle"); // idle | locating | granted | denied | error
  const [nearbyPOIs, setNearbyPOIs] = useState([]);
  const [nearbyAreaName, setNearbyAreaName] = useState("");
  const [loadingNearby, setLoadingNearby] = useState(false);
  const [nearbyError, setNearbyError] = useState(null);
  const [nearbyMeta, setNearbyMeta] = useState(null);

  const cameraInputRef = useRef(null);
  const galleryInputRef = useRef(null);
  const [popularList, setPopularList] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await window.storage.get("saved-places", false);
        if (r && r.value) setSavedPlaces(JSON.parse(r.value));
      } catch (e) {}
      try {
        const r = await window.storage.get("recent-views", false);
        if (r && r.value) setRecentViews(JSON.parse(r.value));
      } catch (e) {}
      try {
        const r = await window.storage.get("alerts-enabled", false);
        if (r && r.value) setAlertsEnabled(JSON.parse(r.value));
      } catch (e) {}
      try {
        const r = await window.storage.get("popular-destinations", true);
        if (r && r.value) {
          const parsed = JSON.parse(r.value);
          if (Array.isArray(parsed.places) && parsed.places.length) setPopularList(parsed.places);
        }
      } catch (e) {}
    })();
  }, []);

  useEffect(() => { setDisplayPlace(place); setLang("en"); }, [place]);

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  }

  async function persistSaved(next) {
    setSavedPlaces(next);
    try { await window.storage.set("saved-places", JSON.stringify(next), false); } catch (e) {}
  }

  async function persistRecent(entry) {
    const next = [entry, ...recentViews.filter(r => r.slug !== entry.slug)].slice(0, 8);
    setRecentViews(next);
    try { await window.storage.set("recent-views", JSON.stringify(next), false); } catch (e) {}
  }

  async function persistAlertsEnabled(next) {
    setAlertsEnabled(next);
    try { await window.storage.set("alerts-enabled", JSON.stringify(next), false); } catch (e) {}
  }

  async function requestNotifPermission() {
    if (typeof Notification === "undefined") { setNotifPermission("unsupported"); return; }
    try {
      const perm = await Notification.requestPermission();
      setNotifPermission(perm);
      if (perm === "granted") { persistAlertsEnabled(true); showToast("Location alerts turned on"); }
    } catch (e) {}
  }

  // Watch GPS position and fire a proximity notification when the traveler
  // comes near a saved place (threshold: 1.5 km). This is the "nearby alert"
  // half of the notification system; the other half fires when a photo/search
  // identifies a place (see fetchOrGeneratePlace).
  useEffect(() => {
    if (!alertsEnabled || typeof navigator === "undefined" || !navigator.geolocation) return;

    const PROXIMITY_KM = 1.5;
    const RENOTIFY_MS = 60 * 60 * 1000; // don't re-alert for the same place within an hour

    function checkProximity(coords) {
      let closest = null;
      for (const s of savedPlaces) {
        if (typeof s.lat !== "number" || typeof s.lng !== "number") continue;
        const d = distanceKm(coords.latitude, coords.longitude, s.lat, s.lng);
        if (d <= PROXIMITY_KM && (!closest || d < closest.distanceKm)) {
          closest = { ...s, distanceKm: d };
        }
      }
      if (closest) {
        const last = notifiedRef.current[closest.slug] || 0;
        if (Date.now() - last > RENOTIFY_MS) {
          notifiedRef.current[closest.slug] = Date.now();
          const title = `You're near ${closest.name}!`;
          const body = `About ${closest.distanceKm.toFixed(1)} km away. Tap Travel Buddy to see the full guide.`;
          const sent = notifyUser(title, body);
          setNearbyPlace(closest);
          if (!sent) showToast(title);
        }
      }
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => checkProximity(pos.coords),
      () => { /* silently ignore geolocation errors (denied, unavailable, etc.) */ },
      { enableHighAccuracy: false, maximumAge: 60000, timeout: 20000 }
    );

    return () => {
      if (watchIdRef.current !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [alertsEnabled, savedPlaces]);

  const isSaved = place && savedPlaces.some(s => s.slug === slugify(place.name));

  function toggleSave() {
    if (!place) return;
    const slug = slugify(place.name);
    if (isSaved) {
      persistSaved(savedPlaces.filter(s => s.slug !== slug));
      showToast("Removed from saved");
    } else {
      persistSaved([{
        slug, name: place.name, category: place.category, savedAt: new Date().toISOString(),
        lat: place.location?.lat, lng: place.location?.lng
      }, ...savedPlaces]);
      showToast("Saved to your trips");
    }
  }

  const fetchOrGeneratePlace = useCallback(async (name, category) => {
    setLoadingPlace(true);
    setLoadError(null);
    setPlace(null);
    setPlaceMeta(null);
    const slug = slugify(name);
    try {
      let cachedEntry = null;
      try {
        const r = await window.storage.get(`place:${slug}`, true);
        if (r && r.value) cachedEntry = JSON.parse(r.value);
      } catch (e) {}

      let data, syncedAt, fromCache;
      if (cachedEntry && daysAgo(cachedEntry.syncedAt) < 30) {
        data = cachedEntry.data;
        syncedAt = cachedEntry.syncedAt;
        fromCache = true;
      } else {
        const text = await callGemini({
          text: contentPrompt(name, category),
          tools: [{ google_search: {} }],
          max_tokens: 4096
        });
        data = extractJSON(text);
        syncedAt = new Date().toISOString();
        fromCache = false;
        try { await window.storage.set(`place:${slug}`, JSON.stringify({ data, syncedAt }), true); } catch (e) {}
      }
      setPlace(data);
      setPlaceMeta({ syncedAt, fromCache, slug });
      persistRecent({ slug, name: data.name, category: data.category, viewedAt: new Date().toISOString() });
      setTab("results");
      const sent = notifyUser(`This is ${data.name}`, data.tagline || "Tap to see the full travel guide.");
      if (!sent) showToast(`Identified: ${data.name}`);
    } catch (e) {
      setLoadError(e.message || "Something went wrong fetching this place.");
    } finally {
      setLoadingPlace(false);
    }
  }, [recentViews]);

  const fetchNearbyPOIs = useCallback(async (lat, lng) => {
    setLoadingNearby(true);
    setNearbyError(null);
    try {
      const places = await fetchOverpassPOIs(lat, lng);
      setNearbyPOIs(places);
      setNearbyAreaName("");
      setNearbyMeta({ syncedAt: new Date().toISOString(), fromCache: false, source: "openstreetmap" });
    } catch (e) {
      setNearbyError(e.message || "Couldn't load nearby places.");
    } finally {
      setLoadingNearby(false);
    }
  }, []);

  const [refreshingMemory, setRefreshingMemory] = useState(false);
  const [refreshResult, setRefreshResult] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data: { session: s } } = await supabase.auth.getSession();
        if (!s?.access_token) return;
        const res = await fetch("/api/refresh-memory", {
          method: "GET",
          headers: { Authorization: `Bearer ${s.access_token}` }
        });
        if (res.ok) {
          const body = await res.json();
          setIsAdmin(!!body.isAdmin);
        }
      } catch (e) {
        // If this check fails for any reason, default stays false — the
        // button simply won't show. The server-side gate on the actual
        // refresh action is the real security boundary either way.
      }
    })();
  }, []);

  async function refreshMemory() {
    setRefreshingMemory(true);
    setRefreshResult(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/refresh-memory", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {})
        }
      });
      const body = await res.json();
      if (!res.ok) {
        setRefreshResult({ ok: false, message: body?.error || `Error (${res.status})` });
      } else {
        const parts = [];
        if (body.popularRefreshed) parts.push("refreshed popular destinations");
        parts.push(`updated ${body.placesRefreshed} place${body.placesRefreshed === 1 ? "" : "s"}`);
        if (body.placesStillStale > 0) parts.push(`${body.placesStillStale} more still stale — run again to continue`);
        setRefreshResult({ ok: true, message: parts.join(", ") });
      }
    } catch (e) {
      setRefreshResult({ ok: false, message: "Network error — try again." });
    } finally {
      setRefreshingMemory(false);
    }
  }

  function locateMe() {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setLocationStatus("error");
      return;
    }
    setLocationStatus("locating");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setMyLocation(loc);
        setLocationStatus("granted");
        fetchNearbyPOIs(loc.lat, loc.lng);
      },
      (err) => {
        setLocationStatus(err.code === 1 ? "denied" : "error");
      },
      { enableHighAccuracy: false, maximumAge: 120000, timeout: 15000 }
    );
  }

  async function handleFile(file) {
    if (!file) return;
    setIdentifying(true);
    setIdentifyError(null);
    try {
      const b64 = await fileToBase64(file);
      setCapturedImage(`data:image/jpeg;base64,${b64}`);
      const text = await callGemini({
        text: IDENTIFY_PROMPT,
        image: { mediaType: "image/jpeg", data: b64 },
        max_tokens: 1024
      });
      const guess = extractJSON(text);
      setIdentifying(false);
      await fetchOrGeneratePlace(guess.name, guess.category);
    } catch (e) {
      setIdentifying(false);
      setIdentifyError(e.message || "Could not identify this photo.");
    }
  }

  async function handleTranslate(code) {
    if (!place) return;
    if (code === "en") { setDisplayPlace(place); setLang("en"); return; }
    const langLabel = LANGUAGES.find(l => l.code === code)?.label || code;
    setTranslating(true);
    try {
      const cacheKey = `place:${placeMeta.slug}:${code}`;
      let cached = null;
      try {
        const r = await window.storage.get(cacheKey, true);
        if (r && r.value) cached = JSON.parse(r.value);
      } catch (e) {}
      if (cached && daysAgo(cached.syncedAt) < 30) {
        setDisplayPlace(cached.data);
      } else {
        const text = await callGemini({
          text: translatePrompt(place, langLabel),
          max_tokens: 4096
        });
        const translated = extractJSON(text);
        setDisplayPlace(translated);
        try { await window.storage.set(cacheKey, JSON.stringify({ data: translated, syncedAt: new Date().toISOString() }), true); } catch (e) {}
      }
      setLang(code);
    } catch (e) {
      showToast("Translation failed, showing English");
    } finally {
      setTranslating(false);
    }
  }

  function speak() {
    if (!displayPlace) return;
    if (speaking) { window.speechSynthesis.cancel(); setSpeaking(false); return; }
    const text = [
      displayPlace.name, displayPlace.overview,
      "History. " + displayPlace.history.reason,
      "Why famous. " + displayPlace.whyFamous,
      "Best time to visit. " + displayPlace.bestTime.season + ". " + displayPlace.bestTime.weather
    ].join(". ");
    const utter = new SpeechSynthesisUtterance(text);
    const langMap = { en: "en-US", hi: "hi-IN", fr: "fr-FR", es: "es-ES", de: "de-DE", ja: "ja-JP", ar: "ar-SA" };
    utter.lang = langMap[lang] || "en-US";
    utter.onend = () => setSpeaking(false);
    utter.onerror = () => setSpeaking(false);
    window.speechSynthesis.speak(utter);
    setSpeaking(true);
  }

  function shareCard() {
    if (!place) return;
    const text = `${place.name}\n\n${place.overview}\n\n${place.location.city}, ${place.location.country}\nVerified ${new Date(placeMeta.syncedAt).toLocaleDateString()}\n\nShared from Travel Buddy`;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(() => showToast("Travel card copied to clipboard"));
    } else {
      showToast("Copy not supported in this preview");
    }
  }

  const fontImport = `@import url('https://fonts.googleapis.com/css2?family=Kalam:wght@400;700&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap');`;
  const paperTexture = {
    backgroundImage: `linear-gradient(${theme.border} 1px, transparent 1px), linear-gradient(90deg, ${theme.border} 1px, transparent 1px)`,
    backgroundSize: "22px 22px", backgroundColor: theme.bg
  };

  return (
    <div style={{ minHeight: 640, background: theme.stage, display: "flex", justifyContent: "center", padding: "24px 12px", fontFamily: "var(--font-body)" }}>
      <style>{`
        ${fontImport}
        :root { --font-display: 'Kalam', cursive; --font-body: 'Inter', sans-serif; --font-mono: 'IBM Plex Mono', monospace; }
        * { box-sizing: border-box; }
        .phone-scroll::-webkit-scrollbar { width: 0; }
      `}</style>

      <div style={{
        width: 402, maxWidth: "100%", ...paperTexture, borderRadius: "30px 34px 28px 32px",
        border: `2.5px solid ${theme.ink}`, overflow: "hidden", display: "flex", flexDirection: "column",
        height: 800, boxShadow: "0 30px 60px rgba(0,0,0,0.35)"
      }}>
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "14px 18px 12px", borderBottom: `2px dashed ${theme.border}`
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <span style={{
              width: 30, height: 30, borderRadius: "50%", background: theme.gold,
              display: "flex", alignItems: "center", justifyContent: "center",
              border: `2px solid ${theme.ink}`, transform: "rotate(-6deg)"
            }}>
              <Compass size={16} color={theme.stage} />
            </span>
            <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 20, color: theme.ink, letterSpacing: 0.3 }}>Travel Buddy</span>
          </div>
          <button onClick={() => setMode(m => m === "dark" ? "light" : "dark")}
            style={{ background: theme.surface, border: `2px dashed ${theme.border}`, borderRadius: 999, padding: 7, cursor: "pointer" }}>
            {mode === "dark" ? <Sun size={14} color={theme.gold} /> : <Moon size={14} color={theme.gold} />}
          </button>
        </div>

        <div className="phone-scroll" style={{ flex: 1, overflowY: "auto", padding: "16px 16px 8px" }}>
          {tab === "home" && (
            <HomeScreen theme={theme} savedCount={savedPlaces.length} recentViews={recentViews}
              onSearch={(name) => fetchOrGeneratePlace(name, "landmark")}
              onPick={(p) => fetchOrGeneratePlace(p.name, p.category)}
              onScan={() => setTab("camera")}
              onOpenRadar={() => { setTab("radar"); if (!myLocation) locateMe(); }}
              loadingPlace={loadingPlace}
              popularList={popularList}
              nearbyPlace={nearbyPlace}
              onOpenNearby={() => { fetchOrGeneratePlace(nearbyPlace.name, nearbyPlace.category); setNearbyPlace(null); }}
              onDismissNearby={() => setNearbyPlace(null)} />
          )}

          {tab === "radar" && (
            <RadarScreen theme={theme} myLocation={myLocation} locationStatus={locationStatus}
              nearbyPOIs={nearbyPOIs} areaName={nearbyAreaName} loadingNearby={loadingNearby}
              nearbyError={nearbyError} nearbyMeta={nearbyMeta}
              onLocate={locateMe} onRefresh={() => myLocation && fetchNearbyPOIs(myLocation.lat, myLocation.lng)}
              onPick={(p) => fetchOrGeneratePlace(p.name, p.category)}
              onBack={() => setTab("home")} />
          )}

          {tab === "camera" && (
            <CameraScreen theme={theme} capturedImage={capturedImage} identifying={identifying}
              identifyError={identifyError} loadingPlace={loadingPlace} loadError={loadError}
              onCapture={() => cameraInputRef.current?.click()}
              onGallery={() => galleryInputRef.current?.click()}
              onRetry={() => { setCapturedImage(null); setIdentifyError(null); setLoadError(null); }} />
          )}

          {tab === "results" && (
            loadingPlace ? (
              <CenteredLoader theme={theme} label="Building your travel guide" />
            ) : place && (
              <ResultsScreen theme={theme} place={displayPlace} rawPlace={place} meta={placeMeta}
                isSaved={isSaved} onToggleSave={toggleSave} onShare={shareCard}
                onSpeak={speak} speaking={speaking}
                lang={lang} onTranslate={handleTranslate} translating={translating}
                onBack={() => setTab("home")} />
            )
          )}

          {tab === "saved" && (
            <SavedScreen theme={theme} savedPlaces={savedPlaces}
              onOpen={(s) => fetchOrGeneratePlace(s.name, s.category)}
              onRemove={(s) => persistSaved(savedPlaces.filter(x => x.slug !== s.slug))} />
          )}

          {tab === "trips" && <TripsScreen theme={theme} savedPlaces={savedPlaces} setTab={setTab} />}

          {tab === "profile" && (
            <ProfileScreen theme={theme} mode={mode} setMode={setMode} savedCount={savedPlaces.length}
              alertsEnabled={alertsEnabled} notifPermission={notifPermission}
              onRequestPermission={requestNotifPermission}
              email={session?.user?.email} onLogout={onLogout}
              onOpenLegal={() => setTab("legal")}
              onRefreshMemory={refreshMemory} refreshingMemory={refreshingMemory} refreshResult={refreshResult} isAdmin={isAdmin}
              onOpenAdmin={() => setTab("admin")}
              onToggleAlerts={(v) => {
                if (v && notifPermission !== "granted") { requestNotifPermission(); return; }
                persistAlertsEnabled(v);
                showToast(v ? "Location alerts turned on" : "Location alerts turned off");
              }} />
          )}

          {tab === "legal" && <LegalScreen theme={theme} onBack={() => setTab("profile")} />}

          {tab === "admin" && <AdminDashboard theme={theme} onBack={() => setTab("profile")} />}
        </div>

        <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }}
          onChange={(e) => { handleFile(e.target.files[0]); e.target.value = ""; }} />
        <input ref={galleryInputRef} type="file" accept="image/*" style={{ display: "none" }}
          onChange={(e) => { handleFile(e.target.files[0]); e.target.value = ""; }} />

        <BottomNav theme={theme} tab={tab} setTab={setTab} />

        {toast && (
          <div style={{
            position: "absolute", bottom: 90, left: "50%", transform: "translateX(-50%)",
            background: theme.ink, color: theme.bg, padding: "8px 16px", borderRadius: 999,
            fontSize: 12.5, fontWeight: 600
          }}>{toast}</div>
        )}
      </div>
    </div>
  );
}

function CenteredLoader({ theme, label }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "80px 20px", textAlign: "center" }}>
      <Loader2 size={26} color={theme.gold} className="spin" style={{ animation: "spin 1s linear infinite" }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <p style={{ marginTop: 14, color: theme.inkMuted, fontSize: 13 }}>{label}...</p>
    </div>
  );
}

function HomeScreen({ theme, onSearch, onPick, onScan, onOpenRadar, savedCount, recentViews, loadingPlace, popularList, nearbyPlace, onOpenNearby, onDismissNearby }) {
  const displayPopular = popularList && popularList.length ? popularList : POPULAR;
  const [q, setQ] = useState("");
  return (
    <div>
      {nearbyPlace && (
        <div style={{
          display: "flex", alignItems: "center", gap: 10, background: theme.teal, color: theme.stage,
          borderRadius: 14, padding: "10px 12px", marginBottom: 14, border: `2px solid ${theme.ink}`
        }}>
          <MapPin size={18} style={{ flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <p style={{ margin: 0, fontSize: 12.5, fontWeight: 700 }}>You're near {nearbyPlace.name}!</p>
            <p style={{ margin: 0, fontSize: 10.5, opacity: 0.85 }}>~{nearbyPlace.distanceKm?.toFixed(1)} km away</p>
          </div>
          <button onClick={onOpenNearby} style={{ background: theme.ink, color: theme.stage, border: "none", borderRadius: 999, padding: "6px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>View</button>
          <button onClick={onDismissNearby} style={{ background: "none", border: "none", color: theme.stage, cursor: "pointer", padding: 2 }}><X size={14} /></button>
        </div>
      )}
      <div style={{ marginBottom: 18 }}>
        <span style={{
          display: "inline-flex", alignItems: "center", gap: 5, background: theme.gold, color: theme.stage,
          fontSize: 10.5, fontWeight: 700, padding: "3px 10px", borderRadius: 999, letterSpacing: 0.5,
          transform: "rotate(-3deg)", marginBottom: 8
        }}>
          <Compass size={11} /> TRAVEL START
        </span>
        <p style={{ fontFamily: "var(--font-display)", fontSize: 30, fontWeight: 700, color: theme.ink, margin: "2px 0 2px", lineHeight: 1 }}>Let's have a trip!</p>
        <p style={{ fontSize: 12.5, color: theme.inkMuted, margin: 0 }}>Point your camera at anything, or search a place.</p>
      </div>

      <form onSubmit={(e) => { e.preventDefault(); if (q.trim()) onSearch(q.trim()); }}
        style={{ display: "flex", alignItems: "center", gap: 8, background: theme.surface, border: `2px dashed ${theme.border}`, borderRadius: 14, padding: "10px 14px", marginBottom: 16 }}>
        <Search size={16} color={theme.inkMuted} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a landmark, museum, city..."
          style={{ flex: 1, background: "none", border: "none", outline: "none", color: theme.ink, fontSize: 13.5, fontFamily: "var(--font-body)" }} />
      </form>

      <button onClick={onScan} disabled={loadingPlace} style={{
        width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
        background: theme.gold, border: `2px solid ${theme.ink}`, borderRadius: 999, padding: "13px 0", marginBottom: 16,
        color: theme.stage, fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "var(--font-display)",
        boxShadow: `3px 3px 0 ${theme.ink}`
      }}>
        <Camera size={17} /> Scan something now
      </button>

      <button onClick={onOpenRadar} style={{
        width: "100%", display: "flex", alignItems: "center", gap: 12, textAlign: "left",
        background: theme.surface, border: `2px dashed ${theme.teal}`, borderRadius: 16, padding: "13px 14px",
        marginBottom: 24, cursor: "pointer"
      }}>
        <span style={{
          width: 38, height: 38, borderRadius: "50%", background: theme.surface2, border: `1.5px solid ${theme.teal}`,
          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0
        }}>
          <Radar size={18} color={theme.teal} />
        </span>
        <span style={{ flex: 1 }}>
          <span style={{ display: "block", fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 700, color: theme.ink }}>Roam Radar</span>
          <span style={{ display: "block", fontSize: 11, color: theme.inkMuted, marginTop: 1 }}>See famous & hidden spots within 10 km of you</span>
        </span>
        <ChevronDown size={16} color={theme.inkMuted} style={{ transform: "rotate(-90deg)" }} />
      </button>

      <p style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 700, color: theme.ink, margin: "0 0 10px" }}>Popular destinations</p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 22 }}>
        {displayPopular.map((p, idx) => {
          const Icon = p.icon || categoryIcon(p.category);
          return (
            <button key={p.name} onClick={() => onPick(p)} disabled={loadingPlace} style={{
              textAlign: "left", background: theme.surface, border: `2px dashed ${theme.border}`, borderRadius: 14,
              padding: "12px 12px", cursor: "pointer", transform: `rotate(${idx % 2 === 0 ? -1 : 1}deg)`, position: "relative"
            }}>
              <span style={{
                position: "absolute", top: -8, right: -6, width: 20, height: 20, borderRadius: "50%",
                background: theme.gold, color: theme.stage, fontSize: 10, fontWeight: 700,
                display: "flex", alignItems: "center", justifyContent: "center", border: `1.5px solid ${theme.ink}`,
                fontFamily: "var(--font-mono)"
              }}>{idx + 1}</span>
              <div style={{ width: 32, height: 32, borderRadius: "50%", background: theme.surface2, border: `1.5px dashed ${theme.teal}`, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 8 }}>
                <Icon size={16} color={theme.teal} />
              </div>
              <div style={{ fontSize: 12.5, color: theme.ink, fontWeight: 600, lineHeight: 1.25 }}>{p.name}</div>
            </button>
          );
        })}
      </div>

      {recentViews.length > 0 && (
        <div>
          <p style={{ fontFamily: "var(--font-display)", fontSize: 14, fontWeight: 600, color: theme.ink, margin: "0 0 10px" }}>Recently viewed</p>
          {recentViews.slice(0, 5).map((r) => (
            <button key={r.slug} onClick={() => onPick(r)} style={{
              width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
              background: "none", border: "none", borderBottom: `1px solid ${theme.border}`, padding: "10px 2px", cursor: "pointer"
            }}>
              <span style={{ fontSize: 13, color: theme.ink }}>{r.name}</span>
              <span style={{ fontSize: 11, color: theme.inkMuted, fontFamily: "var(--font-mono)" }}>{r.category}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function CameraScreen({ theme, capturedImage, identifying, identifyError, loadingPlace, loadError, onCapture, onGallery, onRetry }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "10px 0" }}>
      <div style={{
        width: "100%", aspectRatio: "3/4", borderRadius: 20, background: theme.surface,
        border: `2px dashed ${theme.border}`, display: "flex", alignItems: "center", justifyContent: "center",
        overflow: "hidden", marginBottom: 16, position: "relative"
      }}>
        {capturedImage ? (
          <img src={capturedImage} alt="Captured subject" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <div style={{ textAlign: "center", color: theme.inkMuted }}>
            <Camera size={30} style={{ marginBottom: 8, opacity: 0.5 }} />
            <p style={{ fontSize: 12.5, margin: 0 }}>Live preview appears here</p>
          </div>
        )}
        {capturedImage && !identifying && !loadingPlace && (
          <button onClick={onRetry} aria-label="Clear photo" style={{
            position: "absolute", top: 10, right: 10, width: 30, height: 30, borderRadius: "50%",
            background: "rgba(21,15,9,0.75)", border: `1.5px solid ${theme.ink}`, color: theme.ink,
            display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer"
          }}>
            <X size={16} />
          </button>
        )}
        {(identifying || loadingPlace) && (
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
            <Loader2 size={24} color={theme.gold} style={{ animation: "spin 1s linear infinite" }} />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            <p style={{ color: "#fff", fontSize: 12, marginTop: 10 }}>{identifying ? "Identifying subject..." : "Fetching travel guide..."}</p>
          </div>
        )}
      </div>

      {(identifyError || loadError) && (
        <div style={{ width: "100%", background: theme.surface2, border: `1px solid ${theme.danger}`, borderRadius: 12, padding: 12, marginBottom: 14 }}>
          <p style={{ fontSize: 12.5, color: theme.danger, margin: 0 }}>{identifyError || loadError}</p>
        </div>
      )}

      <div style={{ display: "flex", gap: 10, width: "100%" }}>
        <button onClick={onCapture} style={{
          flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
          background: theme.gold, border: "none", borderRadius: 12, padding: "12px 0",
          color: theme.stage, fontWeight: 700, fontSize: 13, cursor: "pointer"
        }}>
          <Camera size={15} /> Capture
        </button>
        <button onClick={onGallery} style={{
          flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
          background: theme.surface, border: `2px dashed ${theme.border}`, borderRadius: 12, padding: "12px 0",
          color: theme.ink, fontWeight: 600, fontSize: 13, cursor: "pointer"
        }}>
          <ImageIcon size={15} /> Gallery
        </button>
      </div>
      {capturedImage && !identifying && !loadingPlace && (
        <button onClick={onRetry} style={{ marginTop: 12, background: "none", border: "none", color: theme.inkMuted, fontSize: 12, cursor: "pointer" }}>
          Try another photo
        </button>
      )}
      <p style={{ fontSize: 11, color: theme.inkMuted, marginTop: 16, textAlign: "center", lineHeight: 1.5 }}>
        Landmarks, food, animals, flowers, artwork, signboards — point and shoot.
      </p>
    </div>
  );
}

function ResultsScreen({ theme, place, rawPlace, meta, isSaved, onToggleSave, onShare, onSpeak, speaking, lang, onTranslate, translating, onBack }) {
  if (!place) return null;
  return (
    <div>
      <button onClick={onBack} style={{ background: "none", border: "none", color: theme.inkMuted, display: "flex", alignItems: "center", gap: 6, marginBottom: 10, cursor: "pointer", fontSize: 12.5 }}>
        <ArrowLeft size={14} /> Back
      </button>

      <div style={{
        borderRadius: "18px 22px 16px 20px", background: theme.surface2,
        border: `2.5px solid ${theme.ink}`, padding: "22px 18px", marginBottom: 14, position: "relative"
      }}>
        <p style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: theme.teal, letterSpacing: 1, margin: "0 0 6px", textTransform: "uppercase" }}>{place.category}</p>
        <p style={{ fontFamily: "var(--font-display)", fontSize: 30, fontWeight: 700, color: theme.ink, margin: "0 0 6px", lineHeight: 1.05 }}>{place.name}</p>
        <p style={{ fontSize: 13, color: theme.inkMuted, margin: "0 0 14px" }}>{place.tagline}</p>
        <Stamp theme={theme} syncedAt={meta.syncedAt} fromCache={meta.fromCache} />
        <p style={{ fontSize: 10.5, color: theme.inkMuted, marginTop: 8, fontFamily: "var(--font-mono)" }}>Next sync {nextSyncLabel(meta.syncedAt)}</p>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <ActionBtn theme={theme} icon={isSaved ? Heart : Heart} filled={isSaved} label={isSaved ? "Saved" : "Save"} onClick={onToggleSave} />
        <ActionBtn theme={theme} icon={speaking ? VolumeX : Volume2} label={speaking ? "Stop" : "Listen"} onClick={onSpeak} />
        <ActionBtn theme={theme} icon={Share2} label="Share" onClick={onShare} />
        <ActionBtn theme={theme} icon={Navigation} label="Maps" href={`https://www.google.com/maps/search/?api=1&query=${place.location.lat},${place.location.lng}`} />
      </div>

      <div style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
          <Languages size={14} color={theme.gold} />
          <span style={{ fontSize: 12, color: theme.inkMuted }}>Translate{translating ? "..." : ""}</span>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {LANGUAGES.map(l => (
            <button key={l.code} onClick={() => onTranslate(l.code)} disabled={translating} style={{
              padding: "5px 10px", borderRadius: 999, fontSize: 11.5, cursor: "pointer",
              background: lang === l.code ? theme.gold : theme.surface,
              color: lang === l.code ? theme.stage : theme.inkMuted,
              border: `1px solid ${lang === l.code ? theme.gold : theme.border}`
            }}>{l.label}</button>
          ))}
        </div>
      </div>

      <SectionCard theme={theme} icon={Info} title="Overview">
        <p style={{ fontSize: 13.5, lineHeight: 1.6, margin: 0 }}>{place.overview}</p>
      </SectionCard>

      <SectionCard theme={theme} icon={Building2} title="History" defaultOpen={false}>
        <Row theme={theme} label="Built by" value={place.history.builtBy} />
        <Row theme={theme} label="Year built" value={place.history.yearBuilt} />
        <p style={{ fontSize: 13.5, lineHeight: 1.6, margin: "10px 0 8px" }}>{place.history.reason}</p>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: theme.inkMuted, lineHeight: 1.7 }}>
          {place.history.facts.map((f, i) => <li key={i}>{f}</li>)}
        </ul>
      </SectionCard>

      <SectionCard theme={theme} icon={Star} title="Why is it famous?" defaultOpen={false}>
        <p style={{ fontSize: 13.5, lineHeight: 1.6, margin: 0 }}>{place.whyFamous}</p>
      </SectionCard>

      <SectionCard theme={theme} icon={MapPin} title="Location">
        <Row theme={theme} label="City" value={place.location.city} />
        <Row theme={theme} label="State" value={place.location.state} />
        <Row theme={theme} label="Country" value={place.location.country} />
        <Row theme={theme} label="Coordinates" value={`${place.location.lat}, ${place.location.lng}`} />
      </SectionCard>

      <SectionCard theme={theme} icon={Clock} title="Typical opening hours" defaultOpen={false}>
        <Row theme={theme} label="Today" value={place.hours.today} />
        {place.hours.weekly.map((w, i) => <Row key={i} theme={theme} label={w.day} value={w.hours} />)}
        <Row theme={theme} label="Closed" value={place.hours.closedDays} />
        <p style={{ fontSize: 10.5, color: theme.inkMuted, marginTop: 8 }}>Cached hours, verified on last sync — check locally for holiday changes.</p>
      </SectionCard>

      <SectionCard theme={theme} icon={Ticket} title="Ticket price" defaultOpen={false}>
        <Row theme={theme} label="Domestic" value={place.tickets.domestic} />
        <Row theme={theme} label="Foreign" value={place.tickets.foreign} />
        <Row theme={theme} label="Children" value={place.tickets.children} />
        <Row theme={theme} label="Senior citizen" value={place.tickets.senior} />
        <Row theme={theme} label="Special" value={place.tickets.special} />
      </SectionCard>

      <SectionCard theme={theme} icon={Sunrise} title="Best time to visit" defaultOpen={false}>
        <Row theme={theme} label="Season" value={place.bestTime.season} />
        <Row theme={theme} label="Weather" value={place.bestTime.weather} />
        <Row theme={theme} label="Crowd level" value={place.bestTime.crowdLevel} />
        <Row theme={theme} label="Sunrise / sunset tip" value={place.bestTime.sunriseSunset} />
      </SectionCard>

      <SectionCard theme={theme} icon={Sparkles} title="Best photo spots" defaultOpen={false}>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.7 }}>
          {place.photoSpots.map((p, i) => <li key={i}>{p}</li>)}
        </ul>
      </SectionCard>

      <SectionCard theme={theme} icon={MapIcon} title="Nearby attractions" defaultOpen={false}>
        <ListCard theme={theme} items={place.nearbyAttractions.map(a => ({ name: a.name, sub: `${a.distanceKm} km · ${a.travelTimeMin} min`, rating: a.rating }))} renderRight={(it) => `★ ${it.rating}`} />
      </SectionCard>

      <SectionCard theme={theme} icon={Utensils} title="Nearby restaurants" defaultOpen={false}>
        <ListCard theme={theme} items={place.nearbyRestaurants.map(r => ({ name: r.name, sub: `${r.cuisine} · ${r.priceRange}`, rating: r.rating }))} renderRight={(it) => `★ ${it.rating}`} />
      </SectionCard>

      <SectionCard theme={theme} icon={Building2} title="Nearby hotels" defaultOpen={false}>
        <ListCard theme={theme} items={place.nearbyHotels.map(h => ({ name: h.name, sub: `${h.tier} · ${h.distanceKm} km`, rating: h.rating }))} renderRight={(it) => `★ ${it.rating}`} />
      </SectionCard>

      <SectionCard theme={theme} icon={ShieldCheck} title="Facilities available" defaultOpen={false}>
        <div>
          {place.facilities.map((f, i) => {
            const Icon = FACILITY_ICONS[f] || Check;
            return (
              <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 5, background: theme.surface2, borderRadius: 999, padding: "5px 10px", marginRight: 6, marginBottom: 6, fontSize: 11.5, color: theme.ink }}>
                <Icon size={12} color={theme.teal} /> {f}
              </span>
            );
          })}
        </div>
      </SectionCard>

      <SectionCard theme={theme} icon={ShieldCheck} title="Safety tips" defaultOpen={false}>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.7 }}>
          {place.safetyTips.map((s, i) => <li key={i}>{s}</li>)}
        </ul>
      </SectionCard>

      <SectionCard theme={theme} icon={Sparkles} title="Fun facts" defaultOpen={false}>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.7 }}>
          {place.funFacts.map((f, i) => <li key={i}>{f}</li>)}
        </ul>
      </SectionCard>

      <SectionCard theme={theme} icon={Route} title="Suggested itinerary" defaultOpen={false}>
        <Row theme={theme} label="Recommended time" value={place.itinerary.recommendedDuration} />
        <p style={{ fontSize: 12.5, color: theme.inkMuted, margin: "10px 0 6px" }}>Combine with:</p>
        {place.itinerary.combineWith.map((c, i) => <Pill key={i} theme={theme}>{c}</Pill>)}
      </SectionCard>

      <p style={{ fontSize: 10, color: theme.inkMuted, textAlign: "center", padding: "10px 0 4px", lineHeight: 1.6 }}>
        Guide data is cached and re-verified monthly rather than fetched on every view, to keep the app fast and API usage light.
      </p>
    </div>
  );
}

function ActionBtn({ theme, icon: Icon, label, onClick, href, filled }) {
  const style = {
    flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
    background: theme.surface, border: `2px dashed ${filled ? theme.danger : theme.border}`, borderRadius: 14, padding: "9px 0",
    color: filled ? theme.danger : theme.ink, cursor: "pointer", textDecoration: "none"
  };
  if (href) {
    return <a href={href} target="_blank" rel="noreferrer" style={style}>
      <Icon size={16} color={filled ? theme.danger : theme.gold} fill={filled ? theme.danger : "none"} />
      <span style={{ fontSize: 10 }}>{label}</span>
    </a>;
  }
  return (
    <button onClick={onClick} style={style}>
      <Icon size={16} color={filled ? theme.danger : theme.gold} fill={filled ? theme.danger : "none"} />
      <span style={{ fontSize: 10 }}>{label}</span>
    </button>
  );
}

function SavedScreen({ theme, savedPlaces, onOpen, onRemove }) {
  return (
    <div>
      <p style={{ fontFamily: "var(--font-display)", fontSize: 26, fontWeight: 700, color: theme.ink, margin: "0 0 4px" }}>Saved places</p>
      <p style={{ fontSize: 12.5, color: theme.inkMuted, margin: "0 0 18px" }}>{savedPlaces.length} bookmarked</p>
      {savedPlaces.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 20px", color: theme.inkMuted }}>
          <Bookmark size={26} style={{ opacity: 0.4, marginBottom: 10 }} />
          <p style={{ fontSize: 13, margin: 0 }}>Nothing saved yet. Tap the heart on any guide to keep it here.</p>
        </div>
      ) : savedPlaces.map(s => (
        <div key={s.slug} style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          background: theme.surface, border: `2px dashed ${theme.border}`, borderRadius: 14, padding: "12px 14px", marginBottom: 8
        }}>
          <button onClick={() => onOpen(s)} style={{ background: "none", border: "none", textAlign: "left", cursor: "pointer", flex: 1 }}>
            <p style={{ fontSize: 13.5, color: theme.ink, margin: 0, fontWeight: 600 }}>{s.name}</p>
            <p style={{ fontSize: 11, color: theme.inkMuted, margin: "2px 0 0", fontFamily: "var(--font-mono)" }}>{s.category}</p>
          </button>
          <button onClick={() => onRemove(s)} style={{ background: "none", border: "none", cursor: "pointer", padding: 6 }}>
            <X size={15} color={theme.inkMuted} />
          </button>
        </div>
      ))}
    </div>
  );
}

function TripsScreen({ theme, savedPlaces, setTab }) {
  return (
    <div>
      <p style={{ fontFamily: "var(--font-display)", fontSize: 26, fontWeight: 700, color: theme.ink, margin: "0 0 4px" }}>Trips</p>
      <p style={{ fontSize: 12.5, color: theme.inkMuted, margin: "0 0 18px" }}>Turn saved places into an itinerary.</p>
      <div style={{ background: theme.surface, border: `1px dashed ${theme.border}`, borderRadius: 16, padding: 20, textAlign: "center" }}>
        <Route size={22} color={theme.gold} style={{ marginBottom: 10 }} />
        <p style={{ fontSize: 13, color: theme.ink, margin: "0 0 6px", fontWeight: 600 }}>Trip planner is coming soon</p>
        <p style={{ fontSize: 12, color: theme.inkMuted, margin: "0 0 14px", lineHeight: 1.6 }}>
          You have {savedPlaces.length} place{savedPlaces.length === 1 ? "" : "s"} saved. Each guide already suggests a
          recommended visit length and what to combine it with — open a saved place to see its itinerary tips.
        </p>
        <button onClick={() => setTab("saved")} style={{
          background: theme.gold, border: "none", borderRadius: 10, padding: "9px 16px",
          color: theme.stage, fontWeight: 700, fontSize: 12.5, cursor: "pointer"
        }}>View saved places</button>
      </div>
    </div>
  );
}

function RadarScreen({ theme, myLocation, locationStatus, nearbyPOIs, areaName, loadingNearby, nearbyError, nearbyMeta, onLocate, onRefresh, onPick, onBack }) {
  const [selectedStop, setSelectedStop] = useState(null);
  const R = 130; // px radius of the radar circle for the 10km ring
  const rings = [2.5, 5, 7.5, 10];

  if (locationStatus === "idle" || locationStatus === "locating") {
    return (
      <div>
        <button onClick={onBack} style={{ background: "none", border: "none", color: theme.inkMuted, display: "flex", alignItems: "center", gap: 6, marginBottom: 10, cursor: "pointer", fontSize: 12.5 }}>
          <ArrowLeft size={14} /> Back
        </button>
        <div style={{ textAlign: "center", padding: "70px 20px" }}>
          {locationStatus === "locating" ? (
            <Loader2 size={26} color={theme.gold} style={{ animation: "spin 1s linear infinite", marginBottom: 12 }} />
          ) : (
            <Radar size={28} color={theme.teal} style={{ marginBottom: 12, opacity: 0.7 }} />
          )}
          <p style={{ fontFamily: "var(--font-display)", fontSize: 18, color: theme.ink, margin: "0 0 6px" }}>
            {locationStatus === "locating" ? "Finding you..." : "Roam Radar"}
          </p>
          <p style={{ fontSize: 12.5, color: theme.inkMuted, margin: "0 0 16px", lineHeight: 1.6 }}>
            {locationStatus === "locating"
              ? "Getting your current position"
              : "Discover famous and hidden spots within 10 km of you"}
          </p>
          {locationStatus !== "locating" && (
            <button onClick={onLocate} style={{
              background: theme.gold, border: `2px solid ${theme.ink}`, borderRadius: 999, padding: "10px 20px",
              color: theme.stage, fontWeight: 700, fontSize: 13, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 8
            }}><LocateFixed size={15} /> Use my location</button>
          )}
        </div>
      </div>
    );
  }

  if (locationStatus === "denied" || locationStatus === "error") {
    return (
      <div>
        <button onClick={onBack} style={{ background: "none", border: "none", color: theme.inkMuted, display: "flex", alignItems: "center", gap: 6, marginBottom: 10, cursor: "pointer", fontSize: 12.5 }}>
          <ArrowLeft size={14} /> Back
        </button>
        <div style={{ textAlign: "center", padding: "70px 20px", color: theme.inkMuted }}>
          <Radar size={26} style={{ opacity: 0.4, marginBottom: 10 }} />
          <p style={{ fontSize: 13, margin: "0 0 14px", lineHeight: 1.6 }}>
            {locationStatus === "denied"
              ? "Location access was denied. Enable it in your browser's site settings to see what's nearby."
              : "Couldn't get your location. Check your device's location settings and try again."}
          </p>
          <button onClick={onLocate} style={{
            background: "none", border: `2px dashed ${theme.border}`, borderRadius: 999, padding: "9px 18px",
            color: theme.ink, fontSize: 12.5, cursor: "pointer"
          }}>Try again</button>
        </div>
      </div>
    );
  }

  const placed = myLocation ? nearbyPOIs.map(p => {
    const d = Math.min(p.distanceKm ?? distanceKm(myLocation.lat, myLocation.lng, p.lat, p.lng), 10);
    const bearing = bearingDeg(myLocation.lat, myLocation.lng, p.lat, p.lng);
    const rad = (bearing * Math.PI) / 180;
    const r = (d / 10) * R;
    return { ...p, distanceKm: d, x: 150 + r * Math.sin(rad), y: 150 - r * Math.cos(rad) };
  }) : [];

  return (
    <div>
      <button onClick={onBack} style={{ background: "none", border: "none", color: theme.inkMuted, display: "flex", alignItems: "center", gap: 6, marginBottom: 10, cursor: "pointer", fontSize: 12.5 }}>
        <ArrowLeft size={14} /> Back
      </button>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
        <div>
          <p style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 700, color: theme.ink, margin: "0 0 2px" }}>Roam Radar</p>
          <p style={{ fontSize: 12, color: theme.inkMuted, margin: 0 }}>
            {areaName ? `Around ${areaName} · ` : ""}10 km radius
          </p>
        </div>
        <button onClick={onRefresh} disabled={loadingNearby} style={{
          background: theme.surface, border: `2px dashed ${theme.border}`, borderRadius: 999, padding: 8, cursor: "pointer"
        }}>
          <RotateCw size={14} color={theme.gold} style={loadingNearby ? { animation: "spin 1s linear infinite" } : {}} />
        </button>
      </div>

      <div style={{
        position: "relative", width: "100%", aspectRatio: "1/1", marginBottom: 16,
        background: theme.surface, border: `2px dashed ${theme.border}`, borderRadius: 20, overflow: "hidden"
      }}>
        <svg viewBox="0 0 300 300" style={{ width: "100%", height: "100%" }}>
          {rings.map(km => (
            <circle key={km} cx="150" cy="150" r={(km / 10) * R} fill="none" stroke={theme.border} strokeWidth="1" strokeDasharray="3 4" />
          ))}
          {rings.map(km => (
            <text key={`t${km}`} x="153" y={150 - (km / 10) * R + 3} fontSize="8" fill={theme.inkMuted} fontFamily="var(--font-mono)">{km}km</text>
          ))}
          {placed.map((p, i) => (
            <g key={i} transform={`translate(${p.x},${p.y})`} onClick={() => setSelectedStop(p)} style={{ cursor: "pointer" }}>
              <circle r="9" fill={theme.gold} stroke={theme.ink} strokeWidth="1.5" />
              <circle r="2" fill={theme.stage} />
            </g>
          ))}
          <g transform="translate(150,150)">
            <circle r="11" fill={theme.teal} stroke={theme.ink} strokeWidth="2" />
            <circle r="3.5" fill={theme.stage} />
          </g>
        </svg>
      </div>

      {selectedStop && (
        <div style={{
          background: theme.surface2, border: `2.5px solid ${theme.ink}`, borderRadius: "16px 18px 14px 18px",
          padding: "16px 16px", marginBottom: 16, position: "relative"
        }}>
          <button onClick={() => setSelectedStop(null)} style={{
            position: "absolute", top: 10, right: 10, background: "none", border: "none", cursor: "pointer", padding: 4
          }}><X size={15} color={theme.inkMuted} /></button>

          <p style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: theme.teal, letterSpacing: 1, margin: "0 0 4px", textTransform: "uppercase" }}>
            {selectedStop.category} · {selectedStop.distanceKm?.toFixed(1)} km away
          </p>
          <p style={{ fontFamily: "var(--font-display)", fontSize: 21, fontWeight: 700, color: theme.ink, margin: "0 0 10px", lineHeight: 1.1, paddingRight: 20 }}>
            {selectedStop.name}
          </p>
          {selectedStop.blurb && (
            <p style={{ fontSize: 12.5, color: theme.inkMuted, margin: "0 0 8px", lineHeight: 1.5, textTransform: "capitalize" }}>{selectedStop.blurb}</p>
          )}
          {selectedStop.address && (
            <p style={{ fontSize: 12, color: theme.ink, margin: "0 0 4px" }}>📍 {selectedStop.address}</p>
          )}
          {selectedStop.openingHours && (
            <p style={{ fontSize: 12, color: theme.ink, margin: "0 0 14px" }}>🕐 {selectedStop.openingHours}</p>
          )}
          {!selectedStop.address && !selectedStop.openingHours && <div style={{ marginBottom: 6 }} />}

          <button onClick={() => onPick(selectedStop)} style={{
            width: "100%", background: theme.gold, border: `2px solid ${theme.ink}`, borderRadius: 999,
            padding: "10px 0", color: theme.stage, fontWeight: 700, fontSize: 12.5, cursor: "pointer",
            fontFamily: "var(--font-display)", marginTop: 4
          }}>Get full AI guide</button>
          <p style={{ fontSize: 10, color: theme.inkMuted, textAlign: "center", margin: "6px 0 0" }}>
            Location data from OpenStreetMap · AI guide generated on request
          </p>
        </div>
      )}

      {loadingNearby && <CenteredLoader theme={theme} label="Scanning the area" />}
      {nearbyError && <p style={{ fontSize: 12.5, color: theme.danger, textAlign: "center", padding: "10px 0" }}>{nearbyError}</p>}

      {!loadingNearby && !nearbyError && placed.length > 0 && (
        <div>
          <p style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 700, color: theme.ink, margin: "0 0 8px" }}>
            {placed.length} places nearby
          </p>
          {placed.map((p, i) => {
            const Icon = categoryIcon(p.category);
            return (
              <button key={i} onClick={() => setSelectedStop(p)} style={{
                width: "100%", display: "flex", alignItems: "center", gap: 10, textAlign: "left",
                background: theme.surface, border: `1.5px dashed ${theme.border}`, borderRadius: 12,
                padding: "10px 12px", marginBottom: 8, cursor: "pointer"
              }}>
                <span style={{
                  width: 30, height: 30, borderRadius: "50%", background: theme.surface2, border: `1.5px solid ${theme.gold}`,
                  display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0
                }}><Icon size={14} color={theme.gold} /></span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 13, color: theme.ink, fontWeight: 600 }}>{p.name}</span>
                  <span style={{ display: "block", fontSize: 10.5, color: theme.inkMuted, textTransform: "capitalize" }}>{p.blurb}</span>
                </span>
                <span style={{ fontSize: 11, color: theme.inkMuted, fontFamily: "var(--font-mono)", flexShrink: 0, textAlign: "right" }}>
                  {p.distanceKm?.toFixed(1)} km
                </span>
              </button>
            );
          })}
          <p style={{ fontSize: 10, color: theme.inkMuted, textAlign: "center", padding: "8px 0 4px" }}>
            Free live data from OpenStreetMap · no AI tokens used
          </p>
        </div>
      )}
    </div>
  );
}

function ProfileScreen({ theme, mode, setMode, savedCount, alertsEnabled, notifPermission, onRequestPermission, onToggleAlerts, email, onLogout, onOpenLegal, onRefreshMemory, refreshingMemory, refreshResult, isAdmin, onOpenAdmin }) {
  return (
    <div>
      <p style={{ fontFamily: "var(--font-display)", fontSize: 26, fontWeight: 700, color: theme.ink, margin: "0 0 4px" }}>Profile</p>
      <p style={{ fontSize: 12.5, color: theme.inkMuted, margin: "0 0 18px", wordBreak: "break-all" }}>{email || "Signed in"}</p>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      <div style={{ background: theme.surface, border: `2px dashed ${theme.border}`, borderRadius: 14, padding: "14px 16px", marginBottom: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: notifPermission === "denied" ? 8 : 0 }}>
          <div>
            <span style={{ fontSize: 13, color: theme.ink, display: "block" }}>Nearby place alerts</span>
            <span style={{ fontSize: 10.5, color: theme.inkMuted }}>Notify me when I'm near a saved place</span>
          </div>
          <button onClick={() => onToggleAlerts(!alertsEnabled)} style={{
            width: 42, height: 24, borderRadius: 999, border: `1.5px solid ${theme.border}`, cursor: "pointer",
            background: alertsEnabled ? theme.gold : theme.surface2, position: "relative", flexShrink: 0
          }}>
            <span style={{
              position: "absolute", top: 2, left: alertsEnabled ? 20 : 2, width: 18, height: 18, borderRadius: "50%",
              background: theme.ink, transition: "left 0.15s"
            }} />
          </button>
        </div>
        {notifPermission === "denied" && (
          <p style={{ fontSize: 10.5, color: theme.danger, margin: 0 }}>
            Notifications are blocked in your browser settings. Enable them for this site to get alerts.
          </p>
        )}
      </div>

      {isAdmin && (
        <div style={{ background: theme.surface, border: `2px dashed ${theme.border}`, borderRadius: 14, padding: "14px 16px", marginBottom: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
            <div>
              <span style={{ fontSize: 13, color: theme.ink, display: "block" }}>Refresh Memory <span style={{ fontSize: 9, color: theme.gold, fontFamily: "var(--font-mono)", border: `1px solid ${theme.gold}`, borderRadius: 4, padding: "1px 4px", marginLeft: 4 }}>ADMIN</span></span>
              <span style={{ fontSize: 10.5, color: theme.inkMuted }}>
                Re-syncs the app's shared place guides with fresh AI research. Limited to once per day. The AI is
                only ever used here or on a genuine new lookup — never automatically in the background.
              </span>
            </div>
            <button onClick={onRefreshMemory} disabled={refreshingMemory} style={{
              background: theme.gold, border: `2px solid ${theme.ink}`, borderRadius: 999, padding: "8px 14px",
              color: theme.stage, fontWeight: 700, fontSize: 11.5, cursor: refreshingMemory ? "default" : "pointer",
              flexShrink: 0, opacity: refreshingMemory ? 0.7 : 1, display: "flex", alignItems: "center", gap: 6
            }}>
              {refreshingMemory && <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} />}
              Refresh
            </button>
          </div>
          {refreshResult && (
            <p style={{ fontSize: 10.5, color: refreshResult.ok ? theme.teal : theme.danger, margin: "8px 0 0" }}>
              {refreshResult.message}
            </p>
          )}
        </div>
      )}

      {isAdmin && (
        <button onClick={onOpenAdmin} style={{
          width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", textAlign: "left",
          background: theme.surface, border: `2px dashed ${theme.border}`, borderRadius: 14, padding: "14px 16px",
          marginBottom: 12, cursor: "pointer"
        }}>
          <span style={{ fontSize: 13, color: theme.ink }}>
            Admin Dashboard <span style={{ fontSize: 9, color: theme.gold, fontFamily: "var(--font-mono)", border: `1px solid ${theme.gold}`, borderRadius: 4, padding: "1px 4px", marginLeft: 4 }}>ADMIN</span>
          </span>
          <span style={{ fontSize: 11, color: theme.inkMuted }}>Users · usage · popular places →</span>
        </button>
      )}

      <div style={{ background: theme.surface, border: `2px dashed ${theme.border}`, borderRadius: 14, padding: "14px 16px", marginBottom: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 13, color: theme.ink }}>Appearance</span>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={() => setMode("light")} style={{
              padding: "5px 10px", borderRadius: 999, fontSize: 11.5, cursor: "pointer",
              background: mode === "light" ? theme.gold : theme.surface2, color: mode === "light" ? theme.stage : theme.inkMuted, border: "none"
            }}>Light</button>
            <button onClick={() => setMode("dark")} style={{
              padding: "5px 10px", borderRadius: 999, fontSize: 11.5, cursor: "pointer",
              background: mode === "dark" ? theme.gold : theme.surface2, color: mode === "dark" ? theme.stage : theme.inkMuted, border: "none"
            }}>Dark</button>
          </div>
        </div>
      </div>

      <div style={{ background: theme.surface, border: `2px dashed ${theme.border}`, borderRadius: 14, padding: "14px 16px", marginBottom: 12 }}>
        <p style={{ fontSize: 12, color: theme.inkMuted, margin: "0 0 10px", textTransform: "uppercase", letterSpacing: 0.5, fontFamily: "var(--font-mono)" }}>Data sync</p>
        <Row theme={theme} label="Sync schedule" value="Monthly, on the 1st" />
        <Row theme={theme} label="Places bookmarked" value={savedCount} />
        <Row theme={theme} label="Cache scope" value="Shared across travelers" />
        <p style={{ fontSize: 11, color: theme.inkMuted, marginTop: 10, lineHeight: 1.6 }}>
          Guide content is fetched once per place and reused for 30 days, instead of calling external APIs on every search.
        </p>
      </div>

      <button onClick={onOpenLegal} style={{
        width: "100%", background: "none", border: `2px dashed ${theme.border}`, borderRadius: 12,
        padding: "11px 0", color: theme.inkMuted, fontSize: 12.5, cursor: "pointer", marginBottom: 10
      }}>Privacy Policy & Terms</button>

      <button onClick={onLogout} style={{
        width: "100%", background: "none", border: `2px dashed ${theme.border}`, borderRadius: 12,
        padding: "11px 0", color: theme.inkMuted, fontSize: 12.5, cursor: "pointer"
      }}>Log out</button>
    </div>
  );
}

function BottomNav({ theme, tab, setTab }) {
  const items = [
    { id: "home", icon: HomeIcon, label: "Home" },
    { id: "camera", icon: Camera, label: "Camera" },
    { id: "saved", icon: Bookmark, label: "Saved" },
    { id: "trips", icon: MapIcon, label: "Trips" },
    { id: "profile", icon: User, label: "Profile" }
  ];
  return (
    <div style={{ display: "flex", borderTop: `2.5px dashed ${theme.border}`, background: theme.surface }}>
      {items.map(it => {
        const Icon = it.icon;
        const active = tab === it.id || (tab === "results" && it.id === "camera") || (tab === "radar" && it.id === "home") || (tab === "legal" && it.id === "profile") || (tab === "admin" && it.id === "profile");
        return (
          <button key={it.id} onClick={() => setTab(it.id)} style={{
            flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
            background: "none", border: "none", padding: "10px 0 12px", cursor: "pointer"
          }}>
            <span style={{
              width: 26, height: 26, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
              background: active ? theme.gold : "transparent", border: active ? `1.5px solid ${theme.ink}` : "none"
            }}>
              <Icon size={16} color={active ? theme.stage : theme.inkMuted} />
            </span>
            <span style={{ fontSize: 9.5, color: active ? theme.gold : theme.inkMuted, fontWeight: active ? 700 : 400 }}>{it.label}</span>
          </button>
        );
      })}
    </div>
  );
}
