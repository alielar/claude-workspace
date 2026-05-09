/**
 * App-level loading skeleton — shown during page navigation suspense.
 * Renders a simple animated pulse inside the AppShell.
 */
export default function AppLoading() {
  return (
    <div className="p-6 max-w-2xl mx-auto space-y-4">
      <div className="h-8 w-48 rounded-xl animate-pulse" style={{ background: "var(--bg-elevated)" }} />
      <div className="h-4 w-32 rounded-xl animate-pulse" style={{ background: "var(--bg-elevated)" }} />
      <div className="glass rounded-2xl h-36 animate-pulse" />
      <div className="glass rounded-2xl h-28 animate-pulse" />
      <div className="glass rounded-2xl h-28 animate-pulse" />
    </div>
  );
}
