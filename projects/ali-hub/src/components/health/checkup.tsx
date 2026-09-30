"use client";

/**
 * The Health tab's motion pieces (2026-09-30, "show me your motion skills"): a three-arc ring
 * that draws itself on open, small progress rings for the day's activity, numbers that count up
 * to their value, and a panel that folds open. All CSS or one requestAnimationFrame loop, no
 * library. `prefers-reduced-motion` turns every one of them into a plain paint.
 */

import { useEffect, useState, type ReactNode } from "react";
import { signalColor, type Signal, type SignalState } from "@/lib/health/client";

function reducedMotion(): boolean {
  try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; }
}

/** True one frame after mount · flips the CSS transitions that draw the rings. */
export function useDrawn(): boolean {
  const [drawn, setDrawn] = useState(false);
  useEffect(() => {
    let inner = 0;
    const outer = requestAnimationFrame(() => { if (reducedMotion()) setDrawn(true); else inner = requestAnimationFrame(() => setDrawn(true)); });
    return () => { cancelAnimationFrame(outer); cancelAnimationFrame(inner); };
  }, []);
  return drawn;
}

/** A number that counts up to `target` in `ms` (ease-out), re-runs only when the target changes. */
export function useCountUp(target: number | null, ms = 800): number | null {
  const [v, setV] = useState<number | null>(null);
  useEffect(() => {
    // Every write happens inside a frame callback, never in the effect body itself.
    let raf = 0;
    if (target === null || reducedMotion()) { raf = requestAnimationFrame(() => setV(target)); return () => cancelAnimationFrame(raf); }
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - p, 3);
      setV(target * e);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}

export function CountUp({ value, fmt, ms }: { value: number | null; fmt: (v: number) => string; ms?: number }) {
  const v = useCountUp(value, ms);
  return <>{value === null ? "—" : fmt(v ?? 0)}</>;
}

const polar = (cx: number, cy: number, r: number, deg: number): [number, number] => {
  const a = ((deg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
};
function arcPath(cx: number, cy: number, r: number, a0: number, a1: number): string {
  const [x0, y0] = polar(cx, cy, r, a0), [x1, y1] = polar(cx, cy, r, a1);
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

/**
 * The checkup ring: one arc per signal (Recovery · Sleep · Movement), each in its state's colour,
 * drawn one after the other when the page opens. A waiting signal draws in the track colour.
 */
export function CheckupRing({ signals, size = 116, onPick }: { signals: Signal[]; size?: number; onPick?: (s: Signal) => void }) {
  const drawn = useDrawn();
  const C = 60, R = 50, GAP = 14, span = 360 / signals.length - GAP;
  return (
    <svg viewBox="0 0 120 120" style={{ width: size, height: size, display: "block", flexShrink: 0 }} role="img" aria-label={signals.map((s) => `${s.label} ${s.state}`).join(", ")}>
      {signals.map((s, i) => {
        const a0 = i * (span + GAP) + GAP / 2, a1 = a0 + span;
        return (
          <g key={s.key} onClick={onPick ? () => onPick(s) : undefined} style={{ cursor: onPick ? "pointer" : undefined }}>
            <path d={arcPath(C, C, R, a0, a1)} fill="none" style={{ stroke: "var(--fill-2)", strokeWidth: 9 }} strokeLinecap="round" />
            <path d={arcPath(C, C, R, a0, a1)} fill="none" pathLength={100}
              style={{ stroke: signalColor(s.state), strokeWidth: 9, strokeDasharray: 100, strokeDashoffset: drawn ? 0 : 100, transition: `stroke-dashoffset 720ms cubic-bezier(.22,.61,.36,1) ${140 + i * 260}ms`, opacity: s.state === "wait" ? 0 : 1 }}
              strokeLinecap="round" />
          </g>
        );
      })}
    </svg>
  );
}

/** A small progress ring with the number inside · `value / target`, capped at a full turn. */
export function MiniRing({ value, target, fmt, label, sub, size = 74, color = "var(--violet)" }: {
  value: number | null; target: number | null; fmt: (v: number) => string; label: string; sub?: string; size?: number; color?: string;
}) {
  const drawn = useDrawn();
  const frac = value === null || !target ? 0 : Math.max(0, Math.min(1, value / target));
  const full = frac >= 1;
  return (
    <div style={{ display: "grid", justifyItems: "center", gap: 6, minWidth: 0 }}>
      <div style={{ position: "relative", width: size, height: size }}>
        <svg viewBox="0 0 80 80" style={{ width: size, height: size, display: "block", transform: "rotate(-90deg)" }} aria-hidden>
          <circle cx={40} cy={40} r={34} fill="none" style={{ stroke: "var(--fill-2)", strokeWidth: 7 }} />
          <circle cx={40} cy={40} r={34} fill="none" pathLength={100} strokeLinecap="round"
            style={{ stroke: full ? "var(--pos)" : color, strokeWidth: 7, strokeDasharray: 100, strokeDashoffset: drawn ? 100 - frac * 100 : 100, transition: "stroke-dashoffset 900ms cubic-bezier(.22,.61,.36,1) 200ms, stroke 300ms" }} />
        </svg>
        <div className="tabular-nums" style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", fontSize: size >= 74 ? 17 : 15, fontWeight: 600, letterSpacing: "-0.01em", color: "var(--ink)" }}>
          <CountUp value={value} fmt={fmt} />
        </div>
      </div>
      <div style={{ display: "grid", justifyItems: "center", gap: 1, minWidth: 0, maxWidth: "100%" }}>
        <span style={{ fontSize: 13, color: "var(--ink-2)", whiteSpace: "nowrap" }}>{label}</span>
        {sub && <span className="tabular-nums" style={{ fontSize: 12, color: full ? "var(--pos)" : "var(--ink-4)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" }}>{sub}</span>}
      </div>
    </div>
  );
}

/** A coloured dot for a signal state · pulses once when it is off. */
export function StateDot({ state, size = 8 }: { state: SignalState; size?: number }) {
  return (
    <span aria-hidden style={{ position: "relative", display: "inline-block", width: size, height: size, borderRadius: "50%", background: signalColor(state), flexShrink: 0 }}>
      {state === "off" && <span className="cc-h-pulse" style={{ position: "absolute", inset: -2, borderRadius: "50%", border: `1.5px solid ${signalColor(state)}` }} />}
    </span>
  );
}

/** A panel that folds open and closed (grid-rows transition, CSS in globals). */
export function Fold({ open, children }: { open: boolean; children: ReactNode }) {
  return (
    <div className="cc-h-fold" data-open={open ? "true" : "false"} aria-hidden={!open}>
      <div>{children}</div>
    </div>
  );
}

/** Cards rise in one after the other when the page opens. */
export function Reveal({ i, children, id }: { i: number; children: ReactNode; id?: string }) {
  return <div id={id} className="cc-h-in" style={{ animationDelay: `${60 + i * 70}ms`, scrollMarginTop: 72 }}>{children}</div>;
}
