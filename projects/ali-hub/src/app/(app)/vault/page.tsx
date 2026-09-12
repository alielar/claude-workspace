"use client";

/**
 * /vault · passwords, API keys, recovery codes, secure notes (2026-09-12).
 * Reached from To-do → Docs → Passwords.
 *
 * Two doors, both must be open:
 *   1. the app's Google sign-in (cookie) · the server refuses everything else;
 *   2. the vault passphrase · typed here, turned into an AES key on the phone, never sent.
 * The server stores ciphertext only (src/lib/vault/crypto.ts explains the scheme).
 *
 * Behaviour: needs a connection (nothing about the vault is cached on the phone, not even
 * ciphertext); locks itself after 5 min without a tap, 60 s after the app goes to the
 * background, and whenever you tap Lock. Lost passphrase = lost vault · there is no reset,
 * by design (a reset would mean the server could read it).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { decryptJson, deriveKey, encryptJson, generatePassword, KDF_ITERATIONS, passphraseStrength, randomBytes, toB64, VERIFIER } from "@/lib/vault/crypto";
import { commonEmails, csvToImportRows, newVaultId, VAULT_KINDS, type ImportRow, type VaultItem, type VaultKind, type VaultMeta, type VaultRecord } from "@/lib/vault/types";

type Phase = "loading" | "offline" | "setup" | "locked" | "open";
const IDLE_LOCK_MS = 5 * 60_000;
const BACKGROUND_LOCK_MS = 60_000;

const input: React.CSSProperties = { fontSize: 16, minHeight: 46, width: "100%", boxSizing: "border-box" };
const chip = (on: boolean): React.CSSProperties => ({
  minHeight: 40, padding: "0 12px", borderRadius: 10, fontSize: 15, font: "inherit", cursor: "pointer",
  border: `1px solid ${on ? "var(--violet)" : "var(--line-hi)"}`, background: on ? "var(--accent-soft)" : "var(--fill-1)", color: on ? "var(--ink)" : "var(--ink-2)",
});

async function api<T>(method: string, body?: unknown): Promise<T> {
  const res = await fetch("/api/vault", { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined, cache: "no-store" });
  if (!res.ok) { const j = await res.json().catch(() => ({})) as { error?: string }; throw new Error(j.error ?? `Server said ${res.status}`); }
  return res.json() as Promise<T>;
}

function StrengthBar({ value }: { value: string }) {
  const s = passphraseStrength(value);
  const label = ["", "weak", "okay", "good", "strong"][s];
  const color = s <= 1 ? "var(--neg)" : s === 2 ? "var(--warn)" : "var(--pos)";
  return (
    <div style={{ display: "grid", gap: 4 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 4 }}>
        {[1, 2, 3, 4].map((i) => <span key={i} style={{ height: 4, borderRadius: 2, background: i <= s ? color : "var(--fill-3)" }} />)}
      </div>
      <span style={{ fontSize: 13, color: "var(--ink-4)" }}>{value ? label : "A sentence you will remember beats a short scramble · 16+ characters."}</span>
    </div>
  );
}

function PassphraseInput({ value, onChange, placeholder, autoComplete, onEnter, autoFocus }: {
  value: string; onChange: (v: string) => void; placeholder: string; autoComplete: "current-password" | "new-password"; onEnter?: () => void; autoFocus?: boolean;
}) {
  const [show, setShow] = useState(false);
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8 }}>
      <input className="cc-input" type={show ? "text" : "password"} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        autoComplete={autoComplete} autoCapitalize="none" autoCorrect="off" spellCheck={false} autoFocus={autoFocus}
        onKeyDown={(e) => { if (e.key === "Enter" && onEnter) { e.preventDefault(); onEnter(); } }} style={input} />
      <button type="button" className="cc-btn cc-btn-ghost" onClick={() => setShow((v) => !v)} style={{ minHeight: 46, padding: "0 12px", fontSize: 14 }}>{show ? "Hide" : "Show"}</button>
    </div>
  );
}

// ─── Item sheet ───────────────────────────────────────────────────────────────

function Copy({ text, label = "Copy" }: { text: string | undefined; label?: string }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    if (!text) return;
    try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1400); } catch { /* select by hand */ }
  };
  return <button type="button" className="cc-btn cc-btn-ghost" onClick={copy} disabled={!text} style={{ minHeight: 46, padding: "0 12px", fontSize: 14 }}>{done ? "Copied" : label}</button>;
}

function SecretField({ value, onChange, placeholder, label, generate }: { value: string; onChange: (v: string) => void; placeholder: string; label: string; generate?: boolean }) {
  const [show, setShow] = useState(false);
  return (
    <label style={{ display: "grid", gap: 4, fontSize: 14, color: "var(--ink-3)" }}>{label}
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 6 }}>
        <input className="cc-input" type={show ? "text" : "password"} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
          autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false} style={{ ...input, fontFamily: show ? "var(--f-mono)" : undefined }} />
        <button type="button" className="cc-btn cc-btn-ghost" onClick={() => setShow((v) => !v)} style={{ minHeight: 46, padding: "0 10px", fontSize: 14 }}>{show ? "Hide" : "Show"}</button>
        <Copy text={value} />
      </div>
      {generate && <button type="button" onClick={() => { onChange(generatePassword()); setShow(true); }} style={{ all: "unset", cursor: "pointer", fontSize: 13.5, color: "var(--violet)", minHeight: 32, justifySelf: "start" }}>Generate a strong one</button>}
    </label>
  );
}

function ItemSheet({ item, emails, isNew, onSave, onDelete, onClose }: {
  item: VaultItem; emails: string[]; isNew: boolean; onSave: (i: VaultItem) => Promise<void>; onDelete: () => Promise<void>; onClose: () => void;
}) {
  const [d, setD] = useState<VaultItem>(item);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (p: Partial<VaultItem>) => setD((x) => ({ ...x, ...p }));
  useEffect(() => { const prev = document.body.style.overflow; document.body.style.overflow = "hidden"; return () => { document.body.style.overflow = prev; }; }, []);
  const save = async () => {
    if (!d.name.trim()) { setErr("Give it a name."); return; }
    setBusy(true); setErr(null);
    try { await onSave({ ...d, name: d.name.trim(), updatedAt: Date.now() }); onClose(); }
    catch (e) { setErr((e as Error).message || "Couldn't save · check the connection."); setBusy(false); }
  };
  const del = async () => {
    if (!isNew && !confirm(`Delete “${d.name}” from the vault?`)) return;
    setBusy(true);
    try { await onDelete(); onClose(); } catch (e) { setErr((e as Error).message); setBusy(false); }
  };
  const codes = (d.codes ?? []).join("\n");
  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 70, background: "rgba(0,0,0,0.5)" }} />
      <div role="dialog" aria-label={isNew ? "New vault item" : "Vault item"} style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 71, background: "var(--bg-chrome)", borderTop: "1px solid var(--line-hi)", borderRadius: "20px 20px 0 0", padding: "14px 18px calc(env(safe-area-inset-bottom) + 14px)", display: "grid", gap: 12, maxWidth: 560, margin: "0 auto", maxHeight: "90dvh", overflowY: "auto" }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {VAULT_KINDS.map((k) => <button key={k.key} type="button" onClick={() => set({ kind: k.key })} style={chip(d.kind === k.key)} aria-pressed={d.kind === k.key}>{k.label}</button>)}
        </div>
        <label style={{ display: "grid", gap: 4, fontSize: 14, color: "var(--ink-3)" }}>{d.kind === "apikey" ? "Service" : d.kind === "note" ? "Title" : "Site or account"}
          <input className="cc-input" value={d.name} onChange={(e) => set({ name: e.target.value })} placeholder={d.kind === "apikey" ? "Anthropic, Vercel, Turso…" : d.kind === "note" ? "What is this?" : "Netflix, Gmail, bank…"} autoFocus={isNew} style={{ ...input, fontSize: 17, fontWeight: 500 }} />
        </label>
        {d.kind === "login" && (
          <label style={{ display: "grid", gap: 4, fontSize: 14, color: "var(--ink-3)" }}>Website
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 6 }}>
              <input className="cc-input" type="url" value={d.url ?? ""} onChange={(e) => set({ url: e.target.value || undefined })} placeholder="https://" autoCapitalize="none" autoCorrect="off" style={input} />
              {d.url && <a className="cc-btn cc-btn-ghost" href={d.url.includes("://") ? d.url : `https://${d.url}`} target="_blank" rel="noopener noreferrer" style={{ minHeight: 46, padding: "0 12px", fontSize: 14, textDecoration: "none", display: "inline-flex", alignItems: "center" }}>Open</a>}
            </div>
          </label>
        )}
        {d.kind !== "note" && (
          <label style={{ display: "grid", gap: 6, fontSize: 14, color: "var(--ink-3)" }}>{d.kind === "apikey" ? "Account it belongs to" : "Email or username"}
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 6 }}>
              <input className="cc-input" value={d.username ?? ""} onChange={(e) => set({ username: e.target.value || undefined })} placeholder="you@example.com" autoCapitalize="none" autoCorrect="off" autoComplete="off" inputMode="email" style={input} />
              <Copy text={d.username} />
            </div>
            {emails.length > 0 && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {emails.map((e) => <button key={e} type="button" onClick={() => set({ username: e })} style={{ ...chip(d.username === e), minHeight: 36, fontSize: 14, maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e}</button>)}
              </div>
            )}
          </label>
        )}
        {d.kind === "login" && <SecretField label="Password" value={d.password ?? ""} onChange={(v) => set({ password: v || undefined })} placeholder="" generate />}
        {d.kind === "apikey" && <SecretField label="API key" value={d.password ?? ""} onChange={(v) => set({ password: v || undefined })} placeholder="sk-…" />}
        {d.kind === "recovery" && (
          <label style={{ display: "grid", gap: 4, fontSize: 14, color: "var(--ink-3)" }}>Recovery codes · one per line
            <textarea className="cc-input" value={codes} onChange={(e) => set({ codes: e.target.value.split("\n").map((c) => c.trim()).filter(Boolean) })} rows={6} autoCapitalize="none" autoCorrect="off" spellCheck={false}
              style={{ ...input, fontFamily: "var(--f-mono)", lineHeight: 1.6, resize: "vertical", minHeight: 120 }} />
            <div style={{ display: "flex", gap: 6, alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 13, color: "var(--ink-4)" }}>{(d.codes ?? []).length} code{(d.codes ?? []).length === 1 ? "" : "s"}. Cross out a used one by deleting its line.</span>
              <Copy text={codes} label="Copy all" />
            </div>
          </label>
        )}
        <label style={{ display: "grid", gap: 4, fontSize: 14, color: "var(--ink-3)" }}>{d.kind === "note" ? "Note" : "Notes"}
          <textarea className="cc-input" value={d.kind === "note" ? d.password ?? "" : d.notes ?? ""} onChange={(e) => (d.kind === "note" ? set({ password: e.target.value || undefined }) : set({ notes: e.target.value || undefined }))} rows={d.kind === "note" ? 6 : 2}
            placeholder={d.kind === "note" ? "Anything secret that isn't a login." : "Security questions, PIN hints, which card…"} style={{ ...input, lineHeight: 1.5, resize: "vertical", minHeight: d.kind === "note" ? 140 : 60 }} />
        </label>
        {err && <div role="alert" style={{ fontSize: 14.5, color: "var(--neg)" }}>{err}</div>}
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10 }}>
          <button className="cc-btn cc-btn-primary" onClick={save} disabled={busy} style={{ minHeight: 50, borderRadius: 14, fontSize: 17 }}>{busy ? "Saving…" : isNew ? "Add to vault" : "Save"}</button>
          <button className="cc-btn cc-btn-ghost" onClick={del} disabled={busy} style={{ minHeight: 50, borderRadius: 14, padding: "0 16px", color: "var(--neg)", fontSize: 15 }}>{isNew ? "Discard" : "Delete"}</button>
        </div>
      </div>
    </>
  );
}

// ─── Import sheet ─────────────────────────────────────────────────────────────

function ImportSheet({ existing, onImport, onClose }: { existing: VaultItem[]; onImport: (rows: ImportRow[]) => Promise<number>; onClose: () => void }) {
  const [parsed, setParsed] = useState<{ rows: ImportRow[]; skipped: number; unknownHeader: boolean; file: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const have = useMemo(() => new Set(existing.map((i) => `${i.name.toLowerCase()}|${(i.username ?? "").toLowerCase()}`)), [existing]);
  const fresh = parsed ? parsed.rows.filter((r) => !have.has(`${r.name.toLowerCase()}|${(r.username ?? "").toLowerCase()}`)) : [];
  const onFile = async (f: File | undefined) => {
    if (!f) return;
    const text = await f.text();
    const r = csvToImportRows(text);
    setParsed({ ...r, file: f.name });
    setMsg(null);
  };
  const go = async () => {
    if (!fresh.length) return;
    setBusy(true); setMsg(null);
    try { const n = await onImport(fresh); setMsg(`${n} added to the vault. Now delete the CSV file from Files / Downloads · it is the only unencrypted copy.`); setParsed(null); }
    catch (e) { setMsg((e as Error).message || "Import failed · nothing was changed."); }
    finally { setBusy(false); }
  };
  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 70, background: "rgba(0,0,0,0.5)" }} />
      <div role="dialog" aria-label="Import passwords" style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 71, background: "var(--bg-chrome)", borderTop: "1px solid var(--line-hi)", borderRadius: "20px 20px 0 0", padding: "14px 18px calc(env(safe-area-inset-bottom) + 14px)", display: "grid", gap: 12, maxWidth: 560, margin: "0 auto", maxHeight: "90dvh", overflowY: "auto" }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>Import from a CSV export</h2>
        <ol style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 6, fontSize: 14.5, color: "var(--ink-2)", lineHeight: 1.5 }}>
          <li><b>iPhone / iCloud Keychain</b>: on a Mac, Passwords app → File → Export All Passwords to File… → save the CSV, AirDrop it to the phone.</li>
          <li><b>Chrome</b>: Settings → Passwords (Google Password Manager) → Settings → Export passwords.</li>
          <li><b>Safari on Mac</b>: File → Export → Passwords.</li>
          <li>Pick the file below. Everything is encrypted on this phone before it is saved; the file itself never leaves the phone.</li>
        </ol>
        <label className="cc-btn cc-btn-secondary" style={{ minHeight: 50, borderRadius: 14, fontSize: 16, display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer", position: "relative" }}>
          {parsed ? `File: ${parsed.file}` : "Choose the CSV file"}
          <input type="file" accept=".csv,text/csv,text/plain" onChange={(e) => onFile(e.target.files?.[0])} style={{ position: "absolute", inset: 0, opacity: 0, width: "100%", height: "100%", cursor: "pointer" }} />
        </label>
        {parsed && parsed.unknownHeader && <div style={{ fontSize: 14.5, color: "var(--neg)" }}>This file has no username / password columns I recognise. Export again as CSV from the password manager itself.</div>}
        {parsed && !parsed.unknownHeader && (
          <div style={{ fontSize: 15, color: "var(--ink-2)", lineHeight: 1.6 }}>
            <b>{parsed.rows.length}</b> logins in the file · <b>{fresh.length}</b> new{parsed.rows.length - fresh.length > 0 ? ` · ${parsed.rows.length - fresh.length} already in the vault (same site and username), skipped` : ""}{parsed.skipped ? ` · ${parsed.skipped} empty rows ignored` : ""}.
          </div>
        )}
        {msg && <div role="status" style={{ fontSize: 14.5, color: msg.startsWith("Import failed") ? "var(--neg)" : "var(--pos)", lineHeight: 1.5 }}>{msg}</div>}
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10 }}>
          <button className="cc-btn cc-btn-primary" onClick={go} disabled={busy || fresh.length === 0} style={{ minHeight: 50, borderRadius: 14, fontSize: 17 }}>{busy ? "Encrypting…" : fresh.length ? `Import ${fresh.length}` : "Import"}</button>
          <button className="cc-btn cc-btn-ghost" onClick={onClose} disabled={busy} style={{ minHeight: 50, borderRadius: 14, padding: "0 16px", fontSize: 15 }}>Close</button>
        </div>
      </div>
    </>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function VaultPage() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [meta, setMeta] = useState<VaultMeta | null>(null);
  const [records, setRecords] = useState<VaultRecord[]>([]);
  const [items, setItems] = useState<VaultItem[]>([]);
  const [undecryptable, setUndecryptable] = useState(0);
  const keyRef = useRef<CryptoKey | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [pass, setPass] = useState("");
  const [pass2, setPass2] = useState("");
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<VaultKind | "all">("all");
  const [open, setOpen] = useState<{ item: VaultItem; isNew: boolean } | null>(null);
  const [importing, setImporting] = useState(false);
  const [changing, setChanging] = useState(false);

  const load = useCallback(() => {
    let alive = true;
    api<{ meta: VaultMeta | null; items: VaultRecord[] }>("GET")
      .then((r) => { if (!alive) return; setMeta(r.meta); setRecords(r.items); setPhase(r.meta ? "locked" : "setup"); })
      .catch(() => { if (alive) setPhase("offline"); });
    return () => { alive = false; };
  }, []);
  useEffect(load, [load]);

  const lock = useCallback(() => {
    keyRef.current = null;
    setItems([]); setOpen(null); setImporting(false); setChanging(false); setPass(""); setPass2("");
    setPhase((p) => (p === "open" ? "locked" : p));
  }, []);

  // Auto-lock: idle in the foreground, or a minute after going to the background.
  useEffect(() => {
    if (phase !== "open") return;
    let idle = window.setTimeout(lock, IDLE_LOCK_MS);
    let bg: number | null = null;
    const touch = () => { clearTimeout(idle); idle = window.setTimeout(lock, IDLE_LOCK_MS); };
    const vis = () => {
      if (document.visibilityState === "hidden") bg = window.setTimeout(lock, BACKGROUND_LOCK_MS);
      else if (bg) { clearTimeout(bg); bg = null; touch(); }
    };
    window.addEventListener("pointerdown", touch); window.addEventListener("keydown", touch); document.addEventListener("visibilitychange", vis);
    return () => { clearTimeout(idle); if (bg) clearTimeout(bg); window.removeEventListener("pointerdown", touch); window.removeEventListener("keydown", touch); document.removeEventListener("visibilitychange", vis); };
  }, [phase, lock]);

  const decryptAll = async (key: CryptoKey, recs: VaultRecord[]) => {
    const out: VaultItem[] = []; let bad = 0;
    for (const r of recs) {
      try { const it = await decryptJson<VaultItem>(key, r.blob); out.push({ ...it, id: r.id }); } catch { bad++; }
    }
    setItems(out.sort((a, b) => a.name.localeCompare(b.name))); setUndecryptable(bad);
  };

  const setup = async () => {
    if (pass.length < 12) { setError("At least 12 characters. A sentence works well."); return; }
    if (pass !== pass2) { setError("The two entries don't match."); return; }
    setBusy(true); setError(null);
    try {
      const salt = toB64(randomBytes(16));
      const key = await deriveKey(pass, salt, KDF_ITERATIONS);
      const verifier = await encryptJson(key, VERIFIER);
      await api("POST", { salt, iterations: KDF_ITERATIONS, verifier });
      keyRef.current = key; setMeta({ salt, iterations: KDF_ITERATIONS, verifier }); setItems([]); setPass(""); setPass2("");
      setPhase("open");
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };

  const unlock = async () => {
    if (!meta || !pass) return;
    setBusy(true); setError(null);
    try {
      const key = await deriveKey(pass, meta.salt, meta.iterations);
      let ok = false;
      try { ok = (await decryptJson<string>(key, meta.verifier)) === VERIFIER; } catch { ok = false; }
      if (!ok) { setError("Wrong passphrase."); return; }
      keyRef.current = key;
      await decryptAll(key, records);
      setPass(""); setPhase("open");
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };

  const saveItem = async (it: VaultItem) => {
    const key = keyRef.current; if (!key) throw new Error("Locked");
    const blob = await encryptJson(key, it);
    await api("PUT", { items: [{ id: it.id, blob, updatedAt: it.updatedAt }] });
    setItems((list) => [...list.filter((x) => x.id !== it.id), it].sort((a, b) => a.name.localeCompare(b.name)));
    setRecords((rs) => [...rs.filter((r) => r.id !== it.id), { id: it.id, blob, updatedAt: it.updatedAt }]);
  };
  const deleteItem = async (id: string) => {
    await api("PUT", { items: [{ id, blob: "", updatedAt: Date.now(), deleted: true }] });
    setItems((list) => list.filter((x) => x.id !== id));
    setRecords((rs) => rs.filter((r) => r.id !== id));
  };
  const importRows = async (rows: ImportRow[]) => {
    const key = keyRef.current; if (!key) throw new Error("Locked");
    const now = Date.now();
    const fresh: VaultItem[] = rows.map((r) => ({ id: newVaultId(), kind: "login", name: r.name, url: r.url, username: r.username, password: r.password, notes: r.notes, createdAt: now, updatedAt: now }));
    const encrypted: VaultRecord[] = [];
    for (const it of fresh) encrypted.push({ id: it.id, blob: await encryptJson(key, it), updatedAt: now });
    for (let i = 0; i < encrypted.length; i += 200) await api("PUT", { items: encrypted.slice(i, i + 200) });
    setItems((list) => [...list, ...fresh].sort((a, b) => a.name.localeCompare(b.name)));
    setRecords((rs) => [...rs, ...encrypted]);
    return fresh.length;
  };
  const changePassphrase = async () => {
    if (pass.length < 12) { setError("At least 12 characters."); return; }
    if (pass !== pass2) { setError("The two entries don't match."); return; }
    setBusy(true); setError(null);
    try {
      const salt = toB64(randomBytes(16));
      const key = await deriveKey(pass, salt, KDF_ITERATIONS);
      const verifier = await encryptJson(key, VERIFIER);
      const re: VaultRecord[] = [];
      for (const it of items) re.push({ id: it.id, blob: await encryptJson(key, it), updatedAt: it.updatedAt });
      await api("PATCH", { meta: { salt, iterations: KDF_ITERATIONS, verifier }, items: re });
      keyRef.current = key; setMeta({ salt, iterations: KDF_ITERATIONS, verifier }); setRecords(re); setPass(""); setPass2(""); setChanging(false);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };

  const emails = useMemo(() => commonEmails(items), [items]);
  const q = query.trim().toLowerCase();
  const shown = items.filter((i) => (kind === "all" || i.kind === kind) && (!q || i.name.toLowerCase().includes(q) || (i.username ?? "").toLowerCase().includes(q) || (i.url ?? "").toLowerCase().includes(q)));
  const counts = VAULT_KINDS.map((k) => ({ ...k, n: items.filter((i) => i.kind === k.key).length }));

  const head = (sub: string, action?: React.ReactNode) => (
    <div className="cc-pagetitle" style={{ marginBottom: 0, display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
      <div>
        <h1 style={{ fontSize: 28, fontWeight: 600 }}>Passwords</h1>
        <div className="sub">{sub}</div>
      </div>
      {action}
    </div>
  );
  const back = <Link href="/todo" style={{ fontSize: 14, color: "var(--ink-3)", textDecoration: "none" }}>‹ Docs</Link>;

  if (phase === "loading") return <div style={{ display: "grid", gap: 18, maxWidth: 560 }}>{head("…", back)}<div className="cc-card"><div className="cc-card-body" style={{ display: "grid", gap: 10 }}>{[0, 1, 2].map((i) => <div key={i} className="cc-skeleton" style={{ height: 44 }} />)}</div></div></div>;

  if (phase === "offline") return (
    <div style={{ display: "grid", gap: 18, maxWidth: 560 }}>
      {head("needs a connection", back)}
      <div className="cc-card"><div className="cc-card-body" style={{ fontSize: 15.5, lineHeight: 1.6, color: "var(--ink-2)", display: "grid", gap: 10 }}>
        <p style={{ margin: 0 }}>The vault keeps nothing on this phone between visits, not even the encrypted copy · so it can only open with a connection to the server.</p>
        <button className="cc-btn cc-btn-secondary" onClick={() => { setPhase("loading"); load(); }} style={{ minHeight: 46, justifySelf: "start" }}>Try again</button>
      </div></div>
    </div>
  );

  if (phase === "setup") return (
    <div style={{ display: "grid", gap: 18, maxWidth: 560 }}>
      {head("first time · choose the passphrase", back)}
      <div className="cc-card"><div className="cc-card-body" style={{ display: "grid", gap: 12, fontSize: 15, lineHeight: 1.55, color: "var(--ink-2)" }}>
        <p style={{ margin: 0 }}>Everything in the vault is encrypted on this phone with a key made from this passphrase. The server, the database and its backups only ever hold scrambled text.</p>
        <p style={{ margin: 0, color: "var(--warn)" }}>There is no reset. Forget the passphrase and the vault is gone for good · that is the price of the server not being able to read it.</p>
        <PassphraseInput value={pass} onChange={setPass} placeholder="Passphrase" autoComplete="new-password" autoFocus />
        <StrengthBar value={pass} />
        <PassphraseInput value={pass2} onChange={setPass2} placeholder="Type it again" autoComplete="new-password" onEnter={setup} />
        {error && <div role="alert" style={{ color: "var(--neg)", fontSize: 14.5 }}>{error}</div>}
        <button className="cc-btn cc-btn-primary" onClick={setup} disabled={busy || !pass || !pass2} style={{ minHeight: 52, borderRadius: 14, fontSize: 17 }}>{busy ? "Creating the key…" : "Create the vault"}</button>
      </div></div>
    </div>
  );

  if (phase === "locked") return (
    <div style={{ display: "grid", gap: 18, maxWidth: 560 }}>
      {head(`locked · ${records.length} item${records.length === 1 ? "" : "s"}`, back)}
      <div className="cc-card"><div className="cc-card-body" style={{ display: "grid", gap: 12 }}>
        <PassphraseInput value={pass} onChange={setPass} placeholder="Passphrase" autoComplete="current-password" onEnter={unlock} autoFocus />
        {error && <div role="alert" style={{ color: "var(--neg)", fontSize: 14.5 }}>{error}</div>}
        <button className="cc-btn cc-btn-primary" onClick={unlock} disabled={busy || !pass} style={{ minHeight: 52, borderRadius: 14, fontSize: 17 }}>{busy ? "Unlocking…" : "Unlock"}</button>
        <div style={{ fontSize: 13.5, color: "var(--ink-4)", lineHeight: 1.5 }}>Unlocking takes about a second · the key is computed here on the phone. It locks again after 5 minutes without a tap, or a minute after you leave the app.</div>
      </div></div>
    </div>
  );

  // ── Open ──
  return (
    <div style={{ display: "grid", gap: 14, maxWidth: 560, paddingBottom: 24 }}>
      {head(`${items.length} item${items.length === 1 ? "" : "s"}${undecryptable ? ` · ${undecryptable} unreadable` : ""}`,
        <button className="cc-btn cc-btn-ghost" onClick={lock} style={{ minHeight: 44, padding: "0 14px", fontSize: 15 }}>Lock</button>)}

      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8 }}>
        <input className="cc-input" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search site, email, key…" autoCapitalize="none" autoCorrect="off" style={{ fontSize: 16, minHeight: 46, borderRadius: 12 }} />
        <button className="cc-btn cc-btn-primary" onClick={() => setOpen({ isNew: true, item: { id: newVaultId(), kind: kind === "all" ? "login" : kind, name: "", username: emails[0], createdAt: Date.now(), updatedAt: Date.now() } })} style={{ minHeight: 46, minWidth: 46, borderRadius: 12, fontSize: 20, padding: 0 }} aria-label="Add">+</button>
      </div>
      <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2, WebkitOverflowScrolling: "touch" }}>
        <button onClick={() => setKind("all")} style={{ ...chip(kind === "all"), whiteSpace: "nowrap" }}>All · {items.length}</button>
        {counts.map((k) => <button key={k.key} onClick={() => setKind(k.key)} style={{ ...chip(kind === k.key), whiteSpace: "nowrap" }}>{k.plural} · {k.n}</button>)}
      </div>

      {shown.length === 0 && (
        <div className="cc-card"><div className="cc-card-body" style={{ fontSize: 15, color: "var(--ink-3)", lineHeight: 1.6 }}>
          {items.length === 0 ? "Empty. Import a CSV export from your current password manager below, or add the first item with +." : q ? `Nothing matches “${query}”.` : "Nothing of this kind yet."}
        </div></div>
      )}
      {shown.length > 0 && (
        <section className="cc-card">
          {shown.map((it, i) => (
            <button key={it.id} onClick={() => setOpen({ item: it, isNew: false })}
              style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, alignItems: "center", width: "100%", minHeight: 58, padding: "8px 16px", background: "transparent", border: "none", borderBottom: i < shown.length - 1 ? "1px solid var(--line)" : "none", textAlign: "left", color: "inherit", font: "inherit", cursor: "pointer", WebkitTapHighlightColor: "transparent" }}>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 17, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.name}</span>
                <span style={{ display: "block", fontSize: 14, color: "var(--ink-3)", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {it.kind === "recovery" ? `${(it.codes ?? []).length} codes${it.username ? ` · ${it.username}` : ""}` : it.kind === "note" ? "secure note" : it.username ?? (it.kind === "apikey" ? "API key" : "no username")}
                </span>
              </span>
              <span style={{ fontSize: 12, color: "var(--ink-4)", fontFamily: "var(--f-mono)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{it.kind === "apikey" ? "key" : it.kind === "recovery" ? "codes" : it.kind === "note" ? "note" : ""}</span>
            </button>
          ))}
        </section>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button className="cc-btn cc-btn-secondary" onClick={() => setImporting(true)} style={{ minHeight: 46, padding: "0 16px", fontSize: 15 }}>Import CSV</button>
        <button className="cc-btn cc-btn-ghost" onClick={() => { setChanging((v) => !v); setPass(""); setPass2(""); setError(null); }} style={{ minHeight: 46, padding: "0 14px", fontSize: 15 }}>{changing ? "Cancel" : "Change passphrase"}</button>
      </div>
      {changing && (
        <div className="cc-card"><div className="cc-card-body" style={{ display: "grid", gap: 10 }}>
          <PassphraseInput value={pass} onChange={setPass} placeholder="New passphrase" autoComplete="new-password" autoFocus />
          <StrengthBar value={pass} />
          <PassphraseInput value={pass2} onChange={setPass2} placeholder="Type it again" autoComplete="new-password" onEnter={changePassphrase} />
          {error && <div role="alert" style={{ color: "var(--neg)", fontSize: 14.5 }}>{error}</div>}
          <button className="cc-btn cc-btn-primary" onClick={changePassphrase} disabled={busy || !pass || !pass2} style={{ minHeight: 48, borderRadius: 12, fontSize: 16 }}>{busy ? `Re-encrypting ${items.length} items…` : "Change and re-encrypt everything"}</button>
        </div></div>
      )}
      <div style={{ fontSize: 13.5, color: "var(--ink-4)", lineHeight: 1.55 }}>
        Encrypted on this phone (AES-256-GCM, key from your passphrase with PBKDF2 · 600 000 rounds). The server stores scrambled text only. Copying puts a secret on the iPhone clipboard, which Universal Clipboard may share with your Mac for a couple of minutes.
      </div>

      {open && <ItemSheet item={open.item} emails={emails} isNew={open.isNew} onSave={saveItem} onDelete={() => (open.isNew ? Promise.resolve() : deleteItem(open.item.id))} onClose={() => setOpen(null)} />}
      {importing && <ImportSheet existing={items} onImport={importRows} onClose={() => setImporting(false)} />}
    </div>
  );
}
