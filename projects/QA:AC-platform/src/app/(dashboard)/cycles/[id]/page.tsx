import { notFound } from "next/navigation"
import { prisma } from "@/lib/prisma"
import CycleBatchDetail from "@/components/cycles/CycleBatchDetail"

export const dynamic = "force-dynamic"

export default async function CycleBatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const batch = await prisma.cycleBatch.findUnique({
    where: { id },
    include: {
      pitches: {
        orderBy: { createdAt: "asc" },
        include: { acDocument: true },
      },
    },
  })

  if (!batch) notFound()

  return <CycleBatchDetail batch={batch} />
}
