import { LevelystWorkbench } from "@/components/editor-v2/levelyst-workbench"
import { getLevelystDeployMode } from "@/lib/server/levelyst/deploy-mode"
import { getLevelystRepository } from "@/lib/server/levelyst/project-repository"
import { getLocalAiCopilotStatus } from "@/lib/server/levelyst/local-ai-copy-enhancer"

export const dynamic = "force-dynamic"

export default async function Page() {
  const repository = getLevelystRepository()
  const deployMode = getLevelystDeployMode()
  const [initialProjects, initialLocalAiStatus] = await Promise.all([
    repository.listProjectDetails(),
    getLocalAiCopilotStatus(),
  ])

  return (
    <LevelystWorkbench
      initialProjects={initialProjects}
      initialLocalAiStatus={initialLocalAiStatus}
      deployMode={deployMode}
    />
  )
}
