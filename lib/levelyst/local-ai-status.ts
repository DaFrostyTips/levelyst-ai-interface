export const LOCAL_AI_WARMUP_COMMAND = "npm run warmup:local-ai"

export type LocalAiMode = "off" | "copy_only"

export interface LocalAiHealthSnapshot {
  reachable: boolean
  modelAvailable: boolean
  error: string | null
}

export interface CopilotLocalAiStatus {
  state: "active" | "fallback" | "disabled"
  badgeLabel: string
  detail: string
  actionHint: string | null
  warmupCommand: string
  model: string
}

export function deriveCopilotLocalAiStatus(input: {
  mode: LocalAiMode
  model: string
  health?: LocalAiHealthSnapshot | null
}): CopilotLocalAiStatus {
  const warmupCommand = LOCAL_AI_WARMUP_COMMAND

  if (input.mode !== "copy_only") {
    return {
      state: "disabled",
      badgeLabel: "Rule-Based Only",
      detail: "Rule-based planning is active without the local wording layer.",
      actionHint: "Set LEVELYST_LOCAL_AI_MODE=copy_only to enable local AI copy on this Mac.",
      warmupCommand,
      model: input.model,
    }
  }

  const health = input.health
  if (!health?.reachable) {
    return {
      state: "fallback",
      badgeLabel: "Fallback Mode",
      detail: `Rule-based planning stays instant while Ollama is offline, so prompts still work for the demo.`,
      actionHint: `Start Ollama, then run ${warmupCommand} to preload ${input.model}.`,
      warmupCommand,
      model: input.model,
    }
  }

  if (!health.modelAvailable) {
    return {
      state: "fallback",
      badgeLabel: "Fallback Mode",
      detail: `${input.model} is not installed yet, so the app is using deterministic wording only.`,
      actionHint: `Run ollama pull ${input.model}, then ${warmupCommand}.`,
      warmupCommand,
      model: input.model,
    }
  }

  return {
    state: "active",
    badgeLabel: "Local AI Wording Active",
    detail: `Rule-based planning is paired with ${input.model} for faster, more natural demo copy.`,
    actionHint: `Prewarm once before Grad Show with ${warmupCommand}.`,
    warmupCommand,
    model: input.model,
  }
}
