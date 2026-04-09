import { NextResponse } from "next/server"
import { z } from "zod"
import { editorWorkspaceSnapshotSchema } from "@levelyst/contracts"
import { createDemoModeReadonlyResponse, isLevelystDemoMode } from "@/lib/server/levelyst/deploy-mode"
import { getLevelystRepository } from "@/lib/server/levelyst/project-repository"
import { persistWorkspaceSnapshot } from "@/lib/server/levelyst/workspace-patch-service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const patchWorkspaceRequestSchema = z
  .object({
    workspace_json: editorWorkspaceSnapshotSchema,
  })
  .strict()

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  if (isLevelystDemoMode()) {
    return createDemoModeReadonlyResponse()
  }

  const repository = getLevelystRepository()
  const params = await context.params
  const body = patchWorkspaceRequestSchema.parse(await request.json())

  try {
    const project = persistWorkspaceSnapshot(repository, params.id, body.workspace_json)
    return NextResponse.json({ project })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Workspace update failed." },
      { status: 400 },
    )
  }
}
