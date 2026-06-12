/**
 * SectionHub — landing page for a grouped section (Mind, Wellbeing).
 *
 * Renders a page title + a grid of cards. Each card links to one of the
 * underlying module pages (which keep their own routes).
 */

import Link from "next/link";
import { Icon } from "@/components/Icon";

export type HubCard = {
  href: string;
  label: string;
  icon: string;
  color: string;
  description: string;
};

interface Props {
  title: string;
  subtitle: string;
  cards: HubCard[];
}

export function SectionHub({ title, subtitle, cards }: Props) {
  return (
    <>
      <div className="cc-pagetitle">
        <div>
          <h1>{title}</h1>
          <div className="sub">{subtitle}</div>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: 18,
        }}
      >
        {cards.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className="cc-card hub-card"
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 14,
              padding: "22px 22px 20px",
              textDecoration: "none",
              minHeight: 188,
              transition: "border-color 0.18s var(--easeOut), transform 0.18s var(--easeOut)",
              "--accent": c.color,
            } as React.CSSProperties}
          >
            <span
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                background: `${c.color}1A`,
                border: `1px solid ${c.color}40`,
                color: c.color,
              }}
            >
              <Icon name={c.icon} size={22} strokeWidth={1.8} />
            </span>

            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 17, fontWeight: 500, color: "var(--ink)", marginBottom: 6 }}>
                {c.label}
              </div>
              <div style={{ fontSize: 13, color: "var(--ink-3)", lineHeight: 1.5 }}>
                {c.description}
              </div>
            </div>

            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontSize: 12.5,
                color: c.color,
                letterSpacing: "0.01em",
              }}
            >
              Open
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14" />
                <path d="m12 5 7 7-7 7" />
              </svg>
            </span>
          </Link>
        ))}
      </div>

      <style>{`
        .hub-card:hover { border-color: var(--accent) !important; transform: translateY(-2px); }
      `}</style>
    </>
  );
}
