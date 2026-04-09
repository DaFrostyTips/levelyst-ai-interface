"use client"

import { useEffect, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import type { BlueprintState, BlueprintSystemItem, IntentBlueprint, PendingPromptMode } from "@/lib/editor-v2-model"
import { ArrowDown, ArrowUp, ChevronDown, ChevronUp, Loader2, Plus, Sparkles, X } from "lucide-react"

interface BlueprintReviewPanelProps {
  open: boolean
  state: BlueprintState
  mode: PendingPromptMode
  variant?: "initial" | "update"
  blueprint: IntentBlueprint | null
  addableCoreSystems: BlueprintSystemItem[]
  addableGameplaySystems: BlueprintSystemItem[]
  onCancel: () => void
  onGenerate: () => void
  onRemoveSystem: (bucket: "core" | "gameplay", typeId: string) => void
  onAddSystem: (bucket: "core" | "gameplay", typeId: string) => void
  onMoveLevelSection: (index: number, direction: "up" | "down") => void
  readOnly?: boolean
}

export function BlueprintReviewPanel({
  open,
  state,
  mode,
  variant = "initial",
  blueprint,
  addableCoreSystems,
  addableGameplaySystems,
  onCancel,
  onGenerate,
  onRemoveSystem,
  onAddSystem,
  onMoveLevelSection,
  readOnly = false,
}: BlueprintReviewPanelProps) {
  const isPlanning = state === "planning"
  const isGenerating = state === "generating"
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false)

  useEffect(() => {
    if (!open) {
      setShowTechnicalDetails(false)
    }
  }, [open])

  const diagnostics = blueprint?.plannerDiagnostics ?? null
  const isUpdateReview = variant === "update"
  const canApplyUpdate = mode !== "patch" || !diagnostics || diagnostics.supported_changes.length > 0
  const unchangedSummary =
    diagnostics?.edit_category === "appearance_patch"
      ? ["Core gameplay rules and controls stay the same.", "The current playable family stays the same."]
      : diagnostics?.edit_category === "mechanics_patch"
        ? ["The overall game family and visual style stay the same.", "Only the tuned systems listed below will change."]
        : diagnostics?.edit_category === "unsupported_request"
          ? ["The current playable prototype stays exactly as it is.", "No runtime or module changes will be applied."]
          : mode === "replace"
            ? ["The current playable build stays available until you confirm this update."]
            : ["The current playable build stays available until you confirm this update."]

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !isGenerating) onCancel()
      }}
    >
      <DialogContent className="lv-glass-modal max-w-5xl p-0 text-white">
        <DialogHeader className="border-b border-white/10 px-6 py-5">
          <DialogTitle className="flex items-center justify-between gap-4 text-left text-xl">
            <span className="font-display">{isUpdateReview ? "Update Prototype" : "AI Game Blueprint"}</span>
            <div className="flex flex-wrap items-center justify-end gap-2">
              {mode && (
                <Badge
                  variant="outline"
                  className={
                    mode === "patch"
                      ? "border-amber-300/45 bg-amber-400/10 text-[10px] uppercase tracking-[0.16em] text-amber-100"
                      : "border-violet-300/45 bg-violet-400/10 text-[10px] uppercase tracking-[0.16em] text-violet-100"
                  }
                >
                {mode === "patch" ? "Patch Review" : isUpdateReview ? "Build Replacement" : "Replacement Review"}
                  </Badge>
              )}
              <Badge
                variant="outline"
                className="border-cyan-300/45 bg-cyan-400/10 text-[10px] uppercase tracking-[0.16em] text-cyan-100"
              >
                {isPlanning ? "Planning" : isGenerating ? "Generating" : isUpdateReview ? "Update Review" : "Review"}
              </Badge>
            </div>
          </DialogTitle>
        </DialogHeader>

        {isPlanning && (
          <div className="px-6 py-12 text-center">
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-cyan-200" />
            <p className="mt-4 text-sm uppercase tracking-[0.18em] text-cyan-100/70">Analyzing Prompt</p>
            <p className="mt-2 text-sm text-white/85">Interpreting the prompt, selecting a game family, and preparing the prototype plan.</p>
          </div>
        )}

        {!isPlanning && blueprint && (
          <>
            <ScrollArea className="max-h-[72vh] px-6 py-5">
              <div className="space-y-4">
                {blueprint.adaptationNote && !isUpdateReview && (
                  <section className="lv-glass-hud rounded-xl border border-amber-300/40 bg-amber-400/10 p-4">
                    <p className="text-[11px] uppercase tracking-[0.16em] text-amber-100/95">Closest Supported Slice</p>
                    <p className="mt-2 text-sm leading-relaxed text-amber-50/90">{blueprint.adaptationNote}</p>
                  </section>
                )}

                {isUpdateReview ? (
                  <div className="grid gap-4 lg:grid-cols-2">
                    <ListSection
                      title="What Will Change"
                      items={
                        diagnostics?.supported_changes.length
                          ? diagnostics.supported_changes
                          : ["No supported prototype changes are ready to apply yet."]
                      }
                    />
                    <ListSection title="What Stays The Same" items={unchangedSummary} />

                    {diagnostics?.unsupported_requests.length ? (
                      <ListSection
                        title="What I Couldn’t Change Yet"
                        items={diagnostics.unsupported_requests}
                        className="border-amber-300/35 bg-amber-400/10"
                      />
                    ) : null}

                    {diagnostics?.suggested_supported_prompts.length ? (
                      <ListSection title="Suggested Next Prompts" items={diagnostics.suggested_supported_prompts} />
                    ) : null}
                  </div>
                ) : (
                  <>
                    <div className="grid gap-4 lg:grid-cols-2">
                      <InfoSection title="Game Type" value={blueprint.gameTypeLabel} />
                      <InfoSection title="Environment" value={blueprint.environmentLabel} />

                      <section className="lv-glass-hud rounded-xl p-4 lg:col-span-2">
                        <p className="text-[11px] tracking-[0.12em] text-cyan-100/85">Player Experience</p>
                        <p className="mt-2 text-sm leading-relaxed text-white/92">{blueprint.playerExperience}</p>
                      </section>

                      <ListSection title="Core Gameplay" items={blueprint.coreGameplay} />
                      <ListSection title="Game Structure" items={blueprint.gameStructure} />
                    </div>

                      <section className="lv-glass-hud rounded-xl border border-cyan-300/25 bg-cyan-400/5 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-[11px] uppercase tracking-[0.16em] text-cyan-100/90">Prompt Interpretation</p>
                          <p className="mt-1 text-sm text-white/88">
                            Selected game family: <span className="font-medium text-cyan-100">{diagnostics?.explanation.selected_family_label ?? blueprint.gameTypeLabel}</span>
                          </p>
                        </div>
                      </div>
                      {blueprint.promptInterpretation.length > 0 ? (
                        <div className="mt-3 grid gap-2 sm:grid-cols-2">
                          {blueprint.promptInterpretation.map((item) => (
                            <div key={`${item.term}-${item.meaning}`} className="lv-glass-hud rounded-lg px-3 py-2">
                              <p className="text-[10px] uppercase tracking-[0.14em] text-cyan-100/80">{item.term}</p>
                              <p className="mt-1 text-sm text-white/88">{item.meaning}</p>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-3 text-sm text-cyan-100/70">The planner used the detected gameplay cues to build the closest supported prototype family.</p>
                      )}
                    </section>
                  </>
                )}

                <section className="lv-glass-hud rounded-xl p-4">
                  <button
                    type="button"
                    onClick={() => setShowTechnicalDetails((value) => !value)}
                    className="flex w-full items-center justify-between text-left"
                  >
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.16em] text-cyan-100/90">Show Technical Details</p>
                      <p className="mt-1 text-sm text-white/70">Reveal capabilities, translated modules, dependency graph, and advanced editing controls.</p>
                    </div>
                    {showTechnicalDetails ? <ChevronUp className="h-5 w-5 text-cyan-100/75" /> : <ChevronDown className="h-5 w-5 text-cyan-100/75" />}
                  </button>

                  {showTechnicalDetails && diagnostics && (
                    <div className="mt-4 space-y-4">
                      <TechnicalBadgeSection
                        title="Capabilities"
                        items={diagnostics.resolved_capabilities.map(humanizePlannerToken)}
                      />
                      <TechnicalBadgeSection
                        title="Modules"
                        items={diagnostics.translated_modules.map(humanizeModuleId)}
                      />

                      <section className="lv-glass-hud rounded-xl p-4">
                        <p className="text-[11px] uppercase tracking-[0.16em] text-cyan-100/90">Dependency Graph</p>
                        {diagnostics.dependency_graph_preview.edges.length > 0 ? (
                          <div className="mt-3 space-y-2">
                            {diagnostics.dependency_graph_preview.edges.map((edge) => (
                              <div key={`${edge.from}-${edge.to}`} className="lv-glass-hud flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-white/88">
                                <span>{humanizeModuleId(edge.from)}</span>
                                <span className="text-cyan-100/65">requires</span>
                                <span>{humanizeModuleId(edge.to)}</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="mt-3 text-sm text-cyan-100/70">No additional dependency links are required beyond the translated module set.</p>
                        )}
                      </section>

                      <div className="grid gap-4 lg:grid-cols-2">
                        <EditableSystemsSection
                          title="Core Systems"
                          systems={blueprint.coreSystems}
                          addableSystems={addableCoreSystems}
                          accentClassName="border-cyan-300/35 bg-cyan-400/10 text-cyan-100 hover:bg-cyan-400/20 focus-visible:ring-cyan-300"
                          onRemove={(typeId) => onRemoveSystem("core", typeId)}
                          onAdd={(typeId) => onAddSystem("core", typeId)}
                          readOnly={readOnly}
                        />
                        <EditableSystemsSection
                          title="Gameplay Systems"
                          systems={blueprint.gameplaySystems}
                          addableSystems={addableGameplaySystems}
                          accentClassName="border-purple-300/35 bg-purple-400/10 text-purple-100 hover:bg-purple-400/20 focus-visible:ring-purple-300"
                          onRemove={(typeId) => onRemoveSystem("gameplay", typeId)}
                          onAdd={(typeId) => onAddSystem("gameplay", typeId)}
                          readOnly={readOnly}
                        />
                      </div>

                      <section className="lv-glass-hud rounded-xl p-4">
                        <p className="text-[11px] uppercase tracking-[0.16em] text-cyan-100/90">Technical Level Structure</p>
                        <div className="mt-3 space-y-2">
                          {blueprint.levelStructure.map((section, index) => (
                            <div key={`${section}-${index}`} className="lv-glass-hud flex items-center justify-between rounded-lg px-3 py-2">
                              <p className="text-sm text-white/90">{section}</p>
                              <div className="flex items-center gap-1">
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => onMoveLevelSection(index, "up")}
                                  disabled={readOnly || index === 0}
                                  className="h-7 w-7 text-cyan-100/70 hover:bg-white/10 hover:text-white disabled:opacity-35"
                                >
                                  <ArrowUp className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => onMoveLevelSection(index, "down")}
                                  disabled={readOnly || index === blueprint.levelStructure.length - 1}
                                  className="h-7 w-7 text-cyan-100/70 hover:bg-white/10 hover:text-white disabled:opacity-35"
                                >
                                  <ArrowDown className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </section>
                    </div>
                  )}
                </section>
              </div>
            </ScrollArea>

            <div className="flex items-center justify-between border-t border-white/10 px-6 py-4">
              <Button
                variant="ghost"
                onClick={onCancel}
                disabled={isGenerating}
                className="text-cyan-100/80 hover:bg-white/10 hover:text-white"
              >
                Cancel
              </Button>
              <Button
                onClick={onGenerate}
                disabled={readOnly || isGenerating || !canApplyUpdate}
                className="bg-gradient-to-r from-blue-500 to-purple-500 text-white hover:from-blue-400 hover:to-purple-400"
              >
                {isGenerating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                {mode === "patch"
                  ? canApplyUpdate
                    ? "Apply Prototype Update"
                    : "No Supported Changes Yet"
                  : isUpdateReview
                    ? "Apply Build Replacement"
                    : "Generate Prototype"}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

function InfoSection({ title, value }: { title: string; value: string }) {
  return (
    <section className="lv-glass-hud rounded-xl p-4">
      <p className="text-[11px] tracking-[0.12em] text-cyan-100/85">{title}</p>
      <p className="mt-2 text-sm text-white/92">{value}</p>
    </section>
  )
}

function ListSection({ title, items, className }: { title: string; items: string[]; className?: string }) {
  return (
    <section className={`lv-glass-hud rounded-xl p-4 ${className ?? ""}`}>
      <p className="text-[11px] tracking-[0.12em] text-cyan-100/85">{title}</p>
      <div className="mt-3 space-y-2">
        {items.map((item) => (
          <div key={`${title}-${item}`} className="lv-glass-hud rounded-lg px-3 py-2 text-sm text-white/90">
            {item}
          </div>
        ))}
      </div>
    </section>
  )
}

function TechnicalBadgeSection({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="lv-glass-hud rounded-xl p-4">
      <p className="text-[11px] uppercase tracking-[0.16em] text-cyan-100/90">{title}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {items.map((item) => (
          <Badge key={`${title}-${item}`} variant="outline" className="lv-chrome-control border-white/10 text-[11px] text-white/88">
            {item}
          </Badge>
        ))}
      </div>
    </section>
  )
}

function EditableSystemsSection({
  title,
  systems,
  addableSystems,
  accentClassName,
  onRemove,
  onAdd,
  readOnly = false,
}: {
  title: string
  systems: BlueprintSystemItem[]
  addableSystems: BlueprintSystemItem[]
  accentClassName: string
  onRemove: (typeId: string) => void
  onAdd: (typeId: string) => void
  readOnly?: boolean
}) {
  return (
    <section className="lv-glass-hud rounded-xl p-4">
      <p className="text-[11px] uppercase tracking-[0.16em] text-cyan-100/90">{title}</p>
      <div className="mt-3 space-y-2">
        {systems.length === 0 && <p className="text-xs text-cyan-100/65">No systems selected.</p>}
        {systems.map((system) => (
          <div key={system.typeId} className="lv-glass-hud flex items-center justify-between rounded-lg px-3 py-2">
            <div>
              <p className="text-sm font-medium text-white">{system.name}</p>
              <p className="text-[10px] tracking-[0.12em] text-cyan-100/82">{system.category}</p>
            </div>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => onRemove(system.typeId)}
              disabled={readOnly}
              className="h-7 w-7 text-cyan-100/70 hover:bg-white/10 hover:text-white"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
      </div>
      {addableSystems.length > 0 && (
        <div className="mt-3">
          <p className="text-[10px] tracking-[0.12em] text-cyan-100/82">Add Suggested</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {addableSystems.map((system) => (
              <button
                key={`${title}-${system.typeId}`}
                onClick={() => onAdd(system.typeId)}
                disabled={readOnly}
                className={`rounded-full border px-2.5 py-1 text-xs transition focus-visible:outline-none focus-visible:ring-2 ${accentClassName}`}
              >
                <Plus className="mr-1 inline h-3 w-3" />
                {system.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

function humanizePlannerToken(value: string) {
  return value
    .replace(/[._-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase())
}

function humanizeModuleId(value: string) {
  const leaf = value.split("/").pop() ?? value
  return leaf
    .replace(/[._-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase())
}
