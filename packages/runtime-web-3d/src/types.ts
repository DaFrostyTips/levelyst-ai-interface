import type { PrototypeSpec } from "@levelyst/contracts"
import type { GamepadNavigatorLike } from "@levelyst/runtime-input"

export interface RuntimeInputState3D {
  forward: boolean
  backward: boolean
  left: boolean
  right: boolean
  jump: boolean
  fire: boolean
  reload: boolean
  look_delta_x: number
  look_delta_y: number
}

export interface RuntimeActorSnapshot3D {
  id: string
  archetype_id: string | null
  kind: "player" | "enemy"
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
  health: number
  max_health: number
  active: boolean
  grounded: boolean
  modules: string[]
}

export interface RuntimeWaveSnapshot3D {
  index: number
  alive_enemies: number
  next_wave_in_ms: number | null
}

export interface RuntimePickupSnapshot3D {
  id: string
  kind: "health" | "ammo"
  x: number
  y: number
  z: number
  active: boolean
}

export interface RuntimeSnapshot3D {
  tick: number
  running: boolean
  status: "ready" | "running" | "stopped"
  runtime: PrototypeSpec["runtime"]
  scene: {
    environment: string
    width: number
    depth: number
    camera: {
      x: number
      y: number
      z: number
      pitch: number
      yaw: number
    }
  }
  player: (RuntimeActorSnapshot3D & {
    ammo_in_magazine: number
    reserve_ammo: number
    reloading: boolean
  }) | null
  enemies: RuntimeActorSnapshot3D[]
  wave: RuntimeWaveSnapshot3D | null
  pickups: RuntimePickupSnapshot3D[]
  pointer_locked: boolean
  gamepad_connected: boolean
}

export type RuntimeWeb3DSnapshot = RuntimeSnapshot3D

export type RuntimeWeb3DEvent =
  | { type: "runtime_started" }
  | { type: "runtime_stopped" }
  | { type: "wave_started"; wave_index: number; enemy_count: number }
  | { type: "weapon_fired"; hit: boolean; tracer_style: string }
  | { type: "enemy_defeated"; enemy_id: string; wave_index: number }
  | { type: "player_damaged"; health: number }
  | { type: "pickup_collected"; pickup_id: string; pickup_kind: "health" | "ammo" }
  | { type: "player_respawned" }
  | { type: "reload_completed"; ammo_in_magazine: number; reserve_ammo: number }
  | { type: "runtime_error"; message: string }

export interface RuntimeWeb3D {
  start(): void
  stop(): void
  destroy(): void
  step(deltaMs?: number, inputOverride?: Partial<RuntimeInputState3D>): RuntimeSnapshot3D
  getSnapshot(): RuntimeSnapshot3D
}

export interface CreateRuntimeWeb3DOptions {
  spec: PrototypeSpec
  canvas?: HTMLCanvasElement | null
  navigatorLike?: GamepadNavigatorLike | null
  onEvent?: (event: RuntimeWeb3DEvent) => void
}

export interface SceneStaticBox3D {
  id: string
  x: number
  y: number
  z: number
  width: number
  height: number
  depth: number
  tint: string
}

export interface SceneSpawnPoint3D {
  id: string
  x: number
  z: number
}

export interface ScenePreset3D {
  id: string
  width: number
  depth: number
  ceiling_height: number
  floor_y: number
  player_spawn: SceneSpawnPoint3D
  enemy_spawns: SceneSpawnPoint3D[]
  bounds: {
    min_x: number
    max_x: number
    min_z: number
    max_z: number
  }
  cover_boxes: SceneStaticBox3D[]
  walls: SceneStaticBox3D[]
  lighting: {
    clear_color: string
    fog_color: string
  }
}
