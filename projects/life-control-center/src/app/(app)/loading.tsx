/**
 * App-level loading skeleton · shown during page navigation suspense.
 * Minimal shimmer to avoid jarring ghost cards on fast navigations.
 */
export default function AppLoading() {
  return (
    <div style={{
      padding: "24px 0",
      opacity: 0,
      animation: "loadFadeIn 0.3s ease 0.15s forwards",
    }}>
      <div className="cc-skeleton" style={{ height: 28, width: 180, borderRadius: 8, marginBottom: 10 }} />
      <div className="cc-skeleton" style={{ height: 14, width: 120, borderRadius: 6, marginBottom: 24 }} />
      <div className="cc-skeleton" style={{ height: 120, borderRadius: 16, marginBottom: 14 }} />
      <div className="cc-skeleton" style={{ height: 80, borderRadius: 16 }} />
      <style>{`
        @keyframes loadFadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
