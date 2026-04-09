import type { ModuleCategory as EditorModuleCategory } from "@/lib/editor-v2-model"
import { createSeededModuleRegistry } from "@levelyst/module-registry"

export type EditorModuleIconKey =
  | "platformer_controller"
  | "gravity"
  | "side_scroll_camera"
  | "basic_enemy"
  | "checkpoint"
  | "coin"
  | "fps_controller"
  | "hitscan_weapon"
  | "basic_zombie"
  | "wave_manager"
  | "character_body"

export interface EditorModuleTemplateSeed {
  typeId: string
  name: string
  category: EditorModuleCategory
  description: string
  supports: string[]
  dependencies: string[]
  displayInputs: string[]
  displayOutputs: string[]
  displayDependencies: string[]
  aiCompatible: boolean
  iconKey: EditorModuleIconKey
  engineTarget: "web_2d" | "web_3d"
}

export interface EditorBlueprintCatalogItem {
  typeId: string
  name: string
  category: EditorModuleCategory
}

const editorModuleRegistry = createSeededModuleRegistry()

const categoryMap = {
  player_mechanics: "CORE",
  physics: "PHYSICS",
  camera: "CORE",
  enemy_ai: "AI",
  systems: "UI",
  combat: "COMBAT",
  ui: "UI",
} as const satisfies Record<string, EditorModuleCategory>

const decorationMap: Record<
  string,
  {
    label: string
    description: string
    supports: string[]
    iconKey: EditorModuleIconKey
  }
> = {
  "player/platformer_controller": {
    label: "Platformer Controller",
    description: "Jump, run, and land with deterministic side-scroller player motion.",
    supports: ["Run", "Jump", "Air Control"],
    iconKey: "platformer_controller",
  },
  "physics/gravity": {
    label: "Gravity Physics",
    description: "Applies 2D gravity, grounded state, and fall velocity to graybox actors.",
    supports: ["Gravity", "Grounded State"],
    iconKey: "gravity",
  },
  "camera/side_scroll": {
    label: "Side-Scroll Camera",
    description: "Keeps the player framed with readable 2D follow-camera behavior.",
    supports: ["Follow Camera", "Lane Framing"],
    iconKey: "side_scroll_camera",
  },
  "enemy/basic_enemy": {
    label: "Basic Enemy",
    description: "Simple chase-and-patrol enemy behavior for platformer encounters.",
    supports: ["Patrol", "Chase"],
    iconKey: "basic_enemy",
  },
  "systems/checkpoint": {
    label: "Checkpoint System",
    description: "Stores respawn anchors and retry flow for faster graybox iteration.",
    supports: ["Respawn", "Retry Flow"],
    iconKey: "checkpoint",
  },
  "systems/coin_collectible": {
    label: "Coin Collectible",
    description: "Adds score pickups and moment-to-moment reward beats to platformer levels.",
    supports: ["Pickups", "Score Events"],
    iconKey: "coin",
  },
  "player/fps_controller": {
    label: "FPS Controller",
    description: "First-person movement, look controls, and browser-friendly shooter locomotion.",
    supports: ["Look", "Sprint", "Strafe"],
    iconKey: "fps_controller",
  },
  "combat/hitscan_weapon": {
    label: "Hitscan Weapon",
    description: "Deterministic shooter weapon handling with trace-based damage events.",
    supports: ["Fire", "Reload", "Damage"],
    iconKey: "hitscan_weapon",
  },
  "ai/basic_zombie": {
    label: "Basic Zombie",
    description: "Slow melee pursuer behavior for FPS survival graybox combat.",
    supports: ["Chase", "Melee Attack"],
    iconKey: "basic_zombie",
  },
  "systems/wave_manager": {
    label: "Wave Manager",
    description: "Controls spawn pacing and survival progression across enemy waves.",
    supports: ["Spawning", "Difficulty Ramp"],
    iconKey: "wave_manager",
  },
  "physics/character_body": {
    label: "Character Body",
    description: "Character collision and grounded-state physics for 3D controller systems.",
    supports: ["Collision", "Grounding"],
    iconKey: "character_body",
  },
}

export const editorModuleTemplates: EditorModuleTemplateSeed[] = editorModuleRegistry.listModules().map((module) => {
  const decoration = decorationMap[module.id]
  return {
    typeId: module.id,
    name: decoration?.label ?? humanizeId(module.id),
    category: categoryMap[module.category] ?? "CORE",
    description: decoration?.description ?? `${humanizeId(module.id)} module`,
    supports: decoration?.supports ?? module.outputs,
    dependencies: module.dependencies,
    displayInputs: module.inputs,
    displayOutputs: module.outputs,
    displayDependencies: module.dependencies,
    aiCompatible: true,
    iconKey: decoration?.iconKey ?? "platformer_controller",
    engineTarget: module.engine_target,
  }
})

export const editorBlueprintCatalog: EditorBlueprintCatalogItem[] = editorModuleTemplates.map((template) => ({
  typeId: template.typeId,
  name: template.name,
  category: template.category,
}))

export const editorPlatformerModuleIds = [
  "player/platformer_controller",
  "camera/side_scroll",
  "enemy/basic_enemy",
  "systems/checkpoint",
  "systems/coin_collectible",
] as const

export const editorFpsModuleIds = [
  "player/fps_controller",
  "combat/hitscan_weapon",
  "ai/basic_zombie",
  "systems/wave_manager",
] as const

export const editorCoreChainModuleIds = [
  "physics/gravity",
  "player/platformer_controller",
  "camera/side_scroll",
] as const

export const editorPromptAliases: Record<string, string> = {
  movement: "player/platformer_controller",
  platformer_controller: "player/platformer_controller",
  gravity: "physics/gravity",
  camera: "camera/side_scroll",
  side_scroll_camera: "camera/side_scroll",
  enemy_ai: "enemy/basic_enemy",
  basic_enemy: "enemy/basic_enemy",
  checkpoints: "systems/checkpoint",
  checkpoint: "systems/checkpoint",
  coin_collectible: "systems/coin_collectible",
  fps_controller: "player/fps_controller",
  combat: "combat/hitscan_weapon",
  hitscan_weapon: "combat/hitscan_weapon",
  zombie: "ai/basic_zombie",
  enemyai: "ai/basic_zombie",
  wave_manager: "systems/wave_manager",
  character_body: "physics/character_body",
}

export function getEditorModuleTemplate(typeId: string) {
  return editorModuleTemplates.find((template) => template.typeId === typeId)
}

function humanizeId(value: string) {
  const normalized = value
    .split("/")
    .pop()
    ?.replace(/[_-]+/g, " ")
    .trim()

  if (!normalized) return value
  return normalized.replace(/\b\w/g, (char) => char.toUpperCase())
}
