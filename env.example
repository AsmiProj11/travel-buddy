import React, { useState } from "react";
import { ArrowLeft } from "lucide-react";

// ── Fill these in before you launch — they're the only genuinely
// personal/business details this document needs from you. Everything
// else describes what the app actually does and shouldn't need editing
// unless the app's behavior changes. ──
const OPERATOR_NAME = "[Your name or business name]";
const CONTACT_EMAIL = "[your-support-email@example.com]";
const JURISDICTION = "[your country/state — governs disputes]";
const EFFECTIVE_DATE = "[date you go live]";

export default function LegalScreen({ theme, onBack }) {
  const [view, setView] = useState("privacy");
  const h = { color: theme.ink, fontSize: 15, margin: "18px 0 6px" };
  const p = { margin: "0 0 4px" };
  const placeholder = /^\[.*\]$/.test(OPERATOR_NAME);

  return (
    <div>
      <button onClick={onBack} style={{ background: "none", border: "none", color: theme.inkMuted, display: "flex", alignItems: "center", gap: 6, marginBottom: 10, cursor: "pointer", fontSize: 12.5 }}>
        <ArrowLeft size={14} /> Back
      </button>

      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        <button onClick={() => setView("privacy")} style={{
          padding: "6px 12px", borderRadius: 999, fontSize: 12, cursor: "pointer",
          background: view === "privacy" ? theme.gold : theme.surface2,
          color: view === "privacy" ? theme.stage : theme.inkMuted, border: "none"
        }}>Privacy Policy</button>
        <button onClick={() => setView("terms")} style={{
          padding: "6px 12px", borderRadius: 999, fontSize: 12, cursor: "pointer",
          background: view === "terms" ? theme.gold : theme.surface2,
          color: view === "terms" ? theme.stage : theme.inkMuted, border: "none"
        }}>Terms of Service</button>
      </div>

      {placeholder && (
        <div style={{ background: theme.surface2, border: `1.5px dashed ${theme.danger}`, borderRadius: 10, padding: "8px 10px", marginBottom: 14 }}>
          <p style={{ fontSize: 10.5, color: theme.danger, margin: 0, fontFamily: "var(--font-mono)" }}>
            Fill in OPERATOR_NAME, CONTACT_EMAIL, and JURISDICTION at the top of LegalScreen.jsx before going live.
          </p>
        </div>
      )}

      <div style={{ fontSize: 12.5, color: theme.ink, lineHeight: 1.7 }}>
        {view === "privacy" ? (
          <>
            <p style={{ fontSize: 10, color: theme.inkMuted, fontFamily: "var(--font-mono)", marginBottom: 12 }}>
              Effective {EFFECTIVE_DATE}. This describes what Travel Buddy actually collects and does — review it
              yourself (or with a lawyer) before relying on it for real users; it isn't legal advice.
            </p>

            <h3 style={h}>Who this covers</h3>
            <p style={p}>This policy covers the Travel Buddy app, operated by {OPERATOR_NAME}. Using the app means
              you agree to the collection and use described here.</p>

            <h3 style={h}>What we collect</h3>
            <p style={p}><strong>Account info:</strong> the email and password you sign up with, handled by our
              authentication provider (Supabase). We never see or store your password in plain text — it's hashed.</p>
            <p style={p}><strong>Places you save and view:</strong> names, categories, and coordinates of places you
              bookmark or look up, and when you looked at them.</p>
            <p style={p}><strong>Location:</strong> your device's GPS coordinates, only when you open Roam Radar or
              turn on nearby-place alerts. Location is not collected in the background beyond checking proximity to
              your saved places while alerts are on.</p>
            <p style={p}><strong>Photos:</strong> images you choose to scan to identify a landmark. Photos are
              stripped of location/device metadata (EXIF) on your device before being sent anywhere.</p>
            <p style={p}><strong>Notification permission:</strong> if granted, used only to alert you about a place
              you scanned or a saved place you're near.</p>

            <h3 style={h}>How it's used</h3>
            <p style={p}>Photos, search text, and location are sent to our AI provider (Anthropic) solely to
              identify places and generate travel guide content — history, hours, tickets, nearby spots, and similar.
              We don't use this data for advertising, and we don't sell it.</p>
            <p style={p}>Your saved places, view history, and settings are stored so they sync across your sessions
              and devices when you're logged in.</p>
            <p style={p}>Generated place guides (history, hours, ratings, etc.) are cached and shared across all
              users looking up the same place — that cache contains no personal information, just public travel
              content.</p>

            <h3 style={h}>Who we share it with</h3>
            <p style={p}><strong>Anthropic</strong> — processes photos, search queries, and location to generate AI
              travel content. See Anthropic's own privacy policy for how they handle API data.</p>
            <p style={p}><strong>Supabase</strong> — hosts authentication and our database (your account, saved
              places, view history).</p>
            <p style={p}><strong>Vercel</strong> — hosts the application itself.</p>
            <p style={p}>We don't share your data with advertisers or data brokers, and we don't have any other
              third parties in this stack.</p>

            <h3 style={h}>How long we keep it</h3>
            <p style={p}>Account and saved-place data is kept until you delete it or delete your account. Shared
              place-guide cache entries refresh roughly monthly and aren't tied to any individual user.</p>

            <h3 style={h}>Cookies & local storage</h3>
            <p style={p}>The app stores a login session token in your browser so you stay signed in — that's it. No
              advertising cookies or third-party trackers are used.</p>

            <h3 style={h}>Security</h3>
            <p style={p}>Data is encrypted in transit (HTTPS). Your saved places and view history are protected by
              database-level access rules so only you can read or write them. Passwords are hashed, never stored in
              plain text. See our <a href="#" style={{ color: theme.gold }} onClick={e => e.preventDefault()}>security
              practices</a> for more detail if published, or ask us directly.</p>

            <h3 style={h}>Your choices</h3>
            <p style={p}>Delete individual saved places anytime from the Saved tab. Turn off location alerts and
              notification permission anytime from your device or browser settings. To delete your account and all
              associated data, or to request a copy of your data, email {CONTACT_EMAIL}.</p>

            <h3 style={h}>Children</h3>
            <p style={p}>Travel Buddy isn't directed at children and we don't knowingly collect data from anyone
              under 13 (or the relevant minimum age in your region).</p>

            <h3 style={h}>Changes</h3>
            <p style={p}>If this policy changes materially, we'll update the effective date above. Continued use
              after a change means you accept the update.</p>

            <h3 style={h}>Contact</h3>
            <p style={p}>Questions about this policy or your data: {CONTACT_EMAIL}.</p>
          </>
        ) : (
          <>
            <p style={{ fontSize: 10, color: theme.inkMuted, fontFamily: "var(--font-mono)", marginBottom: 12 }}>
              Effective {EFFECTIVE_DATE}. Plain-language terms for using Travel Buddy — review before relying on
              this for real users; it isn't legal advice.
            </p>

            <h3 style={h}>Agreement</h3>
            <p style={p}>By creating an account or using Travel Buddy, you agree to these terms. If you don't agree,
              don't use the app.</p>

            <h3 style={h}>What the service is</h3>
            <p style={p}>Travel Buddy identifies places from photos or search and generates travel information —
              history, hours, ticket prices, safety tips, and similar — using AI. <strong>This content is
              AI-generated and may be inaccurate, incomplete, or outdated.</strong> Always verify anything
              time-sensitive or safety-relevant (opening hours, ticket prices, safety conditions) with an official
              source before relying on it, especially while traveling.</p>

            <h3 style={h}>Accounts</h3>
            <p style={p}>You need an account to use the app. You're responsible for keeping your login credentials
              secure and for activity under your account. One account per person; don't share credentials. You must
              be old enough to legally agree to these terms in your jurisdiction.</p>

            <h3 style={h}>Acceptable use</h3>
            <p style={p}>Don't: attempt to overload, scrape, or abuse the app or its API; try to circumvent rate
              limits or extract API keys; submit illegal, infringing, or abusive content; use the app for anything
              other than personal travel planning.</p>

            <h3 style={h}>Your content</h3>
            <p style={p}>You keep ownership of the photos and search text you submit. By submitting them, you allow
              us to process them (including sending them to our AI provider) solely to provide the service back to
              you.</p>

            <h3 style={h}>No professional advice</h3>
            <p style={p}>Safety tips, health-related information, and similar content are general information, not
              professional advice. Use your own judgment and consult qualified sources for anything safety-critical.</p>

            <h3 style={h}>Termination</h3>
            <p style={p}>You can delete your account anytime. We may suspend or terminate accounts that violate
              these terms.</p>

            <h3 style={h}>Disclaimer & limitation of liability</h3>
            <p style={p}>The app is provided "as is," without warranties of any kind, including accuracy or
              uptime. To the extent permitted by law, {OPERATOR_NAME} isn't liable for indirect, incidental, or
              consequential damages arising from your use of the app, including reliance on AI-generated content.</p>

            <h3 style={h}>Governing law</h3>
            <p style={p}>These terms are governed by the laws of {JURISDICTION}.</p>

            <h3 style={h}>Changes</h3>
            <p style={p}>If these terms change materially, we'll update the effective date above. Continued use
              after a change means you accept the update.</p>

            <h3 style={h}>Contact</h3>
            <p style={p}>Questions about these terms: {CONTACT_EMAIL}.</p>
          </>
        )}
      </div>
    </div>
  );
}
