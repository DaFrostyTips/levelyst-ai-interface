import { NextResponse } from "next/server"
import { createDemoModeReadonlyResponse } from "@/lib/server/levelyst/deploy-mode"
import { getLevelystRepository } from "@/lib/server/levelyst/project-repository"
import { getLevelystRequestContextForRoute } from "@/lib/server/levelyst/request-context"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const requestContext = await getLevelystRequestContextForRoute(request)
  const repository = await getLevelystRepository(requestContext)
  const params = await context.params
  const project = await repository.getProjectDetail(params.id)

  if (!project) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 })
  }

  return NextResponse.json({ project })
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const requestContext = await getLevelystRequestContextForRoute(request)
  if (requestContext.deployMode === "demo") {
    return createDemoModeReadonlyResponse()
  }

  const repository = await getLevelystRepository(requestContext)
  const params = await context.params

  try {
    const project = await repository.deleteProject(params.id)
    return NextResponse.json({ project })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Project delete failed." },
      { status: 404 },
    )
  }
}
