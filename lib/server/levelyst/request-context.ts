import { cookies, headers } from "next/headers"
import type { LevelystDeployMode } from "@/lib/levelyst/deploy-mode"
import { getLevelystDeployMode } from "./deploy-mode"

export const LEVELYST_SESSION_COOKIE = "levelyst_session"
export const LEVELYST_KIOSK_COOKIE = "levelyst_kiosk"

export interface LevelystRequestContext {
  deployMode: LevelystDeployMode
  ownerSessionId: string
  kioskUnlocked: boolean
  ipAddress: string | null
}

export async function getLevelystRequestContextForRoute(request: Request): Promise<LevelystRequestContext> {
  const cookieHeader = request.headers.get("cookie")
  const headerSessionId = parseCookieHeader(cookieHeader)[LEVELYST_SESSION_COOKIE]

  return {
    deployMode: getLevelystDeployMode(),
    ownerSessionId: sanitizeSessionId(headerSessionId) ?? createOpaqueSessionId(),
    kioskUnlocked: parseCookieHeader(cookieHeader)[LEVELYST_KIOSK_COOKIE] === "1",
    ipAddress: resolveClientIp(request.headers),
  }
}

export async function getLevelystRequestContextForServerComponent(): Promise<LevelystRequestContext> {
  const cookieStore = await cookies()
  const requestHeaders = await headers()

  return {
    deployMode: getLevelystDeployMode(),
    ownerSessionId: sanitizeSessionId(cookieStore.get(LEVELYST_SESSION_COOKIE)?.value) ?? createOpaqueSessionId(),
    kioskUnlocked: cookieStore.get(LEVELYST_KIOSK_COOKIE)?.value === "1",
    ipAddress: resolveClientIp(requestHeaders),
  }
}

export function createOpaqueSessionId() {
  return crypto.randomUUID().replaceAll("-", "")
}

export function sanitizeSessionId(value: string | undefined | null) {
  const trimmed = value?.trim()
  if (!trimmed) return null
  return /^[a-zA-Z0-9_-]{16,128}$/.test(trimmed) ? trimmed : null
}

export function resolveClientIp(headersLike: Pick<Headers, "get">) {
  const forwarded = headersLike.get("x-forwarded-for")?.split(",")[0]?.trim()
  if (forwarded) return forwarded

  const realIp = headersLike.get("x-real-ip")?.trim()
  if (realIp) return realIp

  return null
}

function parseCookieHeader(headerValue: string | null) {
  if (!headerValue) return {} as Record<string, string>

  return headerValue
    .split(";")
    .map((segment) => segment.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((result, entry) => {
      const [rawKey, ...rawValue] = entry.split("=")
      if (!rawKey) return result
      result[rawKey] = decodeURIComponent(rawValue.join("="))
      return result
    }, {})
}
