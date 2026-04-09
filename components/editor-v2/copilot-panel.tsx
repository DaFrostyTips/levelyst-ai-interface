"use client"

import React, { useEffect, useMemo, useRef } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Textarea } from "@/components/ui/textarea"
import { HelpTooltip } from "@/components/editor-v2/help-tooltip"
import type { AIPlanningStep, CopilotSuggestion } from "@/lib/editor-v2-model"
import type { CopilotLocalAiStatus } from "@/lib/levelyst/local-ai-status"
import { Bot, CheckCircle2, Circle, Loader2, Send, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"

interface CopilotPanelProps {
  prompt: string
  onPromptChange: (value: string) => void
  onPromptSubmit: () => void
  gamePlan: string[]
  planningSteps: AIPlanningStep[]
  recommendations: CopilotSuggestion[]
  promptChips: string[]
  onPromptChip: (command: string) => void
  planningProfile: "default" | "presentation"
  onPlanningProfileChange: (profile: "default" | "presentation") => void
  localAiStatus: CopilotLocalAiStatus
  onOpenPresentationScreen?: () => void
  readOnly?: boolean
  readOnlyMessage?: string
}

export function CopilotPanel({
  prompt,
  onPromptChange,
  onPromptSubmit,
  gamePlan,
  planningSteps,
  recommendations,
  promptChips,
  onPromptChip,
  planningProfile,
  onPlanningProfileChange,
  localAiStatus,
  onOpenPresentationScreen,
  readOnly = false,
  readOnlyMessage,
}: CopilotPanelProps) {
  const isPlanning = useMemo(() => planningSteps.some((step) => step.status === "running"), [planningSteps])
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return

    textarea.style.height = "0px"
    textarea.style.height = `${Math.min(textarea.scrollHeight, 180)}px`
  }, [prompt])

  return (
    <aside className="lv-glass-shell flex h-full min-h-0 flex-col rounded-2xl">
      <div className="border-b border-white/10 px-5 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-white">
            <Bot className="h-5 w-5 text-purple-300" />
            <h2 className="text-base font-semibold">AI Copilot</h2>
          </div>
          <Badge
            variant="outline"
            className={readOnly ? "border-amber-300/40 text-amber-100" : "border-emerald-300/40 text-emerald-200"}
          >
            {readOnly ? "Read Only" : "Online"}
          </Badge>
        </div>
        {readOnlyMessage ? (
          <div className="mt-3 rounded-xl border border-amber-300/35 bg-amber-400/10 px-3 py-2 text-sm text-amber-50/90">
            {readOnlyMessage}
          </div>
        ) : null}
      </div>

      <ScrollArea className="min-h-0 flex-1 px-5 py-5">
        <div className="space-y-4 pb-3">
          <section className="lv-glass-hud rounded-xl p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] tracking-[0.12em] text-cyan-100/85">Prompt Prototype</p>
                <p className="mt-1 text-sm leading-relaxed text-white/82">
                  Describe the game, review the Blueprint, then generate the prototype.
                </p>
              </div>
              <Badge
                variant="outline"
                className={
                  planningProfile === "presentation"
                    ? "border-amber-300/40 bg-amber-400/10 text-amber-100"
                    : "border-cyan-300/35 bg-cyan-400/10 text-cyan-100"
                }
              >
                {planningProfile === "presentation" ? "Demo Bias" : "Default"}
              </Badge>
            </div>
          </section>

          <section className="lv-glass-hud space-y-3 rounded-xl p-4">
            <div className="flex items-center gap-2">
              <p className="text-[11px] tracking-[0.12em] text-cyan-100/85">AI Status</p>
              <HelpTooltip
                label="AI Status Panel"
                description="Shows staged copilot progress from prompt analysis through module graph assembly and prototype generation."
              />
            </div>
            <div className="space-y-2">
              <div
                className={cn(
                  "rounded-xl border p-3",
                  localAiStatus.state === "active"
                    ? "border-emerald-300/35 bg-emerald-400/10"
                    : localAiStatus.state === "fallback"
                      ? "border-amber-300/35 bg-amber-400/10"
                      : "border-slate-300/20 bg-white/5",
                )}
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[11px] uppercase tracking-[0.16em] text-cyan-100/80">Local AI Copy</p>
                  <Badge
                    variant="outline"
                    className={cn(
                      localAiStatus.state === "active"
                        ? "border-emerald-300/40 bg-emerald-400/10 text-emerald-100"
                        : localAiStatus.state === "fallback"
                          ? "border-amber-300/40 bg-amber-400/10 text-amber-100"
                          : "border-slate-300/30 bg-white/5 text-slate-100",
                    )}
                  >
                    {localAiStatus.badgeLabel}
                  </Badge>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-white/88">{localAiStatus.detail}</p>
                {localAiStatus.actionHint ? (
                  <p className="mt-2 text-xs text-cyan-100/70">{localAiStatus.actionHint}</p>
                ) : null}
              </div>

              {planningSteps.map((step) => (
                <div key={step.id} className="flex items-center gap-2 text-sm text-white/90">
                  {step.status === "done" && <CheckCircle2 className="h-4 w-4 text-emerald-300" />}
                  {step.status === "running" && <Loader2 className="lv-copilot-typing h-4 w-4 text-cyan-200" />}
                  {step.status === "pending" && <Circle className="h-4 w-4 text-white/30" />}
                  <span className={cn(step.status === "running" && "text-cyan-100")}>{step.label}</span>
                </div>
              ))}
              {!isPlanning && planningSteps.length === 0 && (
                <p className="text-sm text-cyan-100/85">Submit a prompt to start AI planning.</p>
              )}
            </div>
          </section>

          <section className="lv-glass-hud space-y-3 rounded-xl p-4">
            <p className="text-[11px] tracking-[0.12em] text-cyan-100/85">Current Plan</p>
            <div className="flex flex-wrap gap-2">
              {gamePlan.length === 0 ? (
                <p className="text-sm text-cyan-100/85">No systems selected yet.</p>
              ) : (
                gamePlan.map((item) => (
                  <span
                    key={item}
                    className="inline-flex items-center rounded-full border border-cyan-300/25 bg-cyan-300/10 px-3 py-1 text-xs text-cyan-50"
                  >
                    <CheckCircle2 className="mr-1.5 h-3.5 w-3.5 text-cyan-200" />
                    {item}
                  </span>
                ))
              )}
            </div>
          </section>

          {recommendations.length > 0 ? (
            <section className="lv-glass-hud space-y-3 rounded-xl p-4">
              <p className="text-[11px] tracking-[0.12em] text-cyan-100/85">Recommendations</p>
              <div className="space-y-2">
                {recommendations.map((suggestion) => (
                  <div key={suggestion.id} className="lv-glass-hud rounded-lg border border-purple-300/25 bg-purple-400/10 p-2.5">
                    <p className="text-sm font-semibold text-white">{suggestion.title}</p>
                    <p className="mt-1 text-sm leading-relaxed text-cyan-100/85">{suggestion.reason}</p>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </ScrollArea>

      <div className="border-t border-white/10 bg-[rgba(7,12,22,0.82)] p-4 backdrop-blur-xl">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant={planningProfile === "presentation" ? "default" : "outline"}
            onClick={() => onPlanningProfileChange(planningProfile === "presentation" ? "default" : "presentation")}
            disabled={readOnly}
            className={
              planningProfile === "presentation"
                ? "bg-gradient-to-r from-amber-500 to-orange-500 text-white"
                : "lv-chrome-control text-white"
            }
          >
            {planningProfile === "presentation" ? "Demo Bias On" : "Enable Demo Bias"}
          </Button>
          {onOpenPresentationScreen ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onOpenPresentationScreen}
              className="lv-chrome-control text-white"
            >
              Presentation Screen
            </Button>
          ) : null}
        </div>

        <div className="lv-scrollbar-hidden -mx-1 mb-3 overflow-x-auto px-1 pb-1">
          <div className="flex min-w-max gap-2">
            {promptChips.map((command) => (
              <button
                key={command}
                onClick={() => onPromptChip(command)}
                disabled={readOnly}
                className="lv-chrome-control rounded-full px-3 py-1 text-xs text-cyan-100/90 transition focus-visible:ring-2 focus-visible:ring-cyan-300"
              >
                <Sparkles className="mr-1 inline h-3 w-3" />
                {command}
              </button>
            ))}
          </div>
        </div>

        <div className="lv-glass-hud rounded-2xl p-3 shadow-[0_18px_40px_rgba(0,0,0,0.25)]">
          <div className="flex items-end gap-3">
            <Textarea
              ref={textareaRef}
              value={prompt}
              rows={1}
              disabled={readOnly}
              onChange={(event) => onPromptChange(event.target.value)}
              onKeyDown={(event) => {
                if (readOnly) {
                  event.preventDefault()
                  return
                }
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault()
                  onPromptSubmit()
                }
              }}
              placeholder="Create a Mario-like platformer..."
              className="max-h-[180px] min-h-[52px] resize-none border-white/15 bg-transparent text-white placeholder:text-cyan-100/45 focus-visible:ring-cyan-300/55"
            />
            <Button
              onClick={onPromptSubmit}
              disabled={readOnly}
              className="h-12 shrink-0 rounded-2xl bg-gradient-to-r from-blue-500 to-purple-500 px-4 text-white hover:from-blue-400 hover:to-purple-400"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </aside>
  )
}
