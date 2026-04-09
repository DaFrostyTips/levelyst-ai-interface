import { NextResponse } from "next/server"
import { LEVELYST_DEMO_READONLY_MESSAGE, type LevelystDeployMode } from "@/lib/levelyst/deploy-mode"

export function getLevelystDeployMode(): LevelystDeployMode {
  return process.env.LEVELYST_DEPLOY_MODE === "demo" ? "demo" : "local"
}

export function isLevelystDemoMode() {
  return getLevelystDeployMode() === "demo"
}

export function createDemoModeReadonlyResponse() {
  return NextResponse.json(
    {
      error: LEVELYST_DEMO_READONLY_MESSAGE,
      code: "demo_read_only",
    },
    { status: 403 },
  )
}
