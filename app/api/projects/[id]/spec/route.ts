import { NextResponse } from "next/server"
import { z } from "zod"
import { patchOperationSchema } from "@levelyst/contracts"
import { createDemoModeReadonlyResponse } from "@/lib/server/levelyst/deploy-mode"
import { getLevelystRepository } from "@/lib/server/levelyst/project-repository"
import { getLevelystRequestContextForRoute } from "@/lib/server/levelyst/request-context"
import { patchProjectSpec } from "@/lib/server/levelyst/workspace-patch-service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const patchSpecRequestSchema = z
  .object({
    operations: z.array(patchOperationSchema).min(1),
  })
  .strict()

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const requestContext = await getLevelystRequestContextForRoute(request)
  const repository = await getLevelystRepository(requestContext)
  const params = await context.params
  const project = await repository.getProjectDetail(params.id)

  if (!project) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 })
  }

  return NextResponse.json({
    prototype_spec: project.prototype_spec,
  })
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const requestContext = await getLevelystRequestContextForRoute(request)
  if (requestContext.deployMode === "demo") {
    return createDemoModeReadonlyResponse()
  }

  const repository = await getLevelystRepository(requestContext)
  const params = await context.params
  const body = patchSpecRequestSchema.parse(await request.json())

  try {
    const project = await patchProjectSpec(repository, params.id, body.operations)
    return NextResponse.json({ project })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Spec patch failed." },
      { status: 400 },
    )
  }
}
