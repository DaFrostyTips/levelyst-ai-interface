import { describe, expect, it } from "vitest"
import { resolveRequiredModules } from "../src"
import { createSeededModuleRegistry } from "@levelyst/module-registry"
import type { ModuleDefinition } from "@levelyst/contracts"

describe("@levelyst/dependency-resolver", () => {
  it("recursively resolves 2D module dependencies with deterministic order and graph edges", () => {
    const registry = createSeededModuleRegistry()
    const result = resolveRequiredModules({
      required_modules: ["camera/side_scroll", "systems/checkpoint"],
      runtime_target: "web_2d",
      registry,
    })

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

  it("recursively resolves 3D module dependencies", () => {
    const registry = createSeededModuleRegistry()
    const result = resolveRequiredModules({
      required_modules: ["combat/hitscan_weapon", "systems/wave_manager"],
      runtime_target: "web_3d",
      registry,
    })

    expect(result.valid).toBe(true)
    expect(result.resolved).toEqual([
      "physics/character_body",
      "player/fps_controller",
      "combat/hitscan_weapon",
      "ai/basic_zombie",
      "systems/wave_manager",
    ])
  })

  it("reports missing module errors", () => {
    const registry = createSeededModuleRegistry()
    const result = resolveRequiredModules({
      required_modules: ["combat/test_weapon"],
      runtime_target: "web_3d",
      registry,
    })

    expect(result.valid).toBe(false)
    expect(result.errors).toContainEqual({
      type: "missing_module",
      module_id: "combat/test_weapon",
      required_by: null,
    })
  })

  it("reports dependency cycles", () => {
    const registry = {
      getModule(id: string) {
        const modules = new Map<string, ModuleDefinition>([
          [
            "systems/a",
            {
              id: "systems/a",
              category: "systems" as const,
              engine_target: "web_2d" as const,
              inputs: [],
              outputs: [],
              dependencies: ["systems/b"],
              compatible_with: [],
              config_schema: {},
              version: "1.0.0",
            },
          ],
          [
            "systems/b",
            {
              id: "systems/b",
              category: "systems" as const,
              engine_target: "web_2d" as const,
              inputs: [],
              outputs: [],
              dependencies: ["systems/a"],
              compatible_with: [],
              config_schema: {},
              version: "1.0.0",
            },
          ],
        ])
        return modules.get(id) ?? null
      },
    }

    const result = resolveRequiredModules({
      required_modules: ["systems/a"],
      runtime_target: "web_2d",
      registry,
    })

    expect(result.valid).toBe(false)
    expect(result.errors.some((error) => error.type === "dependency_cycle")).toBe(true)
  })

  it("reports runtime target conflicts for mixed module selections", () => {
    const registry = createSeededModuleRegistry()
    const result = resolveRequiredModules({
      required_modules: ["player/platformer_controller", "player/fps_controller"],
      runtime_target: "web_2d",
      registry,
    })

    expect(result.valid).toBe(false)
    expect(result.errors).toContainEqual({
      type: "runtime_target_conflict",
      module_id: "player/fps_controller",
      module_engine_target: "web_3d",
      required_runtime_target: "web_2d",
      required_by: null,
    })
  })
})
