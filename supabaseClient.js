import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import { Analytics } from "@vercel/analytics/react";
import App from "./App.jsx";
import LoginScreen from "./LoginScreen.jsx";
import ErrorBoundary from "./ErrorBoundary.jsx";
import { supabase } from "./lib/supabaseClient.js";

// window.storage shim, backed by Supabase Postgres instead of localStorage.
// Personal data (shared=false) is scoped to the signed-in user via
// `user_data`, protected by Row Level Security (see supabase/schema.sql) —
// each user can only read/write their own rows, enforced by the database
// itself, not just app logic. Shared data (shared=true) — cached
// AI-generated guides and nearby-radar results — lives in `shared_cache`,
// reused across everyone.
async function currentUserId() {
  const { data } = await supabase.auth.getSession();
  return data.session?.user?.id || null;
}

window.storage = {
  async get(key, shared = false) {
    if (shared) {
      const { data } = await supabase.from("shared_cache").select("value").eq("cache_key", key).maybeSingle();
      return data ? { key, value: data.value, shared } : null;
    }
    const uid = await currentUserId();
    if (!uid) return null;
    const { data } = await supabase.from("user_data").select("value").eq("user_id", uid).eq("data_key", key).maybeSingle();
    return data ? { key, value: data.value, shared } : null;
  },
  async set(key, value, shared = false) {
    if (shared) {
      await supabase.from("shared_cache").upsert({ cache_key: key, value, updated_at: new Date().toISOString() });
      return { key, value, shared };
    }
    const uid = await currentUserId();
    if (!uid) return null;
    await supabase.from("user_data").upsert({ user_id: uid, data_key: key, value, updated_at: new Date().toISOString() });
    return { key, value, shared };
  },
  async delete(key, shared = false) {
    if (shared) {
      await supabase.from("shared_cache").delete().eq("cache_key", key);
      return { key, deleted: true, shared };
    }
    const uid = await currentUserId();
    if (!uid) return { key, deleted: false, shared };
    await supabase.from("user_data").delete().eq("user_id", uid).eq("data_key", key);
    return { key, deleted: true, shared };
  },
  async list(prefix = "", shared = false) {
    if (shared) {
      const { data } = await supabase.from("shared_cache").select("cache_key").like("cache_key", `${prefix}%`);
      return { keys: (data || []).map(r => r.cache_key), prefix, shared };
    }
    const uid = await currentUserId();
    if (!uid) return { keys: [], prefix, shared };
    const { data } = await supabase.from("user_data").select("data_key").eq("user_id", uid).like("data_key", `${prefix}%`);
    return { keys: (data || []).map(r => r.data_key), prefix, shared };
  }
};

function LoadingScreen() {
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#150F09", color: "#C2AD84", fontFamily: "sans-serif", fontSize: 13 }}>
      Loading…
    </div>
  );
}

function Root() {
  const [session, setSession] = useState(undefined); // undefined = still checking

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => listener.subscription.unsubscribe();
  }, []);

  if (session === undefined) return <LoadingScreen />;
  if (!session) return <LoginScreen />;
  return <App session={session} onLogout={() => supabase.auth.signOut()} />;
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <Root />
      <Analytics />
    </ErrorBoundary>
  </React.StrictMode>
);
