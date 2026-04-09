import { describe, expect, it } from "vitest"
import { createSeededModuleRegistry } from "@levelyst/module-registry"
import { resolveRequiredModules } from "@levelyst/dependency-resolver"
import { PrototypeSpecCompiler, applyPatchOperation, applyPatchOperations } from "../src"

describe("@levelyst/spec-compiler", () => {
  it("compiles a 2D platformer blueprint into player, enemy, and system entries", () => {
    const registry = createSeededModuleRegistry()
    const blueprint = {
      game_type: "2d_platformer" as const,
      core_systems: ["player/platformer_controller", "camera/side_scroll"],
      gameplay_systems: ["enemy/basic_enemy", "systems/checkpoint", "systems/coin_collectible"],
      required_modules: [
        "player/platformer_controller",
        "camera/side_scroll",
        "enemy/basic_enemy",
        "systems/checkpoint",
        "systems/coin_collectible",
      ],
      environment: "graybox_rooftops",
      level_structure: ["intro", "gameplay_loop", "end"],
      constraints: {
        target_runtime: "web_2d" as const,
      },
    }
    const resolved = resolveRequiredModules({
      required_modules: blueprint.required_modules,
      runtime_target: blueprint.constraints.target_runtime,
      registry,
    })

    const spec = PrototypeSpecCompiler.compile(blueprint, resolved)

    expect(spec.runtime).toBe("web_2d")
    expect(spec.entities.map((entity) => entity.id)).toEqual(["player_1", "enemy_1"])
    expect(spec.entities[0]?.modules).toEqual([
      "physics/gravity",
      "player/platformer_controller",
      "camera/side_scroll",
    ])
    expect(spec.entities[1]?.modules).toEqual(["physics/gravity", "enemy/basic_enemy"])
    expect(spec.systems.map((system) => system.module)).toEqual([
      "systems/checkpoint",
      "systems/coin_collectible",
    ])
  })

  it("compiles a 3D FPS blueprint into player, zombie, and wave-manager system entries", () => {
    const registry = createSeededModuleRegistry()
    const blueprint = {
      game_type: "3d_fps" as const,
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
        target_runtime: "web_3d" as const,
      },
    }
    const resolved = resolveRequiredModules({
      required_modules: blueprint.required_modules,
      runtime_target: blueprint.constraints.target_runtime,
      registry,
    })

    const spec = PrototypeSpecCompiler.compile(blueprint, resolved)

    expect(spec.entities.map((entity) => entity.id)).toEqual(["player_1", "enemy_1"])
    expect(spec.entities[0]?.modules).toEqual([
      "physics/character_body",
      "player/fps_controller",
      "combat/hitscan_weapon",
    ])
    expect(spec.entities[1]?.modules).toEqual(["physics/character_body", "ai/basic_zombie"])
    expect(spec.systems.map((system) => system.module)).toEqual(["systems/wave_manager"])
  })

  it("rejects compilation from invalid resolved modules", () => {
    const blueprint = {
      game_type: "3d_fps" as const,
      core_systems: ["player/fps_controller"],
      gameplay_systems: [],
      required_modules: ["player/fps_controller"],
      environment: "warehouse_small",
      level_structure: ["intro"],
      constraints: {
        target_runtime: "web_3d" as const,
      },
    }

    expect(() =>
      PrototypeSpecCompiler.compile(blueprint, {
        requested: ["player/fps_controller"],
        resolved: [],
        ordered_modules: [],
        graph: {
          nodes: [],
          edges: [],
        },
        errors: [
          {
            type: "missing_module" as const,
            module_id: "player/fps_controller",
            required_by: null,
          },
        ],
        valid: false,
      }),
    ).toThrow(/invalid resolved modules/i)
  })

  it("applies add_module and update_module_config patches incrementally", () => {
    const registry = createSeededModuleRegistry()
    const spec = PrototypeSpecCompiler.compile(
      {
        game_type: "2d_platformer" as const,
        core_systems: ["player/platformer_controller"],
        gameplay_systems: [],
        required_modules: ["player/platformer_controller"],
        environment: "graybox_rooftops",
        level_structure: ["intro", "end"],
        constraints: {
          target_runtime: "web_2d" as const,
        },
      },
      resolveRequiredModules({
        required_modules: ["player/platformer_controller"],
        runtime_target: "web_2d",
        registry,
      }),
    )

    const withCoin = applyPatchOperation(
      spec,
      {
        op: "add_module",
        entity_id: "player_1",
        module: "camera/side_scroll",
        changes: {},
      },
      { registry },
    )

    expect(withCoin.entities[0]?.modules).toEqual([
      "physics/gravity",
      "player/platformer_controller",
      "camera/side_scroll",
    ])

    const updated = applyPatchOperation(
      withCoin,
      {
        op: "update_module_config",
        entity_id: "player_1",
        module: "camera/side_scroll",
        changes: {
          follow_lag: 0.2,
        },
      },
      { registry },
    )

    expect(updated.entities[0]?.module_configs["camera/side_scroll"]).toEqual({
      follow_lag: 0.2,
    })
  })

  it("removes orphaned helper modules after remove_module", () => {
    const registry = createSeededModuleRegistry()
    const compiled = PrototypeSpecCompiler.compile(
      {
        game_type: "3d_fps" as const,
        core_systems: ["player/fps_controller", "combat/hitscan_weapon"],
        gameplay_systems: [],
        required_modules: ["player/fps_controller", "combat/hitscan_weapon"],
        environment: "warehouse_small",
        level_structure: ["intro"],
        constraints: {
          target_runtime: "web_3d" as const,
        },
      },
      resolveRequiredModules({
        required_modules: ["player/fps_controller", "combat/hitscan_weapon"],
        runtime_target: "web_3d",
        registry,
      }),
    )

    const patched = applyPatchOperation(
      compiled,
      {
        op: "remove_module",
        entity_id: "player_1",
        module: "combat/hitscan_weapon",
      },
      { registry },
    )

    expect(patched.entities[0]?.modules).toEqual([
      "physics/character_body",
      "player/fps_controller",
    ])
  })

  it("adds and removes systems while enforcing dependency checks", () => {
    const registry = createSeededModuleRegistry()
    const compiled = PrototypeSpecCompiler.compile(
      {
        game_type: "3d_fps" as const,
        core_systems: ["player/fps_controller", "combat/hitscan_weapon"],
        gameplay_systems: ["ai/basic_zombie"],
        required_modules: ["player/fps_controller", "combat/hitscan_weapon", "ai/basic_zombie"],
        environment: "warehouse_small",
        level_structure: ["intro"],
        constraints: {
          target_runtime: "web_3d" as const,
        },
      },
      resolveRequiredModules({
        required_modules: ["player/fps_controller", "combat/hitscan_weapon", "ai/basic_zombie"],
        runtime_target: "web_3d",
        registry,
      }),
    )

    const withSystem = applyPatchOperation(
      compiled,
      {
        op: "add_system",
        module: "systems/wave_manager",
        changes: {
          starting_wave_size: 7,
        },
      },
      { registry },
    )

    expect(withSystem.systems[0]).toEqual({
      id: "system_systems_wave_manager",
      module: "systems/wave_manager",
      config: {
        starting_wave_size: 7,
        wave_growth: 2,
      },
    })

    const withoutSystem = applyPatchOperation(
      withSystem,
      {
        op: "remove_system",
        module: "systems/wave_manager",
      },
      { registry },
    )

    expect(withoutSystem.systems).toEqual([])
  })

  it("updates level structure without rebuilding the spec", () => {
    const registry = createSeededModuleRegistry()
    const compiled = PrototypeSpecCompiler.compile(
      {
        game_type: "2d_platformer" as const,
        core_systems: ["player/platformer_controller"],
        gameplay_systems: [],
        required_modules: ["player/platformer_controller"],
        environment: "graybox_rooftops",
        level_structure: ["intro", "end"],
        constraints: {
          target_runtime: "web_2d" as const,
        },
      },
      resolveRequiredModules({
        required_modules: ["player/platformer_controller"],
        runtime_target: "web_2d",
        registry,
      }),
    )

    const patched = applyPatchOperations(
      compiled,
      [
        {
          op: "reorder_level_structure",
          level_structure: ["end", "intro"],
        },
      ],
      { registry },
    )

    expect(patched.scene.level_structure).toEqual(["end", "intro"])
    expect(patched.entities).toEqual(compiled.entities)
  })

  it("updates environment and scene parameters through patch operations", () => {
    const registry = createSeededModuleRegistry()
    const compiled = PrototypeSpecCompiler.compile(
      {
        game_type: "2d_platformer" as const,
        core_systems: ["player/platformer_controller"],
        gameplay_systems: [],
        required_modules: ["player/platformer_controller"],
        environment: "graybox_rooftops",
        level_structure: ["intro", "end"],
        constraints: {
          target_runtime: "web_2d" as const,
        },
      },
      resolveRequiredModules({
        required_modules: ["player/platformer_controller"],
        runtime_target: "web_2d",
        registry,
      }),
    )

    const patched = applyPatchOperations(
      compiled,
      [
        {
          op: "update_environment",
          environment: "forest_edge",
        },
        {
          op: "update_scene_parameters",
          changes: {
            gravity_scale: 1.25,
            fog_density: 0.15,
          },
        },
      ],
      { registry },
    )

    expect(patched.scene.environment).toBe("forest_edge")
    expect(patched.scene.parameters).toEqual({
      gravity_scale: 1.25,
      fog_density: 0.15,
    })
  })

  it("rejects invalid system additions when dependencies are absent", () => {
    const registry = createSeededModuleRegistry()
    const compiled = PrototypeSpecCompiler.compile(
      {
        game_type: "3d_fps" as const,
        core_systems: ["player/fps_controller"],
        gameplay_systems: [],
        required_modules: ["player/fps_controller"],
        environment: "warehouse_small",
        level_structure: ["intro"],
        constraints: {
          target_runtime: "web_3d" as const,
        },
      },
      resolveRequiredModules({
        required_modules: ["player/fps_controller"],
        runtime_target: "web_3d",
        registry,
      }),
    )

    expect(() =>
      applyPatchOperation(
        compiled,
        {
          op: "add_system",
          module: "systems/wave_manager",
          changes: {},
        },
        { registry },
      ),
    ).toThrow(/dependencies are missing/i)
  })
})
