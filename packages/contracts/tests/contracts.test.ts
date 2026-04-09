import { describe, expect, it } from "vitest"
import {
  blueprintPlanSchema,
  editorWorkspaceSnapshotSchema,
  generationJobEventSchema,
  generationJobSchema,
  moduleDefinitionSchema,
  moduleGraphSchema,
  patchOperationSchema,
  projectDetailSchema,
  projectSummarySchema,
  projectSchema,
  prototypeSpecSchema,
} from "../src"

describe("@levelyst/contracts", () => {
  it("accepts a valid BlueprintPlan payload", () => {
    const result = blueprintPlanSchema.parse({
      game_type: "3d_fps",
      core_systems: ["player/fps_controller", "combat/hitscan_weapon"],
      gameplay_systems: ["ai/basic_zombie", "systems/wave_manager"],
      required_modules: ["player/fps_controller", "combat/hitscan_weapon", "ai/basic_zombie", "systems/wave_manager"],
      environment: "warehouse_small",
      level_structure: ["intro", "gameplay_loop", "boss_encounter"],
      constraints: {
        target_runtime: "web_3d",
      },
    })

    expect(result.game_type).toBe("3d_fps")
  })

  it("rejects a BlueprintPlan without required_modules", () => {
    const result = blueprintPlanSchema.safeParse({
      game_type: "2d_platformer",
      core_systems: ["player/platformer_controller"],
      gameplay_systems: [],
      environment: "graybox_rooftops",
      level_structure: ["intro", "end"],
      constraints: {
        target_runtime: "web_2d",
      },
    })

    expect(result.success).toBe(false)
  })

  it("rejects an invalid ModuleDefinition payload", () => {
    const result = moduleDefinitionSchema.safeParse({
      id: "player/fps_controller",
      category: "player_mechanics",
      engine_target: "web_3d",
      inputs: ["keyboard"],
      outputs: ["velocity"],
      dependencies: ["player/fps_controller"],
      compatible_with: [],
      config_schema: {
        move_speed: {
          type: "number",
          min: 10,
          max: 5,
        },
      },
      version: "1.0",
    })

    expect(result.success).toBe(false)
  })

  it("accepts a valid PrototypeSpec payload", () => {
    const result = prototypeSpecSchema.parse({
      runtime: "web_2d",
      scene: {
        environment: "graybox_rooftops",
        level_structure: ["intro", "gameplay_loop", "end"],
        parameters: {
          gravity_scale: 1,
        },
      },
      entities: [
        {
          id: "player_1",
          kind: "player",
          position: { x: 0, y: 0 },
          modules: ["player/platformer_controller", "physics/gravity"],
          module_configs: {
            "player/platformer_controller": {
              move_speed: 6.5,
            },
          },
        },
      ],
      systems: [
        {
          id: "system_systems_checkpoint",
          module: "systems/checkpoint",
          config: {},
        },
      ],
      ui: {
        hud: ["platformer_hud"],
        panels: [],
        metadata: {},
      },
    })

    expect(result.scene.environment).toBe("graybox_rooftops")
  })

  it("accepts patch operations for structured spec changes", () => {
    const result = patchOperationSchema.parse({
      op: "update_module_config",
      entity_id: "enemy_1",
      module: "ai/basic_zombie",
      changes: {
        move_speed: 1.2,
      },
    })

    expect(result.op).toBe("update_module_config")
  })

  it("accepts a valid Project payload", () => {
    const result = projectSchema.parse({
      id: "project_1",
      name: "Warehouse Siege",
      created_at: "2026-03-11T10:00:00.000Z",
      updated_at: "2026-03-11T12:30:00.000Z",
      genre: "fps_wave_survival",
      runtime_target: "web_3d",
      blueprint_json: {
        game_type: "3d_fps",
        core_systems: ["player/fps_controller", "combat/hitscan_weapon"],
        gameplay_systems: ["ai/basic_zombie", "systems/wave_manager"],
        required_modules: ["player/fps_controller", "combat/hitscan_weapon", "ai/basic_zombie", "systems/wave_manager"],
        environment: "warehouse_small",
        level_structure: ["intro", "gameplay_loop", "boss_encounter"],
        constraints: {
          target_runtime: "web_3d",
        },
      },
      prototype_spec: {
        runtime: "web_3d",
        scene: {
          environment: "warehouse_small",
          level_structure: ["intro", "gameplay_loop", "boss_encounter"],
          parameters: {},
        },
        entities: [
          {
            id: "player_1",
            kind: "player",
            modules: ["player/fps_controller", "physics/character_body"],
            module_configs: {
              "player/fps_controller": {
                move_speed: 5.5,
              },
            },
          },
        ],
        systems: [
          {
            id: "system_systems_wave_manager",
            module: "systems/wave_manager",
            config: {},
          },
        ],
        ui: {
          hud: [],
          panels: [],
          metadata: {},
        },
      },
    })

    expect(result.name).toBe("Warehouse Siege")
  })

  it("accepts backend project summary, detail, workspace, graph, and job payloads", () => {
    const workspace = editorWorkspaceSnapshotSchema.parse({
      nodes: [
        {
          id: "node_player_platformer_controller",
          module_id: "player/platformer_controller",
          x: 120,
          y: 140,
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
          module_ids: ["node_player_platformer_controller"],
        },
      ],
      prompt: "Create a platformer",
      game_plan: ["Platformer Controller"],
      planning_steps: [
        {
          id: "plan",
          label: "Planning systems",
          status: "done",
        },
      ],
      canvas_viewport: {
        x: 0,
        y: 0,
        scale: 1,
        is_panning: false,
      },
      pending_blueprint: null,
      pending_prompt_mode: null,
      blueprint_state: "idle",
    })

    const graph = moduleGraphSchema.parse({
      nodes: [
        {
          id: "player/platformer_controller",
          module_id: "player/platformer_controller",
          category: "player_mechanics",
          position: { x: 120, y: 140 },
        },
      ],
      edges: [],
    })

    const job = generationJobSchema.parse({
      id: "job_1",
      project_id: "project_1",
      kind: "prototype_generation",
      status: "completed",
      error_message: null,
      created_at: "2026-03-12T08:00:00.000Z",
      updated_at: "2026-03-12T08:00:01.000Z",
    })

    const event = generationJobEventSchema.parse({
      job_id: "job_1",
      sequence: 0,
      event_type: "job_started",
      payload_json: {
        project_id: "project_1",
      },
      delay_ms: 0,
    })

    const summary = projectSummarySchema.parse({
      id: "project_1",
      name: "Platformer Prototype",
      genre: "platformer",
      runtime_target: "web_2d",
      preview_thumbnail: "/placeholder.svg",
      module_count: 1,
      systems_summary: ["Platformer Controller"],
      simulation_ready: true,
      created_at: "2026-03-12T08:00:00.000Z",
      updated_at: "2026-03-12T08:00:02.000Z",
    })

    const detail = projectDetailSchema.parse({
      ...summary,
      blueprint_json: null,
      prototype_spec: null,
      module_graph: graph,
      workspace_json: workspace,
      latest_job: job,
    })

    expect(detail.module_graph?.nodes[0]?.module_id).toBe("player/platformer_controller")
    expect(event.event_type).toBe("job_started")
  })
})
