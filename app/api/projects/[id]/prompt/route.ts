import { NextResponse } from "next/server"
import { z } from "zod"
import { createDemoModeReadonlyResponse, isLevelystDemoMode } from "@/lib/server/levelyst/deploy-mode"
import { getLevelystRepository } from "@/lib/server/levelyst/project-repository"
import { isPlannerError } from "@/lib/server/levelyst/planner-service"
import { planProjectPromptReview } from "@/lib/server/levelyst/prompt-review-service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const promptRequestSchema = z
  .object({
    prompt: z.string().min(1),
    planning_profile: z.enum(["default", "presentation"]).optional(),
  })
  .strict()

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (isLevelystDemoMode()) {
    return createDemoModeReadonlyResponse()
  }

  const repository = getLevelystRepository()
  const params = await context.params
  const body = promptRequestSchema.parse(await request.json())
  const project = repository.getProjectDetail(params.id)

  if (!project) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 })
  }

  let plannedReview

  try {
    plannedReview = await planProjectPromptReview(body.prompt, {
      currentBlueprint: project.workspace_json.pending_blueprint ?? project.blueprint_json,
      planningProfile: body.planning_profile ?? "default",
    })
  } catch (error) {
    if (isPlannerError(error)) {
      return NextResponse.json(
        {
          error: error.message,
        },
        { status: error.code === "misconfigured" ? 503 : 502 },
      )
    }

    throw error
  }

  const nextWorkspace = {
    ...project.workspace_json,
    prompt: body.prompt,
    pending_blueprint: plannedReview.blueprintPlan,
    pending_blueprint_diagnostics: plannedReview.diagnostics,
    pending_prompt_mode: plannedReview.mode,
    blueprint_state: "review" as const,
  }

  const updatedProject = repository.updateProject(project.id, {
    name:
      plannedReview.mode === "replace" && shouldRenameProject(project.name)
        ? deriveProjectName(body.prompt)
        : project.name,
    workspace_json: nextWorkspace,
  })

  return NextResponse.json({
    project: updatedProject,
  })
}

function shouldRenameProject(name: string) {
  return /^new project/i.test(name) || /^prototype/i.test(name)
}

function deriveProjectName(prompt: string) {
  const normalized = prompt
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .slice(0, 4)
    .join(" ")
  if (!normalized) return "New Project"
  return normalized.replace(/\b\w/g, (character) => character.toUpperCase())
}
