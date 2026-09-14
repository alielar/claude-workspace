/** Instant feedback while a screen loads. */
export default function Loading() {
  return (
    <main className="animate-pulse">
      <div className="h-9 w-40 rounded-xl bg-line" />
      <div className="mt-4 h-12 rounded-2xl bg-line" />
      <div className="mt-4 grid grid-cols-2 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="tile overflow-hidden">
            <div className="aspect-[4/3] bg-line" />
            <div className="p-3"><div className="h-4 w-3/4 rounded bg-line" /><div className="mt-2 h-3 w-1/2 rounded bg-line" /></div>
          </div>
        ))}
      </div>
    </main>
  );
}
