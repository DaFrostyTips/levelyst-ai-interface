import { NextResponse } from "next/server"
import { z } from "zod"
import { genreSchema, runtimeTargetSchema } from "@levelyst/contracts"
import { createDemoModeReadonlyResponse, isLevelystDemoMode } from "@/lib/server/levelyst/deploy-mode"
import { getLevelystRepository } from "@/lib/server/levelyst/project-repository"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const createProjectRequestSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    genre: genreSchema.optional(),
    runtime_target: runtimeTargetSchema.optional(),
    duplicate_from: z.string().min(1).optional(),
  })
  .strict()

export async function GET() {
  const repository = getLevelystRepository()
  return NextResponse.json({
    projects: repository.listProjectSummaries(),
  })
}

export async function POST(request: Request) {
  if (isLevelystDemoMode()) {
    return createDemoModeReadonlyResponse()
  }

  const repository = getLevelystRepository()
  const body = createProjectRequestSchema.parse(await request.json().catch(() => ({})))
  const project = repository.createProject(body)
  return NextResponse.json({
    project,
  })
}
