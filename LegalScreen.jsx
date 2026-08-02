import React from "react";

const theme = { bg: "#241B10", ink: "#F5E9CD", inkMuted: "#C2AD84", gold: "#E85B3B", stage: "#150F09" };

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    // In a real production app, send this to an error-tracking service
    // (e.g. Sentry) instead of just the console. See README "Monitoring".
    console.error("Travel Buddy crashed:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: "100vh", background: theme.stage, display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center", padding: 24, textAlign: "center", fontFamily: "sans-serif"
        }}>
          <p style={{ fontSize: 40, marginBottom: 8 }}>🧭</p>
          <p style={{ color: theme.ink, fontSize: 17, fontWeight: 700, margin: "0 0 6px" }}>Something went wrong</p>
          <p style={{ color: theme.inkMuted, fontSize: 13, margin: "0 0 20px", maxWidth: 320, lineHeight: 1.6 }}>
            Travel Buddy hit an unexpected error. Reloading usually fixes it — your saved places are safe in your account.
          </p>
          <button onClick={() => window.location.reload()} style={{
            background: theme.gold, border: "none", borderRadius: 999, padding: "10px 22px",
            color: theme.stage, fontWeight: 700, fontSize: 13, cursor: "pointer"
          }}>Reload</button>
        </div>
      );
    }
    return this.props.children;
  }
}
