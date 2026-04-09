import { describe, expect, it } from "vitest"
import { hydrateIntentBlueprint, hydrateWorkspace } from "@/lib/levelyst/client-mappers"
import type { PlannerDiagnostics } from "@levelyst/contracts"

function createPlannerDiagnostics(overrides: Partial<PlannerDiagnostics>): PlannerDiagnostics {
  return {
    tokens: [],
    phrases: [],
    expanded_terms: [],
    capability_scores: {},
    resolved_capabilities: [],
    selected_bundle: "2d_platformer",
    closest_playable_slice: "2d_platformer",
    adaptation_note: null,
    translated_modules: [],
    dependency_graph_preview: {
      nodes: [],
      edges: [],
    },
    edit_category: null,
    supported_changes: [],
    unsupported_requests: [],
    suggested_supported_prompts: [],
    planned_patch_operations: [],
    explanation: {
      game_type_label: "2D Platformer",
      player_experience: "Run and jump through a side-scrolling world.",
      core_gameplay: ["Run and jump through side-scrolling spaces."],
      game_structure: ["Intro", "Platforming", "Goal"],
      environment_label: "Tile-based side-scrolling course",
      prompt_interpretation: [],
      selected_family_label: "2D Platformer",
    },
    ...overrides,
  }
}

describe("client mappers", () => {
  it("hydrates draft workspace nodes even when no module graph exists yet", () => {
    const workspace = hydrateWorkspace(
      {
        nodes: [
          {
            id: "draft-player-node",
            module_id: "player/platformer_controller",
            x: 320,
            y: 180,
            active: true,
          },
        ],
        groups: [],
        timeline_sections: [
          {
            id: "intro",
            title: "Intro",
            order: 0,
            expanded: true,
            module_ids: ["draft-player-node"],
          },
        ],
        prompt: "Create a platformer draft",
        game_plan: ["Platformer Controller"],
        planning_steps: [],
        canvas_viewport: {
          x: 0,
          y: 0,
          scale: 1,
          is_panning: false,
        },
        pending_blueprint: null,
        pending_blueprint_diagnostics: null,
        pending_prompt_mode: null,
        blueprint_state: "idle",
      },
      null,
      null,
    )

    expect(workspace.nodes).toHaveLength(1)
    expect(workspace.nodes[0]).toMatchObject({
      id: "draft-player-node",
      typeId: "player/platformer_controller",
      x: 320,
      y: 180,
    })
  })

  it("preserves workspace-only draft nodes alongside compiled graph nodes", () => {
    const workspace = hydrateWorkspace(
      {
        nodes: [
          {
            id: "draft-player-node",
            module_id: "player/platformer_controller",
            x: 320,
            y: 180,
            active: true,
          },
          {
            id: "draft-checkpoint-node",
            module_id: "systems/checkpoint",
            x: 540,
            y: 260,
            active: true,
          },
        ],
        groups: [],
        timeline_sections: [],
        prompt: "Create a platformer draft",
        game_plan: ["Platformer Controller", "Checkpoint System"],
        planning_steps: [],
        canvas_viewport: {
          x: 0,
          y: 0,
          scale: 1,
          is_panning: false,
        },
        pending_blueprint: null,
        pending_blueprint_diagnostics: null,
        pending_prompt_mode: null,
        blueprint_state: "idle",
      },
      {
        nodes: [
          {
            id: "player/platformer_controller",
            module_id: "player/platformer_controller",
            category: "player_mechanics",
            position: { x: 120, y: 120 },
          },
        ],
        edges: [],
      },
      null,
    )

    expect(workspace.nodes.map((node) => node.typeId).sort()).toEqual([
      "player/platformer_controller",
      "systems/checkpoint",
    ])
    expect(workspace.nodes.find((node) => node.typeId === "player/platformer_controller")?.id).toBe("draft-player-node")
    expect(workspace.nodes.find((node) => node.typeId === "systems/checkpoint")?.id).toBe("draft-checkpoint-node")
  })

  it("surfaces closest-supported-slice notes for out-of-scope prompts like Minecraft", () => {
    const blueprint = hydrateIntentBlueprint(
      {
        game_type: "3d_fps",
        core_systems: ["player/fps_controller", "combat/hitscan_weapon"],
        gameplay_systems: ["ai/basic_zombie", "systems/wave_manager"],
        required_modules: [
          "player/fps_controller",
          "combat/hitscan_weapon",
          "ai/basic_zombie",
          "systems/wave_manager",
        ],
        environment: "warehouse_small",
        level_structure: ["intro", "gameplay_loop", "boss_encounter"],
        constraints: {
          target_runtime: "web_3d",
        },
      },
      "Create a game like Minecraft",
      createPlannerDiagnostics({
        tokens: ["minecraft", "survival", "sandbox"],
        phrases: ["sandbox survival"],
        expanded_terms: ["block building", "minecraft", "sandbox survival", "voxel"],
        capability_scores: {
          "interaction.pickup": 3,
          "systems.crafting": 4,
          "systems.inventory": 3,
          "world.voxel": 5,
        },
        resolved_capabilities: ["world.voxel", "interaction.pickup", "systems.crafting"],
        selected_bundle: "3d_sandbox_builder",
        closest_playable_slice: "3d_fps",
        adaptation_note:
          "Closest supported slice: 3D FPS graybox survival prototype. Voxel terrain, sandbox building, and full crafting loops are not natively playable in the MVP yet.",
        translated_modules: ["player/fps_controller", "combat/hitscan_weapon"],
        dependency_graph_preview: {
          nodes: ["player/fps_controller", "combat/hitscan_weapon"],
          edges: [],
        },
        explanation: {
          game_type_label: "3D Sandbox Builder",
          player_experience: "Roam a blocky world, gather resources, and shape the environment with survival-style goals.",
          core_gameplay: [
            "Move and aim from a first-person view.",
            "Explore a world built from block-like terrain.",
            "Collect and store items.",
            "Craft new tools or structures from gathered resources.",
          ],
          game_structure: ["Intro", "Scavenge", "Build", "Defend"],
          environment_label: "Voxel-style survival sandbox",
          prompt_interpretation: [{ term: "Minecraft", meaning: "sandbox building and survival" }],
          selected_family_label: "3D Sandbox Builder",
        },
      }),
    )

    expect(blueprint.unmappedSystems[0]).toContain("Closest supported slice")
    expect(blueprint.unmappedSystems[0]).toContain("crafting")
  })

  it("surfaces closest-supported-slice notes for out-of-scope prompts like GTA", () => {
    const blueprint = hydrateIntentBlueprint(
      {
        game_type: "3d_fps",
        core_systems: ["player/fps_controller", "combat/hitscan_weapon"],
        gameplay_systems: ["ai/basic_zombie", "systems/wave_manager"],
        required_modules: [
          "player/fps_controller",
          "combat/hitscan_weapon",
          "ai/basic_zombie",
          "systems/wave_manager",
        ],
        environment: "warehouse_small",
        level_structure: ["intro", "gameplay_loop", "boss_encounter"],
        constraints: {
          target_runtime: "web_3d",
        },
      },
      "Instead of this platformer, make a game like Grand Theft Auto",
      createPlannerDiagnostics({
        tokens: ["gta", "open", "world"],
        phrases: ["open world", "grand theft auto"],
        expanded_terms: ["city sandbox", "gta", "grand theft auto", "open world crime"],
        capability_scores: {
          "combat.projectile": 3,
          "movement.third_person": 4,
          "progression.quest": 3,
          "world.open_arena": 4,
        },
        resolved_capabilities: ["movement.third_person", "world.open_arena", "combat.projectile"],
        selected_bundle: "3d_third_person_action",
        closest_playable_slice: "3d_fps",
        adaptation_note:
          "Closest supported slice: 3D FPS graybox action prototype. Third-person movement, broader missions, and open-world action systems are simplified in the MVP runtime.",
        translated_modules: ["player/fps_controller", "combat/hitscan_weapon", "ai/basic_zombie"],
        dependency_graph_preview: {
          nodes: ["player/fps_controller", "combat/hitscan_weapon", "ai/basic_zombie"],
          edges: [],
        },
        explanation: {
          game_type_label: "3D Third-Person Action",
          player_experience: "Explore an open action space, fight enemies, and complete mission-style objectives.",
          core_gameplay: [
            "Explore the world from a third-person camera.",
            "Fight using projectile-based attacks.",
            "Advance by completing quest objectives.",
          ],
          game_structure: ["Intro", "Exploration", "Missions", "Action"],
          environment_label: "Open graybox action space",
          prompt_interpretation: [{ term: "Grand Theft Auto", meaning: "third-person city action" }],
          selected_family_label: "3D Third-Person Action",
        },
      }),
    )

    expect(blueprint.unmappedSystems[0]).toContain("Closest supported slice")
    expect(blueprint.unmappedSystems[0]).toContain("Third-person")
  })

  it("hydrates persisted planner diagnostics onto the review blueprint", () => {
    const blueprint = hydrateIntentBlueprint(
      {
        game_type: "2d_platformer",
        core_systems: ["camera/side_scroll", "player/platformer_controller"],
        gameplay_systems: ["systems/checkpoint"],
        required_modules: ["camera/side_scroll", "player/platformer_controller", "systems/checkpoint"],
        environment: "graybox_rooftops",
        level_structure: ["intro", "exploration", "battle"],
        constraints: {
          target_runtime: "web_2d",
        },
      },
      "pokemon style rpg",
      createPlannerDiagnostics({
        tokens: ["pokemon", "rpg"],
        phrases: ["top down rpg"],
        expanded_terms: ["monster catching", "pokemon", "top down rpg"],
        capability_scores: {
          "combat.turn_based": 5,
          "movement.top_down": 4,
        },
        resolved_capabilities: ["movement.top_down", "combat.turn_based"],
        selected_bundle: "2d_turn_based_rpg",
        closest_playable_slice: "2d_platformer",
        adaptation_note:
          "Closest supported slice: 2D platformer graybox prototype. Turn-based battles, top-down travel, and RPG progression are represented as a simplified playable slice in the MVP.",
        translated_modules: [
          "player/platformer_controller",
          "camera/side_scroll",
          "enemy/basic_enemy",
          "systems/checkpoint",
          "systems/coin_collectible",
        ],
        dependency_graph_preview: {
          nodes: [
            "player/platformer_controller",
            "camera/side_scroll",
            "enemy/basic_enemy",
            "systems/checkpoint",
            "systems/coin_collectible",
          ],
          edges: [
            {
              from: "player/platformer_controller",
              to: "physics/gravity",
              kind: "requires",
            },
          ],
        },
        explanation: {
          game_type_label: "2D Turn-Based RPG",
          player_experience: "Explore towns and routes, talk to characters, and battle enemies in turn-based encounters.",
          core_gameplay: [
            "Move around the world from a top-down view.",
            "Battles happen in turn-based encounters.",
            "Talk to characters.",
            "Collect and store items.",
          ],
          game_structure: ["Intro", "Exploration", "Battles", "Progression"],
          environment_label: "Tile-based overworld",
          prompt_interpretation: [
            { term: "Pokemon", meaning: "monster adventure" },
            { term: "Rpg", meaning: "role-playing progression" },
          ],
          selected_family_label: "2D Turn-Based RPG",
        },
      }),
    )

    expect(blueprint.plannerDiagnostics?.selected_bundle).toBe("2d_turn_based_rpg")
    expect(blueprint.gameTypeLabel).toBe("2D Turn-Based RPG")
    expect(blueprint.unmappedSystems[0]).toContain("Turn-based")
  })
})
