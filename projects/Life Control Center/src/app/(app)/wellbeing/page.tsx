"use client";

/**
 * Wellbeing — one section, three tabs: Mood · Sleep · Journal.
 * Sleep (the middle tab) is the default. Each tab renders the existing
 * page in embedded mode (its own title hidden) with a small fade transition.
 */

import { useState } from "react";
import { SectionTabs, type SectionTab } from "@/components/layout/SectionTabs";
import MoodPage from "@/app/(app)/mood/page";
import SleepPage from "@/app/(app)/sleep/page";
import JournalPage from "@/app/(app)/journal/page";

const TABS: (SectionTab & { Component: React.ComponentType<{ embedded?: boolean }> })[] = [
  { key: "mood",    label: "Mood",    color: "#FFC15C", Component: MoodPage },
  { key: "sleep",   label: "Sleep",   color: "#818CF8", Component: SleepPage },
  { key: "journal", label: "Journal", color: "#FB923C", Component: JournalPage },
];

export default function WellbeingPage() {
  const [active, setActive] = useState(1); // Sleep — middle, default
  const Active = TABS[active].Component;

  return (
    <div>
      <SectionTabs tabs={TABS} active={active} onChange={setActive} />
      <div key={active} className="section-panel">
        <Active embedded />
      </div>
    </div>
  );
}
