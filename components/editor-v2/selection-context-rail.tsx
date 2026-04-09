"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { SimulationReadiness } from "@/lib/editor-v2-model"
import { Activity, Compass, Focus, Link2, Network } from "lucide-react"

interface SelectionContextRailProps {
  projectName: string
  selectedLabel: string | null
  selectedSectionCount: number
  readiness: SimulationReadiness
  onFocusGraph: () => void
  onFocusTimeline: () => void
  onFocusInspector: () => void
}

export function SelectionContextRail({
  projectName,
  selectedLabel,
  selectedSectionCount,
  readiness,
  onFocusGraph,
  onFocusTimeline,
  onFocusInspector,
}: SelectionContextRailProps) {
  return (
    <div className="lv-glass-hud pointer-events-auto absolute left-3 right-3 top-3 z-30 flex flex-wrap items-center gap-2 rounded-xl px-3 py-2">
      <Badge variant="outline" className="border-cyan-300/35 bg-cyan-400/10 text-cyan-50">
        <Compass className="mr-1 h-3.5 w-3.5" />
        {projectName}
      </Badge>

      <Button
        size="sm"
        variant="outline"
        className="lv-chrome-control h-7 text-cyan-50 focus-visible:ring-2 focus-visible:ring-cyan-300/60"
        onClick={onFocusGraph}
      >
        <Network className="mr-1.5 h-3.5 w-3.5" />
        {selectedLabel ? selectedLabel : "No Selection"}
      </Button>

      <Button
        size="sm"
        variant="outline"
        className="lv-chrome-control h-7 text-cyan-50 focus-visible:ring-2 focus-visible:ring-cyan-300/60"
        onClick={onFocusTimeline}
      >
        <Link2 className="mr-1.5 h-3.5 w-3.5" />
        Sections: {selectedSectionCount}
      </Button>

      <Button
        size="sm"
        variant="outline"
        className="lv-chrome-control h-7 text-cyan-50 focus-visible:ring-2 focus-visible:ring-cyan-300/60"
        onClick={onFocusInspector}
      >
        <Focus className="mr-1.5 h-3.5 w-3.5" />
        Inspector
      </Button>

      <Badge
        variant="outline"
        className={
          readiness.status === "prototype_ready"
            ? "border-emerald-300/50 bg-emerald-400/10 text-emerald-100"
            : readiness.status === "systems_connected"
              ? "border-cyan-300/45 bg-cyan-400/10 text-cyan-100"
              : "border-amber-300/50 bg-amber-400/10 text-amber-100"
        }
      >
        <Activity className="mr-1 h-3.5 w-3.5" />
        {readiness.status.replace("_", " ")}
      </Badge>
    </div>
  )
}
