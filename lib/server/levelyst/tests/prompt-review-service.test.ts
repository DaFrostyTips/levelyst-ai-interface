import { describe, expect, it } from "vitest"
import { detectPromptReviewMode, planProjectPromptReview } from "@/lib/server/levelyst/prompt-review-service"

const basePlatformerBlueprint = {
  game_type: "2d_platformer" as const,
  core_systems: ["player/platformer_controller", "camera/side_scroll"],
  gameplay_systems: ["enemy/basic_enemy", "systems/coin_collectible"],
  required_modules: [
    "camera/side_scroll",
    "enemy/basic_enemy",
    "player/platformer_controller",
    "systems/coin_collectible",
  ],
  environment: "graybox_rooftops",
  level_structure: ["intro", "gameplay_loop", "end"],
  constraints: {
    target_runtime: "web_2d" as const,
  },
}

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

describe("prompt review service", () => {
  it("detects patch prompts against an existing blueprint", () => {
    expect(detectPromptReviewMode("Add checkpoints", basePlatformerBlueprint)).toBe("patch")
  })

  it("detects replacement prompts when the user asks for a new game", () => {
    expect(
      detectPromptReviewMode("Instead of this mario game, make a game like Grand Theft Auto", basePlatformerBlueprint),
    ).toBe("replace")
  })

  it("detects explicit start-over prompts as replacements", () => {
    expect(detectPromptReviewMode("start over and make an FPS zombie game", basePlatformerBlueprint)).toBe("replace")
  })

  it("builds a patch review blueprint by adding matched platformer systems", async () => {
    const review = await planProjectPromptReview("Add checkpoints", {
      currentBlueprint: basePlatformerBlueprint,
    })

    expect(review.mode).toBe("patch")
    expect(review.blueprintPlan.required_modules).toContain("systems/checkpoint")
    expect(review.diagnostics.selected_bundle).toBe("2d_platformer")
  })

  it("builds a patch review blueprint for adding 2D gun combat to a platformer", async () => {
    const review = await planProjectPromptReview("Add guns and enemies I can shoot at", {
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

    expect(review.mode).toBe("patch")
    expect(review.blueprintPlan.game_type).toBe("2d_platformer")
    expect(review.blueprintPlan.core_systems).toContain("combat/side_scroller_projectile_weapon")
    expect(review.blueprintPlan.required_modules).toContain("enemy/basic_enemy")
    expect(review.diagnostics.supported_changes).toContain("Add Side Scroller Projectile Weapon to the prototype.")
  })

  it("builds a patch review blueprint by removing zombies and dependent waves", async () => {
    const review = await planProjectPromptReview("Remove zombies", {
      currentBlueprint: baseFpsBlueprint,
    })

    expect(review.mode).toBe("patch")
    expect(review.blueprintPlan.required_modules).not.toContain("ai/basic_zombie")
    expect(review.blueprintPlan.required_modules).not.toContain("systems/wave_manager")
  })

  it("builds replacement reviews with persisted adaptation diagnostics for out-of-scope references", async () => {
    const review = await planProjectPromptReview("Make a Minecraft survival sandbox")

    expect(review.mode).toBe("replace")
    expect(review.diagnostics.selected_bundle).toBe("3d_sandbox_builder")
    expect(review.diagnostics.adaptation_note).toContain("crafting")
  })
})
