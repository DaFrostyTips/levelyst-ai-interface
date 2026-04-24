import { createElement, type ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

vi.mock("@/components/editor-v2/help-tooltip", () => ({
  HelpTooltip: ({ label }: { label: string }) => createElement("button", { "aria-label": `${label} help` }),
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
  it("renders the AI copilot help affordance without the removed runtime block", () => {
    const markup = renderToStaticMarkup(
      createElement(CopilotPanel, {
        prompt: "",
        onPromptChange: () => {},
        onPromptSubmit: () => {},
        gamePlan: [],
        promptChips: [],
        onPromptChip: () => {},
      }),
    )

    expect(markup).toContain("AI Copilot")
    expect(markup).toContain("Prompt Prototype")
    expect(markup).toContain("aria-label=\"AI Copilot help\"")
    expect(markup).not.toContain("AI Runtime")
    expect(markup).not.toContain("Fallback Mode")
  })
})
