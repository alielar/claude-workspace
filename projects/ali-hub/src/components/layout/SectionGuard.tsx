"use client";

/**
 * Wraps a section only Ali has (Train, Health, R2-D2 · src/lib/profile/types.ts). The navigation never
 * shows it to a guest; typed by address it shows one quiet card instead of a page full of empty
 * Speediance and Watch cards. While the profile is loading the children render, so Ali never waits.
 */

import Link from "next/link";
import { useProfile } from "@/lib/profile/useProfile";
import type { Section } from "@/lib/profile/types";

export function SectionGuard({ section, children }: { section: Section; children: React.ReactNode }) {
  const { me, has } = useProfile();
  if (!me || has(section)) return <>{children}</>;
  return (
    <section className="cc-card" style={{ maxWidth: 480 }}>
      <div className="cc-card-body" style={{ display: "grid", gap: 10 }}>
        <span style={{ fontSize: 17, fontWeight: 600 }}>Not part of your hub</span>
        <span style={{ fontSize: 15, color: "var(--ink-2)", lineHeight: 1.5 }}>This section is set up for Ali&apos;s own training and devices.</span>
        <Link href="/today" className="cc-btn cc-btn-secondary" style={{ justifySelf: "start", textDecoration: "none" }}>Back to Today</Link>
      </div>
    </section>
  );
}
