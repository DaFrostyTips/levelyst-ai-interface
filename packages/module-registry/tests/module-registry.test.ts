import { describe, expect, it } from "vitest"
import { ModuleRegistryService, createSeededModuleRegistry, seedModuleDefinitions } from "../src"

describe("@levelyst/module-registry", () => {
  it("loads the seeded module library", () => {
    expect(seedModuleDefinitions).toHaveLength(11)
    expect(seedModuleDefinitions.some((module) => module.id === "player/platformer_controller")).toBe(true)
  })

  it("lists modules with deterministic filtering", () => {
    const registry = createSeededModuleRegistry()
    const modules = registry.listModules({ engine_target: "web_3d" })

    expect(modules.map((module) => module.id)).toEqual([
      "ai/basic_zombie",
      "combat/hitscan_weapon",
      "physics/character_body",
      "player/fps_controller",
      "systems/wave_manager",
    ])
  })

  it("rejects duplicate module registration", () => {
    const registry = new ModuleRegistryService()
    registry.registerModule(seedModuleDefinitions[0])

    expect(() => registry.registerModule(seedModuleDefinitions[0])).toThrow(/already registered/i)
  })

  it("resolves platformer dependencies in stable order", () => {
    const registry = createSeededModuleRegistry()
    const result = registry.resolveModuleDependencies(["camera/side_scroll", "systems/checkpoint"])

    expect(result.valid).toBe(true)
    expect(result.resolved).toEqual([
      "physics/gravity",
      "player/platformer_controller",
      "camera/side_scroll",
      "systems/checkpoint",
    ])
    expect(result.graph.edges).toEqual([
      { from: "camera/side_scroll", to: "player/platformer_controller", kind: "requires" },
      { from: "player/platformer_controller", to: "physics/gravity", kind: "requires" },
      { from: "systems/checkpoint", to: "player/platformer_controller", kind: "requires" },
    ])
  })

  it("resolves fps dependencies in stable order", () => {
    const registry = createSeededModuleRegistry()
    const result = registry.resolveModuleDependencies(["combat/hitscan_weapon", "systems/wave_manager"])

    expect(result.valid).toBe(true)
    expect(result.resolved).toEqual([
      "physics/character_body",
      "player/fps_controller",
      "combat/hitscan_weapon",
      "ai/basic_zombie",
      "systems/wave_manager",
    ])
  })

  it("reports missing dependencies", () => {
    const registry = new ModuleRegistryService([
      {
        id: "combat/test_weapon",
        category: "combat",
        engine_target: "web_3d",
        inputs: ["mouse"],
        outputs: ["damage_events"],
        dependencies: ["player/missing_controller"],
        compatible_with: [],
        config_schema: {},
        version: "1.0.0",
      },
    ])

    const result = registry.resolveModuleDependencies(["combat/test_weapon"])

    expect(result.valid).toBe(false)
    expect(result.errors).toContainEqual({
      type: "missing_module",
      module_id: "player/missing_controller",
      required_by: "combat/test_weapon",
    })
  })

  it("reports dependency cycles", () => {
    const registry = new ModuleRegistryService([
      {
        id: "systems/a",
        category: "systems",
        engine_target: "web_2d",
        inputs: [],
        outputs: [],
        dependencies: ["systems/b"],
        compatible_with: [],
        config_schema: {},
        version: "1.0.0",
      },
      {
        id: "systems/b",
        category: "systems",
        engine_target: "web_2d",
        inputs: [],
        outputs: [],
        dependencies: ["systems/a"],
        compatible_with: [],
        config_schema: {},
        version: "1.0.0",
      },
    ])

    const result = registry.resolveModuleDependencies(["systems/a"])

    expect(result.valid).toBe(false)
    expect(result.errors.some((error) => error.type === "dependency_cycle")).toBe(true)
  })

  it("reports engine target conflicts across mixed module requests", () => {
    const registry = createSeededModuleRegistry()
    const result = registry.resolveModuleDependencies(["player/platformer_controller", "player/fps_controller"])

    expect(result.valid).toBe(false)
    expect(result.errors.some((error) => error.type === "runtime_target_conflict")).toBe(true)
  })
})
