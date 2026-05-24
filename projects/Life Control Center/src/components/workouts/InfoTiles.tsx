"use client";

const DAY_LABELS: Record<string, string> = {
  mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun",
};

interface Plan {
  id: number;
  name: string;
  assignedDays: string | null;
  targetMuscles: string | null;
  exerciseCount: number;
}

interface Props {
  plans: Plan[];
}

function parseDays(raw: string | null): string {
  if (!raw) return "No days set";
  try {
    const arr: string[] = JSON.parse(raw);
    return arr.length > 0 ? arr.map(d => DAY_LABELS[d] ?? d).join(", ") : "No days set";
  } catch { return "No days set"; }
}

function openDrawer(key: string) {
  window.dispatchEvent(new CustomEvent("open-workout-drawer", { detail: key }));
}

export default function InfoTiles({ plans }: Props) {
  return (
    <div className="info-tiles-grid" style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10, marginTop: 14 }}>
      {/* Workouts tile */}
      <button
        onClick={() => openDrawer("workouts")}
        className="cc-card"
        style={{ padding: 0, cursor: "pointer", textAlign: "left", border: "1px solid var(--line)", background: "var(--bg-card)" }}
      >
        <div className="cc-card-head">
          <div className="title">Workouts</div>
          <div className="tail">{plans.length}</div>
        </div>
        <div className="cc-card-body" style={{ minHeight: 120 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {plans.map(p => (
              <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <span style={{ fontSize: 13, color: "var(--ink)", fontWeight: 500 }}>{p.name}</span>
                <span style={{ fontSize: 10, color: "var(--ink-4)", fontFamily: "var(--f-mono)" }}>{parseDays(p.assignedDays)}</span>
              </div>
            ))}
          </div>
          <div style={{ marginTop: "auto", paddingTop: 16, fontSize: 10, color: "var(--cyan)", letterSpacing: "0.04em" }}>
            Manage →
          </div>
        </div>
      </button>
    </div>
  );
}
