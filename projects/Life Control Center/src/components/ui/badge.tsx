import { cn } from "@/lib/utils";
import { type CSSProperties } from "react";

interface BadgeProps {
  children: React.ReactNode;
  color?: string;    // CSS color value
  bg?: string;       // CSS background value
  className?: string;
  style?: CSSProperties;
}

export function Badge({ children, color, bg, className, style }: BadgeProps) {
  return (
    <span
      className={cn("badge", className)}
      style={{
        color: color ?? "var(--text-secondary)",
        background: bg ?? "var(--bg-elevated-2)",
        border: `1px solid ${color ? color + "28" : "var(--border-subtle)"}`,
        ...style,
      }}
    >
      {children}
    </span>
  );
}

/** Preset status badges */
export function StatusBadge({ status }: { status: "active" | "done" | "paused" | "new" | string }) {
  const configs: Record<string, { color: string; bg: string; label: string }> = {
    active:  { color: "var(--success)",          bg: "var(--success-glow)",           label: "Active" },
    done:    { color: "var(--success)",          bg: "var(--success-glow)",           label: "Done" },
    paused:  { color: "var(--warning)",          bg: "var(--warning-glow)",           label: "Paused" },
    new:     { color: "var(--accent-bright)",    bg: "var(--accent-primary-glow)",    label: "New" },
    reading: { color: "var(--module-library)",   bg: "rgba(167,139,250,0.12)",        label: "Reading" },
    finished:{ color: "var(--success)",          bg: "var(--success-glow)",           label: "Finished" },
    not_started:{ color: "var(--text-tertiary)", bg: "var(--bg-elevated-2)",          label: "Not started" },
    mastered:{ color: "var(--success)",          bg: "var(--success-glow)",           label: "Mastered" },
    learning:{ color: "var(--warning)",          bg: "var(--warning-glow)",           label: "Learning" },
  };
  const cfg = configs[status] ?? { color: "var(--text-tertiary)", bg: "var(--bg-elevated-2)", label: status };
  return <Badge color={cfg.color} bg={cfg.bg}>{cfg.label}</Badge>;
}
