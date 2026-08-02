import React, { useState } from "react";
import { Compass, Loader2, Mail, Lock } from "lucide-react";
import { supabase } from "./lib/supabaseClient.js";

const theme = {
  bg: "#241B10", surface: "#2E2316", surface2: "#3B2C1A",
  ink: "#F5E9CD", inkMuted: "#C2AD84", gold: "#E85B3B",
  teal: "#4FC2B8", border: "rgba(245,233,205,0.18)",
  danger: "#E85B3B", stage: "#150F09"
};

export default function LoginScreen() {
  const [mode, setMode] = useState("signin"); // signin | signup
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    if (!email.trim() || !password) {
      setError("Enter both an email and a password.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (mode === "signup" && password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }
    setLoading(true);
    try {
      if (mode === "signin") {
        const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (err) throw err;
        // onAuthStateChange in main.jsx picks this up and mounts the app.
      } else {
        const { data, error: err } = await supabase.auth.signUp({ email: email.trim(), password });
        if (err) throw err;
        if (!data.session) {
          setMessage("Account created — check your email to confirm it, then sign in.");
          setMode("signin");
        }
      }
    } catch (err) {
      setError(err.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  const fontImport = `@import url('https://fonts.googleapis.com/css2?family=Kalam:wght@400;700&family=Inter:wght@400;500;600;700&display=swap');`;

  return (
    <div style={{ minHeight: "100vh", background: theme.stage, display: "flex", justifyContent: "center", alignItems: "center", padding: "24px 12px", fontFamily: "'Inter', sans-serif" }}>
      <style>{`${fontImport} * { box-sizing: border-box; }`}</style>
      <div style={{
        width: 380, maxWidth: "100%", background: theme.bg, borderRadius: "24px 28px 22px 26px",
        border: `2.5px solid ${theme.ink}`, padding: "32px 26px", boxShadow: "0 30px 60px rgba(0,0,0,0.35)"
      }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 26 }}>
          <span style={{
            width: 46, height: 46, borderRadius: "50%", background: theme.gold,
            display: "flex", alignItems: "center", justifyContent: "center",
            border: `2px solid ${theme.ink}`, transform: "rotate(-6deg)", marginBottom: 10
          }}>
            <Compass size={24} color={theme.stage} />
          </span>
          <span style={{ fontFamily: "'Kalam', cursive", fontWeight: 700, fontSize: 24, color: theme.ink }}>Travel Buddy</span>
          <span style={{ fontSize: 12.5, color: theme.inkMuted, marginTop: 4 }}>
            {mode === "signin" ? "Welcome back" : "Create your account"}
          </span>
        </div>

        <form onSubmit={handleSubmit}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, background: theme.surface, border: `2px dashed ${theme.border}`, borderRadius: 12, padding: "10px 12px", marginBottom: 10 }}>
            <Mail size={15} color={theme.inkMuted} />
            <input type="email" autoComplete="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)}
              style={{ flex: 1, background: "none", border: "none", outline: "none", color: theme.ink, fontSize: 13.5, fontFamily: "'Inter', sans-serif" }} />
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 8, background: theme.surface, border: `2px dashed ${theme.border}`, borderRadius: 12, padding: "10px 12px", marginBottom: 14 }}>
            <Lock size={15} color={theme.inkMuted} />
            <input type="password" autoComplete={mode === "signin" ? "current-password" : "new-password"} placeholder="Password" value={password} onChange={e => setPassword(e.target.value)}
              style={{ flex: 1, background: "none", border: "none", outline: "none", color: theme.ink, fontSize: 13.5, fontFamily: "'Inter', sans-serif" }} />
          </label>
          {mode === "signup" && (
            <label style={{ display: "flex", alignItems: "center", gap: 8, background: theme.surface, border: `2px dashed ${theme.border}`, borderRadius: 12, padding: "10px 12px", marginBottom: 14 }}>
              <Lock size={15} color={theme.inkMuted} />
              <input type="password" autoComplete="new-password" placeholder="Confirm password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                style={{ flex: 1, background: "none", border: "none", outline: "none", color: theme.ink, fontSize: 13.5, fontFamily: "'Inter', sans-serif" }} />
            </label>
          )}

          {error && <p style={{ fontSize: 12, color: theme.danger, margin: "0 0 12px" }}>{error}</p>}
          {message && <p style={{ fontSize: 12, color: theme.teal, margin: "0 0 12px" }}>{message}</p>}

          <button type="submit" disabled={loading} style={{
            width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            background: theme.gold, border: `2px solid ${theme.ink}`, borderRadius: 999, padding: "12px 0",
            color: theme.stage, fontWeight: 700, fontSize: 14, cursor: loading ? "default" : "pointer",
            fontFamily: "'Kalam', cursive", boxShadow: `3px 3px 0 ${theme.ink}`, opacity: loading ? 0.75 : 1
          }}>
            {loading ? <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> : null}
            {mode === "signin" ? "Sign in" : "Create account"}
          </button>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </form>

        <p style={{ textAlign: "center", fontSize: 12.5, color: theme.inkMuted, marginTop: 18 }}>
          {mode === "signin" ? "New to Travel Buddy?" : "Already have an account?"}{" "}
          <button onClick={() => { setMode(m => m === "signin" ? "signup" : "signin"); setError(null); setMessage(null); setConfirmPassword(""); }}
            style={{ background: "none", border: "none", color: theme.gold, fontWeight: 700, cursor: "pointer", fontSize: 12.5, padding: 0 }}>
            {mode === "signin" ? "Create an account" : "Sign in"}
          </button>
        </p>
      </div>
    </div>
  );
}
