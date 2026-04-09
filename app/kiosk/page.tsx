import { LevelystWorkbench } from "@/components/editor-v2/levelyst-workbench"
import { ensureKioskStarterProject } from "@/lib/server/levelyst/kiosk"
import { getLocalAiCopilotStatus } from "@/lib/server/levelyst/local-ai-copy-enhancer"
import { getLevelystRepository } from "@/lib/server/levelyst/project-repository"
import { getLevelystRequestContextForServerComponent } from "@/lib/server/levelyst/request-context"

export const dynamic = "force-dynamic"

export default async function KioskPage() {
  const context = await getLevelystRequestContextForServerComponent()
  const repository = await getLevelystRepository(context)
  const [initialProjects, initialLocalAiStatus] = await Promise.all([
    ensureKioskStarterProject(repository),
    getLocalAiCopilotStatus(),
  ])

  return (
    <LevelystWorkbench
      initialProjects={initialProjects}
      initialLocalAiStatus={initialLocalAiStatus}
      deployMode={context.deployMode}
      experienceMode="kiosk"
    />
  )
}
