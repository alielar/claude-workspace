import { SectionHub, type HubCard } from "@/components/layout/SectionHub";

const CARDS: HubCard[] = [
  {
    href: "/mood",
    label: "Mood",
    icon: "mood",
    color: "#FFC15C",
    description: "Daily mood scores and a heatmap of how you've been feeling.",
  },
  {
    href: "/sleep",
    label: "Sleep",
    icon: "sleep",
    color: "#818CF8",
    description: "Last night's rest, sleep stages, and trends over time.",
  },
  {
    href: "/journal",
    label: "Journal",
    icon: "journal",
    color: "#FB923C",
    description: "Write and revisit your entries whenever you need to reflect.",
  },
];

export default function WellbeingPage() {
  return (
    <SectionHub
      title="Wellbeing"
      subtitle="How you feel, how you rest, and what's on your mind."
      cards={CARDS}
    />
  );
}
