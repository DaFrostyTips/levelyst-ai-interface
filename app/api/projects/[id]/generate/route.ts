import { NextResponse } from "next/server"
import { createDemoModeReadonlyResponse, isLevelystDemoMode } from "@/lib/server/levelyst/deploy-mode"
import { getLevelystRepository } from "@/lib/server/levelyst/project-repository"
import { generatePrototypeForProject } from "@/lib/server/levelyst/generation-service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  if (isLevelystDemoMode()) {
    return createDemoModeReadonlyResponse()
  }

  const repository = getLevelystRepository()
  const params = await context.params

  try {
    const result = generatePrototypeForProject(repository, params.id)
    return NextResponse.json({
      job_id: result.job.id,
      project_id: result.project.id,
      status: result.job.status,
    })
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Prototype generation failed.",
      },
      { status: 400 },
    )
  }
}
