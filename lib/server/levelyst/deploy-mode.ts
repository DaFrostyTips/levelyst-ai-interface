import { NextResponse } from "next/server"
import { LEVELYST_DEMO_READONLY_MESSAGE, type LevelystDeployMode } from "@/lib/levelyst/deploy-mode"

export function getLevelystDeployMode(): LevelystDeployMode {
  const value = process.env.LEVELYST_DEPLOY_MODE?.trim()
  if (value === "demo") return "demo"
  if (value === "public") return "public"
  return "local"
}

export function isLevelystDemoMode() {
  return getLevelystDeployMode() === "demo"
}

export function isLevelystPublicMode() {
  return getLevelystDeployMode() === "public"
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

export function createAiUnavailableResponse(errorMessage: string) {
  return NextResponse.json(
    {
      error: errorMessage,
      code: "ai_unavailable",
    },
    { status: 503 },
  )
}

export function createRateLimitedResponse(retryAfterSeconds: number) {
  return NextResponse.json(
    {
      error: `AI planning is temporarily rate-limited. Try again in about ${Math.max(1, retryAfterSeconds)} seconds.`,
      code: "rate_limited",
      retry_after_seconds: Math.max(1, retryAfterSeconds),
    },
    { status: 429 },
  )
}
