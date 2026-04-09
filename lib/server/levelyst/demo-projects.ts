import type { ProjectDetail } from "@levelyst/contracts"

const demoProjects: ProjectDetail[] = [
  {
    id: "demo_platformer",
    name: "Rooftop Relay",
    genre: "platformer",
    runtime_target: "web_2d",
    preview_thumbnail: "/previews/projects/platformer-prototype.svg",
    module_count: 5,
    systems_summary: ["Gravity", "Platformer Controller", "Checkpoint", "Coin Collectible"],
    simulation_ready: true,
    created_at: "2026-04-02T03:05:57.904Z",
    updated_at: "2026-04-02T03:07:50.746Z",
    blueprint_json: {
      game_type: "2d_platformer",
      core_systems: ["camera/side_scroll", "player/platformer_controller"],
      gameplay_systems: ["systems/checkpoint", "systems/coin_collectible"],
      required_modules: [
        "camera/side_scroll",
        "player/platformer_controller",
        "systems/checkpoint",
        "systems/coin_collectible",
      ],
      environment: "graybox_rooftops",
      level_structure: ["intro", "platforming", "challenge", "goal"],
      constraints: {
        target_runtime: "web_2d",
      },
    },
    prototype_spec: {
      runtime: "web_2d",
      scene: {
        environment: "graybox_rooftops",
        level_structure: ["intro", "platforming", "challenge", "goal"],
        parameters: {},
      },
      entities: [
        {
          id: "player_1",
          kind: "player",
          modules: ["physics/gravity", "player/platformer_controller", "camera/side_scroll"],
          module_configs: {
            "physics/gravity": {
              gravity_scale: 1,
            },
            "player/platformer_controller": {
              move_speed: 6.5,
              jump_force: 12,
              body_color: "#facc15",
              accent_color: "#fbd952",
            },
            "camera/side_scroll": {
              follow_lag: 0.12,
            },
          },
        },
      ],
      systems: [
        {
          id: "system_systems_checkpoint",
          module: "systems/checkpoint",
          config: {
            respawn_delay_ms: 800,
          },
        },
        {
          id: "system_systems_coin_collectible",
          module: "systems/coin_collectible",
          config: {
            value: 1,
          },
        },
      ],
      ui: {
        hud: [],
        panels: [],
        metadata: {},
      },
    },
    module_graph: {
      nodes: [
        {
          id: "camera/side_scroll",
          module_id: "camera/side_scroll",
          category: "camera",
          position: {
            x: 924.1389266304348,
            y: 836.154052734375,
          },
        },
        {
          id: "physics/gravity",
          module_id: "physics/gravity",
          category: "physics",
          position: {
            x: 558.93359375,
            y: 593.4296875,
          },
        },
        {
          id: "player/platformer_controller",
          module_id: "player/platformer_controller",
          category: "player_mechanics",
          position: {
            x: 926.39453125,
            y: 499.6875,
          },
        },
        {
          id: "systems/checkpoint",
          module_id: "systems/checkpoint",
          category: "systems",
          position: {
            x: 1218,
            y: 780,
          },
        },
        {
          id: "systems/coin_collectible",
          module_id: "systems/coin_collectible",
          category: "systems",
          position: {
            x: 618,
            y: 780,
          },
        },
      ],
      edges: [
        {
          id: "edge_physics_gravity_player_platformer_controller",
          from_node_id: "physics/gravity",
          to_node_id: "player/platformer_controller",
          kind: "requires",
        },
        {
          id: "edge_player_platformer_controller_camera_side_scroll",
          from_node_id: "player/platformer_controller",
          to_node_id: "camera/side_scroll",
          kind: "requires",
        },
        {
          id: "edge_player_platformer_controller_systems_checkpoint",
          from_node_id: "player/platformer_controller",
          to_node_id: "systems/checkpoint",
          kind: "requires",
        },
      ],
    },
    workspace_json: {
      nodes: [
        {
          id: "node_camera_side_scroll",
          module_id: "camera/side_scroll",
          x: 1218,
          y: 612,
          active: true,
        },
        {
          id: "node_physics_gravity",
          module_id: "physics/gravity",
          x: 558.93359375,
          y: 593.4296875,
          active: true,
        },
        {
          id: "node_player_platformer_controller",
          module_id: "player/platformer_controller",
          x: 926.39453125,
          y: 499.6875,
          active: true,
        },
        {
          id: "node_systems_checkpoint",
          module_id: "systems/checkpoint",
          x: 1218,
          y: 780,
          active: true,
        },
        {
          id: "node_systems_coin_collectible",
          module_id: "systems/coin_collectible",
          x: 618,
          y: 780,
          active: true,
        },
        {
          id: "camera/side_scroll-1775099264477-450",
          module_id: "camera/side_scroll",
          x: 924.1389266304348,
          y: 836.154052734375,
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
          module_ids: [],
        },
        {
          id: "platforming",
          title: "Platforming",
          order: 1,
          expanded: true,
          module_ids: [],
        },
        {
          id: "challenge",
          title: "Challenge",
          order: 2,
          expanded: true,
          module_ids: [],
        },
        {
          id: "goal",
          title: "Goal",
          order: 3,
          expanded: true,
          module_ids: [],
        },
      ],
      prompt: "Make the main character yellow",
      game_plan: ["Side Scroll", "Gravity", "Platformer Controller", "Checkpoint", "Coin Collectible"],
      planning_steps: [],
      canvas_viewport: {
        x: -478.8147078804348,
        y: -801.954833984375,
        scale: 1,
        is_panning: false,
      },
      pending_blueprint: {
        game_type: "2d_platformer",
        core_systems: ["camera/side_scroll", "player/platformer_controller"],
        gameplay_systems: ["systems/checkpoint", "systems/coin_collectible"],
        required_modules: [
          "camera/side_scroll",
          "player/platformer_controller",
          "systems/checkpoint",
          "systems/coin_collectible",
        ],
        environment: "graybox_rooftops",
        level_structure: ["intro", "platforming", "challenge", "goal"],
        constraints: {
          target_runtime: "web_2d",
        },
      },
      pending_blueprint_diagnostics: null,
      pending_prompt_mode: null,
      blueprint_state: "idle",
    },
    latest_job: null,
  },
  {
    id: "demo_survival",
    name: "Orbital Breach",
    genre: "fps_wave_survival",
    runtime_target: "web_3d",
    preview_thumbnail: "/previews/projects/scifi-prototype.svg",
    module_count: 5,
    systems_summary: ["Basic Zombie", "Hitscan Weapon", "Fps Controller", "Wave Manager"],
    simulation_ready: true,
    created_at: "2026-04-02T03:08:17.748Z",
    updated_at: "2026-04-02T03:08:27.637Z",
    blueprint_json: {
      game_type: "3d_fps",
      core_systems: ["combat/hitscan_weapon", "player/fps_controller"],
      gameplay_systems: ["ai/basic_zombie", "systems/wave_manager"],
      required_modules: [
        "ai/basic_zombie",
        "combat/hitscan_weapon",
        "player/fps_controller",
        "systems/wave_manager",
      ],
      environment: "warehouse_small",
      level_structure: ["intro", "combat", "waves", "survival"],
      constraints: {
        target_runtime: "web_3d",
      },
    },
    prototype_spec: {
      runtime: "web_3d",
      scene: {
        environment: "warehouse_small",
        level_structure: ["intro", "combat", "waves", "survival"],
        parameters: {},
      },
      entities: [
        {
          id: "player_1",
          kind: "player",
          modules: ["physics/character_body", "player/fps_controller", "combat/hitscan_weapon"],
          module_configs: {
            "physics/character_body": {
              height: 1.8,
              radius: 0.4,
            },
            "player/fps_controller": {
              move_speed: 5.5,
              look_sensitivity: 0.8,
            },
            "combat/hitscan_weapon": {
              damage: 20,
              magazine_size: 30,
            },
          },
        },
        {
          id: "enemy_1",
          kind: "enemy",
          modules: ["physics/character_body", "ai/basic_zombie"],
          module_configs: {
            "physics/character_body": {
              height: 1.8,
              radius: 0.4,
            },
            "ai/basic_zombie": {
              move_speed: 1.5,
              health: 60,
            },
          },
        },
      ],
      systems: [
        {
          id: "system_systems_wave_manager",
          module: "systems/wave_manager",
          config: {
            starting_wave_size: 5,
            wave_growth: 2,
          },
        },
      ],
      ui: {
        hud: [],
        panels: [],
        metadata: {},
      },
    },
    module_graph: {
      nodes: [
        {
          id: "ai/basic_zombie",
          module_id: "ai/basic_zombie",
          category: "enemy_ai",
          position: {
            x: 918,
            y: 612,
          },
        },
        {
          id: "combat/hitscan_weapon",
          module_id: "combat/hitscan_weapon",
          category: "combat",
          position: {
            x: 1218,
            y: 612,
          },
        },
        {
          id: "physics/character_body",
          module_id: "physics/character_body",
          category: "physics",
          position: {
            x: 618,
            y: 612,
          },
        },
        {
          id: "player/fps_controller",
          module_id: "player/fps_controller",
          category: "player_mechanics",
          position: {
            x: 918,
            y: 780,
          },
        },
        {
          id: "systems/wave_manager",
          module_id: "systems/wave_manager",
          category: "systems",
          position: {
            x: 1218,
            y: 780,
          },
        },
      ],
      edges: [
        {
          id: "edge_ai_basic_zombie_systems_wave_manager",
          from_node_id: "ai/basic_zombie",
          to_node_id: "systems/wave_manager",
          kind: "requires",
        },
        {
          id: "edge_physics_character_body_ai_basic_zombie",
          from_node_id: "physics/character_body",
          to_node_id: "ai/basic_zombie",
          kind: "requires",
        },
        {
          id: "edge_physics_character_body_player_fps_controller",
          from_node_id: "physics/character_body",
          to_node_id: "player/fps_controller",
          kind: "requires",
        },
        {
          id: "edge_player_fps_controller_combat_hitscan_weapon",
          from_node_id: "player/fps_controller",
          to_node_id: "combat/hitscan_weapon",
          kind: "requires",
        },
      ],
    },
    workspace_json: {
      nodes: [
        {
          id: "node_ai_basic_zombie",
          module_id: "ai/basic_zombie",
          x: 918,
          y: 612,
          active: true,
        },
        {
          id: "node_combat_hitscan_weapon",
          module_id: "combat/hitscan_weapon",
          x: 1218,
          y: 612,
          active: true,
        },
        {
          id: "node_physics_character_body",
          module_id: "physics/character_body",
          x: 618,
          y: 612,
          active: true,
        },
        {
          id: "node_player_fps_controller",
          module_id: "player/fps_controller",
          x: 918,
          y: 780,
          active: true,
        },
        {
          id: "node_systems_wave_manager",
          module_id: "systems/wave_manager",
          x: 1218,
          y: 780,
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
          module_ids: [],
        },
        {
          id: "combat",
          title: "Combat",
          order: 1,
          expanded: true,
          module_ids: [],
        },
        {
          id: "waves",
          title: "Waves",
          order: 2,
          expanded: true,
          module_ids: [],
        },
        {
          id: "survival",
          title: "Survival",
          order: 3,
          expanded: true,
          module_ids: [],
        },
      ],
      prompt: "",
      game_plan: ["Basic Zombie", "Hitscan Weapon", "Character Body", "Fps Controller", "Wave Manager"],
      planning_steps: [],
      canvas_viewport: {
        x: -541.530910326087,
        y: -468.595458984375,
        scale: 1,
        is_panning: false,
      },
      pending_blueprint: {
        game_type: "3d_fps",
        core_systems: ["combat/hitscan_weapon", "player/fps_controller"],
        gameplay_systems: ["ai/basic_zombie", "systems/wave_manager"],
        required_modules: [
          "ai/basic_zombie",
          "combat/hitscan_weapon",
          "player/fps_controller",
          "systems/wave_manager",
        ],
        environment: "warehouse_small",
        level_structure: ["intro", "combat", "waves", "survival"],
        constraints: {
          target_runtime: "web_3d",
        },
      },
      pending_blueprint_diagnostics: null,
      pending_prompt_mode: null,
      blueprint_state: "idle",
    },
    latest_job: null,
  },
] satisfies ProjectDetail[]

export function listDemoProjects() {
  return demoProjects.map((project) => structuredClone(project))
}

export function getDemoProject(projectId: string) {
  const project = demoProjects.find((entry) => entry.id === projectId)
  return project ? structuredClone(project) : null
}
