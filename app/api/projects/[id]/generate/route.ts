import { NextResponse } from "next/server"
import { createDemoModeReadonlyResponse } from "@/lib/server/levelyst/deploy-mode"
import { getLevelystRepository } from "@/lib/server/levelyst/project-repository"
import { getLevelystRequestContextForRoute } from "@/lib/server/levelyst/request-context"
import { generatePrototypeForProject } from "@/lib/server/levelyst/generation-service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const requestContext = await getLevelystRequestContextForRoute(request)
  if (requestContext.deployMode === "demo") {
    return createDemoModeReadonlyResponse()
  }

  const repository = await getLevelystRepository(requestContext)
  const params = await context.params

  try {
    const result = await generatePrototypeForProject(repository, params.id)
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
