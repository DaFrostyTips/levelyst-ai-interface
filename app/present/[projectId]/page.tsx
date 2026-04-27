import { PresentationAttractScreen, PresentationScreen } from "@/components/editor-v2/presentation-screen"
import { getLevelystRepository } from "@/lib/server/levelyst/project-repository"
import { getLevelystRequestContextForServerComponent } from "@/lib/server/levelyst/request-context"

export const dynamic = "force-dynamic"

export default async function PresentationPage({
  params,
}: {
  params: Promise<{ projectId: string }>
}) {
  const { projectId } = await params
  const context = await getLevelystRequestContextForServerComponent()
  const repository = await getLevelystRepository(context)
  const project = await repository.getProjectDetail(projectId)

  if (!project) {
    return <PresentationAttractScreen status="Waiting for the active project from the main screen." />
  }

  return <PresentationScreen initialProject={project} />
}
