"use client"

import type React from "react"

import { HelpTooltip } from "@/components/editor-v2/help-tooltip"
import { cn } from "@/lib/utils"
import type { ModuleCategory } from "@/lib/editor-v2-model"

export interface ModuleTemplate {
  typeId: string
  name: string
  category: ModuleCategory
  description: string
  supports: string[]
  dependencies: string[]
  displayInputs?: string[]
  displayOutputs?: string[]
  displayDependencies?: string[]
  aiCompatible: boolean
  icon: React.ComponentType<{ className?: string }>
}

interface ModuleLibraryPanelProps {
  templates: ModuleTemplate[]
  selectedTypeId?: string
  onSelect: (typeId: string) => void
}

const categoryRailMap: Record<ModuleCategory, string> = {
  CORE: "from-blue-500 to-sky-400",
  AI: "from-purple-500 to-fuchsia-400",
  COMBAT: "from-red-500 to-rose-400",
  PHYSICS: "from-slate-500 to-slate-300",
  UI: "from-cyan-500 to-sky-300",
  AUDIO: "from-emerald-500 to-green-300",
}

export function ModuleLibraryPanel({ templates, selectedTypeId, onSelect }: ModuleLibraryPanelProps) {
  const grouped = templates.reduce<Record<ModuleCategory, ModuleTemplate[]>>(
    (acc, template) => {
      acc[template.category].push(template)
      return acc
    },
    {
      CORE: [],
      AI: [],
      COMBAT: [],
      PHYSICS: [],
      UI: [],
      AUDIO: [],
    },
  )

  return (
    <aside className="lv-glass-shell lv-scrollbar-hidden h-full overflow-y-auto rounded-2xl p-5">
      <div className="mb-4">
        <p className="text-xs tracking-[0.14em] text-cyan-100/85">Module Library</p>
        <p className="mt-1 text-sm leading-relaxed text-white/85">Select a system to inspect its role and dependencies.</p>
        <div className="mt-3 flex items-center gap-2">
          <p className="text-[11px] tracking-[0.1em] text-cyan-100/80">Module Dependencies</p>
          <HelpTooltip
            label="Module Dependencies"
            description="Dependencies define which systems this module expects before it can run cleanly in your graph."
          />
        </div>
      </div>

      <div className="space-y-4">
        {(Object.keys(grouped) as ModuleCategory[]).map((category) => (
          <section key={category} className="space-y-2.5">
            <div className="flex items-center gap-2">
              <div className={cn("h-1.5 w-14 rounded-full bg-gradient-to-r", categoryRailMap[category])} />
              <h3 className="text-[11px] font-semibold tracking-[0.14em] text-cyan-50/90">{category}</h3>
            </div>

            <div className="space-y-2">
              {grouped[category].map((template) => {
                const Icon = template.icon
                const isActive = selectedTypeId === template.typeId
                const dependencies = cleanMetadataValues(template.displayDependencies ?? template.dependencies)
                const dependencySummary =
                  dependencies.length > 0 ? dependencies.map(humanizeModuleDependency).join(", ") : "Standalone module"
                return (
                  <article
                    key={template.typeId}
                    draggable
                    tabIndex={0}
                    onDragStart={(event) => {
                      event.dataTransfer.setData("application/x-levelyst-module", template.typeId)
                      event.dataTransfer.effectAllowed = "copy"
                    }}
                    onClick={() => onSelect(template.typeId)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault()
                        onSelect(template.typeId)
                      }
                    }}
                    className={cn(
                      "cursor-grab rounded-xl border p-3 transition",
                      "lv-glass-hud hover:border-cyan-300/40 hover:shadow-[0_0_22px_rgba(59,130,246,0.2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60",
                      isActive && "border-blue-300/60 shadow-[0_0_24px_rgba(59,130,246,0.24)]",
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <div className={cn("rounded-full bg-gradient-to-r p-2.5 shadow-[0_0_18px_rgba(59,130,246,0.26)]", categoryRailMap[category])}>
                        <Icon className="h-4 w-4 text-white" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <h4 className="truncate text-sm font-semibold uppercase tracking-[0.12em] text-white">{template.name}</h4>
                            <p className="mt-1 font-code text-[10px] tracking-[0.16em] text-cyan-100/78">
                              {template.category} Module
                            </p>
                          </div>
                        </div>
                        <p className="mt-2 truncate text-sm text-cyan-50/88">{template.description}</p>
                        <p className="mt-2 text-xs text-cyan-100/72">
                          <span className="font-semibold uppercase tracking-[0.12em] text-cyan-100/78">Requires</span>{" "}
                          {dependencySummary}
                        </p>
                        {isActive ? (
                          <div className="lv-glass-hud mt-3 rounded-lg p-3">
                            <p className="text-sm leading-relaxed text-white/88">{template.description}</p>
                            {dependencies.length > 0 ? (
                              <div className="mt-3">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-cyan-100/82">
                                  Dependencies
                                </p>
                                <p className="mt-1 text-sm leading-relaxed text-white/86">
                                  {dependencies.map(humanizeModuleDependency).join(", ")}
                                </p>
                              </div>
                            ) : (
                              <div className="mt-3">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-cyan-100/82">
                                  Dependencies
                                </p>
                                <p className="mt-1 text-sm leading-relaxed text-white/86">No required systems.</p>
                              </div>
                            )}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>
          </section>
        ))}
      </div>
    </aside>
  )
}

function cleanMetadataValues(values: string[] | undefined) {
  return (values ?? []).map((value) => value.trim()).filter((value) => value.length > 0 && value !== "None")
}

function humanizeModuleDependency(value: string) {
  return value
    .split("/")
    .at(-1)
    ?.replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase()) ?? value
}
