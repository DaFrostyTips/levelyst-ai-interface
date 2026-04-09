import { NextResponse } from "next/server"
import { createDemoModeReadonlyResponse, isLevelystDemoMode } from "@/lib/server/levelyst/deploy-mode"
import { getLevelystRepository } from "@/lib/server/levelyst/project-repository"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const repository = getLevelystRepository()
  const params = await context.params
  const project = repository.getProjectDetail(params.id)

  if (!project) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 })
  }

  return NextResponse.json({ project })
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  if (isLevelystDemoMode()) {
    return createDemoModeReadonlyResponse()
  }

  const repository = getLevelystRepository()
  const params = await context.params

  try {
    const project = repository.deleteProject(params.id)
    return NextResponse.json({ project })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Project delete failed." },
      { status: 404 },
    )
  }
}
