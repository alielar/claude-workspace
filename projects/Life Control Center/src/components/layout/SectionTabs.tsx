"use client";

/**
 * SectionTabs — top tab row for a grouped section (Mind, Wellbeing).
 * Active tab shows an accent underline; switching is handled by the parent.
 */

export type SectionTab = { key: string; label: string; color: string };

interface Props {
  tabs: SectionTab[];
  active: number;
  onChange: (index: number) => void;
}

export function SectionTabs({ tabs, active, onChange }: Props) {
  return (
    <div className="section-tabs" role="tablist" aria-label="Section">
      {tabs.map((t, i) => (
        <button
          key={t.key}
          role="tab"
          type="button"
          aria-selected={i === active}
          className={`section-tab${i === active ? " cur" : ""}`}
          style={{ "--accent": t.color } as React.CSSProperties}
          onClick={() => onChange(i)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
