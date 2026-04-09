"use client"

import { Button } from "@/components/ui/button"
import type { UiBlockerState } from "@/lib/editor-v2-model"
import { AlertTriangle, Coins, Link2, Sparkles } from "lucide-react"

interface UiBlockerBannerProps {
  state: UiBlockerState
  message: string
  onFixDependencies: () => void
  onOpenLibrary: () => void
  onAddCoreChain: () => void
}

export function UiBlockerBanner({
  state,
  message,
  onFixDependencies,
  onOpenLibrary,
  onAddCoreChain,
}: UiBlockerBannerProps) {
  if (state === "none") return null

  return (
    <div className="lv-glass-hud mx-3 mb-2 flex flex-wrap items-center gap-2 rounded-xl px-3 py-2 text-sm text-cyan-50">
      {state === "credits_exhausted" && <Coins className="h-4 w-4 text-amber-200" />}
      {state === "missing_dependencies" && <Link2 className="h-4 w-4 text-amber-200" />}
      {state === "no_compatible_modules" && <AlertTriangle className="h-4 w-4 text-amber-200" />}
      {state === "simulation_error" && <AlertTriangle className="h-4 w-4 text-amber-200" />}

      <p className="mr-2 text-cyan-50/90">{message}</p>

      {state === "credits_exhausted" && (
        <Button size="sm" variant="outline" className="lv-chrome-control h-7 text-white" onClick={onOpenLibrary}>
          Open Module Library
        </Button>
      )}

      {state === "missing_dependencies" && (
        <>
          <Button size="sm" variant="outline" className="lv-chrome-control h-7 text-white" onClick={onFixDependencies}>
            Fix Dependencies
          </Button>
          <Button size="sm" className="h-7 bg-gradient-to-r from-blue-500 to-purple-500 text-white" onClick={onAddCoreChain}>
            <Sparkles className="mr-1.5 h-3.5 w-3.5" />
            Add Core Chain
          </Button>
        </>
      )}

      {state === "no_compatible_modules" && (
        <Button size="sm" variant="outline" className="lv-chrome-control h-7 text-white" onClick={onOpenLibrary}>
          Open Module Library
        </Button>
      )}
    </div>
  )
}
