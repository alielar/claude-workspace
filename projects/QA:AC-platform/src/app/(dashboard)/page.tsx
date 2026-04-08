// Home — AC Generator dashboard
// Shows cycle batches + individual pitches, and lets users upload both types.

import { prisma } from "@/lib/prisma"
import PitchesDashboard from "@/components/pitches/PitchesDashboard"

export const dynamic = "force-dynamic"

export default async function HomePage() {
  const [pitches, batches] = await Promise.all([
    // Only individual pitches (no batch)
    prisma.pitch.findMany({
      where: { batchId: null },
      orderBy: { createdAt: "desc" },
      include: { acDocument: { select: { id: true, createdAt: true, linearPushedAt: true } } },
    }),
    prisma.cycleBatch.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        pitches: {
          select: { id: true, title: true, status: true, acDocument: { select: { id: true } } },
        },
      },
    }),
  ])

  return <PitchesDashboard initialPitches={pitches} initialBatches={batches} />
}
