import type { ScenePreset } from "./types"

const grayboxRooftopsPreset: ScenePreset = {
  id: "graybox_rooftops",
  width: 2800,
  height: 1100,
  background: {
    top: "#0b1327",
    bottom: "#17223f",
  },
  platforms: [
    { id: "floor", x: 0, y: 1020, width: 2800, height: 80 },
    { id: "rooftop_1", x: 100, y: 860, width: 360, height: 28 },
    { id: "rooftop_2", x: 560, y: 760, width: 300, height: 28 },
    { id: "rooftop_3", x: 940, y: 660, width: 280, height: 28 },
    { id: "rooftop_4", x: 1320, y: 820, width: 360, height: 28 },
    { id: "rooftop_5", x: 1760, y: 720, width: 300, height: 28 },
    { id: "rooftop_6", x: 2140, y: 600, width: 280, height: 28 },
    { id: "rooftop_7", x: 2460, y: 460, width: 240, height: 28 },
  ],
  player_spawn: { id: "player_spawn_1", x: 132, y: 792 },
  enemy_spawns: [
    { id: "enemy_spawn_1", x: 1420, y: 756 },
    { id: "enemy_spawn_2", x: 2210, y: 536 },
  ],
  coin_markers: [
    { id: "coin_1", x: 240, y: 814 },
    { id: "coin_2", x: 670, y: 714 },
    { id: "coin_3", x: 1050, y: 614 },
    { id: "coin_4", x: 1470, y: 774 },
    { id: "coin_5", x: 1890, y: 674 },
    { id: "coin_6", x: 2280, y: 554 },
    { id: "coin_7", x: 2580, y: 414 },
  ],
  checkpoint_markers: [
    { id: "checkpoint_1", x: 1120, y: 608 },
    { id: "checkpoint_2", x: 2320, y: 548 },
  ],
}

const presets: Record<string, ScenePreset> = {
  graybox_rooftops: grayboxRooftopsPreset,
}

export function getScenePreset(environment: string): ScenePreset {
  return presets[environment] ?? grayboxRooftopsPreset
}
