import { NextResponse } from "next/server"
import { getLevelystRepository } from "@/lib/server/levelyst/project-repository"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const repository = getLevelystRepository()
  const params = await context.params
  const job = repository.getJob(params.id)

  if (!job) {
    return NextResponse.json({ error: "Job not found." }, { status: 404 })
  }

  return NextResponse.json({ job })
}
