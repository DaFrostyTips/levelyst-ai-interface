import { NextRequest, NextResponse } from "next/server"
import { getLevelystDeployMode } from "@/lib/server/levelyst/deploy-mode"
import {
  createOpaqueSessionId,
  LEVELYST_KIOSK_COOKIE,
  LEVELYST_SESSION_COOKIE,
} from "@/lib/server/levelyst/request-context"

export function middleware(request: NextRequest) {
  const kioskResult = maybeHandleKioskAccess(request)
  const response = kioskResult ?? NextResponse.next()

  if (!request.cookies.get(LEVELYST_SESSION_COOKIE)?.value) {
    response.cookies.set(LEVELYST_SESSION_COOKIE, createOpaqueSessionId(), cookieOptions())
  }

  return response
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon\\.png|apple-touch-icon\\.png|site\\.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map|txt)$).*)",
  ],
}

function maybeHandleKioskAccess(request: NextRequest) {
  if (!request.nextUrl.pathname.startsWith("/kiosk")) {
    return null
  }

  const deployMode = getLevelystDeployMode()
  const hasKioskCookie = request.cookies.get(LEVELYST_KIOSK_COOKIE)?.value === "1"
  if (hasKioskCookie) {
    return null
  }

  const token = request.nextUrl.searchParams.get("token")?.trim()
  const kioskSecret = process.env.LEVELYST_KIOSK_SECRET?.trim()

  if (deployMode === "local" && !kioskSecret) {
    return null
  }

  if (token && kioskSecret && token === kioskSecret) {
    const redirectUrl = request.nextUrl.clone()
    redirectUrl.searchParams.delete("token")

    const response = NextResponse.redirect(redirectUrl)
    response.cookies.set(LEVELYST_KIOSK_COOKIE, "1", cookieOptions())
    return response
  }

  return NextResponse.redirect(new URL("/", request.url))
}

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
  }
}
