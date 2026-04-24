"use client"

import React, { useEffect, useRef } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Textarea } from "@/components/ui/textarea"
import { HelpTooltip } from "@/components/editor-v2/help-tooltip"
import { Bot, CheckCircle2, Send, Sparkles } from "lucide-react"

interface CopilotPanelProps {
  prompt: string
  onPromptChange: (value: string) => void
  onPromptSubmit: () => void
  gamePlan: string[]
  promptChips: string[]
  onPromptChip: (command: string) => void
  readOnly?: boolean
  readOnlyMessage?: string
}

export function CopilotPanel({
  prompt,
  onPromptChange,
  onPromptSubmit,
  gamePlan,
  promptChips,
  onPromptChip,
  readOnly = false,
  readOnlyMessage,
}: CopilotPanelProps) {
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
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-white">
            <Bot className="h-5 w-5 text-purple-300" />
            <h2 className="text-base font-semibold">AI Copilot</h2>
            <HelpTooltip
              label="AI Copilot"
              description="Prompt planning is active here. Describe the game, review the Blueprint, then generate the prototype."
            />
          </div>
          {readOnly ? (
            <Badge variant="outline" className="border-amber-300/40 text-amber-100">
              Read Only
            </Badge>
          ) : null}
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
            <p className="text-[11px] tracking-[0.12em] text-cyan-100/85">Prompt Prototype</p>
            <p className="mt-1 text-sm leading-relaxed text-white/82">
              Describe the game, review the Blueprint, then generate the prototype.
            </p>
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
        </div>
      </ScrollArea>

      <div className="border-t border-white/10 bg-[rgba(7,12,22,0.82)] p-4 backdrop-blur-xl">
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
              className="h-12 w-12 rounded-2xl bg-gradient-to-r from-blue-500 to-purple-500 text-white"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </aside>
  )
}
