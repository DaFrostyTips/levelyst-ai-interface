import { describe, expect, it } from "vitest"
import {
  analyzePromptCapabilities,
  expandSynonyms,
  extractPhrases,
  planCapabilityPrompt,
  resolveCapabilityConflicts,
  scoreCapabilities,
  tokenizePrompt,
} from "@/lib/server/levelyst/capability-planner"

const baseFpsBlueprint = {
  game_type: "3d_fps" as const,
  core_systems: ["player/fps_controller", "combat/hitscan_weapon"],
  gameplay_systems: ["ai/basic_zombie", "systems/wave_manager"],
  required_modules: [
    "ai/basic_zombie",
    "combat/hitscan_weapon",
    "player/fps_controller",
    "systems/wave_manager",
  ],
  environment: "warehouse_small",
  level_structure: ["intro", "gameplay_loop", "boss_encounter"],
  constraints: {
    target_runtime: "web_3d" as const,
  },
}

const basePlatformerBlueprint = {
  game_type: "2d_platformer" as const,
  core_systems: ["camera/side_scroll", "player/platformer_controller"],
  gameplay_systems: ["enemy/basic_enemy", "systems/checkpoint", "systems/coin_collectible"],
  required_modules: [
    "camera/side_scroll",
    "enemy/basic_enemy",
    "player/platformer_controller",
    "systems/checkpoint",
    "systems/coin_collectible",
  ],
  environment: "graybox_rooftops",
  level_structure: ["intro", "gameplay_loop", "end"],
  constraints: {
    target_runtime: "web_2d" as const,
  },
}

describe("capability planner", () => {
  it("tokenizes prompts and extracts multi-word phrases deterministically", () => {
    const tokenized = tokenizePrompt("Create a cyberpunk stealth platformer with enemies!")
    const phrases = extractPhrases(tokenized.normalized)

    expect(tokenized.tokens).toEqual(["cyberpunk", "enemies", "platformer", "stealth"])
    expect(phrases).toContain("stealth platformer")
  })

  it("expands well-known references through the synonym dictionary", () => {
    const expanded = expandSynonyms(["pokemon", "rpg"], [])
    expect(expanded).toContain("monster catching")
    expect(expanded).toContain("top down rpg")
  })

  it("resolves conflicting capability groups by score and fixed precedence", () => {
    const scored = scoreCapabilities([
      "platformer",
      "fps",
      "voxel",
      "tilemap",
      "turn based",
      "hitscan",
    ])
    const resolved = resolveCapabilityConflicts(scored)

    expect(resolved).toContain("movement.first_person")
    expect(resolved).not.toContain("movement.side_scroll")
    expect(resolved).toContain("world.voxel")
    expect(resolved).not.toContain("world.tilemap")
  })

  it("plans pokemon prompts into a top-down adventure bundle and closest 2D slice", () => {
    const planned = planCapabilityPrompt("pokemon style rpg")

    expect(planned.analysis.selected_bundle).toBe("2d_turn_based_rpg")
    expect(planned.analysis.selected_family_label).toBe("2D Turn-Based RPG")
    expect(planned.analysis.closest_playable_slice).toBe("2d_platformer")
    expect(planned.analysis.resolved_capabilities).toContain("movement.top_down")
    expect(planned.analysis.resolved_capabilities).toContain("combat.turn_based")
    expect(planned.blueprintPlan.game_type).toBe("2d_platformer")
    expect(planned.diagnostics.explanation.player_experience).toContain("turn-based encounters")
    expect(planned.diagnostics.adaptation_note).toContain("Turn-based battles")
  })

  it("plans GTA prompts into the third-person action family and closest 3D slice", () => {
    const analysis = analyzePromptCapabilities("open world gta game")

    expect(analysis.selected_bundle).toBe("3d_third_person_action")
    expect(analysis.selected_family_label).toBe("3D Third-Person Action")
    expect(analysis.closest_playable_slice).toBe("3d_fps")
    expect(analysis.resolved_capabilities).toContain("movement.third_person")
    expect(analysis.resolved_capabilities).toContain("world.open_arena")
  })

  it("plans Minecraft prompts into the sandbox builder family", () => {
    const analysis = analyzePromptCapabilities("minecraft sandbox survival")

    expect(analysis.selected_bundle).toBe("3d_sandbox_builder")
    expect(analysis.resolved_capabilities).toContain("world.voxel")
    expect(analysis.resolved_capabilities).toContain("systems.crafting")
  })

  it("keeps stealth platformer prompts in the platformer family with variant gameplay notes", () => {
    const planned = planCapabilityPrompt("2d stealth platformer")

    expect(planned.analysis.selected_bundle).toBe("2d_platformer")
    expect(planned.blueprintPlan.core_systems).toEqual(["camera/side_scroll", "player/platformer_controller"])
    expect(planned.analysis.core_gameplay[0]).toContain("side-scrolling")
  })

  it("plans top-down quest prompts into the adventure bundle", () => {
    const analysis = analyzePromptCapabilities("top down adventure with dialogue and quests")

    expect(analysis.selected_bundle).toBe("2d_top_down_adventure")
    expect(analysis.selected_family_label).toBe("2D Top-Down Adventure")
    expect(analysis.resolved_capabilities).toContain("movement.top_down")
    expect(analysis.resolved_capabilities).toContain("interaction.dialogue")
    expect(analysis.resolved_capabilities).toContain("progression.quest")
  })

  it("plans zombie survival prompts into the native FPS survival bundle", () => {
    const planned = planCapabilityPrompt("fps zombie survival")

    expect(planned.analysis.selected_bundle).toBe("3d_fps_survival")
    expect(planned.diagnostics.explanation.game_type_label).toBe("3D FPS Survival")
    expect(planned.blueprintPlan.gameplay_systems).toContain("ai/basic_zombie")
    expect(planned.blueprintPlan.gameplay_systems).toContain("systems/wave_manager")
  })

  it("carries initial appearance prompts into replace-mode planned patch operations", () => {
    const planned = planCapabilityPrompt("create a 2d platformer with enemies and make the character black")

    expect(planned.blueprintPlan.game_type).toBe("2d_platformer")
    expect(planned.blueprintPlan.required_modules).toContain("enemy/basic_enemy")
    expect(planned.diagnostics.edit_category).toBe("appearance_patch")
    expect(planned.diagnostics.supported_changes).toContain("Update the main character palette to black.")
    expect(planned.diagnostics.planned_patch_operations).toContainEqual(
      expect.objectContaining({
        op: "update_module_config",
        entity_id: "player_1",
        module: "player/platformer_controller",
        changes: expect.objectContaining({
          body_color: "#111827",
        }),
      }),
    )
  })

  it("supports patch-style removal by translating capability changes back into the current slice", () => {
    const planned = planCapabilityPrompt("Remove zombies", {
      mode: "patch",
      currentBlueprint: baseFpsBlueprint,
    })

    expect(planned.blueprintPlan.required_modules).not.toContain("ai/basic_zombie")
    expect(planned.blueprintPlan.required_modules).not.toContain("systems/wave_manager")
    expect(planned.blueprintPlan.required_modules).toContain("player/fps_controller")
  })

  it("resolves follow-up appearance prompts into supported player color patches", () => {
    const planned = planCapabilityPrompt("Make the main character red", {
      mode: "patch",
      currentBlueprint: basePlatformerBlueprint,
    })

    expect(planned.diagnostics.edit_category).toBe("appearance_patch")
    expect(planned.diagnostics.supported_changes).toContain("Update the main character palette to red.")
    expect(planned.diagnostics.planned_patch_operations).toContainEqual(
      expect.objectContaining({
        op: "update_module_config",
        entity_id: "player_1",
        module: "player/platformer_controller",
        changes: expect.objectContaining({
          body_color: "#ef4444",
        }),
      }),
    )
  })

  it("keeps platformer follow-up gun prompts in the current 2D slice", () => {
    const planned = planCapabilityPrompt("Add guns and enemies I can shoot at", {
      mode: "patch",
      currentBlueprint: {
        ...basePlatformerBlueprint,
        gameplay_systems: ["systems/coin_collectible"],
        required_modules: [
          "camera/side_scroll",
          "player/platformer_controller",
          "systems/coin_collectible",
        ],
      },
    })

    expect(planned.blueprintPlan.game_type).toBe("2d_platformer")
    expect(planned.blueprintPlan.core_systems).toContain("combat/side_scroller_projectile_weapon")
    expect(planned.blueprintPlan.required_modules).toContain("enemy/basic_enemy")
    expect(planned.diagnostics.edit_category).toBe("mechanics_patch")
    expect(planned.diagnostics.supported_changes).toEqual(
      expect.arrayContaining([
        "Add Side Scroller Projectile Weapon to the prototype.",
        "Add Basic Enemy to the prototype.",
      ]),
    )
  })

  it("turns projectile requests into visible tracer-style shooter feedback while keeping hitscan", () => {
    const planned = planCapabilityPrompt("Make the gun show actual projectiles", {
      mode: "patch",
      currentBlueprint: baseFpsBlueprint,
    })

    expect(planned.diagnostics.edit_category).toBe("appearance_patch")
    expect(planned.diagnostics.supported_changes).toContain(
      "Make weapon fire visibly readable with tracer streaks, muzzle flash, and impact sparks.",
    )
    expect(planned.diagnostics.unsupported_requests).toContain(
      "Physical projectile simulation is not supported yet, so shots still land instantly underneath.",
    )
    expect(planned.diagnostics.planned_patch_operations).toContainEqual(
      expect.objectContaining({
        op: "update_module_config",
        entity_id: "player_1",
        module: "combat/hitscan_weapon",
        changes: expect.objectContaining({
          tracer_style: "bright_tracer",
          tracer_color: "#fb923c",
          impact_fx_style: "spark_burst",
        }),
      }),
    )
  })

  it("applies the supported subset of an exact-style request and explains the rest", () => {
    const planned = planCapabilityPrompt("Make it look exactly like Hollow Knight but neon", {
      mode: "patch",
      currentBlueprint: basePlatformerBlueprint,
    })

    expect(planned.diagnostics.edit_category).toBe("appearance_patch")
    expect(planned.diagnostics.supported_changes).toContain(
      "Shift the prototype mood to a Neon presentation theme.",
    )
    expect(planned.diagnostics.unsupported_requests[0]).toContain("Exact franchise-authentic art style matching")
    expect(planned.diagnostics.suggested_supported_prompts.length).toBeGreaterThan(0)
  })
})
