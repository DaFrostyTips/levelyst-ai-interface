import { notFound } from "next/navigation"
import { PresentationScreen } from "@/components/editor-v2/presentation-screen"
import { getLevelystRepository } from "@/lib/server/levelyst/project-repository"

export const dynamic = "force-dynamic"

export default async function PresentationPage({
  params,
}: {
  params: Promise<{ projectId: string }>
}) {
  const { projectId } = await params
  const repository = getLevelystRepository()
  const project = repository.getProjectDetail(projectId)

  if (!project) {
    notFound()
  }

  return <PresentationScreen initialProject={project} />
}
