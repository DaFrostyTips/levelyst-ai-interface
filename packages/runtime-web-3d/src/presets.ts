import type { ScenePreset3D } from "./types"

const warehouseSmallPreset: ScenePreset3D = {
  id: "warehouse_small",
  width: 56,
  depth: 40,
  ceiling_height: 7,
  floor_y: 0,
  player_spawn: { id: "player_spawn_1", x: 0, z: -14 },
  enemy_spawns: [
    { id: "enemy_spawn_1", x: -14, z: 10 },
    { id: "enemy_spawn_2", x: -6, z: 14 },
    { id: "enemy_spawn_3", x: 6, z: 14 },
    { id: "enemy_spawn_4", x: 14, z: 10 },
    { id: "enemy_spawn_5", x: -10, z: 2 },
    { id: "enemy_spawn_6", x: 10, z: 2 },
  ],
  bounds: {
    min_x: -24,
    max_x: 24,
    min_z: -18,
    max_z: 18,
  },
  cover_boxes: [
    { id: "cover_1", x: -10, y: 1.2, z: -1, width: 3.2, height: 2.4, depth: 2.2, tint: "#475569" },
    { id: "cover_2", x: 10, y: 1.2, z: -1, width: 3.2, height: 2.4, depth: 2.2, tint: "#475569" },
    { id: "cover_3", x: -4, y: 0.8, z: 8, width: 2.4, height: 1.6, depth: 2.4, tint: "#64748b" },
    { id: "cover_4", x: 4, y: 0.8, z: 8, width: 2.4, height: 1.6, depth: 2.4, tint: "#64748b" },
  ],
  walls: [
    { id: "wall_north", x: 0, y: 2.5, z: -19.5, width: 52, height: 5, depth: 1, tint: "#1e293b" },
    { id: "wall_south", x: 0, y: 2.5, z: 19.5, width: 52, height: 5, depth: 1, tint: "#1e293b" },
    { id: "wall_west", x: -25.5, y: 2.5, z: 0, width: 1, height: 5, depth: 39, tint: "#1e293b" },
    { id: "wall_east", x: 25.5, y: 2.5, z: 0, width: 1, height: 5, depth: 39, tint: "#1e293b" },
  ],
  lighting: {
    clear_color: "#0b1220",
    fog_color: "#10192d",
  },
}

const presets: Record<string, ScenePreset3D> = {
  warehouse_small: warehouseSmallPreset,
}

export function getScenePreset3D(environment: string): ScenePreset3D {
  return presets[environment] ?? warehouseSmallPreset
}
