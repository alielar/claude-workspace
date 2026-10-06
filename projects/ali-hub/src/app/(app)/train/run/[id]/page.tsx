"use client";

/**
 * /train/run/<hkId> · one Watch workout. For a run: distance · time · pace up top,
 * heart rate, climb and calories, the route drawn, the heart-rate line, then the
 * kilometre splits. A strength session shows the same header without the map.
 */

import Link from "next/link";
import { use } from "react";
import { useWorkoutDetail } from "@/lib/health/useHealth";
import { fmtDur, fmtPace, fmtTime, kindLabel, paceOf, workoutKind } from "@/lib/health/client";
import { HrLine, IntervalsTable, RouteMap, SplitsTable } from "@/components/health/charts";

function Stat({ label, value, big }: { label: string; value: string; big?: boolean }) {
  return (
    <div style={{ display: "grid", gap: 2, minWidth: 0 }}>
      <span className="tabular-nums" style={{ fontSize: big ? 30 : 20, fontWeight: 600, letterSpacing: "-0.02em", fontFamily: "var(--f-mono)", lineHeight: 1.1 }}>{value}</span>
      <span style={{ fontSize: 13, color: "var(--ink-3)" }}>{label}</span>
    </div>
  );
}

export default function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: w, loading } = useWorkoutDetail(decodeURIComponent(id));
  const kind = w ? workoutKind(w.type) : "run";
  const when = w ? new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Madrid" }).format(new Date(w.startMs)) : "";
  const pace = w ? paceOf(w) : null;
  const climb = w?.elevationM ?? (w?.splits.length ? w.splits.reduce((s, x) => s + (x.elevM ?? 0), 0) : null);

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div className="cc-pagetitle" style={{ marginBottom: 0 }}>
        <div>
          <Link href="/train" style={{ fontSize: 14, color: "var(--ink-3)", textDecoration: "none" }}>‹ Train</Link>
          <h1 style={{ fontSize: 26, fontWeight: 600, marginTop: 4 }}>{w ? kindLabel(w.type) : "…"}</h1>
          <div className="sub">{w ? `${when} · ${fmtTime(w.startMs)}${w.endMs ? ` to ${fmtTime(w.endMs)}` : ""}` : loading ? "loading" : "not found"}</div>
        </div>
      </div>

      {w && (
        <section className="cc-card">
          <div className="cc-card-body" style={{ display: "grid", gap: 16 }}>
            <div style={{ display: "grid", gridTemplateColumns: kind === "run" ? "1fr 1fr 1fr" : "1fr 1fr", gap: 12 }}>
              {kind === "run" && <Stat big label="km" value={w.distanceKm === null ? "—" : w.distanceKm.toFixed(2)} />}
              <Stat big label="time" value={fmtDur(w.durationSec)} />
              {kind === "run" ? <Stat big label="pace / km" value={fmtPace(pace)} /> : <Stat big label="calories" value={w.activeKcal !== null ? `${w.activeKcal}` : "—"} />}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
              <Stat label="avg bpm" value={w.hrAvg !== null ? `${w.hrAvg}` : "—"} />
              <Stat label="max bpm" value={w.hrMax !== null ? `${w.hrMax}` : "—"} />
              {kind === "run" ? <Stat label="climb" value={climb !== null ? `${climb} m` : "—"} /> : <Stat label="min bpm" value={w.hrMin !== null ? `${w.hrMin}` : "—"} />}
              <Stat label="kcal" value={w.activeKcal !== null ? `${w.activeKcal}` : "—"} />
            </div>
          </div>
        </section>
      )}

      {w && w.route.length > 1 && (
        <section className="cc-card">
          <div className="cc-card-head"><span className="title">Route</span><span className="tail">{w.route.length > 1 ? "start green · finish black · a ring per km" : ""}</span></div>
          <div className="cc-card-body"><RouteMap route={w.route} /></div>
        </section>
      )}

      {w && w.intervals.length > 1 && (
        <section className="cc-card">
          <div className="cc-card-head"><span className="title">Intervals</span><span className="tail">fastest in green</span></div>
          <div className="cc-card-body" style={{ paddingTop: 4 }}><IntervalsTable intervals={w.intervals} fmtPace={fmtPace} /></div>
        </section>
      )}

      {w && w.splits.length > 0 && (
        <section className="cc-card">
          <div className="cc-card-head"><span className="title">Splits</span><span className="tail">fastest in green</span></div>
          <div className="cc-card-body" style={{ paddingTop: 4 }}><SplitsTable splits={w.splits} fmtPace={fmtPace} /></div>
        </section>
      )}

      {w && w.hr.length > 2 && (
        <section className="cc-card">
          <div className="cc-card-head"><span className="title">Heart rate</span><span className="tail">tap to read</span></div>
          <div className="cc-card-body"><HrLine hr={w.hr} startMs={w.startMs} /></div>
        </section>
      )}

      {w && kind === "run" && !w.route.length && !w.splits.length && (
        <div style={{ fontSize: 14, color: "var(--ink-3)", padding: "0 2px" }}>No route for this run · Health Auto Export sends it when &ldquo;Include Route Data&rdquo; is on.</div>
      )}
      {!w && loading && <div className="cc-skeleton" style={{ height: 160 }} />}
    </div>
  );
}
