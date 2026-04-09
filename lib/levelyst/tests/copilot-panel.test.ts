import { createElement, type ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

vi.mock("@/components/editor-v2/help-tooltip", () => ({
  HelpTooltip: () => null,
}))

vi.mock("@/components/ui/badge", () => ({
  Badge: ({ children }: { children: ReactNode }) => createElement("span", null, children),
}))

vi.mock("@/components/ui/button", () => ({
  Button: ({ children }: { children: ReactNode }) => createElement("button", null, children),
}))

vi.mock("@/components/ui/scroll-area", () => ({
  ScrollArea: ({ children }: { children: ReactNode }) => createElement("div", null, children),
}))

vi.mock("@/components/ui/textarea", () => ({
  Textarea: () => createElement("textarea"),
}))

import { CopilotPanel } from "@/components/editor-v2/copilot-panel"

describe("copilot panel", () => {
  it("renders the AI runtime status copy without introducing a blocking state", () => {
    const markup = renderToStaticMarkup(
      createElement(CopilotPanel, {
        prompt: "",
        onPromptChange: () => {},
        onPromptSubmit: () => {},
        gamePlan: [],
        planningSteps: [],
        recommendations: [],
        promptChips: [],
        onPromptChip: () => {},
        planningProfile: "default",
        onPlanningProfileChange: () => {},
        localAiStatus: {
          state: "fallback",
          badgeLabel: "Fallback Mode",
          detail: "Rule-based planning stays instant while Ollama is offline, so prompts still work for the demo.",
          actionHint: "Start Ollama, then run npm run warmup:local-ai to preload qwen3:4b.",
          warmupCommand: "npm run warmup:local-ai",
          model: "qwen3:4b",
        },
      }),
    )

    expect(markup).toContain("Fallback Mode")
    expect(markup).toContain("AI Runtime")
    expect(markup).toContain("npm run warmup:local-ai")
    expect(markup).not.toContain("Analyzing Prompt")
  })
})
