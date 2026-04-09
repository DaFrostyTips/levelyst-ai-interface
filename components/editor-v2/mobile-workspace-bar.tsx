"use client"

import { cn } from "@/lib/utils"
import { Bot, Library, Monitor, Rows3 } from "lucide-react"
import type { ComponentType } from "react"

export type MobileWorkspace = "canvas" | "library" | "copilot" | "timeline"

interface MobileWorkspaceBarProps {
  value: MobileWorkspace
  onChange: (workspace: MobileWorkspace) => void
}

const workspaceItems: Array<{ id: MobileWorkspace; label: string; icon: ComponentType<{ className?: string }> }> = [
  { id: "canvas", label: "Canvas", icon: Monitor },
  { id: "library", label: "Library", icon: Library },
  { id: "copilot", label: "Copilot", icon: Bot },
  { id: "timeline", label: "Timeline", icon: Rows3 },
]

export function MobileWorkspaceBar({ value, onChange }: MobileWorkspaceBarProps) {
  return (
    <div className="grid grid-cols-4 gap-2 border-t border-white/10 bg-[rgba(11,18,32,0.9)] p-2 backdrop-blur-xl md:hidden">
      {workspaceItems.map((workspace) => {
        const Icon = workspace.icon
        const active = value === workspace.id
        return (
          <button
            key={workspace.id}
            onClick={() => onChange(workspace.id)}
            className={cn(
              "flex flex-col items-center justify-center gap-1 rounded-lg px-2 py-2 text-[11px] transition",
              active
                ? "bg-gradient-to-r from-blue-500/40 to-purple-500/45 text-white"
                : "text-cyan-100/85 hover:bg-white/10 hover:text-white",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60",
            )}
          >
            <Icon className="h-4 w-4" />
            {workspace.label}
          </button>
        )
      })}
    </div>
  )
}
