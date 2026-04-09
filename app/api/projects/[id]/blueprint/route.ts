import { NextResponse } from "next/server"
import { z } from "zod"
import { blueprintPlanSchema } from "@levelyst/contracts"
import { createDemoModeReadonlyResponse } from "@/lib/server/levelyst/deploy-mode"
import { getLevelystRepository } from "@/lib/server/levelyst/project-repository"
import { getLevelystRequestContextForRoute } from "@/lib/server/levelyst/request-context"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const patchBlueprintRequestSchema = z
  .object({
    blueprint_json: blueprintPlanSchema,
  })
  .strict()

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const requestContext = await getLevelystRequestContextForRoute(request)
  if (requestContext.deployMode === "demo") {
    return createDemoModeReadonlyResponse()
  }

  const repository = await getLevelystRepository(requestContext)
  const params = await context.params
  const project = await repository.getProjectDetail(params.id)

  if (!project) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 })
  }

  const body = patchBlueprintRequestSchema.parse(await request.json())

  const updatedProject = await repository.updateProject(project.id, {
    workspace_json: {
      ...project.workspace_json,
      pending_blueprint: body.blueprint_json,
      pending_blueprint_diagnostics: project.workspace_json.pending_blueprint_diagnostics,
      pending_prompt_mode: project.workspace_json.pending_prompt_mode,
      blueprint_state: "review",
    },
  })

  return NextResponse.json({
    project: updatedProject,
  })
}
