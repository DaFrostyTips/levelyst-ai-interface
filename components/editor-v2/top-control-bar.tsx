"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import {
  CircleHelp,
  MoreHorizontal,
  Home,
  PlayCircle,
  Search,
  Share2,
  SlidersHorizontal,
  UserPlus,
} from "lucide-react"
import type {
  EditorMode,
  MotionIntensity,
  SimulationReadiness,
  WorkspaceLayoutMode,
} from "@/lib/editor-v2-model"
import { cn } from "@/lib/utils"

interface TopControlBarProps {
  projectName: string
  mode: EditorMode
  credits: number
  motionIntensity: MotionIntensity
  readiness: SimulationReadiness
  layoutMode: WorkspaceLayoutMode
  onDashboard: () => void
  onOpenHelp: () => void
  onOpenCommandPalette: () => void
  onOpenPresentation: () => void
  onSetMotionIntensity: (motionIntensity: MotionIntensity) => void
  onModeChange: (mode: EditorMode) => void
}

const readinessLabelMap: Record<SimulationReadiness["status"], string> = {
  prototype_ready: "Prototype Ready",
  systems_connected: "Systems Connected",
  missing_dependencies: "Needs Links",
}

export function TopControlBar({
  projectName,
  mode,
  credits,
  motionIntensity,
  readiness,
  layoutMode,
  onDashboard,
  onOpenHelp,
  onOpenCommandPalette,
  onOpenPresentation,
  onSetMotionIntensity,
  onModeChange,
}: TopControlBarProps) {
  const modeButtons: EditorMode[] = ["build", "simulate", "debug"]
  const isWideLayout = layoutMode === "wide"
  const isMobileLayout = layoutMode === "mobile"
  const simulateClass =
    readiness.status === "prototype_ready"
      ? "lv-simulate-ready"
      : readiness.status === "missing_dependencies"
        ? "lv-simulate-warning"
        : "lv-simulate-connected"

  return (
    <header className="lv-glass-shell sticky top-0 z-50 px-3 py-2 lg:px-5">
      <div
        className={cn(
          "grid w-full items-center gap-3",
          isMobileLayout ? "grid-cols-1" : "grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]",
        )}
      >
        <div className={cn("flex min-w-0 items-center gap-2 md:gap-3", isMobileLayout ? "justify-between" : "justify-self-start")}>
          <Button
            variant="ghost"
            onClick={onDashboard}
            className="lv-chrome-control h-9 shrink-0 rounded-lg px-2 text-cyan-100/85 hover:text-white"
          >
            <Home className="mr-2 h-4 w-4" />
            Levelyst.AI
          </Button>
          <div className="lv-glass-hud min-w-0 rounded-lg px-3 py-1.5">
            <p className="text-[10px] uppercase tracking-[0.2em] text-cyan-200/70">Project</p>
            <p className={cn("truncate font-medium text-white", isWideLayout ? "max-w-[220px] text-sm" : "max-w-[160px] text-sm")}>
              {projectName}
            </p>
          </div>
        </div>

        <div className={cn("flex flex-wrap items-center justify-center gap-2", isMobileLayout ? "justify-start" : "justify-self-center")}>
          <div className="lv-glass-hud flex items-center rounded-xl p-1">
            <TooltipProvider delayDuration={180}>
              {modeButtons.map((entry) => {
                const button = (
                  <button
                    key={entry}
                    onClick={() => onModeChange(entry)}
                    className={cn(
                      "rounded-lg px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60",
                      mode === entry
                        ? "bg-gradient-to-r from-blue-500 to-purple-500 text-white shadow-[0_0_16px_rgba(59,130,246,0.38)]"
                        : "text-cyan-100/70 hover:text-white",
                      entry === "simulate" && mode !== "simulate" && simulateClass,
                    )}
                    data-panel-interactive="true"
                  >
                    <span className="inline-flex items-center">
                      {entry}
                      {entry === "simulate" && <CircleHelp className="ml-1 h-3 w-3" />}
                    </span>
                  </button>
                )

                if (entry !== "simulate") {
                  return button
                }

                return (
                  <Tooltip key={entry}>
                    <TooltipTrigger asChild>{button}</TooltipTrigger>
                    <TooltipContent className="lv-glass-modal max-w-[280px] text-xs leading-relaxed text-cyan-100">
                      <p className="font-semibold text-white">Simulation Mode</p>
                      <p className="mt-1 text-cyan-100/80">{readiness.message}</p>
                      {readiness.missingLinks.length > 0 && (
                        <p className="mt-1 text-amber-200/90">Missing: {readiness.missingLinks.join(", ")}</p>
                      )}
                    </TooltipContent>
                  </Tooltip>
                )
              })}
            </TooltipProvider>
          </div>

          <Badge
            variant="outline"
            className={cn(
              "lv-glass-hud border px-2 py-1 text-[10px] uppercase tracking-[0.14em]",
              readiness.status === "prototype_ready" && "border-emerald-300/50 bg-emerald-400/10 text-emerald-200",
              readiness.status === "systems_connected" && "border-cyan-300/45 bg-cyan-400/10 text-cyan-100",
              readiness.status === "missing_dependencies" && "border-amber-300/50 bg-amber-400/10 text-amber-100",
            )}
          >
            {readinessLabelMap[readiness.status]}
          </Badge>
        </div>

        <div className={cn("flex flex-wrap items-center gap-2", isMobileLayout ? "justify-start" : "justify-self-end justify-end")}>
          <Button
            variant="outline"
            size="icon"
            className="lv-chrome-control text-white focus-visible:ring-2 focus-visible:ring-cyan-300/60"
            onClick={onOpenCommandPalette}
          >
            <Search className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="lv-chrome-control text-white focus-visible:ring-2 focus-visible:ring-cyan-300/60"
            onClick={onOpenHelp}
          >
            <CircleHelp className="h-4 w-4" />
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                className="lv-chrome-control text-white focus-visible:ring-2 focus-visible:ring-cyan-300/60"
              >
                <SlidersHorizontal className="mr-2 h-4 w-4" />
                {isMobileLayout ? "Display" : `Display: ${motionIntensity}`}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="lv-glass-modal w-72 text-cyan-100 shadow-[0_24px_60px_rgba(2,6,23,0.55)]"
            >
              <div className="px-2 py-1.5">
                <p className="text-sm font-semibold text-white">Display Settings</p>
                <p className="mt-1 text-xs leading-relaxed text-cyan-100/70">
                  Motion controls the editor atmosphere. Performance status is informational in this MVP.
                </p>
              </div>
              <DropdownMenuSeparator className="bg-white/10" />
              <DropdownMenuLabel className="text-[11px] uppercase tracking-[0.16em] text-cyan-100/75">
                Motion
              </DropdownMenuLabel>
              <DropdownMenuRadioGroup value={motionIntensity} onValueChange={(value) => onSetMotionIntensity(value as MotionIntensity)}>
                <DropdownMenuRadioItem value="high" className="text-cyan-50 focus:bg-white/10 focus:text-white">
                  High
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="medium" className="text-cyan-50 focus:bg-white/10 focus:text-white">
                  Medium
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="reduced" className="text-cyan-50 focus:bg-white/10 focus:text-white">
                  Reduced
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
              <DropdownMenuSeparator className="bg-white/10" />
              <div className="px-2 py-1.5 text-xs leading-relaxed text-cyan-100/72">
                <p className="font-semibold text-white/92">Performance</p>
                <p className="mt-1">Adaptive. Canvas sizing and runtime rendering scale automatically for the current display.</p>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>

          {isWideLayout ? (
            <>
              <Button
                variant="outline"
                className="lv-chrome-control text-white focus-visible:ring-2 focus-visible:ring-cyan-300/60"
                onClick={onOpenPresentation}
              >
                <PlayCircle className="mr-2 h-4 w-4" />
                Present
              </Button>
              <Button
                variant="outline"
                className="lv-chrome-control text-white focus-visible:ring-2 focus-visible:ring-cyan-300/60"
              >
                <UserPlus className="mr-2 h-4 w-4" />
                Invite
              </Button>
              <Button
                variant="outline"
                className="lv-chrome-control text-white focus-visible:ring-2 focus-visible:ring-cyan-300/60"
              >
                <Share2 className="mr-2 h-4 w-4" />
                Share
              </Button>
            </>
          ) : (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="lv-chrome-control text-white focus-visible:ring-2 focus-visible:ring-cyan-300/60"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="lv-glass-modal w-52 text-cyan-100 shadow-[0_24px_60px_rgba(2,6,23,0.55)]"
              >
                <DropdownMenuItem className="text-cyan-50 focus:bg-white/10 focus:text-white" onClick={onOpenCommandPalette}>
                  <Search className="h-4 w-4" />
                  Command Palette
                </DropdownMenuItem>
                <DropdownMenuItem className="text-cyan-50 focus:bg-white/10 focus:text-white" onClick={onOpenHelp}>
                  <CircleHelp className="h-4 w-4" />
                  Help
                </DropdownMenuItem>
                <DropdownMenuItem className="text-cyan-50 focus:bg-white/10 focus:text-white" onClick={onOpenPresentation}>
                  <PlayCircle className="h-4 w-4" />
                  Presentation Screen
                </DropdownMenuItem>
                <DropdownMenuSeparator className="bg-white/10" />
                <DropdownMenuItem className="text-cyan-50 focus:bg-white/10 focus:text-white">
                  <UserPlus className="h-4 w-4" />
                  Invite
                </DropdownMenuItem>
                <DropdownMenuItem className="text-cyan-50 focus:bg-white/10 focus:text-white">
                  <Share2 className="h-4 w-4" />
                  Share
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          <Badge className="lv-glass-hud border border-cyan-400/30 bg-cyan-400/10 px-2 py-1 text-cyan-100">
            Credits: {credits}
          </Badge>
        </div>
      </div>
    </header>
  )
}
