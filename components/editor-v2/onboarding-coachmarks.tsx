"use client"

import { useEffect } from "react"
import { Button } from "@/components/ui/button"

interface OnboardingCoachmarksProps {
  open: boolean
  onDismiss: () => void
}

export function OnboardingCoachmarks({ open, onDismiss }: OnboardingCoachmarksProps) {
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault()
        onDismiss()
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [onDismiss, open])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[95] cursor-pointer" onClick={onDismiss}>
      <div className="absolute inset-0 bg-black/28 backdrop-blur-[1px]" />

      <div
        className="lv-glass-modal pointer-events-auto absolute left-6 top-24 max-w-[280px] cursor-default rounded-xl border border-cyan-300/35 p-3 text-sm text-cyan-50 shadow-[0_0_30px_rgba(34,211,238,0.2)]"
        onClick={(event) => event.stopPropagation()}
      >
        <p className="text-xs uppercase tracking-[0.16em] text-cyan-200/85">Canvas Controls</p>
        <p className="mt-1 leading-relaxed text-cyan-50/90">Hold Space + drag to pan, use the mouse wheel to zoom, and use trackpad two-finger pan with pinch zoom. The center canvas is your primary build surface.</p>
      </div>

      <div
        className="lv-glass-modal pointer-events-auto absolute left-6 top-[46%] max-w-[280px] cursor-default rounded-xl border border-blue-300/35 p-3 text-sm text-blue-50 shadow-[0_0_30px_rgba(59,130,246,0.22)]"
        onClick={(event) => event.stopPropagation()}
      >
        <p className="text-xs uppercase tracking-[0.16em] text-blue-200/85">Floating Panels</p>
        <p className="mt-1 leading-relaxed text-blue-50/90">Drag panels from non-interactive space, dock to edges, and resize from handles for your preferred layout.</p>
      </div>

      <div
        className="lv-glass-modal pointer-events-auto absolute right-6 top-20 max-w-[300px] cursor-default rounded-xl border border-emerald-300/35 p-3 text-sm text-emerald-50 shadow-[0_0_30px_rgba(52,211,153,0.2)]"
        onClick={(event) => event.stopPropagation()}
      >
        <p className="text-xs uppercase tracking-[0.16em] text-emerald-200/85">Simulation Readiness</p>
        <p className="mt-1 leading-relaxed text-emerald-50/90">The Simulate state reflects graph health. Connect core chains first to unlock a stable prototype preview.</p>
      </div>

      <div
        className="lv-glass-modal pointer-events-auto absolute bottom-20 right-6 max-w-[300px] cursor-default rounded-xl border border-purple-300/35 p-3 text-sm text-purple-50 shadow-[0_0_30px_rgba(168,85,247,0.22)]"
        onClick={(event) => event.stopPropagation()}
      >
        <p className="text-xs uppercase tracking-[0.16em] text-purple-200/85">Blueprint Confirm</p>
        <p className="mt-1 leading-relaxed text-purple-50/90">When Blueprint appears, review systems and level flow first, then click Generate Prototype to build the graph.</p>
      </div>

      <div
        className="pointer-events-auto absolute bottom-5 left-1/2 -translate-x-1/2 text-center"
        onClick={(event) => event.stopPropagation()}
      >
        <p className="mb-2 text-xs font-medium tracking-wide text-cyan-100/90">Click anywhere to continue</p>
        <Button onClick={onDismiss} className="h-11 min-w-[220px] bg-gradient-to-r from-blue-500 to-purple-500 px-6 text-base font-semibold text-white shadow-[0_0_28px_rgba(59,130,246,0.38)]">
          Got it
        </Button>
      </div>
    </div>
  )
}
