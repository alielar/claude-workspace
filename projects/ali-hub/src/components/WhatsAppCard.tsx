"use client";

/**
 * Settings → WhatsApp (2026-10-10) · to-dos as WhatsApp messages through CallMeBot, free, per account.
 * Setup in two taps: the first button opens WhatsApp on CallMeBot's number with the activation sentence
 * already typed; CallMeBot answers with an API key; the number and the key go in the two fields.
 * When it is on, the phone push nags stop for this account and the WhatsApp rules apply (server.ts header).
 */

import { useEffect, useState } from "react";
import type { WaStatus } from "@/lib/whatsapp/server";

export function WhatsAppCard() {
  const [st, setSt] = useState<WaStatus | null>(null);
  const [phone, setPhone] = useState("");
  const [key, setKey] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState(false);
  const load = () => fetch("/api/whatsapp").then((r) => r.json()).then((d: WaStatus) => { setSt(d); if (d.phone) setPhone(d.phone); }).catch(() => {});
  useEffect(() => { load(); }, []);
  const save = async () => {
    setBusy(true); setMsg(null);
    const r = await fetch("/api/whatsapp", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone, apikey: key }) });
    const d = await r.json().catch(() => null) as (WaStatus & { error?: string }) | null;
    if (!r.ok) { setMsg(d?.error ?? "Could not save."); setBusy(false); return; }
    setSt(d); setKey(""); setEdit(false); setBusy(false);
    setMsg("Saved · send a test.");
  };
  const test = async () => {
    setBusy(true); setMsg("Sending…");
    const d = await fetch("/api/whatsapp", { method: "POST" }).then((r) => r.json()).catch(() => null) as { ok?: boolean; error?: string; status?: WaStatus } | null;
    if (d?.status) setSt(d.status);
    setMsg(d?.ok ? "Sent · it should arrive on WhatsApp within a minute." : d?.error ?? "Nothing sent.");
    setBusy(false);
  };
  const remove = async () => {
    if (!confirm("Turn WhatsApp reminders off?")) return;
    const d = await fetch("/api/whatsapp", { method: "DELETE" }).then((r) => r.json()).catch(() => null) as WaStatus | null;
    if (d) setSt(d); setMsg(null); setPhone(""); setKey("");
  };
  const input: React.CSSProperties = { fontSize: 16, minHeight: 46, width: "100%", boxSizing: "border-box" };
  const on = !!st?.on;
  return (
    <section className="cc-card">
      <div className="cc-card-head"><span className="title">WhatsApp</span><span className="tail" style={on ? { color: "var(--pos)" } : undefined}>{st ? (on ? `on · ${st.phone}` : "off") : "…"}</span></div>
      <div className="cc-card-body" style={{ display: "grid", gap: 12, fontSize: 14, color: "var(--ink-3)", lineHeight: 1.5 }}>
        {on && !edit ? (
          <>
            <p style={{ margin: 0 }}>Your to-dos arrive here: a list at 09:00, a message at a to-do&apos;s hour with one follow-up, a list of what is still open at 19:00. Phone reminders are off while this is on.</p>
            {st?.lastError && <p style={{ margin: 0, color: "var(--warn)" }}>Last send failed · {st.lastError}</p>}
            {st?.lastSentAt && !st.lastError && <p style={{ margin: 0 }}>Last message {new Date(st.lastSentAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</p>}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button className="cc-btn cc-btn-secondary" onClick={test} disabled={busy}>Send a test</button>
              <button className="cc-btn cc-btn-ghost" onClick={() => setEdit(true)}>Change</button>
              <button className="cc-btn cc-btn-ghost" onClick={remove} style={{ color: "var(--neg)" }}>Turn off</button>
            </div>
          </>
        ) : (
          <>
            <ol style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 8 }}>
              <li>Tap the button, WhatsApp opens on CallMeBot with the sentence ready, press send.
                <div style={{ marginTop: 8 }}>
                  <a href={st?.activationLink ?? "#"} target="_blank" rel="noopener noreferrer" className="cc-btn cc-btn-primary" style={{ textDecoration: "none", display: "inline-flex", alignItems: "center", minHeight: 44 }}>Open WhatsApp · activate</a>
                </div>
                <div style={{ marginTop: 6, fontSize: 13, color: "var(--ink-4)" }}>By hand: save {st?.number ?? "+34 644 95 73 56"} as a contact and send it &quot;{st?.activation ?? "I allow callmebot to send me messages"}&quot;.</div>
              </li>
              <li>CallMeBot replies with an API key (a number). Enter it here with your WhatsApp number.</li>
            </ol>
            <label style={{ display: "grid", gap: 4 }}>Your WhatsApp number · with the country code
              <input className="cc-input" style={input} type="tel" inputMode="tel" placeholder="+212 6 12 34 56 78" value={phone} onChange={(e) => setPhone(e.target.value)} /></label>
            <label style={{ display: "grid", gap: 4 }}>API key from CallMeBot
              <input className="cc-input" style={input} inputMode="numeric" placeholder="123456" value={key} onChange={(e) => setKey(e.target.value)} /></label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button className="cc-btn cc-btn-primary" onClick={save} disabled={busy || !phone.trim() || !key.trim()}>Save</button>
              {on && <button className="cc-btn cc-btn-ghost" onClick={() => { setEdit(false); setMsg(null); }}>Cancel</button>}
            </div>
          </>
        )}
        {msg && <p style={{ margin: 0 }}>{msg}</p>}
      </div>
    </section>
  );
}
