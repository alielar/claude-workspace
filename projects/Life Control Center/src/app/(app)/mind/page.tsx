import { SectionHub, type HubCard } from "@/components/layout/SectionHub";

const CARDS: HubCard[] = [
  {
    href: "/wordbank",
    label: "Words",
    icon: "words",
    color: "#7C4DFF",
    description: "Vocabulary flashcards with spaced repetition across your languages.",
  },
  {
    href: "/knowledge",
    label: "Knowledge",
    icon: "knowledge",
    color: "#FFC15C",
    description: "Notes saved while reading, reviewed so the ideas stick.",
  },
  {
    href: "/library",
    label: "Library",
    icon: "library",
    color: "#64FFDA",
    description: "Your books and articles, with reading progress and annotations.",
  },
];

export default function MindPage() {
  return (
    <SectionHub
      title="Mind"
      subtitle="Everything you're reading, learning, and remembering."
      cards={CARDS}
    />
  );
}
