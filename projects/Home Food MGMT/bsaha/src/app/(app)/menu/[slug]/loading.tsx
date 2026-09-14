export default function Loading() {
  return (
    <main className="animate-pulse">
      <div className="h-5 w-12 rounded bg-line" />
      <div className="mt-3 tile overflow-hidden"><div className="aspect-[4/3] bg-line" /></div>
      <div className="mt-4 h-8 w-3/4 rounded bg-line" />
      <div className="mt-2 h-5 w-1/2 rounded bg-line" />
      <div className="mt-6 h-24 rounded-2xl bg-line" />
    </main>
  );
}
