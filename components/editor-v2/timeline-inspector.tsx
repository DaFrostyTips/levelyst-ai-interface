"use client"

import { useMemo } from "react"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { HelpTooltip } from "@/components/editor-v2/help-tooltip"
import { getSystemLabel } from "@/lib/editor-v2-lexicon"
import type { LevelSection, ModuleNode } from "@/lib/editor-v2-model"
import { Clock3, Link2, PackagePlus, Stethoscope } from "lucide-react"

interface TimelineInspectorProps {
  sections: LevelSection[]
  nodes: ModuleNode[]
  selectedNode: ModuleNode | null
  activeTab?: "timeline" | "inspector"
  onTabChange?: (tab: "timeline" | "inspector") => void
  onReorderSections: (dragId: string, targetId: string) => void
  onToggleSection: (sectionId: string) => void
  onAttachModuleToSection: (moduleId: string, sectionId: string) => void
}

export function TimelineInspector({
  sections,
  nodes,
  selectedNode,
  activeTab = "timeline",
  onTabChange,
  onReorderSections,
  onToggleSection,
  onAttachModuleToSection,
}: TimelineInspectorProps) {
  const sortedSections = useMemo(() => [...sections].sort((a, b) => a.order - b.order), [sections])
  const selectedNodeSectionCount = useMemo(
    () => sections.filter((section) => selectedNode && section.moduleIds.includes(selectedNode.id)).length,
    [sections, selectedNode],
  )

  return (
    <div className="lv-glass-shell h-full rounded-2xl">
      <Tabs
        value={activeTab}
        onValueChange={(value) => onTabChange?.(value as "timeline" | "inspector")}
        className="flex h-full min-h-0 flex-col"
      >
        <div className="border-b border-white/10 p-3">
          <TabsList className="lv-glass-hud grid h-10 w-[260px] grid-cols-2">
            <TabsTrigger value="timeline" className="rounded-xl text-white data-[state=active]:bg-white/12">
              <Clock3 className="mr-2 h-4 w-4" />
              Timeline
            </TabsTrigger>
            <TabsTrigger value="inspector" className="rounded-xl text-white data-[state=active]:bg-white/12">
              <Stethoscope className="mr-2 h-4 w-4" />
              Inspector
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="timeline" className="lv-scrollbar-hidden mt-0 min-h-0 flex-1 overflow-auto p-4">
          <div className="grid gap-5 lg:grid-cols-[300px_1fr]">
            <section className="lv-glass-hud rounded-xl p-3">
              <p className="mb-2 text-xs tracking-[0.12em] text-cyan-100/85">Module Chips</p>
              <div className="flex flex-wrap gap-2">
                {nodes.map((node) => (
                  <button
                    key={node.id}
                    draggable
                    onDragStart={(event) => event.dataTransfer.setData("application/x-levelyst-node", node.id)}
                    className="rounded-full border border-cyan-300/35 bg-cyan-300/10 px-3 py-1 text-xs text-cyan-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
                  >
                    {node.name}
                  </button>
                ))}
                {nodes.length === 0 && <p className="text-sm text-cyan-100/80">Place modules in the canvas first.</p>}
              </div>
            </section>

            <section className="lv-glass-hud space-y-3 rounded-xl p-3">
              <div className="flex items-center gap-2">
                <p className="text-xs tracking-[0.12em] text-cyan-100/85">Level Structure</p>
                <HelpTooltip
                  label="Level Structure"
                  description="Defines game progression. Attach systems to sections like Intro, Gameplay Loop, Boss Fight, or End."
                />
              </div>
              {sortedSections.map((section) => (
                <article
                  key={section.id}
                  draggable
                  onDragStart={(event) => event.dataTransfer.setData("application/x-levelyst-section", section.id)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault()
                    const sectionDragId = event.dataTransfer.getData("application/x-levelyst-section")
                    const moduleDragId = event.dataTransfer.getData("application/x-levelyst-node")
                    if (sectionDragId) {
                      onReorderSections(sectionDragId, section.id)
                    }
                    if (moduleDragId) {
                      onAttachModuleToSection(moduleDragId, section.id)
                    }
                  }}
                  className="lv-glass-hud rounded-lg p-3 focus-within:ring-2 focus-within:ring-cyan-300/45"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-white">{section.title}</p>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="border-white/20 text-xs text-cyan-100/80">
                        {section.moduleIds.length}
                      </Badge>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => onToggleSection(section.id)}
                        className="h-7 px-2 text-xs text-cyan-100/70 hover:bg-white/10"
                      >
                        {section.expanded ? "Collapse" : "Expand"}
                      </Button>
                    </div>
                  </div>

                  {section.expanded && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {section.moduleIds.length === 0 && (
                        <p className="text-xs text-cyan-100/60">Drop module chips here.</p>
                      )}
                      {section.moduleIds.map((moduleId) => {
                        const node = nodes.find((entry) => entry.id === moduleId)
                        return (
                          <Badge key={moduleId} variant="secondary" className="bg-purple-400/20 text-purple-100">
                            <Link2 className="mr-1 h-3 w-3" />
                            {node?.name ?? "Module"}
                          </Badge>
                        )
                      })}
                    </div>
                  )}
                </article>
              ))}
            </section>
          </div>
        </TabsContent>

        <TabsContent value="inspector" className="lv-scrollbar-hidden mt-0 min-h-0 flex-1 overflow-auto p-4">
          <div className="lv-glass-hud rounded-xl p-4">
            {selectedNode ? (
              <div className="space-y-3 text-sm">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-cyan-200/70">Selected Node</p>
                  <p className="text-lg font-semibold text-white">{selectedNode.name}</p>
                </div>
                <p className="text-cyan-100/75">{selectedNode.description}</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="lv-glass-hud rounded-lg p-3">
                    <p className="text-xs uppercase tracking-wide text-cyan-100/70">Dependencies</p>
                    <p className="text-white">
                      {selectedNode.dependencies.map((dependency) => getSystemLabel(dependency)).join(", ") || "None"}
                    </p>
                  </div>
                  <div className="lv-glass-hud rounded-lg p-3">
                    <p className="text-xs uppercase tracking-wide text-cyan-100/70">Sections Attached</p>
                    <p className="text-white">{selectedNodeSectionCount}</p>
                  </div>
                </div>
                <div className="rounded-lg border border-emerald-300/25 bg-emerald-300/10 p-3 text-emerald-100">
                  <p className="text-xs uppercase tracking-wide">Node Health</p>
                  <p className="mt-1 font-semibold">Operational</p>
                </div>
              </div>
            ) : (
              <div className="text-center text-sm text-cyan-100/65">
                <PackagePlus className="mx-auto mb-2 h-5 w-5" />
                Select a module node from the canvas to inspect it.
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
