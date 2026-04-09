import { z } from "zod"
import {
  blueprintPlanSchema,
  type BlueprintPlan,
  type GameType,
  type ModuleDefinition,
  type PlannerDiagnostics,
  type RuntimeTarget,
} from "@levelyst/contracts"
import { createSeededModuleRegistry } from "@levelyst/module-registry"
import { zodTextFormat } from "openai/helpers/zod"
import { buildPlannerDiagnostics, planCapabilityPrompt } from "./capability-planner"
import { createLevelystOpenAIClient, getPlannerRuntimeConfig } from "./openai-client"

const moduleRegistry = createSeededModuleRegistry()

const plannerCatalog = {
  "2d_platformer": {
    runtime: "web_2d" as const,
    environment: "graybox_rooftops",
    coreRequired: ["player/platformer_controller", "camera/side_scroll"] as const,
    gameplayDefaults: ["systems/coin_collectible"] as const,
    gameplayOptional: ["enemy/basic_enemy", "systems/checkpoint", "systems/coin_collectible"] as const,
    levelSections: ["intro", "gameplay_loop", "end"] as const,
  },
  "3d_fps": {
    runtime: "web_3d" as const,
    environment: "warehouse_small",
    coreRequired: ["player/fps_controller", "combat/hitscan_weapon"] as const,
    gameplayDefaults: ["ai/basic_zombie", "systems/wave_manager"] as const,
    gameplayOptional: ["ai/basic_zombie", "systems/wave_manager"] as const,
    levelSections: ["intro", "gameplay_loop", "boss_encounter"] as const,
  },
} satisfies Record<
  GameType,
  {
    runtime: RuntimeTarget
    environment: string
    coreRequired: readonly string[]
    gameplayDefaults: readonly string[]
    gameplayOptional: readonly string[]
    levelSections: readonly string[]
  }
>

const glossaryByModuleId: Record<string, string> = {
  "player/platformer_controller": "2D player movement with running and jumping.",
  "camera/side_scroll": "2D follow camera for a side-scrolling platformer lane.",
  "enemy/basic_enemy": "Simple 2D patrol enemy for obstacle and collision pressure.",
  "systems/checkpoint": "Checkpoint and respawn anchors for retry-friendly platforming.",
  "systems/coin_collectible": "Collectible coin system that creates a score loop.",
  "player/fps_controller": "First-person movement and look controls for 3D shooters.",
  "combat/hitscan_weapon": "Instant-hit weapon loop for graybox FPS combat.",
  "ai/basic_zombie": "Zombie enemy AI that chases and pressures the player.",
  "systems/wave_manager": "Wave spawning and pacing for survival gameplay.",
}

const plannerCoreModuleSchema = z.enum([
  ...plannerCatalog["2d_platformer"].coreRequired,
  ...plannerCatalog["3d_fps"].coreRequired,
])

const plannerGameplayModuleSchema = z.enum([
  ...plannerCatalog["2d_platformer"].gameplayOptional,
  ...plannerCatalog["3d_fps"].gameplayOptional,
])

const plannerEnvironmentSchema = z.enum([
  plannerCatalog["2d_platformer"].environment,
  plannerCatalog["3d_fps"].environment,
])

const plannerLevelSectionSchema = z.enum([
  ...plannerCatalog["2d_platformer"].levelSections,
  ...plannerCatalog["3d_fps"].levelSections,
])

export const plannerModelOutputSchema = z
  .object({
    game_type: z.enum(["2d_platformer", "3d_fps"]),
    core_systems: z.array(plannerCoreModuleSchema).min(1),
    gameplay_systems: z.array(plannerGameplayModuleSchema),
    environment: plannerEnvironmentSchema,
    level_structure: z.array(plannerLevelSectionSchema).min(1),
  })
  .strict()
  .superRefine((value, ctx) => {
    const catalogEntry = plannerCatalog[value.game_type]

    value.core_systems.forEach((moduleId, index) => {
      if (!includesModuleId(catalogEntry.coreRequired, moduleId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Core system "${moduleId}" is not valid for ${value.game_type}.`,
          path: ["core_systems", index],
        })
      }
    })

    value.gameplay_systems.forEach((moduleId, index) => {
      if (!includesModuleId(catalogEntry.gameplayOptional, moduleId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Gameplay system "${moduleId}" is not valid for ${value.game_type}.`,
          path: ["gameplay_systems", index],
        })
      }
    })

    if (value.environment !== catalogEntry.environment) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Environment "${value.environment}" is not valid for ${value.game_type}.`,
        path: ["environment"],
      })
    }

    value.level_structure.forEach((section, index) => {
      if (!includesModuleId(catalogEntry.levelSections, section)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Level section "${section}" is not valid for ${value.game_type}.`,
          path: ["level_structure", index],
        })
      }
    })
  })

export type PlannerModelOutput = z.infer<typeof plannerModelOutputSchema>

export interface PlannerProvider {
  plan(prompt: string): Promise<PlannerModelOutput>
}

export interface PlanPromptOptions {
  provider?: PlannerProvider
  planningProfile?: "default" | "presentation"
}

export interface PlannedPromptResult {
  blueprint: BlueprintPlan
  diagnostics: PlannerDiagnostics
}

export class PlannerError extends Error {
  readonly code: "misconfigured" | "failed"
  readonly reason: "missing_api_key" | "invalid_output" | "refusal" | "provider_error"

  constructor(
    code: PlannerError["code"],
    reason: PlannerError["reason"],
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options)
    this.name = "PlannerError"
    this.code = code
    this.reason = reason
  }
}

export function isPlannerError(error: unknown): error is PlannerError {
  return error instanceof PlannerError
}

export async function planPrompt(prompt: string, options: PlanPromptOptions = {}): Promise<BlueprintPlan> {
  return (await planPromptWithDiagnostics(prompt, options)).blueprint
}

export async function planPromptWithDiagnostics(
  prompt: string,
  options: PlanPromptOptions = {},
): Promise<PlannedPromptResult> {
  const trimmedPrompt = prompt.trim()
  if (!trimmedPrompt) {
    throw new Error("Prompt must not be empty.")
  }

  const provider = options.provider ?? createPlannerProvider()
  if (provider instanceof RuleBasedPlannerProvider) {
    return provider.planDetailed(trimmedPrompt, {
      planningProfile: options.planningProfile ?? "default",
    })
  }

  const rawPlan = await provider.plan(trimmedPrompt)
  const blueprint = normalizePlannerOutput(rawPlan)
  const diagnostics = buildPlannerDiagnostics(trimmedPrompt, blueprint)

  return {
    blueprint,
    diagnostics,
  }
}

export function createPlannerProvider(kind = getPlannerRuntimeConfig().provider): PlannerProvider {
  return kind === "rule_based" ? new RuleBasedPlannerProvider() : new OpenAIPlannerProvider()
}

export class RuleBasedPlannerProvider implements PlannerProvider {
  async planDetailed(
    prompt: string,
    options: {
      planningProfile?: "default" | "presentation"
    } = {},
  ): Promise<PlannedPromptResult> {
    const planned = planCapabilityPrompt(prompt, {
      mode: "replace",
      profile: options.planningProfile ?? "default",
    })
    return {
      blueprint: planned.blueprintPlan,
      diagnostics: planned.diagnostics,
    }
  }

  async plan(prompt: string): Promise<PlannerModelOutput> {
    const { blueprint } = await this.planDetailed(prompt)
    return plannerModelOutputSchema.parse({
      game_type: blueprint.game_type,
      core_systems: blueprint.core_systems,
      gameplay_systems: blueprint.gameplay_systems,
      environment: blueprint.environment,
      level_structure: blueprint.level_structure,
    })
  }
}

export interface PlannerResponsesClient {
  responses: {
    parse: (body: any) => Promise<{ output_parsed: PlannerModelOutput | null; output?: unknown[] }>
  }
}

export interface OpenAIPlannerProviderOptions {
  client?: PlannerResponsesClient
  model?: string
  maxRetries?: number
}

export class OpenAIPlannerProvider implements PlannerProvider {
  private readonly client: PlannerResponsesClient
  private readonly model: string
  private readonly maxRetries: number

  constructor(options: OpenAIPlannerProviderOptions = {}) {
    const runtimeConfig = getPlannerRuntimeConfig()
    const client = options.client ?? createLevelystOpenAIClient()
    if (!client) {
      throw new PlannerError(
        "misconfigured",
        "missing_api_key",
        "Planner is configured for OpenAI but OPENAI_API_KEY is not set.",
      )
    }

    this.client = client
    this.model = options.model ?? runtimeConfig.model
    this.maxRetries = options.maxRetries ?? runtimeConfig.maxRetries
  }

  async plan(prompt: string): Promise<PlannerModelOutput> {
    let lastError: PlannerError | null = null

    for (let attempt = 1; attempt <= this.maxRetries; attempt += 1) {
      const repairSummary = lastError ? summarizePlannerFailure(lastError) : null

      try {
        const response = await this.client.responses.parse({
          model: this.model,
          input: [
            {
              role: "developer",
              content: buildPlannerDeveloperPrompt(repairSummary),
            },
            {
              role: "user",
              content: prompt,
            },
          ],
          max_output_tokens: 500,
          text: {
            format: zodTextFormat(plannerModelOutputSchema, "levelyst_blueprint_plan"),
          },
        })

        if (responseHasRefusal(response.output)) {
          throw new PlannerError(
            "failed",
            "refusal",
            "The planner model refused to produce a supported Levelyst blueprint.",
          )
        }

        const parsed = response.output_parsed
        if (!parsed) {
          throw new PlannerError(
            "failed",
            "invalid_output",
            "The planner model returned no structured blueprint output.",
          )
        }

        return plannerModelOutputSchema.parse(parsed)
      } catch (error) {
        const plannerError = toPlannerError(error)
        if (plannerError.code === "misconfigured") {
          throw plannerError
        }

        lastError = plannerError
      }
    }

    throw new PlannerError(
      "failed",
      lastError?.reason ?? "provider_error",
      lastError?.message ?? "The planner failed to produce a valid blueprint after retrying.",
      { cause: lastError?.cause },
    )
  }
}

function normalizePlannerOutput(rawPlan: PlannerModelOutput): BlueprintPlan {
  const parsed = plannerModelOutputSchema.parse(rawPlan)
  const catalogEntry = plannerCatalog[parsed.game_type]
  const coreSystems = dedupeAndSort([...catalogEntry.coreRequired, ...parsed.core_systems])
  const gameplaySystems = dedupeAndSort([...catalogEntry.gameplayDefaults, ...parsed.gameplay_systems])

  return blueprintPlanSchema.parse({
    game_type: parsed.game_type,
    core_systems: coreSystems,
    gameplay_systems: gameplaySystems,
    required_modules: dedupeAndSort([...coreSystems, ...gameplaySystems]),
    environment: catalogEntry.environment,
    level_structure: normalizeLevelStructure(parsed.level_structure, catalogEntry.levelSections),
    constraints: {
      target_runtime: catalogEntry.runtime,
    },
  })
}

function normalizeLevelStructure(values: string[], defaults: readonly string[]) {
  const seen = new Set<string>()
  const normalized: string[] = []

  values.forEach((value) => {
    if (defaults.includes(value) && !seen.has(value)) {
      normalized.push(value)
      seen.add(value)
    }
  })

  defaults.forEach((value) => {
    if (!seen.has(value)) {
      normalized.push(value)
      seen.add(value)
    }
  })

  return normalized
}

function dedupeAndSort(values: readonly string[]) {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right))
}

function buildPlannerDeveloperPrompt(repairSummary: string | null) {
  return [
    "You are the Levelyst.AI intent planner.",
    "Choose exactly one supported genre: 2d_platformer or 3d_fps.",
    "Return only structured JSON that matches the provided schema.",
    "Do not generate code, prose, markdown, or explanations.",
    "Only use module IDs, environments, and level structure sections from the approved MVP catalog.",
    "Never include dependencies. Only pick core and gameplay systems that match the user's request.",
    "If the prompt references a game outside exact MVP scope, such as Minecraft, GTA, sandbox, crafting, or open-world prompts, choose the closest supported slice and preserve the nearest playable graybox loop.",
    "For 2d platformer prompts, always include movement and camera. Prefer coins for generic platformer prompts. Add checkpoint and enemy systems only when the request supports them.",
    "For 3d FPS wave survival prompts, include movement, weapon, zombie AI, and wave manager.",
    repairSummary ? `Repair requirement: ${repairSummary}` : null,
    buildCatalogPrompt(),
  ]
    .filter(Boolean)
    .join("\n\n")
}

function buildCatalogPrompt() {
  return [
    "Approved catalog:",
    formatGenreCatalog("2d_platformer"),
    formatGenreCatalog("3d_fps"),
  ].join("\n")
}

function formatGenreCatalog(gameType: GameType) {
  const catalogEntry = plannerCatalog[gameType]
  const modules = [...catalogEntry.coreRequired, ...catalogEntry.gameplayOptional]
    .map((moduleId) => moduleRegistry.getModule(moduleId))
    .filter((module): module is ModuleDefinition => Boolean(module))
    .map((module) => `- ${module.id}: ${glossaryByModuleId[module.id] ?? humanizeModuleId(module.id)} (${module.category})`)
    .join("\n")

  return [
    `${gameType}:`,
    `runtime: ${catalogEntry.runtime}`,
    `environment: ${catalogEntry.environment}`,
    `core modules: ${catalogEntry.coreRequired.join(", ")}`,
    `gameplay modules: ${catalogEntry.gameplayOptional.join(", ")}`,
    `level sections: ${catalogEntry.levelSections.join(", ")}`,
    modules,
  ].join("\n")
}

function summarizePlannerFailure(error: PlannerError) {
  switch (error.reason) {
    case "invalid_output":
      return `The previous output was invalid or incomplete. Fix the JSON so it matches the schema exactly. ${error.message}`
    case "refusal":
      return "Do not refuse. Produce a valid Levelyst blueprint for one of the supported MVP genres."
    case "provider_error":
      return `The previous attempt failed upstream. Retry with the same schema and catalog bounds. ${error.message}`
    default:
      return error.message
  }
}

function toPlannerError(error: unknown) {
  if (error instanceof PlannerError) {
    return error
  }

  if (error instanceof z.ZodError) {
    return new PlannerError(
      "failed",
      "invalid_output",
      `The planner output failed schema validation: ${error.issues.map((issue) => issue.message).join("; ")}`,
      { cause: error },
    )
  }

  if (error instanceof Error) {
    return new PlannerError("failed", "provider_error", error.message, { cause: error })
  }

  return new PlannerError("failed", "provider_error", "The planner failed due to an unknown error.", {
    cause: error,
  })
}

function responseHasRefusal(output: unknown[] | undefined) {
  if (!Array.isArray(output)) return false

  return output.some((item) => {
    if (!item || typeof item !== "object") return false
    if ((item as { type?: string }).type !== "message") return false

    const content = (item as { content?: unknown[] }).content
    if (!Array.isArray(content)) return false
    return content.some((part) => part && typeof part === "object" && (part as { type?: string }).type === "refusal")
  })
}

function humanizeModuleId(moduleId: string) {
  const token = moduleId
    .split("/")
    .pop()
    ?.replace(/[_-]+/g, " ")
    .trim()

  if (!token) return moduleId
  return token.replace(/\b\w/g, (character) => character.toUpperCase())
}

function includesModuleId(values: readonly string[], value: string) {
  return values.includes(value)
}
