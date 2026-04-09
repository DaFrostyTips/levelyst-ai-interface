import { describe, expect, it } from "vitest"
import { deriveCopilotLocalAiStatus } from "@/lib/levelyst/local-ai-status"

describe("local AI status", () => {
  it("reports an active local wording state when Ollama and the model are available", () => {
    const status = deriveCopilotLocalAiStatus({
      mode: "copy_only",
      model: "qwen3:4b",
      health: {
        reachable: true,
        modelAvailable: true,
        error: null,
      },
    })

    expect(status.state).toBe("active")
    expect(status.badgeLabel).toBe("Local AI Wording Active")
    expect(status.actionHint).toContain("npm run warmup:local-ai")
  })

  it("reports fallback mode when Ollama is offline", () => {
    const status = deriveCopilotLocalAiStatus({
      mode: "copy_only",
      model: "qwen3:4b",
      health: {
        reachable: false,
        modelAvailable: false,
        error: "offline",
      },
    })

    expect(status.state).toBe("fallback")
    expect(status.badgeLabel).toBe("Fallback Mode")
    expect(status.detail).toContain("instant")
  })
})
