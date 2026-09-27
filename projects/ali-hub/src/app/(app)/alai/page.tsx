"use client";

/**
 * /alai · ALAI, the fifth tab (2026-09-27). Ali says what he wants changed, in his words, with
 * screenshots (camera roll, paste, or drag and drop on the laptop). Messages WAIT here · nothing
 * is built until he taps Ship now ("hold until I say go"); then the Mac (fix-worker) takes every
 * released message as one batch, builds, ships and answers in this same thread.
 *
 * One thread, newest at the bottom. Ali's bubbles on the right; under each one a quiet status
 * line (waiting · queued · building · live) and, once built, the worker's reply on the left. The
 * header says whether the Mac is listening · the worker only runs while the Mac is awake.
 * Behind the login gate: the page and /api/fix both need the session cookie.
 */

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Linkify } from "@/components/Linkify";
import { useCached, fetchJson } from "@/lib/local/store";
import { MAX_IMAGES, MAX_IMAGE_BYTES, MAX_TEXT, newFixId, type FixFeed, type FixRequest, type FixStatus } from "@/lib/fix/types";

const TZ = "Europe/Madrid";
function fmtWhen(ms: number): string {
  const d = new Date(ms), now = new Date();
  const time = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: TZ }).format(d);
  const sameDay = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d) === new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(now);
  return sameDay ? time : `${new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: TZ }).format(d)} · ${time}`;
}
function ago(ms: number, now: number): string {
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 60) return `${s} s ago`;
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}
function elapsed(from: number, to: number): string {
  const m = Math.round((to - from) / 60000);
  return m < 1 ? "under a minute" : m === 1 ? "1 min" : `${m} min`;
}

/** Shrink a photo on the phone: longest side 1400 px, JPEG · lower the quality until it fits. */
async function shrink(file: File): Promise<string> {
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) {
    // The browser could not decode it (an odd format, a damaged file) · a small one goes as it is.
    if (file.size <= MAX_IMAGE_BYTES && /^image\/(jpeg|png|webp)$/.test(file.type)) {
      return new Promise<string>((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.onerror = () => reject(r.error); r.readAsDataURL(file); });
    }
    throw new Error("cannot decode");
  }
  const scale = Math.min(1, 1400 / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale); canvas.height = Math.round(bmp.height * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  for (const q of [0.82, 0.7, 0.58, 0.45]) {
    const url = canvas.toDataURL("image/jpeg", q);
    if (url.length <= MAX_IMAGE_BYTES) return url;
  }
  // still too big: halve the size once more
  const small = document.createElement("canvas");
  small.width = Math.round(canvas.width / 2); small.height = Math.round(canvas.height / 2);
  small.getContext("2d")!.drawImage(canvas, 0, 0, small.width, small.height);
  return small.toDataURL("image/jpeg", 0.6);
}

const STATUS_LABEL: Record<FixStatus, string> = { held: "Waiting", queued: "Queued", building: "Building", shipped: "Live", failed: "Needs you", skipped: "Cancelled" };

export default function AlaiPage() {
  // true only on the client after hydration (the composer is portalled into <body>)
  const mounted = useSyncExternalStore(() => () => {}, () => true, () => false);
  const feed = useCached<FixFeed>("fixes", () => fetchJson<FixFeed>("/api/fix"));
  const refreshRef = useRef(feed.refresh);
  useEffect(() => { refreshRef.current = feed.refresh; });
  // "2 min ago" and "building · 4 min" tick from this clock, not from Date.now() in render.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 15_000); return () => clearInterval(t); }, []);
  const requests = feed.data?.requests ?? [];
  const worker = feed.data?.worker ?? { seenAt: null, note: null };
  const active = requests.some((r) => r.status === "queued" || r.status === "building");

  // While something is queued or building, ask again every 6 s (the 45 s default is for calm lists).
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => refreshRef.current(), 6000);
    return () => clearInterval(t);
  }, [active]);

  const [text, setText] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [zoom, setZoom] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  // Textarea grows with the text, up to ~6 lines.
  useEffect(() => { const el = taRef.current; if (el) { el.style.height = "auto"; el.style.height = `${Math.min(el.scrollHeight, 160)}px`; } }, [text]);
  // New message or a status change → keep the end in view.
  const lastKey = requests.length ? `${requests[requests.length - 1].id}-${requests[requests.length - 1].status}` : "";
  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [lastKey]);

  const addFiles = async (files: FileList | File[]) => {
    setErr(null);
    const room = MAX_IMAGES - images.length;
    const picked = Array.from(files).filter((f) => f.type.startsWith("image/")).slice(0, room);
    if (!picked.length) { if (room <= 0) setErr(`${MAX_IMAGES} screenshots at most`); return; }
    try {
      const urls = await Promise.all(picked.map(shrink));
      setImages((cur) => [...cur, ...urls].slice(0, MAX_IMAGES));
    } catch { setErr("Could not read that image"); }
  };

  const addFilesRef = useRef(addFiles);
  useEffect(() => { addFilesRef.current = addFiles; });

  const send = async () => {
    const t = text.trim();
    if ((!t && images.length === 0) || busy) return;
    setBusy(true); setErr(null);
    const clientId = newFixId();
    const now = Date.now();
    const optimistic: FixRequest = { id: -now, clientId, text: t, images, imageCount: images.length, status: "held", reply: null, commitSha: null, batchId: null, createdAt: now, updatedAt: now, startedAt: null, finishedAt: null };
    feed.setData((cur) => ({ requests: [...(cur?.requests ?? []), optimistic], worker: cur?.worker ?? { seenAt: null, note: null } }));
    try {
      const res = await fetch("/api/fix", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientId, text: t, images }) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error ?? `HTTP ${res.status}`);
      const { request } = (await res.json()) as { request: FixRequest };
      feed.setData((cur) => ({ requests: (cur?.requests ?? []).map((r) => (r.clientId === clientId ? request : r)), worker: cur?.worker ?? { seenAt: null, note: null } }));
      feed.markEdit();
      setText(""); setImages([]);
    } catch (e) {
      feed.setData((cur) => ({ requests: (cur?.requests ?? []).filter((r) => r.clientId !== clientId), worker: cur?.worker ?? { seenAt: null, note: null } }));
      setErr(navigator.onLine === false ? "No connection · the message stays here, send it again later" : `Not sent · ${(e as Error).message}`);
    } finally { setBusy(false); }
  };

  const patch = async (id: number, status: FixStatus) => {
    feed.setData((cur) => ({ requests: (cur?.requests ?? []).map((r) => (r.id === id ? { ...r, status, reply: status === "held" ? null : r.reply } : r)), worker: cur?.worker ?? { seenAt: null, note: null } }));
    try { await fetch("/api/fix", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status }) }); feed.markEdit(); }
    catch { feed.refresh(); }
  };

  // Header line · is the Mac listening?
  const workerLine = useMemo(() => {
    if (!worker.seenAt) return { text: "Mac not connected yet", tone: "var(--ink-4)" };
    const age = now - worker.seenAt;
    if (age < 120_000) return { text: "Mac listening", tone: "var(--pos)" };
    return { text: `Mac last seen ${ago(worker.seenAt, now)}`, tone: age > 15 * 60_000 ? "var(--warn)" : "var(--ink-3)" };
  }, [worker.seenAt, now]);

  const canSend = (text.trim().length > 0 || images.length > 0) && !busy;

  // Ship now · every waiting message is released together; the Mac takes them within 30 s.
  const heldCount = requests.filter((r) => r.status === "held").length;
  const queuedCount = requests.filter((r) => r.status === "queued").length;
  const [shipping, setShipping] = useState(false);
  const shipNow = async () => {
    if (!heldCount || shipping) return;
    setShipping(true); setErr(null);
    feed.setData((cur) => ({ requests: (cur?.requests ?? []).map((r) => (r.status === "held" ? { ...r, status: "queued" } : r)), worker: cur?.worker ?? { seenAt: null, note: null } }));
    try {
      const res = await fetch("/api/fix/ship", { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      feed.markEdit();
    } catch (e) { setErr(`Not shipped · ${(e as Error).message}`); feed.refresh(); }
    finally { setShipping(false); }
  };

  // Drag a picture anywhere onto the page (laptop) · a violet veil says "drop it".
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    let depth = 0;
    const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");
    const enter = (e: DragEvent) => { if (!hasFiles(e)) return; depth++; setDragging(true); };
    const leave = () => { depth = Math.max(0, depth - 1); if (depth === 0) setDragging(false); };
    const over = (e: DragEvent) => { if (hasFiles(e)) e.preventDefault(); };
    const drop = (e: DragEvent) => {
      depth = 0; setDragging(false);
      if (!hasFiles(e)) return;
      e.preventDefault();
      const dt = e.dataTransfer;
      const files = dt?.files.length ? Array.from(dt.files) : Array.from(dt?.items ?? []).map((it) => it.getAsFile()).filter((f): f is File => !!f);
      if (files.length) addFilesRef.current(files);
    };
    window.addEventListener("dragenter", enter); window.addEventListener("dragleave", leave);
    window.addEventListener("dragover", over); window.addEventListener("drop", drop);
    return () => { window.removeEventListener("dragenter", enter); window.removeEventListener("dragleave", leave); window.removeEventListener("dragover", over); window.removeEventListener("drop", drop); };
  }, []);

  // The Mac is connected once, with one line pasted in Terminal · the command carries the app key,
  // so it is fetched by the signed-in browser only (GET /api/fix/setup refuses the key header).
  const [copied, setCopied] = useState<"idle" | "done" | "failed">("idle");
  const connectMac = async () => {
    try {
      const res = await fetch("/api/fix/setup", { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      await navigator.clipboard.writeText((await res.text()).trim());
      setCopied("done");
    } catch { setCopied("failed"); }
    setTimeout(() => setCopied("idle"), 4000);
  };
  const needsMac = feed.data && (!worker.seenAt || now - worker.seenAt > 15 * 60_000);

  return (
    <div style={{ display: "grid", gap: 14, maxWidth: 560, margin: "0 auto", width: "100%", paddingBottom: 190 + Math.min(images.length, 1) * 84 + (heldCount + queuedCount > 0 ? 44 : 0) }}>
      <div className="cc-pagetitle" style={{ marginBottom: 0 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 600 }}>ALAI</h1>
          <div className="sub" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span aria-hidden style={{ width: 8, height: 8, borderRadius: 99, background: workerLine.tone, boxShadow: workerLine.tone === "var(--pos)" ? "0 0 0 3px color-mix(in srgb, var(--pos) 22%, transparent)" : undefined }} />
            <span style={{ color: workerLine.tone === "var(--warn)" ? "var(--warn)" : undefined }}>{workerLine.text}</span>
            {feed.stale ? <span>· saved copy</span> : null}
          </div>
        </div>
      </div>

      {needsMac && (
        <section className="cc-card">
          <div className="cc-card-head"><span className="title">Connect the Mac</span><span className="tail">{worker.seenAt ? `last seen ${ago(worker.seenAt, now)}` : "never"}</span></div>
          <div className="cc-card-body" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <span style={{ fontSize: 14, color: "var(--ink-3)" }}>{worker.seenAt ? "Wake the Mac, or run the command again." : "Paste the command in Terminal on the Mac, once."}</span>
            <button type="button" onClick={connectMac} className="cc-btn cc-btn-secondary" style={{ minHeight: 40, borderRadius: 10 }}>
              {copied === "done" ? "Copied" : copied === "failed" ? "Could not copy" : "Copy the command"}
            </button>
          </div>
        </section>
      )}

      {feed.loading && !feed.data && (
        <div style={{ display: "grid", gap: 10 }}>{[0, 1, 2].map((i) => <div key={i} className="cc-skeleton" style={{ height: 56, borderRadius: 16, width: i % 2 ? "70%" : "85%", justifySelf: i % 2 ? "start" : "end" }} />)}</div>
      )}

      {feed.data && requests.length === 0 && (
        <div style={{ textAlign: "center", color: "var(--ink-3)", fontSize: 15, padding: "48px 16px", lineHeight: 1.6 }}>
          <div style={{ fontSize: 40, marginBottom: 8, color: "var(--violet)" }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M14.7 6.3a4 4 0 0 0 5 5l-9.6 9.6a2 2 0 0 1-2.8-2.8l9.6-9.6" /><path d="M3 21l3-3" /></svg>
          </div>
          Nothing written yet.
        </div>
      )}

      {/* The thread */}
      <div style={{ display: "grid", gap: 18 }}>
        {requests.map((r) => <Bubble key={r.clientId} r={r} now={now} onZoom={setZoom} onCancel={() => patch(r.id, "skipped")} onRetry={() => patch(r.id, "held")} />)}
        <div ref={endRef} />
      </div>

      {/* Composer · fixed above the tab bar (same box as the To-do quick add) */}
      {mounted && createPortal(
        <form className="todo-addbar" onSubmit={(e) => { e.preventDefault(); send(); }} style={{ padding: "8px 12px 10px" }}>
          <div style={{ maxWidth: 560, margin: "0 auto", display: "grid", gap: 8 }}>
            {images.length > 0 && (
              <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 2 }}>
                {images.map((src, i) => (
                  <span key={i} style={{ position: "relative", flex: "0 0 auto" }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt="" onClick={() => setZoom(src)} style={{ height: 72, width: 72, objectFit: "cover", borderRadius: 12, border: "1px solid var(--line)", display: "block" }} />
                    <button type="button" onClick={() => setImages((cur) => cur.filter((_, j) => j !== i))} aria-label="Remove screenshot"
                      style={{ position: "absolute", top: -6, right: -6, width: 24, height: 24, borderRadius: 99, border: "none", background: "var(--ink)", color: "var(--bg-card)", fontSize: 13, lineHeight: 1, cursor: "pointer", display: "grid", placeItems: "center" }}>✕</button>
                  </span>
                ))}
              </div>
            )}
            {err && <div style={{ fontSize: 13.5, color: "var(--neg)" }}>{err}</div>}
            {(heldCount > 0 || queuedCount > 0) && (
              <div style={{ display: "flex", alignItems: "center", gap: 10, minHeight: 36 }}>
                <span style={{ fontSize: 14, color: "var(--ink-3)", flex: 1 }}>
                  {heldCount > 0 ? `${heldCount} waiting` : ""}{heldCount > 0 && queuedCount > 0 ? " · " : ""}{queuedCount > 0 ? `${queuedCount} on the way to the Mac` : ""}
                </span>
                {heldCount > 0 && (
                  <button type="button" onClick={shipNow} disabled={shipping} className="cc-btn cc-btn-primary" style={{ minHeight: 36, padding: "0 14px", borderRadius: 10, fontSize: 15, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12h14" /><path d="M13 6l6 6-6 6" /></svg>
                    Ship now
                  </button>
                )}
              </div>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "44px 1fr 44px", gap: 8, alignItems: "end" }}>
              <button type="button" onClick={() => fileRef.current?.click()} className="cc-btn cc-btn-ghost" aria-label="Add a screenshot" title="Add a screenshot"
                style={{ minHeight: 44, minWidth: 44, borderRadius: 14, padding: 0, color: images.length ? "var(--violet)" : undefined }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="3" y="5" width="18" height="14" rx="3" /><circle cx="9" cy="10" r="1.6" /><path d="M21 16l-5-5-9 8" /></svg>
              </button>
              <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }} />
              <textarea ref={taRef} className="cc-input" value={text} rows={1} placeholder="What should change?" maxLength={MAX_TEXT}
                onChange={(e) => setText(e.target.value)}
                onPaste={(e) => { const files = Array.from(e.clipboardData?.files ?? []); if (files.length) { e.preventDefault(); addFiles(files); } }}
                onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send(); } }}
                style={{ fontSize: 17, minHeight: 44, maxHeight: 160, padding: "10px 12px", borderRadius: 14, resize: "none", lineHeight: 1.4, width: "100%", boxSizing: "border-box" }} />
              <button type="submit" disabled={!canSend} className="cc-btn cc-btn-primary" aria-label="Send" style={{ minHeight: 44, minWidth: 44, borderRadius: 14, padding: 0, opacity: canSend ? 1 : 0.45 }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 19V5" /><path d="M5 12l7-7 7 7" /></svg>
              </button>
            </div>
          </div>
        </form>, document.body)}

      {/* Drop veil */}
      {dragging && (
        <div aria-hidden style={{ position: "fixed", inset: 0, zIndex: 55, background: "color-mix(in srgb, var(--violet) 14%, transparent)", border: "3px dashed var(--violet)", borderRadius: 18, margin: 10, display: "grid", placeItems: "center", pointerEvents: "none" }}>
          <span style={{ background: "var(--bg-card)", color: "var(--ink)", padding: "10px 16px", borderRadius: 12, fontSize: 16, fontWeight: 600, border: "1px solid var(--line)" }}>Drop the picture</span>
        </div>
      )}

      {/* Lightbox */}
      {zoom && (
        <div role="dialog" aria-label="Screenshot" onClick={() => setZoom(null)}
          style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,.86)", display: "grid", placeItems: "center", padding: 16, cursor: "zoom-out" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={zoom} alt="" style={{ maxWidth: "100%", maxHeight: "100%", borderRadius: 12, boxShadow: "0 20px 60px rgba(0,0,0,.5)" }} />
        </div>
      )}

      <style>{`
        @keyframes fix-pulse { 0%, 100% { opacity: .35; transform: scale(.8); } 50% { opacity: 1; transform: scale(1); } }
        .fix-dots span { display: inline-block; width: 6px; height: 6px; border-radius: 99px; background: var(--violet); margin-right: 4px; animation: fix-pulse 1.2s infinite ease-in-out; }
        .fix-dots span:nth-child(2) { animation-delay: .2s; } .fix-dots span:nth-child(3) { animation-delay: .4s; }
        @media (prefers-reduced-motion: reduce) { .fix-dots span { animation: none; opacity: .8; } }
      `}</style>
    </div>
  );
}

/** One request: Ali's bubble on the right, the status line under it, the reply on the left once built. */
function Bubble({ r, now, onZoom, onCancel, onRetry }: { r: FixRequest; now: number; onZoom: (src: string) => void; onCancel: () => void; onRetry: () => void }) {
  const tone = r.status === "shipped" ? "var(--pos)" : r.status === "failed" ? "var(--warn)" : r.status === "building" ? "var(--violet)" : "var(--ink-4)";
  return (
    <div style={{ display: "grid", gap: 8 }}>
      {/* Ali */}
      <div style={{ justifySelf: "end", maxWidth: "88%", display: "grid", gap: 6, justifyItems: "end" }}>
        {r.images && r.images.length > 0 && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
            {r.images.map((src, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={i} src={src} alt="" onClick={() => onZoom(src)} style={{ height: 96, maxWidth: 140, objectFit: "cover", borderRadius: 12, border: "1px solid var(--line)", cursor: "zoom-in" }} />
            ))}
          </div>
        )}
        {!r.images && r.imageCount > 0 && <span style={{ fontSize: 13, color: "var(--ink-4)" }}>{r.imageCount} screenshot{r.imageCount === 1 ? "" : "s"}</span>}
        {r.text && (
          <div style={{ background: "var(--violet)", color: "var(--on-accent)", padding: "10px 14px", borderRadius: "18px 18px 6px 18px", fontSize: 16, lineHeight: 1.45, whiteSpace: "pre-wrap", overflowWrap: "anywhere", WebkitUserSelect: "text", userSelect: "text" }}>
            {r.text}
          </div>
        )}
        <span style={{ fontSize: 12.5, color: "var(--ink-4)", fontFamily: "var(--f-mono)" }}>{fmtWhen(r.createdAt)}</span>
      </div>

      {/* Status line · left, quiet */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, color: "var(--ink-3)", minHeight: 24 }}>
        {r.status === "building"
          ? <span className="fix-dots" aria-hidden><span /><span /><span /></span>
          : <span aria-hidden style={{ width: 8, height: 8, borderRadius: 99, background: tone, flex: "0 0 auto" }} />}
        <span style={{ color: r.status === "failed" ? "var(--warn)" : r.status === "shipped" ? "var(--pos)" : undefined, fontWeight: r.status === "held" || r.status === "queued" || r.status === "skipped" ? 400 : 600 }}>{STATUS_LABEL[r.status]}</span>
        {r.status === "building" && r.startedAt && <span>· {elapsed(r.startedAt, now)}</span>}
        {r.status === "shipped" && r.startedAt && r.finishedAt && <span>· built in {elapsed(r.startedAt, r.finishedAt)}</span>}
        {r.status === "shipped" && r.commitSha && <span style={{ fontFamily: "var(--f-mono)" }}>· {r.commitSha.slice(0, 7)}</span>}
        <span style={{ flex: 1 }} />
        {(r.status === "held" || r.status === "queued") && <button type="button" onClick={onCancel} className="cc-btn cc-btn-ghost" style={{ minHeight: 30, padding: "0 10px", fontSize: 13, borderRadius: 8 }}>Cancel</button>}
        {(r.status === "failed" || r.status === "skipped") && <button type="button" onClick={onRetry} className="cc-btn cc-btn-ghost" style={{ minHeight: 30, padding: "0 10px", fontSize: 13, borderRadius: 8 }}>Send again</button>}
      </div>

      {/* The worker's reply */}
      {r.reply && r.status !== "held" && r.status !== "queued" && r.status !== "building" && (
        <div style={{ justifySelf: "start", maxWidth: "88%", background: "var(--bg-card)", border: "1px solid var(--line)", borderLeft: `3px solid ${tone}`, padding: "10px 14px", borderRadius: "6px 18px 18px 18px", fontSize: 15.5, lineHeight: 1.5, color: "var(--ink)", whiteSpace: "pre-wrap", overflowWrap: "anywhere", WebkitUserSelect: "text", userSelect: "text" }}>
          <Linkify text={r.reply} />
        </div>
      )}
    </div>
  );
}
