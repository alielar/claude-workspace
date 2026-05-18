"use client";

/**
 * /finance — Net worth tracker. V2 Ambient Futurism design.
 * Layout: 1fr / 360px — left: NW hero + chart + breakdown tables; right: 12m delta + goals + audit log.
 * Uses localStorage for persistence until backend is added.
 */

import { useEffect, useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

type Asset = {
  id: string;
  name: string;
  sub?: string;
  category: "Cash" | "Equity" | "Bonds" | "Crypto" | "RE" | "Other";
  value: number;
  mom: number; // month-over-month change in €
  updated: string;
};

type Liability = {
  id: string;
  name: string;
  sub?: string;
  category: string;
  value: number;
  mom: number;
};

type Snapshot = {
  date: string; // YYYY-MM
  netWorth: number;
  assets: Asset[];
  liabilities: Liability[];
};

// Demo seed data — used if no localStorage entry
const DEMO_ASSETS: Asset[] = [
  { id: "a1", name: "N26 / Revolut",    sub: "checking",      category: "Cash",   value: 18500, mom: -600,  updated: "May 1" },
  { id: "a2", name: "Vanguard IB",      sub: "VWCE",          category: "Equity", value: 62400, mom: 2100,  updated: "May 1" },
  { id: "a3", name: "Treasury bonds",   sub: "EU 10y",        category: "Bonds",  value: 19600, mom: 180,   updated: "May 1" },
  { id: "a4", name: "BTC",              sub: "cold wallet",   category: "Crypto", value: 9400,  mom: 820,   updated: "May 1" },
  { id: "a5", name: "ETH",              sub: undefined,       category: "Crypto", value: 3000,  mom: 340,   updated: "May 1" },
  { id: "a6", name: "Casablanca apt",   sub: "deposit equity",category: "RE",     value: 10530, mom: 160,   updated: "May 1" },
  { id: "a7", name: "Pension",          sub: "company plan",  category: "Other",  value: 4000,  mom: 400,   updated: "May 1" },
];

const DEMO_LIABILITIES: Liability[] = [
  { id: "l1", name: "Amex Gold", sub: "due 20 May", category: "CC", value: 1200, mom: -200 },
];

// Category colors for allocation bar
const CAT_COLORS: Record<string, string> = {
  Cash:   "#7EE7FF",
  Equity: "#B388FF",
  Bonds:  "#9AA8D6",
  Crypto: "#FFC15C",
  RE:     "#6FD49A",
  Other:  "rgba(255,255,255,0.15)",
};

// Range labels for chart tabs
const RANGES = ["3M","6M","1Y","2Y","ALL"];

// Format a number as currency with K/M suffix
function fmtVal(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return `${n.toLocaleString()}`;
}

function fmtFull(n: number): string {
  return n.toLocaleString("en-EU");
}

export default function FinancePage() {
  const [assets, setAssets]           = useState<Asset[]>(DEMO_ASSETS);
  const [liabilities, setLiabilities] = useState<Liability[]>(DEMO_LIABILITIES);
  const [range, setRange]             = useState("2Y");

  // Load from localStorage (if the user has saved custom data)
  useEffect(() => {
    try {
      const raw = localStorage.getItem("cc_finance_snapshot");
      if (raw) {
        const snap: Snapshot = JSON.parse(raw);
        setAssets(snap.assets);
        setLiabilities(snap.liabilities);
      }
    } catch { /* ignore */ }
  }, []);

  // ─── Computed values ──────────────────────────────────────────────────────
  const totalAssets      = assets.reduce((s, a) => s + a.value, 0);
  const totalLiabilities = liabilities.reduce((s, l) => s + l.value, 0);
  const netWorth         = totalAssets - totalLiabilities;
  const momChange        = assets.reduce((s, a) => s + a.mom, 0) + liabilities.reduce((s, l) => s + l.mom, 0);
  const momPct           = netWorth > 0 ? ((momChange / (netWorth - momChange)) * 100).toFixed(1) : "0";

  // Allocation breakdown
  type AllocMap = Record<string, number>;
  const alloc: AllocMap = assets.reduce((acc: AllocMap, a) => {
    acc[a.category] = (acc[a.category] ?? 0) + a.value;
    return acc;
  }, {} as AllocMap);

  const now      = new Date();
  const monthStr = now.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  return (
    <div style={{ padding: "0 0 40px" }}>

      {/* Page title */}
      <div className="cc-pagetitle" style={{ marginBottom: 20 }}>
        <div>
          <h1>Net <span className="grad-text">Worth</span>.</h1>
          <div className="sub">Monthly snapshots · manual log · {assets.length} assets tracked</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="cc-btn cc-btn-ghost">Audit log</button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: 14 }}>

        {/* ── LEFT ─────────────────────────────────────────────────── */}
        <div>
          {/* NW hero */}
          <div className="cc-card" style={{
            padding: "36px 40px 32px", marginBottom: 14,
            background: "radial-gradient(60% 80% at 0% 0%, rgba(179,136,255,0.14), transparent 60%), radial-gradient(50% 80% at 100% 100%, rgba(111,212,154,0.10), transparent 60%), var(--bg-card)",
          }}>
            {/* Label */}
            <div style={{ fontSize: 11, letterSpacing: "0.20em", textTransform: "uppercase", color: "var(--ink-3)", fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 6, height: 6, borderRadius: "99px", background: "var(--cyan)", boxShadow: "0 0 6px var(--cyan)", display: "inline-block" }} />
              Net worth · {monthStr}
            </div>

            {/* Big number row */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 24 }}>
              <div>
                {/* 96px gradient number */}
                <div style={{
                  fontSize: 96, fontWeight: 200, letterSpacing: "-0.05em", lineHeight: 0.9, marginTop: 6,
                  background: "var(--grad)", WebkitBackgroundClip: "text", color: "transparent",
                  filter: "drop-shadow(0 0 28px rgba(179,136,255,0.22))", fontFamily: "var(--f-mono)",
                }}>
                  <span style={{ fontSize: 36, WebkitTextFillColor: "var(--ink-3)", color: "var(--ink-3)", marginRight: 8, fontWeight: 300 }}>€</span>
                  {fmtFull(netWorth)}
                </div>
                {/* MoM change */}
                <div style={{ fontSize: 18, fontWeight: 500, color: momChange >= 0 ? "var(--pos)" : "var(--neg)", letterSpacing: "-0.01em", fontFamily: "var(--f-mono)", display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
                  <span style={{ display: "inline-flex", width: 24, height: 24, borderRadius: "99px", background: momChange >= 0 ? "rgba(111,212,154,0.15)" : "rgba(255,138,138,0.15)", alignItems: "center", justifyContent: "center" }}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      {momChange >= 0 ? <polyline points="18 15 12 9 6 15"/> : <polyline points="6 9 12 15 18 9"/>}
                    </svg>
                  </span>
                  {momChange >= 0 ? "+" : ""}€{fmtFull(Math.abs(momChange))} this month
                  <span style={{ fontSize: 14, color: "var(--ink-3)", fontWeight: 400 }}>· {momChange >= 0 ? "+" : ""}{momPct}% MoM</span>
                </div>
                <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 8, letterSpacing: "0.02em", fontFamily: "var(--f-mono)" }}>
                  Assets €{fmtFull(totalAssets)} · Liabilities €{fmtFull(totalLiabilities)}
                </div>
              </div>

              {/* Mini stats grid */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, auto)", gap: 24, textAlign: "right" }}>
                {[
                  { label: "Assets", value: `€${fmtFull(totalAssets)}`, change: `+€${fmtVal(assets.reduce((s,a) => s+(a.mom>0?a.mom:0),0))}`, pos: true },
                  { label: "Liabilities", value: `€${fmtFull(totalLiabilities)}`, change: `-€${fmtVal(liabilities.reduce((s,l) => s+(l.mom<0?Math.abs(l.mom):0),0))}`, pos: true },
                  { label: "Savings rate", value: "38%", change: "+3pp", pos: true },
                ].map((stat) => (
                  <div key={stat.label}>
                    <div style={{ fontSize: 9.5, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--ink-3)", fontWeight: 600 }}>{stat.label}</div>
                    <div style={{ fontSize: 20, fontWeight: 500, marginTop: 4, fontFamily: "var(--f-mono)" }}>{stat.value}</div>
                    <div style={{ fontSize: 10.5, color: stat.pos ? "var(--pos)" : "var(--neg)", marginTop: 2, fontFamily: "var(--f-mono)" }}>{stat.change}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Update banner */}
            <div style={{ marginTop: 18, padding: "12px 16px", border: "1px solid rgba(255,193,92,0.25)", borderRadius: 10, background: "rgba(255,193,92,0.06)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12.5 }}>
                <span style={{ width: 8, height: 8, borderRadius: "99px", background: "var(--warn)", boxShadow: "0 0 8px var(--warn)", flexShrink: 0, display: "inline-block" }} />
                <span><b>Time to log {now.toLocaleDateString("en-US",{month:"long",year:"numeric"})}.</b> Keep your snapshot up to date.</span>
              </div>
              <button className="cc-btn cc-btn-primary" style={{ padding: "7px 14px", fontSize: 12 }}>Update now →</button>
            </div>
          </div>

          {/* Chart card */}
          <div className="cc-card" style={{ padding: 28, marginBottom: 14 }}>
            <div className="cc-card-head">
              <div className="title">Net worth · 24 months</div>
              {/* Range tabs */}
              <div style={{ display: "inline-flex", border: "1px solid var(--line)", borderRadius: 8, padding: 2, background: "rgba(255,255,255,0.015)" }}>
                {RANGES.map((r) => (
                  <button
                    key={r}
                    onClick={() => setRange(r)}
                    style={{
                      padding: "5px 11px", fontSize: 11, color: range === r ? "var(--violet)" : "var(--ink-3)",
                      fontFamily: "var(--f-mono)", letterSpacing: "0.06em", cursor: "pointer", borderRadius: 6,
                      border: 0, background: range === r ? "rgba(179,136,255,0.15)" : "transparent",
                      transition: "all var(--t-1)",
                    }}
                  >{r}</button>
                ))}
              </div>
            </div>

            {/* SVG area chart — static representation */}
            <svg viewBox="0 0 800 260" preserveAspectRatio="none" style={{ width: "100%", height: 260, display: "block", marginTop: 16 }}>
              <defs>
                <linearGradient id="finGradFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="rgba(179,136,255,0.35)" />
                  <stop offset="100%" stopColor="rgba(179,136,255,0)" />
                </linearGradient>
                <linearGradient id="finGradStroke" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#B388FF" />
                  <stop offset="100%" stopColor="#7EE7FF" />
                </linearGradient>
              </defs>
              {/* Grid lines */}
              {[40,100,160,220].map((y) => (
                <line key={y} x1="60" x2="800" y1={y} y2={y} stroke="var(--line)" strokeWidth="1" />
              ))}
              {/* Y axis labels */}
              {[["€130K",44],["€115K",104],["€100K",164],["€ 85K",224]].map(([label,y]) => (
                <text key={String(y)} x="55" y={Number(y)} textAnchor="end" fontSize="9.5" fill="var(--ink-4)" fontFamily="var(--f-mono)" letterSpacing="0.06em">{label}</text>
              ))}
              {/* Area fill */}
              <path
                d="M 60,228 L 91,222 L 122,218 L 153,212 L 184,205 L 215,202 L 246,193 L 277,196 L 308,185 L 339,170 L 370,162 L 401,158 L 432,148 L 463,138 L 494,132 L 525,118 L 556,112 L 587,104 L 618,90 L 649,80 L 680,72 L 711,65 L 742,52 L 773,42 L 800,45 L 800,260 L 60,260 Z"
                fill="url(#finGradFill)"
              />
              {/* Line */}
              <path
                d="M 60,228 L 91,222 L 122,218 L 153,212 L 184,205 L 215,202 L 246,193 L 277,196 L 308,185 L 339,170 L 370,162 L 401,158 L 432,148 L 463,138 L 494,132 L 525,118 L 556,112 L 587,104 L 618,90 L 649,80 L 680,72 L 711,65 L 742,52 L 773,42 L 800,45"
                fill="none" stroke="url(#finGradStroke)" strokeWidth="2"
                style={{ filter: "drop-shadow(0 0 4px rgba(179,136,255,0.3))" }}
              />
              {/* Latest marker */}
              <line x1="773" y1="42" x2="773" y2="240" stroke="rgba(126,231,255,0.30)" strokeWidth="1" strokeDasharray="2 3" />
              <circle cx="773" cy="42" r="4" fill="var(--cyan)" style={{ filter: "drop-shadow(0 0 5px var(--cyan))" }} />
              {/* X axis labels */}
              {[["APR 24",60],["OCT 24",220],["APR 25",400],["OCT 25",580],["MAY 26",773]].map(([label,x]) => (
                <text key={String(x)} x={Number(x)} y="254" fontSize="9.5" fill="var(--ink-4)" fontFamily="var(--f-mono)" letterSpacing="0.06em" textAnchor={x === 773 ? "end" : "start"}>{label}</text>
              ))}
            </svg>
          </div>

          {/* Breakdown tables */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            {/* Assets */}
            <div className="cc-card" style={{ padding: 0, display: "flex", flexDirection: "column" }}>
              {/* Header */}
              <div style={{ padding: "18px 22px 12px", borderBottom: "1px solid var(--line)", display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
                <div style={{ fontSize: 11, fontWeight: 500, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--ink-3)", display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 5, height: 5, borderRadius: "99px", background: "var(--pos)", boxShadow: "0 0 6px var(--pos)", display: "inline-block" }} />
                  Assets
                </div>
                <div style={{ fontFamily: "var(--f-mono)", fontSize: 18, fontWeight: 500, letterSpacing: "-0.01em" }}>
                  <span style={{ color: "var(--ink-3)", fontSize: 13, marginRight: 3 }}>€</span>
                  {fmtFull(totalAssets)}
                </div>
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr>
                    <th style={{ fontSize: 9.5, fontWeight: 500, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--ink-3)", textAlign: "left", padding: "10px 18px 8px", borderBottom: "1px solid var(--line)" }}>Holding</th>
                    <th style={{ fontSize: 9.5, fontWeight: 500, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--ink-3)", textAlign: "left", padding: "10px 18px 8px", borderBottom: "1px solid var(--line)" }}>Cat.</th>
                    <th style={{ fontSize: 9.5, fontWeight: 500, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--ink-3)", textAlign: "right", padding: "10px 18px 8px", borderBottom: "1px solid var(--line)" }}>Value</th>
                    <th style={{ fontSize: 9.5, fontWeight: 500, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--ink-3)", textAlign: "right", padding: "10px 18px 8px", borderBottom: "1px solid var(--line)" }}>MoM</th>
                  </tr>
                </thead>
                <tbody>
                  {assets.map((a, i) => (
                    <tr key={a.id} style={{ borderBottom: i < assets.length - 1 ? "1px solid var(--line)" : "none" }}>
                      <td style={{ padding: "11px 18px", verticalAlign: "middle" }}>
                        <span style={{ color: "var(--ink)", fontWeight: 500 }}>{a.name}</span>
                        {a.sub && <span style={{ color: "var(--ink-3)", fontWeight: 400, fontSize: 11, marginLeft: 6 }}>{a.sub}</span>}
                      </td>
                      <td style={{ padding: "11px 18px", fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--ink-3)", fontFamily: "var(--f-mono)", fontWeight: 500, verticalAlign: "middle" }}>{a.category}</td>
                      <td style={{ padding: "11px 18px", textAlign: "right", fontFamily: "var(--f-mono)", color: "var(--ink)", fontSize: 13.5, letterSpacing: "-0.005em", fontWeight: 500, verticalAlign: "middle" }}>
                        <span style={{ color: "var(--ink-3)", fontSize: 11, marginRight: 2 }}>€</span>{fmtFull(a.value)}
                      </td>
                      <td style={{ padding: "11px 18px", textAlign: "right", fontFamily: "var(--f-mono)", fontSize: 10.5, letterSpacing: "0.04em", color: a.mom >= 0 ? "var(--pos)" : "var(--neg)", verticalAlign: "middle" }}>
                        {a.mom >= 0 ? "+" : ""}€{fmtVal(Math.abs(a.mom))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ padding: "8px 18px", background: "rgba(255,255,255,0.012)", borderTop: "1px solid var(--line)", textAlign: "center" }}>
                <button style={{ fontSize: 11.5, color: "var(--ink-3)", letterSpacing: "0.02em", background: "none", border: 0, cursor: "pointer", padding: "6px 10px", borderRadius: 6 }}>
                  + Add asset
                </button>
              </div>
            </div>

            {/* Liabilities + Allocation */}
            <div>
              {/* Liabilities */}
              <div className="cc-card" style={{ padding: 0, display: "flex", flexDirection: "column", marginBottom: 14 }}>
                <div style={{ padding: "18px 22px 12px", borderBottom: "1px solid var(--line)", display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
                  <div style={{ fontSize: 11, fontWeight: 500, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--ink-3)", display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ width: 5, height: 5, borderRadius: "99px", background: "var(--neg)", boxShadow: "0 0 6px var(--neg)", display: "inline-block" }} />
                    Liabilities
                  </div>
                  <div style={{ fontFamily: "var(--f-mono)", fontSize: 18, fontWeight: 500, letterSpacing: "-0.01em" }}>
                    <span style={{ color: "var(--ink-3)", fontSize: 13, marginRight: 3 }}>€</span>
                    {fmtFull(totalLiabilities)}
                  </div>
                </div>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr>
                      <th style={{ fontSize: 9.5, fontWeight: 500, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--ink-3)", textAlign: "left", padding: "10px 18px 8px", borderBottom: "1px solid var(--line)" }}>Holding</th>
                      <th style={{ fontSize: 9.5, fontWeight: 500, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--ink-3)", textAlign: "right", padding: "10px 18px 8px", borderBottom: "1px solid var(--line)" }}>Value</th>
                      <th style={{ fontSize: 9.5, fontWeight: 500, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--ink-3)", textAlign: "right", padding: "10px 18px 8px", borderBottom: "1px solid var(--line)" }}>MoM</th>
                    </tr>
                  </thead>
                  <tbody>
                    {liabilities.map((l, i) => (
                      <tr key={l.id} style={{ borderBottom: i < liabilities.length - 1 ? "1px solid var(--line)" : "none" }}>
                        <td style={{ padding: "11px 18px", verticalAlign: "middle" }}>
                          <span style={{ color: "var(--ink)", fontWeight: 500 }}>{l.name}</span>
                          {l.sub && <span style={{ color: "var(--ink-3)", fontWeight: 400, fontSize: 11, marginLeft: 6 }}>{l.sub}</span>}
                        </td>
                        <td style={{ padding: "11px 18px", textAlign: "right", fontFamily: "var(--f-mono)", color: "var(--ink)", fontSize: 13.5, letterSpacing: "-0.005em", fontWeight: 500, verticalAlign: "middle" }}>
                          <span style={{ color: "var(--ink-3)", fontSize: 11, marginRight: 2 }}>€</span>{fmtFull(l.value)}
                        </td>
                        <td style={{ padding: "11px 18px", textAlign: "right", fontFamily: "var(--f-mono)", fontSize: 10.5, letterSpacing: "0.04em", color: l.mom <= 0 ? "var(--pos)" : "var(--neg)", verticalAlign: "middle" }}>
                          {l.mom >= 0 ? "+" : ""}€{fmtVal(Math.abs(l.mom))}
                        </td>
                      </tr>
                    ))}
                    {liabilities.length === 0 && (
                      <tr><td colSpan={3} style={{ textAlign: "center", color: "var(--ink-3)", fontSize: 12, padding: 18 }}>No liabilities · great!</td></tr>
                    )}
                  </tbody>
                </table>
                <div style={{ padding: "8px 18px", background: "rgba(255,255,255,0.012)", borderTop: "1px solid var(--line)", textAlign: "center" }}>
                  <button style={{ fontSize: 11.5, color: "var(--ink-3)", letterSpacing: "0.02em", background: "none", border: 0, cursor: "pointer", padding: "6px 10px", borderRadius: 6 }}>
                    + Add liability
                  </button>
                </div>
              </div>

              {/* Allocation stack */}
              <div className="cc-card">
                <div className="cc-card-head">
                  <div className="title">Allocation</div>
                  <div className="tail">{monthStr}</div>
                </div>
                {/* Stack bar */}
                <div style={{ display: "flex", height: 8, borderRadius: 99, overflow: "hidden", background: "rgba(255,255,255,0.04)", marginTop: 8 }}>
                  {Object.entries(alloc).map(([cat, val]) => (
                    <span key={cat} style={{ flex: val, background: CAT_COLORS[cat] ?? "rgba(255,255,255,0.15)", height: "100%" }} />
                  ))}
                </div>
                {/* Legend */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 18px", marginTop: 14, fontSize: 11.5, fontFamily: "var(--f-mono)" }}>
                  {Object.entries(alloc).map(([cat, val]) => (
                    <div key={cat} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ color: "var(--ink-2)", display: "flex", alignItems: "center" }}>
                        <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, marginRight: 6, background: CAT_COLORS[cat] ?? "rgba(255,255,255,0.15)" }} />
                        {cat}
                      </span>
                      <span style={{ color: "var(--ink-3)", letterSpacing: "0.04em" }}>
                        {((val / totalAssets) * 100).toFixed(1)}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── RIGHT ───────────────────────────────────────────────── */}
        <div>
          {/* 12-month delta */}
          <div className="cc-card" style={{ marginBottom: 14 }}>
            <div className="cc-card-head"><div className="title">12-month delta</div><div className="tail">YoY view</div></div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 12.5 }}>
              {[
                { label: "May '25", value: "€97,830" },
                { label: "May '26", value: "€127,430" },
              ].map((row) => (
                <div key={row.label} style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "var(--ink-3)" }}>{row.label}</span>
                  <span style={{ fontFamily: "var(--f-mono)" }}>{row.value}</span>
                </div>
              ))}
              <div style={{ height: 1, background: "var(--line)", margin: "6px 0" }} />
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span className="grad-text" style={{ fontWeight: 500 }}>YoY change</span>
                <span style={{ fontFamily: "var(--f-mono)", color: "var(--pos)", fontWeight: 600 }}>+€29,600 · +30.3%</span>
              </div>
              {[
                { label: "Monthly avg", value: "+€2,467" },
                { label: "Best month",  value: "+€4,800 · Jan", color: "var(--pos)" },
                { label: "Worst month", value: "-€820 · Aug",   color: "var(--neg)" },
              ].map((row) => (
                <div key={row.label} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--ink-3)" }}>
                  <span>{row.label}</span>
                  <span style={{ fontFamily: "var(--f-mono)", color: row.color }}>{row.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Goals */}
          <div className="cc-card" style={{ marginBottom: 14 }}>
            <div className="cc-card-head"><div className="title">Goals</div><div className="tail">2026</div></div>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {[
                { label: "€150K by EOY",       pct: 85, note: "on pace · 7 months remaining", color: "var(--pos)" },
                { label: "40% savings rate",   pct: 95, note: "38% YTD · +3pp vs '25",        color: "var(--cyan)" },
                { label: "Emergency fund · 6mo", pct: 100, note: "covered · 7.2 months",       color: "var(--pos)" },
              ].map((goal) => (
                <div key={goal.label}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 12.5 }}>
                    <span>{goal.label}</span>
                    <span style={{ fontFamily: "var(--f-mono)", color: goal.color }}>{goal.pct}%</span>
                  </div>
                  <div className="cc-bar"><div className="fg" style={{ width: `${goal.pct}%` }} /></div>
                  <div style={{ fontSize: 10.5, color: "var(--ink-3)", marginTop: 4, fontFamily: "var(--f-mono)", letterSpacing: "0.02em" }}>
                    {goal.note}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Audit log */}
          <div className="cc-card">
            <div className="cc-card-head"><div className="title">Audit log</div><div className="tail">latest</div></div>
            <div style={{ fontSize: 12, display: "flex", flexDirection: "column", gap: 8, fontFamily: "var(--f-mono)", color: "var(--ink-2)" }}>
              {[
                { label: "+€820 BTC",       date: "MAY 1" },
                { label: "+€2,100 VWCE",    date: "MAY 1" },
                { label: "-€600 N26",       date: "MAY 1" },
                { label: "-€200 Amex",      date: "MAY 1" },
                { label: "Added pension €4K", date: "MAY 1" },
              ].map((log) => (
                <div key={log.label} style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>{log.label}</span>
                  <span style={{ fontSize: 10, color: "var(--ink-4)" }}>{log.date}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
