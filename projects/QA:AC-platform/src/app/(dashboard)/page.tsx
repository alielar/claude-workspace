// Home — Pitches dashboard
// Shows all uploaded pitches and lets users upload new ones.

import { prisma } from "@/lib/prisma"
import PitchesDashboard from "@/components/pitches/PitchesDashboard"

export const dynamic = "force-dynamic"

export default async function HomePage() {
  const pitches = await prisma.pitch.findMany({
    orderBy: { createdAt: "desc" },
    include: { acDocument: { select: { id: true, createdAt: true, linearPushedAt: true } } },
  })

  return <PitchesDashboard initialPitches={pitches} />
}
