"use client"

import { CircleHelp } from "lucide-react"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

interface HelpTooltipProps {
  label: string
  description: string
  className?: string
}

export function HelpTooltip({ label, description, className }: HelpTooltipProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={`${label} help`}
          className={cn(
            "lv-chrome-control inline-flex h-5 w-5 items-center justify-center rounded-full text-cyan-100/80 transition hover:border-cyan-300/45 hover:text-white",
            className,
          )}
          data-panel-interactive="true"
        >
          <CircleHelp className="h-3.5 w-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent className="lv-glass-modal max-w-[280px] text-xs leading-relaxed text-cyan-100">
        <p className="font-semibold text-white">{label}</p>
        <p className="mt-1 text-cyan-100/80">{description}</p>
      </TooltipContent>
    </Tooltip>
  )
}
