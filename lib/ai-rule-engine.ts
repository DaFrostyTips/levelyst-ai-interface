import { analyzePromptCapabilities } from "@/lib/server/levelyst/capability-planner"

export type PromptIntent =
  | "2d_platformer"
  | "3d_fps"
  | "general"

export interface IntentResult {
  intent: PromptIntent
  confidence: number
  matchedKeywords: string[]
}

export interface ModuleRecommendation {
  moduleId: string
  reason: string
  optional?: boolean
}

export interface AIResponsePlan {
  title: string
  summary: string
  steps: string[]
}

const recommendationMap: Record<Exclude<PromptIntent, "general">, ModuleRecommendation[]> = {
  "2d_platformer": [
    { moduleId: "player/platformer_controller", reason: "Player jump and run feel is the foundation for the 2D slice." },
    { moduleId: "camera/side_scroll", reason: "Side-scroll framing keeps the prototype readable." },
    { moduleId: "enemy/basic_enemy", reason: "Simple enemy pressure helps graybox encounters feel game-like." },
    { moduleId: "systems/checkpoint", reason: "Checkpoint anchors create a fast retry loop." },
    { moduleId: "systems/coin_collectible", reason: "Collectibles provide immediate reward and feedback." },
  ],
  "3d_fps": [
    { moduleId: "player/fps_controller", reason: "First-person movement is the core of the 3D shooter slice." },
    { moduleId: "combat/hitscan_weapon", reason: "Hitscan combat is the fastest reliable FPS graybox loop." },
    { moduleId: "ai/basic_zombie", reason: "Enemy pressure creates immediate combat stakes." },
    { moduleId: "systems/wave_manager", reason: "Wave pacing makes the survival loop deterministic and testable." },
  ],
}

export function classifyPrompt(prompt: string): IntentResult {
  const analysis = analyzePromptCapabilities(prompt)
  const matchedKeywords = analysis.expanded_terms.filter((term) => prompt.toLowerCase().includes(term)).slice(0, 8)

  if (Object.keys(analysis.capability_scores).length === 0) {
    return {
      intent: "general",
      confidence: 0.35,
      matchedKeywords: [],
    }
  }

  return {
    intent: analysis.closest_playable_slice,
    confidence: Math.min(0.95, 0.52 + analysis.resolved_capabilities.length * 0.06 + analysis.phrases.length * 0.08),
    matchedKeywords,
  }
}

export function recommendModules(intent: PromptIntent): ModuleRecommendation[] {
  if (intent === "general") {
    return recommendationMap["2d_platformer"].slice(0, 2)
  }

  return recommendationMap[intent]
}

export function buildResponse(
  prompt: string,
  intent: IntentResult,
  selected: ModuleRecommendation[],
  placedModuleNames: string[],
): AIResponsePlan {
  const intentLabelMap: Record<PromptIntent, string> = {
    "2d_platformer": "2D Prototype Slice Ready",
    "3d_fps": "3D Prototype Slice Ready",
    general: "Core Gameplay Build",
  }

  const reasons = selected.slice(0, 3).map((item) => `- ${item.reason}`)
  const placedSummary =
    placedModuleNames.length > 0
      ? `Auto-placed modules: ${placedModuleNames.join(", ")}.`
      : "No new modules were placed because similar modules already exist."

  return {
    title: `AI Copilot: ${intentLabelMap[intent.intent]}`,
    summary: `Processed "${prompt}" with ${(intent.confidence * 100).toFixed(0)}% intent confidence. ${placedSummary}`,
    steps: [
      "Plan: establish the core gameplay loop first.",
      ...reasons,
      "Next: review the blueprint, generate the prototype, and launch simulation.",
    ],
  }
}
