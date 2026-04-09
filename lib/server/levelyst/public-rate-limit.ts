import { Redis } from "@upstash/redis"
import type { LevelystRequestContext } from "./request-context"

const PUBLIC_SESSION_LIMIT = 20
const PUBLIC_SESSION_WINDOW_SECONDS = 60 * 60
const PUBLIC_IP_LIMIT = 100
const PUBLIC_IP_WINDOW_SECONDS = 60 * 60 * 24

const KIOSK_SESSION_LIMIT = 500
const KIOSK_IP_LIMIT = 2_000

let redisClient: Redis | null = null

export interface PublicPromptRateLimitResult {
  ok: boolean
  retryAfterSeconds: number
  sessionRemaining: number | null
  ipRemaining: number | null
}

export function hasPublicRateLimitConfig() {
  return Boolean(process.env.UPSTASH_REDIS_REST_URL?.trim() && process.env.UPSTASH_REDIS_REST_TOKEN?.trim())
}

export async function checkPublicPromptRateLimit(
  context: LevelystRequestContext,
): Promise<PublicPromptRateLimitResult> {
  if (context.deployMode !== "public" || !hasPublicRateLimitConfig()) {
    return {
      ok: true,
      retryAfterSeconds: 0,
      sessionRemaining: null,
      ipRemaining: null,
    }
  }

  const redis = getRedis()
  const sessionLimit = context.kioskUnlocked ? KIOSK_SESSION_LIMIT : PUBLIC_SESSION_LIMIT
  const ipLimit = context.kioskUnlocked ? KIOSK_IP_LIMIT : PUBLIC_IP_LIMIT

  const sessionWindow = buildHourlyWindow(new Date())
  const sessionKey = `levelyst:prompt:session:${context.ownerSessionId}:${sessionWindow.key}`
  const sessionCounter = await incrementWindow(redis, sessionKey, sessionWindow.ttlSeconds)

  let ipCounter: { count: number; ttlSeconds: number } | null = null
  if (context.ipAddress) {
    const ipWindow = buildDailyWindow(new Date())
    const ipKey = `levelyst:prompt:ip:${context.ipAddress}:${ipWindow.key}`
    ipCounter = await incrementWindow(redis, ipKey, ipWindow.ttlSeconds)
  }

  const sessionExceeded = sessionCounter.count > sessionLimit
  const ipExceeded = ipCounter ? ipCounter.count > ipLimit : false

  return {
    ok: !sessionExceeded && !ipExceeded,
    retryAfterSeconds: Math.max(
      sessionExceeded ? sessionCounter.ttlSeconds : 0,
      ipExceeded ? ipCounter?.ttlSeconds ?? 0 : 0,
    ),
    sessionRemaining: Math.max(0, sessionLimit - sessionCounter.count),
    ipRemaining: ipCounter ? Math.max(0, ipLimit - ipCounter.count) : null,
  }
}

function getRedis() {
  if (!redisClient) {
    redisClient = Redis.fromEnv()
  }

  return redisClient
}

async function incrementWindow(redis: Redis, key: string, ttlSeconds: number) {
  const count = await redis.incr(key)
  if (count === 1) {
    await redis.expire(key, ttlSeconds)
    return { count, ttlSeconds }
  }

  const remainingTtl = await redis.ttl(key)
  return {
    count,
    ttlSeconds: typeof remainingTtl === "number" && remainingTtl > 0 ? remainingTtl : ttlSeconds,
  }
}

function buildHourlyWindow(now: Date) {
  const windowStart = new Date(now)
  windowStart.setMinutes(0, 0, 0)
  const nextWindow = new Date(windowStart)
  nextWindow.setHours(nextWindow.getHours() + 1)

  return {
    key: [
      windowStart.getUTCFullYear(),
      String(windowStart.getUTCMonth() + 1).padStart(2, "0"),
      String(windowStart.getUTCDate()).padStart(2, "0"),
      String(windowStart.getUTCHours()).padStart(2, "0"),
    ].join(""),
    ttlSeconds: Math.max(1, Math.ceil((nextWindow.getTime() - now.getTime()) / 1000)),
  }
}

function buildDailyWindow(now: Date) {
  const windowStart = new Date(now)
  windowStart.setHours(0, 0, 0, 0)
  const nextWindow = new Date(windowStart)
  nextWindow.setDate(nextWindow.getDate() + 1)

  return {
    key: [
      windowStart.getUTCFullYear(),
      String(windowStart.getUTCMonth() + 1).padStart(2, "0"),
      String(windowStart.getUTCDate()).padStart(2, "0"),
    ].join(""),
    ttlSeconds: Math.max(1, Math.ceil((nextWindow.getTime() - now.getTime()) / 1000)),
  }
}
