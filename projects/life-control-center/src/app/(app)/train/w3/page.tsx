"use client";

/**
 * /train/w3 · Workout 3: the 6-round kettlebell circuit (2026-09-08, from Ali's reel).
 * Played as the same 30-min AMRAP game; 6 rounds is the reel's target. The details
 * card carries the reel's weight guide, scaling and movement cues, and the reel link
 * is dismissible forever once the movements are learned.
 */

import { AmrapGame } from "@/components/train/AmrapGame";
import { W3_DETAILS } from "@/lib/train/types";
import { ReelRow, useReelDismissals } from "@/components/ReelLink";

function W3Details() {
  const reels = useReelDismissals();
  const d = W3_DETAILS;
  return (
    <section className="cc-card">
      <div className="cc-card-head"><span className="title">How this one works</span><span className="tail">target: {d.targetRounds} rounds</span></div>
      <div className="cc-card-body" style={{ display: "grid", gap: 12, fontSize: 15, color: "var(--ink-2)", lineHeight: 1.5 }}>
        <p style={{ margin: 0 }}>
          Aim for <b>{d.targetRounds} clean rounds</b>, resting as needed. The reel uses {d.referenceWeightKg} kg;
          you lift your 12 kg until every movement is mastered, then go up.
        </p>
        <p style={{ margin: 0, fontSize: 14, color: "var(--ink-3)" }}>{d.weightGuide}</p>

        {reels.ready && !reels.isDismissed(d.reel.id) && (
          <ReelRow id={d.reel.id} label={d.reel.label} url={d.reel.url} dismissed={reels.isDismissed(d.reel.id)} onDismiss={reels.dismiss} />
        )}

        <div>
          <div style={{ fontSize: 13, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ink-4)", fontFamily: "var(--f-mono)", marginBottom: 6 }}>Movement cues</div>
          {d.cues.map(([name, cue]) => (
            <div key={name} style={{ padding: "6px 0", borderBottom: "1px solid var(--line)" }}>
              <div style={{ fontWeight: 500, color: "var(--ink)" }}>{name}</div>
              <div style={{ fontSize: 14, color: "var(--ink-3)" }}>{cue}</div>
            </div>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <div style={{ fontSize: 13, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ink-4)", fontFamily: "var(--f-mono)", marginBottom: 4 }}>Easier</div>
            {d.easier.map((x) => <div key={x} style={{ fontSize: 14, color: "var(--ink-3)", padding: "2px 0" }}>· {x}</div>)}
          </div>
          <div>
            <div style={{ fontSize: 13, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ink-4)", fontFamily: "var(--f-mono)", marginBottom: 4 }}>Harder</div>
            {d.harder.map((x) => <div key={x} style={{ fontSize: 14, color: "var(--ink-3)", padding: "2px 0" }}>· {x}</div>)}
          </div>
        </div>
      </div>
    </section>
  );
}

export default function W3Page() {
  return <AmrapGame workoutKey="w3" details={<W3Details />} />;
}
