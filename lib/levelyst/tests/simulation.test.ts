import { describe, expect, it } from "vitest"
import type { ProjectRecord, ProjectWorkspace } from "@/lib/editor-v2-model"
import { prepareSimulationProject, serializeWorkspaceToBlueprintPlan } from "@/lib/levelyst/simulation"

function createWorkspace(overrides: Partial<ProjectWorkspace> = {}): ProjectWorkspace {
  return {
    nodes: [
      {
        id: "node-player",
        typeId: "player/platformer_controller",
        name: "Platformer Controller",
        category: "CORE",
        description: "",
        inputs: [],
        outputs: [],
        dependencies: ["physics/gravity"],
        inputPorts: [],
        outputPorts: [],
        x: 120,
        y: 120,
        aiCompatible: true,
        active: true,
      },
      {
        id: "node-camera",
        typeId: "camera/side_scroll",
        name: "Side-Scroll Camera",
        category: "CORE",
        description: "",
        inputs: [],
        outputs: [],
        dependencies: ["player/platformer_controller"],
        inputPorts: [],
        outputPorts: [],
        x: 300,
        y: 120,
        aiCompatible: true,
        active: true,
      },
      {
        id: "node-enemy",
        typeId: "enemy/basic_enemy",
        name: "Basic Enemy",
        category: "AI",
        description: "",
        inputs: [],
        outputs: [],
        dependencies: ["physics/gravity"],
        inputPorts: [],
        outputPorts: [],
        x: 480,
        y: 120,
        aiCompatible: true,
        active: true,
      },
      {
        id: "node-checkpoint",
        typeId: "systems/checkpoint",
        name: "Checkpoint System",
        category: "UI",
        description: "",
        inputs: [],
        outputs: [],
        dependencies: [],
        inputPorts: [],
        outputPorts: [],
        x: 660,
        y: 120,
        aiCompatible: true,
        active: true,
      },
      {
        id: "node-coins",
        typeId: "systems/coin_collectible",
        name: "Coin Collectible",
        category: "UI",
        description: "",
        inputs: [],
        outputs: [],
        dependencies: [],
        inputPorts: [],
        outputPorts: [],
        x: 840,
        y: 120,
        aiCompatible: true,
        active: true,
      },
    ],
    groups: [],
    timelineSections: [
      { id: "intro", title: "Intro", order: 0, expanded: true, moduleIds: [] },
      { id: "gameplay", title: "Gameplay Loop", order: 1, expanded: true, moduleIds: [] },
      { id: "end", title: "End", order: 2, expanded: true, moduleIds: [] },
    ],
    prompt: "",
    gamePlan: [],
    planningSteps: [],
    canvasViewport: {
      x: 0,
      y: 0,
      scale: 1,
      isPanning: false,
    },
    pendingBlueprint: null,
    pendingPromptMode: null,
    blueprintState: "idle",
    ...overrides,
  }
}

function createProject(workspace: ProjectWorkspace): ProjectRecord {
  return {
    id: "project_1",
    name: "Platformer Test",
    genre: "Platformer",
    lastModified: new Date(),
    previewThumbnail: "/placeholder.svg",
    blueprintPlan: {
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
    },
    prototypeSpec: null,
    workspace,
  }
}

describe("levelyst simulation helpers", () => {
  it("serializes the workspace graph into a canonical blueprint plan", () => {
    const blueprintPlan = serializeWorkspaceToBlueprintPlan(createWorkspace(), null)

    expect(blueprintPlan.game_type).toBe("2d_platformer")
    expect(blueprintPlan.required_modules).toEqual([
      "camera/side_scroll",
      "enemy/basic_enemy",
      "player/platformer_controller",
      "systems/checkpoint",
      "systems/coin_collectible",
    ])
    expect(blueprintPlan.level_structure).toEqual(["intro", "gameplay_loop", "end"])
  })

  it("prepares a playable platformer simulation from project workspace state", () => {
    const prepared = prepareSimulationProject(createProject(createWorkspace()))

    expect(prepared.blueprintPlan.constraints.target_runtime).toBe("web_2d")
    expect(prepared.prototypeSpec.runtime).toBe("web_2d")
    expect(prepared.prototypeSpec.entities.map((entity) => entity.id)).toEqual(["player_1", "enemy_1"])
  })

  it("prepares a compiled 3D FPS simulation when the workspace graph targets web_3d", () => {
    const workspace = createWorkspace({
      nodes: [
        {
          id: "node-fps",
          typeId: "player/fps_controller",
          name: "FPS Controller",
          category: "CORE",
          description: "",
          inputs: [],
          outputs: [],
          dependencies: ["physics/character_body"],
          inputPorts: [],
          outputPorts: [],
          x: 120,
          y: 120,
          aiCompatible: true,
          active: true,
        },
        {
          id: "node-weapon",
          typeId: "combat/hitscan_weapon",
          name: "Hitscan Weapon",
          category: "CORE",
          description: "",
          inputs: [],
          outputs: [],
          dependencies: ["player/fps_controller"],
          inputPorts: [],
          outputPorts: [],
          x: 320,
          y: 120,
          aiCompatible: true,
          active: true,
        },
        {
          id: "node-zombie",
          typeId: "ai/basic_zombie",
          name: "Basic Zombie",
          category: "AI",
          description: "",
          inputs: [],
          outputs: [],
          dependencies: ["physics/character_body"],
          inputPorts: [],
          outputPorts: [],
          x: 520,
          y: 120,
          aiCompatible: true,
          active: true,
        },
        {
          id: "node-wave-manager",
          typeId: "systems/wave_manager",
          name: "Wave Manager",
          category: "UI",
          description: "",
          inputs: [],
          outputs: [],
          dependencies: ["ai/basic_zombie"],
          inputPorts: [],
          outputPorts: [],
          x: 720,
          y: 120,
          aiCompatible: true,
          active: true,
        },
      ],
    })

    const prepared = prepareSimulationProject(createProject(workspace))

    expect(prepared.blueprintPlan.constraints.target_runtime).toBe("web_3d")
    expect(prepared.prototypeSpec.runtime).toBe("web_3d")
    expect(prepared.prototypeSpec.systems.map((system) => system.module)).toEqual(["systems/wave_manager"])
  })
})
