import React, { useEffect, useState } from "react";
import { ArrowLeft, Users, Sparkles, MapPin, RotateCw, Loader2 } from "lucide-react";
import { supabase } from "./lib/supabaseClient.js";

function timeAgo(iso) {
  if (!iso) return "never";
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default function AdminDashboard({ theme, onBack }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/admin-stats", {
        headers: { Authorization: `Bearer ${session?.access_token || ""}` }
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || `Error ${res.status}`);
      setData(body);
    } catch (e) {
      setError(e.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  return (
    <div>
      <button onClick={onBack} style={{ background: "none", border: "none", color: theme.inkMuted, display: "flex", alignItems: "center", gap: 6, marginBottom: 10, cursor: "pointer", fontSize: 12.5 }}>
        <ArrowLeft size={14} /> Back
      </button>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <p style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 700, color: theme.ink, margin: 0 }}>Admin Dashboard</p>
        <button onClick={load} disabled={loading} style={{
          background: theme.surface, border: `2px dashed ${theme.border}`, borderRadius: 999, padding: 8, cursor: "pointer"
        }}>
          <RotateCw size={14} color={theme.gold} style={loading ? { animation: "spin 1s linear infinite" } : {}} />
        </button>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {loading && !data && (
        <div style={{ textAlign: "center", padding: "60px 0" }}>
          <Loader2 size={22} color={theme.gold} style={{ animation: "spin 1s linear infinite" }} />
        </div>
      )}
      {error && <p style={{ fontSize: 12.5, color: theme.danger, textAlign: "center", padding: "20px 0" }}>{error}</p>}

      {data && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
            <div style={{ background: theme.surface, border: `2px dashed ${theme.border}`, borderRadius: 14, padding: "12px 14px" }}>
              <Users size={16} color={theme.teal} />
              <p style={{ fontSize: 22, fontWeight: 700, color: theme.ink, margin: "6px 0 0", fontFamily: "var(--font-display)" }}>{data.totalUsers}</p>
              <p style={{ fontSize: 10.5, color: theme.inkMuted, margin: 0 }}>Total users</p>
            </div>
            <div style={{ background: theme.surface, border: `2px dashed ${theme.border}`, borderRadius: 14, padding: "12px 14px" }}>
              <MapPin size={16} color={theme.teal} />
              <p style={{ fontSize: 22, fontWeight: 700, color: theme.ink, margin: "6px 0 0", fontFamily: "var(--font-display)" }}>{data.totalSavedPlaces}</p>
              <p style={{ fontSize: 10.5, color: theme.inkMuted, margin: 0 }}>Places saved (all users)</p>
            </div>
            <div style={{ background: theme.surface, border: `2px dashed ${theme.border}`, borderRadius: 14, padding: "12px 14px", gridColumn: "span 2" }}>
              <Sparkles size={16} color={theme.gold} />
              <p style={{ fontSize: 22, fontWeight: 700, color: theme.ink, margin: "6px 0 0", fontFamily: "var(--font-display)" }}>
                {data.aiUsageToday} <span style={{ fontSize: 13, color: theme.inkMuted, fontWeight: 400 }}>AI calls today (cap: {data.aiDailyCap}/user/day)</span>
              </p>
            </div>
          </div>

          {data.topPlaces.length > 0 && (
            <div style={{ marginBottom: 18 }}>
              <p style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 700, color: theme.ink, margin: "0 0 8px" }}>Most-saved places</p>
              {data.topPlaces.map((p, i) => (
                <div key={p.name} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: i < data.topPlaces.length - 1 ? `1px dashed ${theme.border}` : "none" }}>
                  <span style={{ fontSize: 12.5, color: theme.ink }}>{p.name}</span>
                  <span style={{ fontSize: 12, color: theme.inkMuted, fontFamily: "var(--font-mono)" }}>{p.count} save{p.count === 1 ? "" : "s"}</span>
                </div>
              ))}
            </div>
          )}

          <p style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 700, color: theme.ink, margin: "0 0 8px" }}>Users ({data.users.length})</p>
          {data.users.map(u => (
            <div key={u.id} style={{ background: theme.surface, border: `1.5px dashed ${theme.border}`, borderRadius: 12, padding: "10px 12px", marginBottom: 8 }}>
              <p style={{ fontSize: 12.5, color: theme.ink, fontWeight: 600, margin: "0 0 2px", wordBreak: "break-all" }}>{u.email}</p>
              <p style={{ fontSize: 10.5, color: theme.inkMuted, margin: 0 }}>
                Joined {timeAgo(u.createdAt)} · last active {timeAgo(u.lastSignIn)} · {u.savedCount} saved · {u.aiCallsToday} AI calls today
              </p>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
