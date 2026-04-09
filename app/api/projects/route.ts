import { NextResponse } from "next/server"
import { z } from "zod"
import { genreSchema, runtimeTargetSchema } from "@levelyst/contracts"
import { createDemoModeReadonlyResponse } from "@/lib/server/levelyst/deploy-mode"
import { getLevelystRepository } from "@/lib/server/levelyst/project-repository"
import { getLevelystRequestContextForRoute } from "@/lib/server/levelyst/request-context"

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

export async function GET(request: Request) {
  const context = await getLevelystRequestContextForRoute(request)
  const repository = await getLevelystRepository(context)
  return NextResponse.json({
    projects: await repository.listProjectSummaries(),
  })
}

export async function POST(request: Request) {
  const context = await getLevelystRequestContextForRoute(request)
  if (context.deployMode === "demo") {
    return createDemoModeReadonlyResponse()
  }

  const repository = await getLevelystRepository(context)
  const body = createProjectRequestSchema.parse(await request.json().catch(() => ({})))
  const project = await repository.createProject(body)
  return NextResponse.json({
    project,
  })
}
