import {
  blueprintPlanSchema,
  plannerDiagnosticsSchema,
  type BlueprintPlan,
  type GameType,
  type PatchOperation,
  type PlannerEditCategory,
  type PlannerDiagnostics,
  type PlannerPromptInterpretationItem,
} from "@levelyst/contracts"
import { createSeededModuleRegistry } from "@levelyst/module-registry"

const moduleRegistry = createSeededModuleRegistry()

const CAPABILITY_IDS = [
  "movement.side_scroll",
  "movement.top_down",
  "movement.first_person",
  "movement.third_person",
  "world.tilemap",
  "world.zone_based",
  "world.open_arena",
  "world.voxel",
  "combat.melee",
  "combat.projectile",
  "combat.hitscan",
  "combat.turn_based",
  "interaction.dialogue",
  "interaction.npc",
  "interaction.pickup",
  "interaction.inventory",
  "progression.quest",
  "progression.checkpoint",
  "progression.wave",
  "ai.enemy_basic",
  "ai.enemy_ranged",
  "ai.npc_idle",
  "systems.inventory",
  "systems.crafting",
  "systems.wave_spawner",
  "physics.gravity",
] as const

const CAPABILITY_BUNDLE_IDS = [
  "2d_platformer",
  "2d_top_down_adventure",
  "2d_turn_based_rpg",
  "3d_fps_survival",
  "3d_third_person_action",
  "3d_sandbox_builder",
] as const

export type CapabilityId = (typeof CAPABILITY_IDS)[number]
export type CapabilityBundleId = (typeof CAPABILITY_BUNDLE_IDS)[number]
export type CapabilityScoreMap = Partial<Record<CapabilityId, number>>
export type CapabilityPlanningMode = "replace" | "patch"

export interface CapabilityAnalysis {
  tokens: string[]
  phrases: string[]
  expanded_terms: string[]
  capability_scores: CapabilityScoreMap
  resolved_capabilities: CapabilityId[]
  selected_bundle: CapabilityBundleId
  closest_playable_slice: GameType
  adaptation_note: string | null
  selected_family_label: string
  player_experience: string
  core_gameplay: string[]
  game_structure: string[]
  environment_label: string
  prompt_interpretation: PlannerPromptInterpretationItem[]
}

export interface CapabilityPlanningResult {
  blueprintPlan: BlueprintPlan
  diagnostics: PlannerDiagnostics
  analysis: CapabilityAnalysis
}

export interface FollowUpEditResolution {
  edit_category: PlannerEditCategory
  supported_changes: string[]
  unsupported_requests: string[]
  suggested_supported_prompts: string[]
  planned_patch_operations: PatchOperation[]
}

export type CapabilityPlanningProfile = "default" | "presentation"

interface CapabilityBundleDefinition {
  id: CapabilityBundleId
  label: string
  primary: CapabilityId[]
  required: CapabilityId[]
  preferred_environment: string
  environment_label: string
  preferred_level_structure: string[]
  player_experience: string
  closest_playable_slice: GameType
  native: boolean
  adaptation_note: string | null
}

const STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "build",
  "create",
  "for",
  "game",
  "into",
  "just",
  "like",
  "make",
  "of",
  "style",
  "the",
  "this",
  "to",
  "with",
])

const COLOR_HEX_MAP = {
  red: "#ef4444",
  blue: "#3b82f6",
  green: "#22c55e",
  yellow: "#facc15",
  purple: "#a855f7",
  black: "#111827",
  white: "#f8fafc",
  orange: "#f97316",
} as const

const VISUAL_THEME_MAP = {
  neon: {
    visual_theme: "neon",
    background_variant: "neon_grid",
    sky_variant: "electric",
    lighting_variant: "neon",
    arena_tint: "#22d3ee",
    fog_variant: "neon",
  },
  cyberpunk: {
    visual_theme: "cyberpunk",
    background_variant: "city_night",
    sky_variant: "magenta_night",
    lighting_variant: "cyberpunk",
    arena_tint: "#a855f7",
    fog_variant: "violet",
  },
  sunset: {
    visual_theme: "sunset",
    background_variant: "sunset_haze",
    sky_variant: "sunset",
    lighting_variant: "sunset",
    arena_tint: "#fb7185",
    fog_variant: "amber",
  },
  forest: {
    visual_theme: "forest",
    background_variant: "forest_canopy",
    sky_variant: "forest",
    lighting_variant: "forest",
    arena_tint: "#22c55e",
    fog_variant: "mist",
  },
  ice: {
    visual_theme: "ice",
    background_variant: "frost",
    sky_variant: "ice",
    lighting_variant: "ice",
    arena_tint: "#67e8f9",
    fog_variant: "ice",
  },
  lava: {
    visual_theme: "lava",
    background_variant: "ember",
    sky_variant: "ember",
    lighting_variant: "lava",
    arena_tint: "#f97316",
    fog_variant: "ember",
  },
  night: {
    visual_theme: "night",
    background_variant: "night_sky",
    sky_variant: "night",
    lighting_variant: "night",
    arena_tint: "#1d4ed8",
    fog_variant: "night",
  },
  arcade: {
    visual_theme: "arcade",
    background_variant: "arcade",
    sky_variant: "arcade",
    lighting_variant: "arcade",
    arena_tint: "#f43f5e",
    fog_variant: "arcade",
  },
} as const

const synonymDictionary: Record<string, string[]> = {
  pokemon: ["monster", "monster catching", "top down rpg"],
  gta: ["grand theft auto", "open world crime", "city sandbox", "third person crime"],
  minecraft: ["voxel", "block building", "sandbox survival"],
  platformer: ["side scroll", "jumping platform"],
  fps: ["first person shooter"],
  mario: ["platformer", "side scroll"],
  sonic: ["platformer", "side scroll"],
  celeste: ["platformer", "precision platformer"],
  valorant: ["tactical shooter", "first person shooter"],
  "counter strike": ["tactical shooter", "first person shooter"],
  "call of duty": ["military shooter", "first person shooter"],
}

const termCapabilityWeights: Record<string, CapabilityScoreMap> = {
  "2d": {
    "movement.side_scroll": 1,
  },
  "3d": {
    "movement.first_person": 1,
  },
  adventure: {
    "interaction.dialogue": 1,
    "progression.quest": 2,
  },
  battle: {
    "combat.turn_based": 2,
  },
  battles: {
    "combat.turn_based": 2,
  },
  builder: {
    "systems.crafting": 3,
    "world.voxel": 2,
  },
  building: {
    "systems.crafting": 3,
    "world.voxel": 2,
  },
  checkpoint: {
    "progression.checkpoint": 4,
  },
  checkpoints: {
    "progression.checkpoint": 4,
  },
  city: {
    "progression.quest": 1,
    "world.open_arena": 3,
  },
  coin: {
    "interaction.pickup": 3,
  },
  coins: {
    "interaction.pickup": 3,
  },
  collectible: {
    "interaction.pickup": 3,
  },
  collectibles: {
    "interaction.pickup": 3,
  },
  crafting: {
    "interaction.pickup": 1,
    "systems.crafting": 4,
    "systems.inventory": 2,
  },
  crime: {
    "combat.projectile": 2,
    "movement.third_person": 1,
    "progression.quest": 2,
    "world.open_arena": 2,
  },
  dialogue: {
    "ai.npc_idle": 1,
    "interaction.dialogue": 3,
    "interaction.npc": 2,
  },
  enemies: {
    "ai.enemy_basic": 2,
  },
  enemy: {
    "ai.enemy_basic": 2,
  },
  exploration: {
    "interaction.dialogue": 1,
    "progression.quest": 2,
    "world.zone_based": 2,
  },
  fps: {
    "combat.hitscan": 4,
    "movement.first_person": 4,
  },
  gunplay: {
    "combat.hitscan": 3,
    "movement.first_person": 1,
  },
  hitscan: {
    "combat.hitscan": 4,
  },
  inventory: {
    "interaction.inventory": 2,
    "systems.inventory": 4,
  },
  mario: {
    "interaction.pickup": 2,
    "movement.side_scroll": 3,
    "physics.gravity": 2,
    "progression.checkpoint": 1,
  },
  minecraft: {
    "interaction.pickup": 1,
    "movement.first_person": 2,
    "systems.crafting": 2,
    "systems.inventory": 2,
    "world.voxel": 3,
  },
  monster: {
    "combat.turn_based": 1,
  },
  npc: {
    "ai.npc_idle": 2,
    "interaction.npc": 3,
  },
  open: {
    "world.open_arena": 1,
  },
  platformer: {
    "movement.side_scroll": 3,
    "physics.gravity": 2,
  },
  pokemon: {
    "combat.turn_based": 2,
    "interaction.dialogue": 2,
    "movement.top_down": 1,
  },
  projectile: {
    "combat.projectile": 4,
  },
  quest: {
    "progression.quest": 4,
  },
  quests: {
    "progression.quest": 4,
  },
  route: {
    "movement.top_down": 1,
    "world.tilemap": 2,
  },
  routes: {
    "movement.top_down": 1,
    "world.tilemap": 2,
  },
  rpg: {
    "combat.turn_based": 3,
    "interaction.dialogue": 2,
    "systems.inventory": 2,
    "world.zone_based": 1,
  },
  sandbox: {
    "interaction.pickup": 1,
    "systems.crafting": 1,
    "world.open_arena": 1,
    "world.voxel": 2,
  },
  shooter: {
    "combat.hitscan": 2,
  },
  side: {
    "movement.side_scroll": 1,
  },
  stealth: {
    "ai.enemy_basic": 1,
    "combat.melee": 2,
  },
  survival: {
    "interaction.pickup": 2,
    "progression.wave": 2,
  },
  tactical: {
    "ai.enemy_ranged": 2,
    "combat.hitscan": 2,
  },
  tilemap: {
    "world.tilemap": 4,
  },
  town: {
    "ai.npc_idle": 1,
    "interaction.dialogue": 2,
    "interaction.npc": 2,
    "world.tilemap": 1,
  },
  towns: {
    "ai.npc_idle": 1,
    "interaction.dialogue": 2,
    "interaction.npc": 2,
    "world.tilemap": 1,
  },
  "turn based": {
    "combat.turn_based": 4,
  },
  voxel: {
    "world.voxel": 5,
  },
  wave: {
    "progression.wave": 4,
    "systems.wave_spawner": 3,
  },
  waves: {
    "progression.wave": 4,
    "systems.wave_spawner": 3,
  },
  zombie: {
    "ai.enemy_basic": 4,
    "progression.wave": 1,
  },
  zombies: {
    "ai.enemy_basic": 4,
    "progression.wave": 1,
  },
  "block building": {
    "interaction.pickup": 2,
    "systems.crafting": 3,
    "world.voxel": 4,
  },
  "call of duty": {
    "combat.hitscan": 4,
    "movement.first_person": 3,
  },
  "city sandbox": {
    "movement.third_person": 2,
    "world.open_arena": 4,
  },
  "counter strike": {
    "ai.enemy_ranged": 2,
    "combat.hitscan": 4,
    "movement.first_person": 3,
  },
  "dialogue and quests": {
    "ai.npc_idle": 1,
    "interaction.dialogue": 4,
    "interaction.npc": 2,
    "progression.quest": 4,
  },
  "first person": {
    "movement.first_person": 4,
  },
  "first person shooter": {
    "combat.hitscan": 4,
    "movement.first_person": 4,
  },
  "grand theft auto": {
    "combat.projectile": 2,
    "movement.third_person": 3,
    "progression.quest": 2,
    "world.open_arena": 3,
  },
  gta: {
    "combat.projectile": 2,
    "movement.third_person": 3,
    "progression.quest": 2,
    "world.open_arena": 3,
  },
  "monster catching": {
    "combat.turn_based": 3,
    "interaction.npc": 1,
    "systems.inventory": 2,
  },
  "open world": {
    "movement.third_person": 1,
    "progression.quest": 2,
    "world.open_arena": 4,
  },
  "open world crime": {
    "combat.projectile": 2,
    "movement.third_person": 3,
    "progression.quest": 2,
    "world.open_arena": 4,
  },
  "precision platformer": {
    "movement.side_scroll": 3,
    "physics.gravity": 3,
    "progression.checkpoint": 2,
  },
  "sandbox survival": {
    "interaction.pickup": 2,
    "systems.crafting": 2,
    "systems.inventory": 2,
    "world.voxel": 3,
  },
  "side scroll": {
    "movement.side_scroll": 4,
    "physics.gravity": 2,
  },
  "stealth platformer": {
    "ai.enemy_basic": 2,
    "combat.melee": 2,
    "movement.side_scroll": 4,
    "physics.gravity": 2,
  },
  "tactical shooter": {
    "ai.enemy_ranged": 3,
    "combat.hitscan": 3,
    "movement.first_person": 2,
  },
  "third person": {
    "movement.third_person": 4,
  },
  "third person crime": {
    "combat.projectile": 2,
    "movement.third_person": 4,
    "progression.quest": 2,
    "world.open_arena": 3,
  },
  "top down": {
    "movement.top_down": 4,
    "world.tilemap": 2,
  },
  "top down adventure": {
    "interaction.dialogue": 2,
    "movement.top_down": 4,
    "progression.quest": 3,
    "world.tilemap": 2,
  },
  "top down exploration": {
    "interaction.dialogue": 2,
    "movement.top_down": 4,
    "progression.quest": 2,
    "world.zone_based": 2,
  },
  "top down rpg": {
    "combat.turn_based": 3,
    "interaction.dialogue": 2,
    "movement.top_down": 4,
    "systems.inventory": 2,
    "world.tilemap": 2,
  },
  valorant: {
    "ai.enemy_ranged": 2,
    "combat.hitscan": 4,
    "movement.first_person": 3,
  },
  "wave spawning": {
    "progression.wave": 5,
    "systems.wave_spawner": 4,
  },
}

const gameReferenceBoosts: Record<string, CapabilityScoreMap> = {
  pokemon: {
    "ai.npc_idle": 2,
    "combat.turn_based": 5,
    "interaction.dialogue": 4,
    "interaction.npc": 2,
    "movement.top_down": 3,
    "systems.inventory": 3,
    "world.tilemap": 3,
  },
  gta: {
    "ai.enemy_basic": 2,
    "combat.projectile": 4,
    "movement.third_person": 4,
    "progression.quest": 3,
    "world.open_arena": 4,
  },
  minecraft: {
    "interaction.pickup": 3,
    "movement.first_person": 3,
    "systems.crafting": 4,
    "systems.inventory": 3,
    "world.voxel": 5,
  },
  mario: {
    "interaction.pickup": 2,
    "movement.side_scroll": 4,
    "physics.gravity": 3,
    "progression.checkpoint": 1,
  },
  sonic: {
    "movement.side_scroll": 4,
    "physics.gravity": 3,
  },
  celeste: {
    "movement.side_scroll": 4,
    "physics.gravity": 3,
    "progression.checkpoint": 2,
  },
  valorant: {
    "ai.enemy_ranged": 3,
    "combat.hitscan": 4,
    "movement.first_person": 4,
  },
  "counter strike": {
    "ai.enemy_ranged": 3,
    "combat.hitscan": 4,
    "movement.first_person": 4,
  },
  "call of duty": {
    "combat.hitscan": 4,
    "movement.first_person": 4,
    "progression.wave": 1,
  },
}

const termMeaningMap: Record<string, string> = {
  pokemon: "monster adventure",
  towns: "npc interaction",
  town: "npc interaction",
  battle: "turn-based combat",
  battles: "turn-based combat",
  "top down": "top-down world navigation",
  rpg: "role-playing progression",
  gta: "third-person city action",
  "grand theft auto": "third-person city action",
  "open world": "large open exploration spaces",
  crime: "mission-driven action",
  city: "urban sandbox setting",
  minecraft: "sandbox building and survival",
  voxel: "block-based world structure",
  "sandbox survival": "resource gathering and building",
  platformer: "side-scrolling movement",
  "stealth platformer": "platforming with enemy avoidance",
  stealth: "sneak-focused encounters",
  quest: "goal-based progression",
  quests: "goal-based progression",
  dialogue: "character conversations",
  fps: "first-person shooting",
  zombie: "enemy survival pressure",
  zombies: "enemy survival pressure",
  survival: "resource or wave-based survival pressure",
  "wave spawning": "escalating enemy waves",
}

const movementConflictGroup: CapabilityId[] = [
  "movement.side_scroll",
  "movement.top_down",
  "movement.first_person",
  "movement.third_person",
]

const worldConflictGroup: CapabilityId[] = [
  "world.tilemap",
  "world.zone_based",
  "world.open_arena",
  "world.voxel",
]

const combatConflictGroup: CapabilityId[] = [
  "combat.melee",
  "combat.projectile",
  "combat.hitscan",
  "combat.turn_based",
]

const conflictGroups = [movementConflictGroup, worldConflictGroup, combatConflictGroup]

const capabilityPrecedence: CapabilityId[] = [
  "world.voxel",
  "world.open_arena",
  "movement.first_person",
  "movement.third_person",
  "movement.top_down",
  "movement.side_scroll",
  "world.tilemap",
  "world.zone_based",
  "combat.turn_based",
  "combat.hitscan",
  "combat.projectile",
  "combat.melee",
  "physics.gravity",
  "interaction.dialogue",
  "interaction.npc",
  "interaction.pickup",
  "interaction.inventory",
  "progression.quest",
  "progression.checkpoint",
  "progression.wave",
  "systems.inventory",
  "systems.crafting",
  "systems.wave_spawner",
  "ai.enemy_ranged",
  "ai.enemy_basic",
  "ai.npc_idle",
]

const bundleCatalog: Record<CapabilityBundleId, CapabilityBundleDefinition> = {
  "2d_platformer": {
    id: "2d_platformer",
    label: "2D Platformer",
    primary: [
      "movement.side_scroll",
      "physics.gravity",
      "world.tilemap",
      "interaction.pickup",
      "progression.checkpoint",
    ],
    required: [
      "movement.side_scroll",
      "physics.gravity",
      "world.tilemap",
      "interaction.pickup",
      "progression.checkpoint",
    ],
    preferred_environment: "graybox_rooftops",
    environment_label: "Tile-based side-scrolling course",
    preferred_level_structure: ["intro", "platforming", "challenge", "goal"],
    player_experience: "Run, jump, and push through side-scrolling spaces while collecting rewards and reaching safe checkpoints.",
    closest_playable_slice: "2d_platformer",
    native: true,
    adaptation_note: null,
  },
  "2d_top_down_adventure": {
    id: "2d_top_down_adventure",
    label: "2D Top-Down Adventure",
    primary: ["movement.top_down", "world.tilemap", "interaction.dialogue", "ai.npc_idle", "progression.quest"],
    required: ["movement.top_down", "world.tilemap", "interaction.dialogue", "ai.npc_idle", "progression.quest"],
    preferred_environment: "graybox_rooftops",
    environment_label: "Tile-based overworld",
    preferred_level_structure: ["intro", "exploration", "quests", "progression"],
    player_experience: "Explore a top-down world, talk to characters, and follow quests through connected areas.",
    closest_playable_slice: "2d_platformer",
    native: false,
    adaptation_note:
      "Closest supported slice: 2D platformer graybox prototype. Top-down traversal, dialogue systems, and quest logic are approximated in the current MVP runtime.",
  },
  "2d_turn_based_rpg": {
    id: "2d_turn_based_rpg",
    label: "2D Turn-Based RPG",
    primary: ["movement.top_down", "world.tilemap", "combat.turn_based", "interaction.dialogue", "systems.inventory"],
    required: ["movement.top_down", "world.tilemap", "combat.turn_based", "interaction.dialogue", "systems.inventory"],
    preferred_environment: "graybox_rooftops",
    environment_label: "Tile-based overworld",
    preferred_level_structure: ["intro", "exploration", "battles", "progression"],
    player_experience: "Explore towns and routes, talk to characters, and battle enemies in turn-based encounters.",
    closest_playable_slice: "2d_platformer",
    native: false,
    adaptation_note:
      "Closest supported slice: 2D platformer graybox prototype. Turn-based battles, top-down travel, and RPG progression are represented as a simplified playable slice in the MVP.",
  },
  "3d_fps_survival": {
    id: "3d_fps_survival",
    label: "3D FPS Survival",
    primary: ["movement.first_person", "combat.hitscan", "ai.enemy_ranged", "systems.wave_spawner", "world.open_arena"],
    required: ["movement.first_person", "combat.hitscan", "ai.enemy_ranged", "systems.wave_spawner", "world.open_arena"],
    preferred_environment: "warehouse_small",
    environment_label: "Open graybox arena",
    preferred_level_structure: ["intro", "combat", "waves", "survival"],
    player_experience: "Move through a 3D arena, aim and shoot enemies, and survive escalating waves.",
    closest_playable_slice: "3d_fps",
    native: true,
    adaptation_note: null,
  },
  "3d_third_person_action": {
    id: "3d_third_person_action",
    label: "3D Third-Person Action",
    primary: ["movement.third_person", "combat.projectile", "ai.enemy_basic", "progression.quest", "world.open_arena"],
    required: ["movement.third_person", "combat.projectile", "ai.enemy_basic", "progression.quest", "world.open_arena"],
    preferred_environment: "warehouse_small",
    environment_label: "Open graybox action space",
    preferred_level_structure: ["intro", "exploration", "missions", "action"],
    player_experience: "Explore an open action space, fight enemies, and complete mission-style objectives.",
    closest_playable_slice: "3d_fps",
    native: false,
    adaptation_note:
      "Closest supported slice: 3D FPS graybox action prototype. Third-person movement, broader missions, and open-world action systems are simplified in the MVP runtime.",
  },
  "3d_sandbox_builder": {
    id: "3d_sandbox_builder",
    label: "3D Sandbox Builder",
    primary: ["movement.first_person", "world.voxel", "interaction.pickup", "systems.inventory", "systems.crafting"],
    required: ["movement.first_person", "world.voxel", "interaction.pickup", "systems.inventory", "systems.crafting"],
    preferred_environment: "warehouse_small",
    environment_label: "Voxel-style survival sandbox",
    preferred_level_structure: ["intro", "scavenge", "build", "defend"],
    player_experience: "Roam a blocky world, gather resources, and shape the environment with survival-style goals.",
    closest_playable_slice: "3d_fps",
    native: false,
    adaptation_note:
      "Closest supported slice: 3D FPS graybox survival prototype. Voxel terrain, building and crafting systems, and full sandbox loops are not natively playable in the MVP yet.",
  },
}

const capabilityDescriptionMap: Record<CapabilityId, string> = {
  "movement.side_scroll": "Move through the world from a side-scrolling view.",
  "movement.top_down": "Move around the world from a top-down view.",
  "movement.first_person": "Move and aim from a first-person view.",
  "movement.third_person": "Explore the world from a third-person camera.",
  "world.tilemap": "Travel through a structured tile-based world.",
  "world.zone_based": "Progress through connected world zones.",
  "world.open_arena": "Play across a large open combat space.",
  "world.voxel": "Explore a world built from block-like terrain.",
  "combat.melee": "Handle close-range combat encounters.",
  "combat.projectile": "Fight using projectile-based attacks.",
  "combat.hitscan": "Use instant-hit ranged weapons.",
  "combat.turn_based": "Battles happen in turn-based encounters.",
  "interaction.dialogue": "Talk to characters.",
  "interaction.npc": "Meet and interact with non-player characters.",
  "interaction.pickup": "Collect pickups and rewards.",
  "interaction.inventory": "Carry useful items while exploring.",
  "progression.quest": "Advance by completing quest objectives.",
  "progression.checkpoint": "Reach checkpoints to secure progress.",
  "progression.wave": "Face escalating enemy waves.",
  "ai.enemy_basic": "Deal with straightforward enemy threats.",
  "ai.enemy_ranged": "Face enemies that pressure the player from range.",
  "ai.npc_idle": "Encounter friendly characters inhabiting the world.",
  "systems.inventory": "Collect and store items.",
  "systems.crafting": "Craft new tools or structures from gathered resources.",
  "systems.wave_spawner": "Progress through spawning wave challenges.",
  "physics.gravity": "Jump and land with gravity-driven movement.",
}

const sectionLabelMap: Record<string, string> = {
  intro: "Intro",
  platforming: "Platforming",
  challenge: "Challenge",
  goal: "Goal",
  exploration: "Exploration",
  quests: "Quests",
  progression: "Progression",
  battles: "Battles",
  combat: "Combat",
  waves: "Waves",
  survival: "Survival",
  missions: "Missions",
  action: "Action",
  scavenge: "Scavenge",
  build: "Build",
  defend: "Defend",
}

const moduleCapabilityMap: Record<string, CapabilityId[]> = {
  "player/platformer_controller": ["movement.side_scroll", "physics.gravity"],
  "camera/side_scroll": ["movement.side_scroll"],
  "enemy/basic_enemy": ["ai.enemy_basic"],
  "systems/checkpoint": ["progression.checkpoint"],
  "systems/coin_collectible": ["interaction.pickup"],
  "player/fps_controller": ["movement.first_person"],
  "combat/hitscan_weapon": ["combat.hitscan"],
  "ai/basic_zombie": ["ai.enemy_basic"],
  "systems/wave_manager": ["progression.wave", "systems.wave_spawner"],
}

const removalAdjacency: Partial<Record<CapabilityId, CapabilityId[]>> = {
  "ai.enemy_basic": ["progression.wave", "systems.wave_spawner"],
  "interaction.pickup": ["interaction.inventory", "systems.inventory"],
  "world.voxel": ["systems.crafting"],
}

const phraseDictionary = buildPhraseDictionary()

export function tokenizePrompt(prompt: string) {
  const normalized = extractPromptFocus(normalizePrompt(prompt))
  const tokens = normalized
    .split(" ")
    .map((token) => token.trim())
    .filter(Boolean)
    .filter((token) => !STOPWORDS.has(token))

  return {
    normalized,
    tokens: dedupeAndSort(tokens),
  }
}

export function extractPhrases(normalizedPrompt: string) {
  return phraseDictionary.filter((phrase) => normalizedPrompt.includes(phrase))
}

export function expandSynonyms(tokens: string[], phrases: string[]) {
  const seedTerms = new Set([...tokens, ...phrases])
  const expanded = new Set([...seedTerms])

  for (const [canonical, synonyms] of Object.entries(synonymDictionary)) {
    if (!seedTerms.has(canonical)) continue

    synonyms.forEach((term) => {
      expanded.add(term)
    })
  }

  return dedupeAndSort([...expanded])
}

export function scoreCapabilities(matchedTerms: string[]) {
  const scoreMap: CapabilityScoreMap = {}

  matchedTerms.forEach((term) => {
    const weights = termCapabilityWeights[term]
    if (!weights) return
    applyCapabilityWeights(scoreMap, weights)
  })

  Object.entries(gameReferenceBoosts).forEach(([reference, weights]) => {
    if (!matchedTerms.includes(reference)) return
    applyCapabilityWeights(scoreMap, weights)
  })

  return sortCapabilityScoreMap(scoreMap)
}

export function resolveCapabilityConflicts(scoreMap: CapabilityScoreMap) {
  const scores = { ...scoreMap }

  conflictGroups.forEach((group) => {
    const candidates = group
      .filter((capabilityId) => (scores[capabilityId] ?? 0) > 0)
      .sort((left, right) => {
        const scoreDelta = (scores[right] ?? 0) - (scores[left] ?? 0)
        if (scoreDelta !== 0) return scoreDelta
        return capabilityPrecedence.indexOf(left) - capabilityPrecedence.indexOf(right)
      })

    const winner = candidates[0]
    candidates.slice(1).forEach((capabilityId) => {
      delete scores[capabilityId]
    })

    if (!winner) return
    scores[winner] = scores[winner] ?? 0
  })

  return capabilityPrecedence.filter((capabilityId) => (scores[capabilityId] ?? 0) > 0)
}

export function selectCapabilityBundle(
  resolvedCapabilities: CapabilityId[],
  scoreMap: CapabilityScoreMap,
  options: {
    preferredSlice?: GameType | null
    profile?: CapabilityPlanningProfile
  } = {},
) {
  const resolvedSet = new Set(resolvedCapabilities)
  const preferredSlice = options.preferredSlice ?? null
  const profile = options.profile ?? "default"

  if (resolvedSet.has("world.voxel")) {
    return bundleCatalog["3d_sandbox_builder"]
  }

  if (resolvedSet.has("movement.third_person")) {
    return bundleCatalog["3d_third_person_action"]
  }

  if (resolvedSet.has("movement.first_person") || resolvedSet.has("combat.hitscan")) {
    return bundleCatalog["3d_fps_survival"]
  }

  if (resolvedSet.has("movement.top_down")) {
    if (
      resolvedSet.has("combat.turn_based") ||
      resolvedSet.has("systems.inventory") ||
      (scoreMap["combat.turn_based"] ?? 0) >= 3
    ) {
      return bundleCatalog["2d_turn_based_rpg"]
    }
    return bundleCatalog["2d_top_down_adventure"]
  }

  if (resolvedSet.has("movement.side_scroll")) {
    return bundleCatalog["2d_platformer"]
  }

  if (preferredSlice === "3d_fps") {
    return bundleCatalog["3d_fps_survival"]
  }

  if (profile === "presentation") {
    const threeDimensionalMomentum =
      (scoreMap["movement.first_person"] ?? 0) +
      (scoreMap["movement.third_person"] ?? 0) +
      (scoreMap["combat.hitscan"] ?? 0) +
      (scoreMap["world.open_arena"] ?? 0) +
      (scoreMap["world.voxel"] ?? 0)
    const twoDimensionalMomentum =
      (scoreMap["movement.side_scroll"] ?? 0) +
      (scoreMap["movement.top_down"] ?? 0) +
      (scoreMap["combat.turn_based"] ?? 0) +
      (scoreMap["world.tilemap"] ?? 0) +
      (scoreMap["physics.gravity"] ?? 0)

    return threeDimensionalMomentum > twoDimensionalMomentum
      ? bundleCatalog["3d_fps_survival"]
      : bundleCatalog["2d_platformer"]
  }

  return bundleCatalog["2d_platformer"]
}

export function enforceCapabilityCompleteness(bundleId: CapabilityBundleId, capabilities: CapabilityId[]) {
  const complete = new Set(capabilities)
  bundleCatalog[bundleId].required.forEach((capabilityId) => complete.add(capabilityId))
  return capabilityPrecedence.filter((capabilityId) => complete.has(capabilityId))
}

function enforcePatchCompleteness(bundleId: CapabilityBundleId, capabilities: CapabilityId[]) {
  const complete = new Set(capabilities)

  if (bundleCatalog[bundleId].closest_playable_slice === "2d_platformer") {
    complete.add("movement.side_scroll")
    complete.add("physics.gravity")
  } else {
    complete.add("movement.first_person")
    complete.add("combat.hitscan")
  }

  return capabilityPrecedence.filter((capabilityId) => complete.has(capabilityId))
}

export function translateBundleToBlueprint(
  bundleId: CapabilityBundleId,
  capabilities: CapabilityId[],
  options: {
    mode?: CapabilityPlanningMode
  } = {},
): BlueprintPlan {
  const bundle = bundleCatalog[bundleId]
  const capabilitySet = new Set(capabilities)
  const mode = options.mode ?? "replace"

  if (bundle.closest_playable_slice === "2d_platformer") {
    const coreSystems = ["camera/side_scroll", "player/platformer_controller"]
    const gameplaySystems = new Set<string>()

    if (bundleId === "2d_platformer" || capabilitySet.has("interaction.pickup")) {
      gameplaySystems.add("systems/coin_collectible")
    }

    if (bundleId === "2d_platformer" || capabilitySet.has("progression.checkpoint") || capabilitySet.has("progression.quest")) {
      gameplaySystems.add("systems/checkpoint")
    }

    if (
      bundleId === "2d_turn_based_rpg" ||
      capabilitySet.has("combat.turn_based") ||
      capabilitySet.has("combat.melee") ||
      capabilitySet.has("ai.enemy_basic")
    ) {
      gameplaySystems.add("enemy/basic_enemy")
    }

    if (mode === "patch" && !capabilitySet.has("interaction.pickup")) {
      gameplaySystems.delete("systems/coin_collectible")
    }

    return blueprintPlanSchema.parse({
      game_type: "2d_platformer",
      core_systems: dedupeAndSort(coreSystems),
      gameplay_systems: dedupeAndSort([...gameplaySystems]),
      required_modules: dedupeAndSort([...coreSystems, ...gameplaySystems]),
      environment: bundle.preferred_environment,
      level_structure: [...bundle.preferred_level_structure],
      constraints: {
        target_runtime: "web_2d",
      },
    })
  }

  const coreSystems = ["combat/hitscan_weapon", "player/fps_controller"]
  const gameplaySystems = new Set<string>()

  if (bundleId === "3d_fps_survival" && mode === "replace") {
    gameplaySystems.add("ai/basic_zombie")
    gameplaySystems.add("systems/wave_manager")
  } else if (bundleId === "3d_third_person_action") {
    gameplaySystems.add("ai/basic_zombie")
  } else if (capabilitySet.has("progression.wave") || capabilitySet.has("systems.wave_spawner")) {
    gameplaySystems.add("ai/basic_zombie")
    gameplaySystems.add("systems/wave_manager")
  }

  return blueprintPlanSchema.parse({
    game_type: "3d_fps",
    core_systems: dedupeAndSort(coreSystems),
    gameplay_systems: dedupeAndSort([...gameplaySystems]),
    required_modules: dedupeAndSort([...coreSystems, ...gameplaySystems]),
    environment: bundle.preferred_environment,
    level_structure: [...bundle.preferred_level_structure],
    constraints: {
      target_runtime: "web_3d",
    },
  })
}

export function deriveCapabilitiesFromBlueprint(blueprint: BlueprintPlan) {
  const capabilitySet = new Set<CapabilityId>()

  blueprint.required_modules.forEach((moduleId) => {
    ;(moduleCapabilityMap[moduleId] ?? []).forEach((capabilityId) => capabilitySet.add(capabilityId))
  })

  if (blueprint.game_type === "2d_platformer") {
    capabilitySet.add("movement.side_scroll")
    capabilitySet.add("physics.gravity")
  } else {
    capabilitySet.add("movement.first_person")
    capabilitySet.add("combat.hitscan")
  }

  return capabilityPrecedence.filter((capabilityId) => capabilitySet.has(capabilityId))
}

export function analyzePromptCapabilities(
  prompt: string,
  options: {
    preferredSlice?: GameType | null
    profile?: CapabilityPlanningProfile
  } = {},
): CapabilityAnalysis {
  const { normalized, tokens } = tokenizePrompt(prompt)
  const phrases = extractPhrases(normalized)
  const expandedTerms = expandSynonyms(tokens, phrases)
  const matchedTerms = dedupeAndSort([...tokens, ...phrases, ...expandedTerms])
  const capabilityScores = scoreCapabilities(matchedTerms)
  const resolvedCapabilities = resolveCapabilityConflicts(capabilityScores)
  const bundle = selectCapabilityBundle(resolvedCapabilities, capabilityScores, {
    preferredSlice: options.preferredSlice,
    profile: options.profile ?? "default",
  })
  const completedCapabilities = enforceCapabilityCompleteness(bundle.id, resolvedCapabilities)

  return {
    tokens,
    phrases,
    expanded_terms: expandedTerms,
    capability_scores: capabilityScores,
    resolved_capabilities: completedCapabilities,
    selected_bundle: bundle.id,
    closest_playable_slice: bundle.closest_playable_slice,
    adaptation_note: bundle.adaptation_note,
    selected_family_label: bundle.label,
    player_experience: bundle.player_experience,
    core_gameplay: buildCoreGameplayDescriptions(bundle, completedCapabilities),
    game_structure: bundle.preferred_level_structure.map(humanizeSection),
    environment_label: bundle.environment_label,
    prompt_interpretation: buildPromptInterpretation(matchedTerms),
  }
}

export function buildPlannerDiagnostics(
  prompt: string,
  blueprintPlan: BlueprintPlan,
  analysis?: CapabilityAnalysis,
  options: {
    editResolution?: FollowUpEditResolution | null
  } = {},
) {
  const resolvedAnalysis = analysis ?? analyzePromptCapabilities(prompt, { preferredSlice: blueprintPlan.game_type })
  const resolution = moduleRegistry.resolveModuleDependencies(blueprintPlan.required_modules)
  const translatedModules = resolution.resolved.length > 0 ? resolution.resolved : blueprintPlan.required_modules
  const editResolution = options.editResolution ?? null

  return plannerDiagnosticsSchema.parse({
    tokens: resolvedAnalysis.tokens,
    phrases: resolvedAnalysis.phrases,
    expanded_terms: resolvedAnalysis.expanded_terms,
    capability_scores: resolvedAnalysis.capability_scores,
    resolved_capabilities: resolvedAnalysis.resolved_capabilities,
    selected_bundle: resolvedAnalysis.selected_bundle,
    closest_playable_slice: resolvedAnalysis.closest_playable_slice,
    adaptation_note: resolvedAnalysis.adaptation_note,
    translated_modules: translatedModules,
    dependency_graph_preview: resolution.graph,
    edit_category: editResolution?.edit_category ?? null,
    supported_changes: editResolution?.supported_changes ?? [],
    unsupported_requests: editResolution?.unsupported_requests ?? [],
    suggested_supported_prompts: editResolution?.suggested_supported_prompts ?? [],
    planned_patch_operations: editResolution?.planned_patch_operations ?? [],
    explanation: {
      game_type_label: resolvedAnalysis.selected_family_label,
      player_experience: resolvedAnalysis.player_experience,
      core_gameplay: resolvedAnalysis.core_gameplay,
      game_structure: resolvedAnalysis.game_structure,
      environment_label: resolvedAnalysis.environment_label,
      prompt_interpretation: resolvedAnalysis.prompt_interpretation,
      selected_family_label: resolvedAnalysis.selected_family_label,
    },
  })
}

export function planCapabilityPrompt(
  prompt: string,
  options: {
    mode?: CapabilityPlanningMode
    currentBlueprint?: BlueprintPlan | null
    profile?: CapabilityPlanningProfile
  } = {},
): CapabilityPlanningResult {
  const mode = options.mode ?? "replace"

  if (mode === "patch" && options.currentBlueprint) {
    return planCapabilityPatchPrompt(prompt, options.currentBlueprint, options.profile ?? "default")
  }

  const analysis = analyzePromptCapabilities(prompt, {
    profile: options.profile ?? "default",
  })
  const blueprintPlan = translateBundleToBlueprint(analysis.selected_bundle, analysis.resolved_capabilities, {
    mode: "replace",
  })
  const diagnostics = buildPlannerDiagnostics(prompt, blueprintPlan, analysis)

  return {
    blueprintPlan,
    diagnostics,
    analysis,
  }
}

function planCapabilityPatchPrompt(
  prompt: string,
  currentBlueprint: BlueprintPlan,
  profile: CapabilityPlanningProfile,
): CapabilityPlanningResult {
  const promptAnalysis = analyzePromptCapabilities(prompt, {
    preferredSlice: currentBlueprint.game_type,
    profile,
  })
  const currentCapabilities = deriveCapabilitiesFromBlueprint(currentBlueprint)
  const nextCapabilities = new Set<CapabilityId>(currentCapabilities)
  const currentScoreMap = buildBaselineScoreMap(currentCapabilities)
  const promptCapabilities = new Set(resolveCapabilityConflicts(promptAnalysis.capability_scores))
  const shouldRemove = hasPatchCue(prompt, "remove")
  const shouldAdd = hasPatchCue(prompt, "add")

  if (shouldRemove) {
    promptCapabilities.forEach((capabilityId) => removeCapability(nextCapabilities, capabilityId))
    if (promptCapabilities.has("ai.enemy_basic") || promptCapabilities.has("ai.enemy_ranged")) {
      removeCapability(nextCapabilities, "progression.wave")
      removeCapability(nextCapabilities, "systems.wave_spawner")
    }
  }

  if (shouldAdd || !shouldRemove) {
    promptCapabilities.forEach((capabilityId) => nextCapabilities.add(capabilityId))
  }

  const mergedScoreMap = mergeCapabilityScores(currentScoreMap, promptAnalysis.capability_scores, nextCapabilities)
  const resolvedCapabilities = resolveCapabilityConflicts(mergedScoreMap)
  const selectedBundle = selectCapabilityBundle(resolvedCapabilities, mergedScoreMap, {
    preferredSlice: currentBlueprint.game_type,
    profile,
  })
  const completedCapabilities = enforcePatchCompleteness(selectedBundle.id, resolvedCapabilities)
  const analysis: CapabilityAnalysis = {
    ...promptAnalysis,
    capability_scores: mergedScoreMap,
    resolved_capabilities: completedCapabilities,
    selected_bundle: selectedBundle.id,
    closest_playable_slice: selectedBundle.closest_playable_slice,
    adaptation_note: selectedBundle.adaptation_note,
    selected_family_label: selectedBundle.label,
    player_experience: selectedBundle.player_experience,
    core_gameplay: buildCoreGameplayDescriptions(selectedBundle, completedCapabilities),
    game_structure: selectedBundle.preferred_level_structure.map(humanizeSection),
    environment_label: selectedBundle.environment_label,
    prompt_interpretation: buildPromptInterpretation(
      dedupeAndSort([...promptAnalysis.tokens, ...promptAnalysis.phrases, ...promptAnalysis.expanded_terms]),
    ),
  }

  const blueprintPlan = translateBundleToBlueprint(selectedBundle.id, completedCapabilities, {
    mode: "patch",
  })
  const editResolution = resolveFollowUpPatch(prompt, currentBlueprint)
  const supportedChanges = dedupePreserveOrder([
    ...editResolution.supported_changes,
    ...describeBlueprintPatch(currentBlueprint, blueprintPlan),
  ])
  const finalEditResolution: FollowUpEditResolution = {
    ...editResolution,
    edit_category:
      supportedChanges.length === 0 && editResolution.unsupported_requests.length > 0
        ? "unsupported_request"
        : editResolution.edit_category,
    supported_changes: supportedChanges,
  }

  return {
    blueprintPlan,
    diagnostics: buildPlannerDiagnostics(prompt, blueprintPlan, analysis, {
      editResolution: finalEditResolution,
    }),
    analysis,
  }
}

export function hasPatchCue(prompt: string, type: "add" | "remove") {
  const normalized = normalizePrompt(prompt)
  if (type === "add") {
    return /\badd\b|\bwith\b|\bmore\b|\bmake the\b|\btune\b|\bfaster\b/.test(normalized)
  }
  return /\bremove\b|\bwithout\b|\bless\b|\bslower\b/.test(normalized)
}

export function hasReplaceCue(prompt: string) {
  return /\binstead\b|\breplace\b|\bmake it into\b|\bturn it into\b|\bnew game\b|\bstart over\b|\bfrom scratch\b|\brebuild\b/.test(
    normalizePrompt(prompt),
  )
}

export function hasDirectEditCue(prompt: string) {
  const normalized = normalizePrompt(prompt)
  return (
    hasPatchCue(normalized, "add") ||
    hasPatchCue(normalized, "remove") ||
    /\bchange\b|\bcolor\b|\bred\b|\bblue\b|\bgreen\b|\byellow\b|\bpurple\b|\bblack\b|\bwhite\b|\borange\b|\bhero\b|\bcharacter\b|\bplayer\b|\benemy\b|\bzombie\b|\bgun\b|\bweapon\b|\bprojectiles?\b|\btracers?\b|\bvisual\b|\blook\b|\btheme\b|\bneon\b|\bcyberpunk\b|\bsunset\b|\bforest\b|\bice\b|\blava\b|\bnight\b|\barcade\b|\bjump\b|\bspeed\b|\breload\b|\bdamage\b|\bmagazine\b|\bcoins?\b|\bcheckpoints?\b|\bzombies?\b|\barena\b|\bmood\b/.test(
      normalized,
    )
  )
}

export function decorateDiagnosticsForFamilyReplace(
  diagnostics: PlannerDiagnostics,
  currentBlueprint: BlueprintPlan,
): PlannerDiagnostics {
  return plannerDiagnosticsSchema.parse({
    ...diagnostics,
    edit_category: "family_replace",
    supported_changes: [
      `Replace the current ${humanizeGameType(currentBlueprint.game_type)} build with a new ${diagnostics.explanation.game_type_label} concept.`,
    ],
    unsupported_requests: [],
    suggested_supported_prompts: getSuggestedFollowUpPrompts(diagnostics.closest_playable_slice, "family_replace"),
    planned_patch_operations: [],
  })
}

function resolveFollowUpPatch(prompt: string, currentBlueprint: BlueprintPlan): FollowUpEditResolution {
  const normalized = normalizePrompt(prompt)
  const modulePatchMap = new Map<string, Record<string, string | number>>()
  const sceneChanges: Record<string, string | number> = {}
  const supportedChanges: string[] = []
  const unsupportedRequests: string[] = []
  const currentSlice = currentBlueprint.game_type
  let editCategory: PlannerEditCategory = "unsupported_request"
  let includesMechanicsChange = false

  const requestedColor = detectNamedColor(normalized)
  const requestedTheme = detectTheme(normalized)

  if (requestedTheme) {
    Object.assign(sceneChanges, VISUAL_THEME_MAP[requestedTheme])
    supportedChanges.push(`Shift the prototype mood to a ${humanizeSection(requestedTheme)} presentation theme.`)
    editCategory = "appearance_patch"
  }

  if (requestedColor) {
    const hex = COLOR_HEX_MAP[requestedColor]
    if (mentionsPlayerTarget(normalized)) {
      if (currentSlice === "2d_platformer") {
        mergeModulePatch(modulePatchMap, "player_1", "player/platformer_controller", {
          body_color: hex,
          accent_color: lightenHex(hex, 0.26),
        })
        supportedChanges.push(`Update the main character palette to ${requestedColor}.`)
        editCategory = "appearance_patch"
      } else {
        unsupportedRequests.push(
          `The current first-person prototype does not show a visible player body yet, so hero color changes are not supported in this build.`,
        )
      }
    } else if (mentionsEnemyTarget(normalized)) {
      const enemyModule = currentSlice === "3d_fps" ? "ai/basic_zombie" : "enemy/basic_enemy"
      mergeModulePatch(modulePatchMap, "enemy_1", enemyModule, {
        body_color: hex,
        accent_color: lightenHex(hex, 0.24),
      })
      supportedChanges.push(`Retint enemy characters to ${requestedColor}.`)
      editCategory = "appearance_patch"
    } else if (mentionsWorldTarget(normalized)) {
      sceneChanges.arena_tint = hex
      sceneChanges.background_variant = requestedColor
      supportedChanges.push(`Retint the world presentation toward ${requestedColor}.`)
      editCategory = "appearance_patch"
    } else if (mentionsWeaponTarget(normalized) && currentSlice === "3d_fps") {
      mergeModulePatch(modulePatchMap, "player_1", "combat/hitscan_weapon", {
        tracer_color: hex,
        muzzle_flash_color: lightenHex(hex, 0.28),
      })
      supportedChanges.push(`Retint weapon fire feedback to ${requestedColor}.`)
      editCategory = "appearance_patch"
    }
  }

  if (mentionsProjectilePresentation(normalized)) {
    if (currentSlice === "3d_fps") {
      mergeModulePatch(modulePatchMap, "player_1", "combat/hitscan_weapon", {
        tracer_style: "bright_tracer",
        tracer_color: requestedColor ? COLOR_HEX_MAP[requestedColor] : "#fb923c",
        muzzle_flash_color: requestedColor ? lightenHex(COLOR_HEX_MAP[requestedColor], 0.28) : "#fde68a",
        impact_fx_style: "spark_burst",
      })
      supportedChanges.push("Make weapon fire visibly readable with tracer streaks, muzzle flash, and impact sparks.")
      unsupportedRequests.push("Physical projectile simulation is not supported yet, so shots still land instantly underneath.")
      editCategory = "appearance_patch"
    } else {
      unsupportedRequests.push("Visible projectile-style weapon FX are only available in the native 3D shooter prototype right now.")
    }
  }

  if (currentSlice === "2d_platformer") {
    if (/\b(higher jump|increase jump|jump higher|jump height)\b/.test(normalized)) {
      mergeModulePatch(modulePatchMap, "player_1", "player/platformer_controller", { jump_force: 14.5 })
      supportedChanges.push("Increase jump height for the platformer hero.")
      includesMechanicsChange = true
    }
    if (/\b(lower jump|decrease jump|jump lower)\b/.test(normalized)) {
      mergeModulePatch(modulePatchMap, "player_1", "player/platformer_controller", { jump_force: 10.5 })
      supportedChanges.push("Reduce jump height for the platformer hero.")
      includesMechanicsChange = true
    }
    if (/\b(faster movement|move faster|run faster|faster player|increase speed)\b/.test(normalized)) {
      mergeModulePatch(modulePatchMap, "player_1", "player/platformer_controller", { move_speed: 7.8 })
      supportedChanges.push("Increase player movement speed.")
      includesMechanicsChange = true
    }
    if (/\b(slower movement|move slower|run slower|decrease speed)\b/.test(normalized)) {
      mergeModulePatch(modulePatchMap, "player_1", "player/platformer_controller", { move_speed: 5.4 })
      supportedChanges.push("Slow down player movement speed.")
      includesMechanicsChange = true
    }
    if (/\b(more coins|extra coins|more pickups|coin density)\b/.test(normalized)) {
      sceneChanges.coin_density = "dense"
      supportedChanges.push("Increase collectible coin density across the level.")
      includesMechanicsChange = true
    }
    if (/\b(less coins|fewer coins|less pickups|fewer pickups)\b/.test(normalized)) {
      sceneChanges.coin_density = "sparse"
      supportedChanges.push("Reduce collectible coin density across the level.")
      includesMechanicsChange = true
    }
    if (/\b(more checkpoints|extra checkpoints|checkpoint frequency)\b/.test(normalized)) {
      sceneChanges.checkpoint_density = "dense"
      supportedChanges.push("Increase checkpoint frequency across the level.")
      includesMechanicsChange = true
    }
    if (/\b(fewer checkpoints|less checkpoints)\b/.test(normalized)) {
      sceneChanges.checkpoint_density = "sparse"
      supportedChanges.push("Reduce checkpoint frequency across the level.")
      includesMechanicsChange = true
    }
    if (/\b(more enemies|extra enemies)\b/.test(normalized)) {
      sceneChanges.enemy_count = 3
      supportedChanges.push("Increase enemy count in the platformer route.")
      includesMechanicsChange = true
    }
    if (/\b(fewer enemies|less enemies)\b/.test(normalized)) {
      sceneChanges.enemy_count = 1
      supportedChanges.push("Reduce enemy count in the platformer route.")
      includesMechanicsChange = true
    }
  }

  if (currentSlice === "3d_fps") {
    if (/\b(more enemies|more zombies|extra zombies|extra enemies)\b/.test(normalized)) {
      sceneChanges.starting_wave_size_override = 7
      sceneChanges.wave_growth_override = 3
      supportedChanges.push("Increase zombie wave size and escalation.")
      includesMechanicsChange = true
    }
    if (/\b(fewer enemies|less enemies|fewer zombies|less zombies)\b/.test(normalized)) {
      sceneChanges.starting_wave_size_override = 3
      sceneChanges.wave_growth_override = 1
      supportedChanges.push("Reduce zombie wave size and escalation.")
      includesMechanicsChange = true
    }
    if (/\b(reload faster|faster reload|quick reload)\b/.test(normalized)) {
      mergeModulePatch(modulePatchMap, "player_1", "combat/hitscan_weapon", { reload_duration_ms: 900 })
      supportedChanges.push("Speed up weapon reloads.")
      includesMechanicsChange = true
    }
    if (/\b(reload slower|slower reload)\b/.test(normalized)) {
      mergeModulePatch(modulePatchMap, "player_1", "combat/hitscan_weapon", { reload_duration_ms: 1800 })
      supportedChanges.push("Slow down weapon reloads.")
      includesMechanicsChange = true
    }
    if (/\b(more damage|higher damage|increase damage)\b/.test(normalized)) {
      mergeModulePatch(modulePatchMap, "player_1", "combat/hitscan_weapon", { damage: 28 })
      supportedChanges.push("Increase weapon damage output.")
      includesMechanicsChange = true
    }
    if (/\b(less damage|lower damage|decrease damage)\b/.test(normalized)) {
      mergeModulePatch(modulePatchMap, "player_1", "combat/hitscan_weapon", { damage: 14 })
      supportedChanges.push("Reduce weapon damage output.")
      includesMechanicsChange = true
    }
    if (/\b(bigger magazine|more ammo|larger magazine)\b/.test(normalized)) {
      mergeModulePatch(modulePatchMap, "player_1", "combat/hitscan_weapon", { magazine_size: 40 })
      supportedChanges.push("Increase magazine capacity.")
      includesMechanicsChange = true
    }
    if (/\b(smaller magazine|less ammo|lower magazine)\b/.test(normalized)) {
      mergeModulePatch(modulePatchMap, "player_1", "combat/hitscan_weapon", { magazine_size: 18 })
      supportedChanges.push("Reduce magazine capacity.")
      includesMechanicsChange = true
    }
    if (/\b(move faster|player faster|increase speed)\b/.test(normalized)) {
      mergeModulePatch(modulePatchMap, "player_1", "player/fps_controller", { move_speed: 6.6 })
      supportedChanges.push("Increase player movement speed.")
      includesMechanicsChange = true
    }
    if (/\b(move slower|player slower|decrease speed)\b/.test(normalized)) {
      mergeModulePatch(modulePatchMap, "player_1", "player/fps_controller", { move_speed: 4.6 })
      supportedChanges.push("Slow down player movement speed.")
      includesMechanicsChange = true
    }
  }

  if (mentionsExactStyleRequest(normalized)) {
    unsupportedRequests.push("Exact franchise-authentic art style matching is not supported yet, so the prototype stays within curated Levelyst themes.")
  }

  const plannedPatchOperations = buildPatchOperationsFromMaps(modulePatchMap, sceneChanges)
  if (includesMechanicsChange) {
    editCategory = "mechanics_patch"
  } else if (plannedPatchOperations.length > 0) {
    editCategory = "appearance_patch"
  }

  return {
    edit_category: plannedPatchOperations.length > 0 ? editCategory : "unsupported_request",
    supported_changes: dedupePreserveOrder(supportedChanges),
    unsupported_requests: dedupePreserveOrder(unsupportedRequests),
    suggested_supported_prompts: getSuggestedFollowUpPrompts(currentSlice, plannedPatchOperations.length > 0 ? editCategory : "unsupported_request"),
    planned_patch_operations: plannedPatchOperations,
  }
}

function buildPatchOperationsFromMaps(
  modulePatchMap: Map<string, Record<string, string | number>>,
  sceneChanges: Record<string, string | number>,
) {
  const operations: PatchOperation[] = []

  if (Object.keys(sceneChanges).length > 0) {
    operations.push({
      op: "update_scene_parameters",
      changes: sceneChanges,
    })
  }

  for (const [key, changes] of modulePatchMap.entries()) {
    const [entityId, moduleId] = key.split("::")
    operations.push({
      op: "update_module_config",
      entity_id: entityId,
      module: moduleId,
      changes,
    })
  }

  return operations
}

function describeBlueprintPatch(currentBlueprint: BlueprintPlan, nextBlueprint: BlueprintPlan) {
  const changes: string[] = []
  const currentModules = new Set(currentBlueprint.required_modules)
  const nextModules = new Set(nextBlueprint.required_modules)

  const addedModules = [...nextModules].filter((moduleId) => !currentModules.has(moduleId))
  const removedModules = [...currentModules].filter((moduleId) => !nextModules.has(moduleId))

  addedModules.forEach((moduleId) => {
    changes.push(`Add ${humanizeModuleId(moduleId)} to the prototype.`)
  })

  removedModules.forEach((moduleId) => {
    changes.push(`Remove ${humanizeModuleId(moduleId)} from the prototype.`)
  })

  if (currentBlueprint.environment !== nextBlueprint.environment) {
    changes.push(`Shift the prototype environment to ${humanizeSection(nextBlueprint.environment)}.`)
  }

  if (JSON.stringify(currentBlueprint.level_structure) !== JSON.stringify(nextBlueprint.level_structure)) {
    changes.push("Re-sequence the game structure for the updated prototype loop.")
  }

  return changes
}

function getSuggestedFollowUpPrompts(gameType: GameType, category: PlannerEditCategory) {
  if (gameType === "2d_platformer") {
    if (category === "unsupported_request") {
      return ["Make the hero red", "Increase jump height", "Make the world neon"]
    }
    return ["Make the hero red", "Add more enemies", "Give the world a sunset mood"]
  }

  if (category === "unsupported_request") {
    return ["Make shots more visible", "Increase zombie waves", "Give the arena a sunset mood"]
  }

  return ["Make shots more visible", "Increase zombie waves", "Retint the arena neon"]
}

function mergeModulePatch(
  modulePatchMap: Map<string, Record<string, string | number>>,
  entityId: string,
  moduleId: string,
  changes: Record<string, string | number>,
) {
  const key = `${entityId}::${moduleId}`
  modulePatchMap.set(key, {
    ...(modulePatchMap.get(key) ?? {}),
    ...changes,
  })
}

function detectNamedColor(prompt: string) {
  return (Object.keys(COLOR_HEX_MAP) as Array<keyof typeof COLOR_HEX_MAP>).find((color) =>
    new RegExp(`\\b${color}\\b`).test(prompt),
  ) ?? null
}

function detectTheme(prompt: string) {
  return (Object.keys(VISUAL_THEME_MAP) as Array<keyof typeof VISUAL_THEME_MAP>).find((theme) =>
    new RegExp(`\\b${theme}\\b`).test(prompt),
  ) ?? null
}

function mentionsPlayerTarget(prompt: string) {
  return /\b(hero|main character|character|player)\b/.test(prompt)
}

function mentionsEnemyTarget(prompt: string) {
  return /\b(enemy|enemies|zombie|zombies)\b/.test(prompt)
}

function mentionsWorldTarget(prompt: string) {
  return /\b(world|background|arena|sky|level|environment)\b/.test(prompt)
}

function mentionsWeaponTarget(prompt: string) {
  return /\b(gun|weapon|shots|bullets|projectiles|tracers?)\b/.test(prompt)
}

function mentionsProjectilePresentation(prompt: string) {
  return /\b(projectiles?|bullets?|tracers?|visible shots?|show shots?|make shots more visible)\b/.test(prompt)
}

function mentionsExactStyleRequest(prompt: string) {
  return /\b(exactly like|identical to|same art style|clone|look exactly like)\b/.test(prompt)
}

function buildCoreGameplayDescriptions(bundle: CapabilityBundleDefinition, capabilities: CapabilityId[]) {
  const ordered = dedupePreserveOrder([...bundle.primary, ...capabilities])
  return ordered
    .map((capabilityId) => capabilityDescriptionMap[capabilityId])
    .filter(Boolean)
    .slice(0, 5)
}

function buildPromptInterpretation(matchedTerms: string[]) {
  const candidates = matchedTerms
    .filter((term) => termMeaningMap[term])
    .sort((left, right) => {
      const leftWeight = totalTermWeight(left)
      const rightWeight = totalTermWeight(right)
      if (rightWeight !== leftWeight) return rightWeight - leftWeight
      return left.localeCompare(right)
    })

  return dedupePreserveOrder(
    candidates.map((term) =>
      JSON.stringify({
        term: humanizeSection(term),
        meaning: termMeaningMap[term],
      }),
    ),
  )
    .slice(0, 4)
    .map((entry) => JSON.parse(entry) as PlannerPromptInterpretationItem)
}

function totalTermWeight(term: string) {
  const base = Object.values(termCapabilityWeights[term] ?? {}).reduce((sum, value) => sum + (value ?? 0), 0)
  const boost = Object.values(gameReferenceBoosts[term] ?? {}).reduce((sum, value) => sum + (value ?? 0), 0)
  return base + boost
}

function applyCapabilityWeights(target: CapabilityScoreMap, weights: CapabilityScoreMap) {
  Object.entries(weights).forEach(([capabilityId, value]) => {
    const key = capabilityId as CapabilityId
    target[key] = (target[key] ?? 0) + (value ?? 0)
  })
}

function buildBaselineScoreMap(capabilities: CapabilityId[]) {
  const baseline: CapabilityScoreMap = {}
  capabilities.forEach((capabilityId) => {
    baseline[capabilityId] = 3
  })
  return baseline
}

function mergeCapabilityScores(
  baseline: CapabilityScoreMap,
  promptScores: CapabilityScoreMap,
  retainedCapabilities: Set<CapabilityId>,
) {
  const merged: CapabilityScoreMap = { ...baseline }
  applyCapabilityWeights(merged, promptScores)

  capabilityPrecedence.forEach((capabilityId) => {
    if (!retainedCapabilities.has(capabilityId)) {
      delete merged[capabilityId]
    }
  })

  return sortCapabilityScoreMap(merged)
}

function removeCapability(target: Set<CapabilityId>, capabilityId: CapabilityId) {
  target.delete(capabilityId)
  ;(removalAdjacency[capabilityId] ?? []).forEach((linkedCapabilityId) => target.delete(linkedCapabilityId))
}

function sortCapabilityScoreMap(scoreMap: CapabilityScoreMap) {
  const sortedEntries = Object.entries(scoreMap)
    .filter((entry): entry is [CapabilityId, number] => Boolean(entry[1] && entry[1] > 0))
    .sort((left, right) => {
      if (right[1] !== left[1]) {
        return right[1] - left[1]
      }
      return capabilityPrecedence.indexOf(left[0]) - capabilityPrecedence.indexOf(right[0])
    })

  return Object.fromEntries(sortedEntries) as CapabilityScoreMap
}

function buildPhraseDictionary() {
  const phrases = new Set<string>()

  Object.entries(synonymDictionary).forEach(([canonical, synonyms]) => {
    if (canonical.includes(" ")) {
      phrases.add(canonical)
    }
    synonyms.forEach((term) => {
      if (term.includes(" ")) {
        phrases.add(term)
      }
    })
  })

  Object.keys(termCapabilityWeights).forEach((term) => {
    if (term.includes(" ")) {
      phrases.add(term)
    }
  })

  return [...phrases].sort((left, right) => {
    const wordDelta = right.split(" ").length - left.split(" ").length
    if (wordDelta !== 0) return wordDelta
    return left.localeCompare(right)
  })
}

function normalizePrompt(prompt: string) {
  return prompt
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function extractPromptFocus(normalizedPrompt: string) {
  const replaceMatch = normalizedPrompt.match(
    /\b(?:instead of|replace|make it into|turn it into)\b.*?\b(?:create|make|build)\b\s+(.*)$/,
  )

  if (replaceMatch?.[1]) {
    return replaceMatch[1].trim()
  }

  const fromScratchMatch = normalizedPrompt.match(/\b(?:new game|start over|from scratch|rebuild)\b.*?\b(?:create|make|build)\b\s+(.*)$/)
  if (fromScratchMatch?.[1]) {
    return fromScratchMatch[1].trim()
  }

  return normalizedPrompt
}

function humanizeSection(value: string) {
  return (sectionLabelMap[value] ?? value)
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase())
}

function humanizeModuleId(moduleId: string) {
  return moduleId
    .split("/")
    .pop()
    ?.replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase()) ?? moduleId
}

function humanizeGameType(gameType: GameType) {
  return gameType === "3d_fps" ? "3D FPS" : "2D Platformer"
}

function lightenHex(hex: string, amount: number) {
  const normalized = /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : "#ffffff"
  const channels = [1, 3, 5].map((offset) => parseInt(normalized.slice(offset, offset + 2), 16))
  const adjusted = channels.map((channel) => Math.round(channel + (255 - channel) * amount))
  return `#${adjusted.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`
}

function dedupeAndSort(values: string[]) {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right))
}

function dedupePreserveOrder<T>(values: T[]) {
  const seen = new Set<T>()
  return values.filter((value) => {
    if (seen.has(value)) return false
    seen.add(value)
    return true
  })
}
