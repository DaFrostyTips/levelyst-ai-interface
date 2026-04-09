import { describe, expect, it } from "vitest"
import type { BlueprintPlan, ModuleGraph } from "@levelyst/contracts"
import { buildModuleGraph } from "@/lib/server/levelyst/graph-builder-service"

const platformerBlueprint: BlueprintPlan = {
  game_type: "2d_platformer",
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
    target_runtime: "web_2d",
  },
}

describe("graph builder service", () => {
  it("centers fresh generated graphs around the world midpoint", () => {
    const { module_graph } = buildModuleGraph(platformerBlueprint)
    const xValues = module_graph.nodes.map((node) => node.position.x)
    const yValues = module_graph.nodes.map((node) => node.position.y)
    const graphCenterX = (Math.min(...xValues) + Math.max(...xValues) + 244) / 2
    const graphCenterY = (Math.min(...yValues) + Math.max(...yValues) + 128) / 2

    expect(graphCenterX).toBeCloseTo(1300, 0)
    expect(graphCenterY).toBeCloseTo(900, 0)
  })

  it("preserves previously saved node positions when rebuilding an existing graph", () => {
    const initial = buildModuleGraph(platformerBlueprint).module_graph
    const previousGraph: ModuleGraph = {
      ...initial,
      nodes: initial.nodes.map((node) =>
        node.module_id === "player/platformer_controller"
          ? {
              ...node,
              position: {
                x: 420,
                y: 510,
              },
            }
          : node,
      ),
    }

    const rebuilt = buildModuleGraph(platformerBlueprint, previousGraph).module_graph
    const playerNode = rebuilt.nodes.find((node) => node.module_id === "player/platformer_controller")

    expect(playerNode?.position).toEqual({
      x: 420,
      y: 510,
    })
  })
})
