import { NextResponse } from "next/server"
import { resetProjectsToKioskStarter } from "@/lib/server/levelyst/kiosk"
import { getLevelystRepository } from "@/lib/server/levelyst/project-repository"
import { getLevelystRequestContextForRoute } from "@/lib/server/levelyst/request-context"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  const context = await getLevelystRequestContextForRoute(request)

  if (!context.kioskUnlocked) {
    return NextResponse.json({ error: "Kiosk access is not enabled for this session." }, { status: 403 })
  }

  const repository = await getLevelystRepository(context)

  try {
    const project = await resetProjectsToKioskStarter(repository)
    return NextResponse.json({ project })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Kiosk reset failed." },
      { status: 500 },
    )
  }
}
