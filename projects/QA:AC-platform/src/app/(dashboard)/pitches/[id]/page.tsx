// Individual pitch page
// Shows: pitch status, clarification chat (if needed), AC output, download + Linear push

import { notFound } from "next/navigation"
import { prisma } from "@/lib/prisma"
import PitchDetail from "@/components/pitches/PitchDetail"

export const dynamic = "force-dynamic"

export default async function PitchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const pitch = await prisma.pitch.findUnique({
    where: { id },
    include: {
      messages: { orderBy: { createdAt: "asc" } },
      acDocument: true,
    },
  })

  if (!pitch) notFound()

  return <PitchDetail pitch={pitch} />
}
