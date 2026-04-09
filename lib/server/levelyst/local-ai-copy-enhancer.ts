import { plannerDiagnosticsSchema, type PlannerDiagnostics } from "@levelyst/contracts"
import { z } from "zod"
import {
  deriveCopilotLocalAiStatus,
  type CopilotLocalAiStatus,
  type LocalAiHealthSnapshot,
  LOCAL_AI_WARMUP_COMMAND,
  type LocalAiMode,
} from "@/lib/levelyst/local-ai-status"
import { LEVELYST_DEMO_READONLY_HINT, LEVELYST_PUBLIC_SESSION_MESSAGE } from "@/lib/levelyst/deploy-mode"
import { isLevelystDemoMode, isLevelystPublicMode } from "./deploy-mode"
import { getPlannerRuntimeConfig } from "./openai-client"

const DEFAULT_OLLAMA_HOST = "http://127.0.0.1:11434"
const DEFAULT_LOCAL_AI_MODEL = "qwen3:4b"
const DEFAULT_LOCAL_AI_TIMEOUT_MS = 800
const STATUS_TIMEOUT_MS = 300

const plannerCopyEnhancementSchema = z
  .object({
    player_experience: z.string().min(1),
    adaptation_note: z.string().min(1).nullable(),
    prompt_interpretation_meanings: z.array(z.string().min(1)),
    supported_changes: z.array(z.string().min(1)),
    suggested_supported_prompts: z.array(z.string().min(1)),
  })
  .strict()

const ollamaPlannerCopyFormat = {
  type: "object",
  properties: {
    player_experience: { type: "string" },
    adaptation_note: { type: ["string", "null"] },
    prompt_interpretation_meanings: {
      type: "array",
      items: { type: "string" },
    },
    supported_changes: {
      type: "array",
      items: { type: "string" },
    },
    suggested_supported_prompts: {
      type: "array",
      items: { type: "string" },
    },
  },
  required: [
    "player_experience",
    "adaptation_note",
    "prompt_interpretation_meanings",
    "supported_changes",
    "suggested_supported_prompts",
  ],
}

export interface LocalAiRuntimeConfig {
  mode: LocalAiMode
  host: string
  model: string
  timeoutMs: number
}

export async function maybeEnhancePlannerDiagnosticsCopy(input: {
  prompt: string
  mode: "replace" | "patch"
  diagnostics: PlannerDiagnostics
}): Promise<PlannerDiagnostics> {
  const diagnostics = plannerDiagnosticsSchema.parse(input.diagnostics)
  const localAiConfig = getLocalAiRuntimeConfig()

  if (localAiConfig.mode !== "copy_only") {
    return diagnostics
  }

  if (getPlannerRuntimeConfig().provider !== "rule_based") {
    return diagnostics
  }

  try {
    const enhancement = await requestPlannerCopyEnhancement(input, localAiConfig)
    return mergePlannerCopyEnhancement(diagnostics, enhancement)
  } catch {
    return diagnostics
  }
}

export async function getLocalAiCopilotStatus(): Promise<CopilotLocalAiStatus> {
  if (isLevelystDemoMode()) {
    return {
      state: "disabled",
      badgeLabel: "Public Demo",
      detail: "This deployment is running in safe read-only demo mode with rule-based planning only.",
      actionHint: LEVELYST_DEMO_READONLY_HINT,
      warmupCommand: LOCAL_AI_WARMUP_COMMAND,
      model: getLocalAiRuntimeConfig().model,
    }
  }

  if (isLevelystPublicMode()) {
    const runtimeConfig = getPlannerRuntimeConfig()
    return {
      state: "active",
      badgeLabel: "AI Copilot Ready",
      detail: "Prompt planning is active for this public workspace and stays responsive for browser-based project creation.",
      actionHint: LEVELYST_PUBLIC_SESSION_MESSAGE,
      warmupCommand: LOCAL_AI_WARMUP_COMMAND,
      model: runtimeConfig.model,
    }
  }

  const config = getLocalAiRuntimeConfig()

  if (config.mode !== "copy_only") {
    return deriveCopilotLocalAiStatus({
      mode: config.mode,
      model: config.model,
    })
  }

  const health = await getLocalAiHealth(config, STATUS_TIMEOUT_MS)
  return deriveCopilotLocalAiStatus({
    mode: config.mode,
    model: config.model,
    health,
  })
}

export function getLocalAiRuntimeConfig(): LocalAiRuntimeConfig {
  const mode = process.env.LEVELYST_LOCAL_AI_MODE === "copy_only" ? "copy_only" : "off"
  const host = process.env.OLLAMA_HOST?.trim() || DEFAULT_OLLAMA_HOST
  const model = process.env.LEVELYST_LOCAL_AI_MODEL?.trim() || DEFAULT_LOCAL_AI_MODEL
  const parsedTimeout = Number.parseInt(process.env.LEVELYST_LOCAL_AI_TIMEOUT_MS ?? "", 10)
  const timeoutMs = Number.isFinite(parsedTimeout) && parsedTimeout > 0 ? parsedTimeout : DEFAULT_LOCAL_AI_TIMEOUT_MS

  return {
    mode,
    host,
    model,
    timeoutMs,
  }
}

export function isOllamaModelAvailable(availableModels: string[], desiredModel: string) {
  if (availableModels.includes(desiredModel)) {
    return true
  }

  if (!desiredModel.includes(":")) {
    return availableModels.includes(`${desiredModel}:latest`)
  }

  return false
}

async function getLocalAiHealth(
  config: LocalAiRuntimeConfig,
  timeoutMs: number,
): Promise<LocalAiHealthSnapshot> {
  try {
    const response = await fetchWithTimeout(`${config.host}/api/tags`, { method: "GET" }, timeoutMs)
    if (!response.ok) {
      throw new Error(`Ollama returned ${response.status}.`)
    }

    const payload = (await response.json()) as { models?: Array<{ model?: string }> }
    const availableModels = (payload.models ?? [])
      .map((model) => model.model?.trim() ?? "")
      .filter((model): model is string => model.length > 0)

    return {
      reachable: true,
      modelAvailable: isOllamaModelAvailable(availableModels, config.model),
      error: null,
    }
  } catch (error) {
    return {
      reachable: false,
      modelAvailable: false,
      error: getErrorMessage(error),
    }
  }
}

async function requestPlannerCopyEnhancement(
  input: {
    prompt: string
    mode: "replace" | "patch"
    diagnostics: PlannerDiagnostics
  },
  config: LocalAiRuntimeConfig,
) {
  const response = await fetchWithTimeout(
    `${config.host}/api/chat`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.model,
        stream: false,
        keep_alive: "20m",
        format: ollamaPlannerCopyFormat,
        options: {
          temperature: 0.35,
          num_ctx: 2048,
        },
        messages: [
          {
            role: "system",
            content: [
              "You rewrite short UI copy for Levelyst, a fast game-prototype demo.",
              "Keep gameplay meaning identical.",
              "Do not add systems, mechanics, module names, promises, or franchise claims.",
              "Keep the same list lengths as the input.",
              "If adaptation_note is null, return null.",
              "Return JSON only.",
            ].join(" "),
          },
          {
            role: "user",
            content: JSON.stringify({
              prompt: input.prompt,
              review_mode: input.mode,
              selected_family_label: input.diagnostics.explanation.selected_family_label,
              game_type_label: input.diagnostics.explanation.game_type_label,
              player_experience: input.diagnostics.explanation.player_experience,
              adaptation_note: input.diagnostics.adaptation_note,
              prompt_interpretation: input.diagnostics.explanation.prompt_interpretation,
              supported_changes: input.diagnostics.supported_changes,
              suggested_supported_prompts: input.diagnostics.suggested_supported_prompts,
            }),
          },
        ],
      }),
    },
    config.timeoutMs,
  )

  if (!response.ok) {
    throw new Error(`Ollama returned ${response.status}.`)
  }

  const payload = (await response.json()) as {
    message?: {
      content?: string
    }
  }
  const content = payload.message?.content?.trim()
  if (!content) {
    throw new Error("Ollama returned empty planner copy.")
  }

  return plannerCopyEnhancementSchema.parse(JSON.parse(content))
}

function mergePlannerCopyEnhancement(
  diagnostics: PlannerDiagnostics,
  enhancement: z.infer<typeof plannerCopyEnhancementSchema>,
): PlannerDiagnostics {
  const promptInterpretation = diagnostics.explanation.prompt_interpretation

  if (enhancement.prompt_interpretation_meanings.length !== promptInterpretation.length) {
    throw new Error("Prompt interpretation length mismatch.")
  }

  if (enhancement.supported_changes.length !== diagnostics.supported_changes.length) {
    throw new Error("Supported changes length mismatch.")
  }

  if (enhancement.suggested_supported_prompts.length !== diagnostics.suggested_supported_prompts.length) {
    throw new Error("Suggested prompts length mismatch.")
  }

  if ((diagnostics.adaptation_note === null) !== (enhancement.adaptation_note === null)) {
    throw new Error("Adaptation note nullability mismatch.")
  }

  return plannerDiagnosticsSchema.parse({
    ...diagnostics,
    adaptation_note: enhancement.adaptation_note,
    supported_changes: enhancement.supported_changes,
    suggested_supported_prompts: enhancement.suggested_supported_prompts,
    explanation: {
      ...diagnostics.explanation,
      player_experience: enhancement.player_experience,
      prompt_interpretation: promptInterpretation.map((item, index) => ({
        term: item.term,
        meaning: enhancement.prompt_interpretation_meanings[index] ?? item.meaning,
      })),
    },
  })
}

async function fetchWithTimeout(input: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    return await fetch(input, {
      ...init,
      cache: "no-store",
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timeout)
  }
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.name === "AbortError") {
    return "Local AI request timed out."
  }

  return error instanceof Error ? error.message : "Unable to reach the local AI runtime."
}
