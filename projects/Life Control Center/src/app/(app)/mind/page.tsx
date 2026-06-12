"use client";

/**
 * Mind — one section, three tabs: Words · Library · Knowledge.
 * Library (the middle tab) is the default. Each tab renders the existing
 * page in embedded mode (its own title hidden) with a small fade transition.
 */

import { useState } from "react";
import { SectionTabs, type SectionTab } from "@/components/layout/SectionTabs";
import WordbankPage from "@/app/(app)/wordbank/page";
import LibraryPage from "@/app/(app)/library/page";
import KnowledgeBankPage from "@/app/(app)/knowledge/page";

const TABS: (SectionTab & { Component: React.ComponentType<{ embedded?: boolean }> })[] = [
  { key: "words",     label: "Words",     color: "#7C4DFF", Component: WordbankPage },
  { key: "library",   label: "Library",   color: "#64FFDA", Component: LibraryPage },
  { key: "knowledge", label: "Knowledge", color: "#FFC15C", Component: KnowledgeBankPage },
];

export default function MindPage() {
  const [active, setActive] = useState(1); // Library — middle, default
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
