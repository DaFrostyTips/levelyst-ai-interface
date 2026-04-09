import type { PrototypeSpec } from "@levelyst/contracts"
import type { GamepadNavigatorLike } from "@levelyst/runtime-input"

export interface RuntimeInputState {
  left: boolean
  right: boolean
  jump: boolean
}

export interface RuntimeActorSnapshot {
  id: string
  kind: string
  x: number
  y: number
  vx: number
  vy: number
  width: number
  height: number
  grounded: boolean
  active: boolean
  modules: string[]
}

export interface RuntimeCoinSnapshot {
  id: string
  x: number
  y: number
  collected: boolean
}

export interface RuntimeCheckpointSnapshot {
  id: string
  x: number
  y: number
  active: boolean
}

export interface RuntimeSnapshot {
  tick: number
  running: boolean
  status: "ready" | "running" | "stopped"
  runtime: PrototypeSpec["runtime"]
  scene: {
    environment: string
    width: number
    height: number
    camera: {
      x: number
      y: number
      width: number
      height: number
    }
  }
  player: RuntimeActorSnapshot | null
  enemies: RuntimeActorSnapshot[]
  coins: RuntimeCoinSnapshot[]
  checkpoints: RuntimeCheckpointSnapshot[]
  score: number
  activeCheckpointId: string | null
  gamepad_connected: boolean
}

export type RuntimeWeb2DEvent =
  | { type: "runtime_started" }
  | { type: "runtime_stopped" }
  | { type: "coin_collected"; coin_id: string; score: number }
  | { type: "checkpoint_activated"; checkpoint_id: string }
  | { type: "player_respawned"; checkpoint_id: string | null }
  | { type: "runtime_error"; message: string }

export interface RuntimeWeb2D {
  start(): void
  stop(): void
  destroy(): void
  step(deltaMs?: number, inputOverride?: Partial<RuntimeInputState>): RuntimeSnapshot
  getSnapshot(): RuntimeSnapshot
}

export interface CreateRuntimeWeb2DOptions {
  spec: PrototypeSpec
  canvas?: HTMLCanvasElement | null
  navigatorLike?: GamepadNavigatorLike | null
  onEvent?: (event: RuntimeWeb2DEvent) => void
}

export interface ScenePlatform {
  id: string
  x: number
  y: number
  width: number
  height: number
}

export interface SceneMarker {
  id: string
  x: number
  y: number
}

export interface ScenePreset {
  id: string
  width: number
  height: number
  background: {
    top: string
    bottom: string
  }
  platforms: ScenePlatform[]
  player_spawn: SceneMarker
  enemy_spawns: SceneMarker[]
  coin_markers: SceneMarker[]
  checkpoint_markers: SceneMarker[]
}
