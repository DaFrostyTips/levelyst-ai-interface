import { describe, expect, it } from "vitest"
import { createSeededModuleRegistry } from "@levelyst/module-registry"
import { resolveRequiredModules } from "@levelyst/dependency-resolver"
import { PrototypeSpecCompiler } from "@levelyst/spec-compiler"
import type { PrototypeSpec } from "@levelyst/contracts"
import type { GamepadNavigatorLike } from "@levelyst/runtime-input"
import { createRuntimeWeb3D, getScenePreset3D } from "../src"

function compileFpsSpec({ withWaveManager = true }: { withWaveManager?: boolean } = {}) {
  const registry = createSeededModuleRegistry()
  const requiredModules = ["player/fps_controller", "combat/hitscan_weapon", "ai/basic_zombie"]
  const gameplaySystems = ["ai/basic_zombie"]

  if (withWaveManager) {
    requiredModules.push("systems/wave_manager")
    gameplaySystems.push("systems/wave_manager")
  }

  const blueprint = {
    game_type: "3d_fps" as const,
    core_systems: ["player/fps_controller", "combat/hitscan_weapon"],
    gameplay_systems: gameplaySystems,
    required_modules: requiredModules,
    environment: "warehouse_small",
    level_structure: ["intro", "gameplay_loop", "boss_encounter"],
    constraints: {
      target_runtime: "web_3d" as const,
    },
  }

  const resolved = resolveRequiredModules({
    required_modules: blueprint.required_modules,
    runtime_target: blueprint.constraints.target_runtime,
    registry,
  })

  return PrototypeSpecCompiler.compile(blueprint, resolved)
}

function cloneSpec(spec: PrototypeSpec) {
  return JSON.parse(JSON.stringify(spec)) as PrototypeSpec
}

function createMutableGamepadNavigator(initial?: {
  axes?: number[]
  buttons?: Array<{ pressed?: boolean; value?: number }>
}) {
  const state = {
    axes: initial?.axes ?? [0, 0, 0, 0],
    buttons: Array.from({ length: 16 }, (_, index) => ({
      pressed: initial?.buttons?.[index]?.pressed ?? false,
      value: initial?.buttons?.[index]?.value ?? 0,
    })),
  }

  const navigatorLike: GamepadNavigatorLike = {
    getGamepads: () =>
      [
        {
          connected: true,
          axes: state.axes,
          buttons: state.buttons.map((button) => ({
            ...button,
            touched: false,
          })),
          id: "test-pad",
          index: 0,
          mapping: "standard",
          timestamp: Date.now(),
          hapticActuators: [],
          vibrationActuator: null,
        } as unknown as Gamepad,
      ] satisfies ArrayLike<Gamepad | null>,
  }

  return {
    navigatorLike,
    setAxes(nextAxes: number[]) {
      state.axes = nextAxes
    },
    setButton(index: number, pressed: boolean, value = pressed ? 1 : 0) {
      state.buttons[index] = { pressed, value }
    },
  }
}

function createGamepadNavigator(overrides: {
  axes?: number[]
  buttons?: Array<{ pressed?: boolean; value?: number }>
}): GamepadNavigatorLike {
  const buttons = Array.from({ length: 16 }, (_, index) => ({
    pressed: overrides.buttons?.[index]?.pressed ?? false,
    value: overrides.buttons?.[index]?.value ?? 0,
    touched: false,
  }))

  return {
    getGamepads: () =>
      [
        {
          connected: true,
          axes: overrides.axes ?? [0, 0, 0, 0],
          buttons,
          id: "test-pad",
          index: 0,
          mapping: "standard",
          timestamp: Date.now(),
          hapticActuators: [],
          vibrationActuator: null,
        } as unknown as Gamepad,
      ] satisfies ArrayLike<Gamepad | null>,
  }
}

function patchEntityModuleConfig(
  spec: PrototypeSpec,
  entityId: string,
  moduleId: string,
  changes: Record<string, string | number>,
) {
  spec.entities = spec.entities.map((entity) =>
    entity.id === entityId
      ? {
          ...entity,
          module_configs: {
            ...entity.module_configs,
            [moduleId]: {
              ...(entity.module_configs[moduleId] ?? {}),
              ...changes,
            },
          },
        }
      : entity,
  )
}

function patchSystemConfig(spec: PrototypeSpec, moduleId: string, changes: Record<string, string | number>) {
  spec.systems = spec.systems.map((system) =>
    system.module === moduleId
      ? {
          ...system,
          config: {
            ...system.config,
            ...changes,
          },
        }
      : system,
  )
}

function aimAtEnemy(runtime: ReturnType<typeof createRuntimeWeb3D>) {
  const snapshot = runtime.getSnapshot()
  const player = snapshot.player
  const enemy = snapshot.enemies[0]
  if (!player || !enemy) {
    throw new Error("Expected active player and enemy for aiming test.")
  }

  const origin = snapshot.scene.camera
  const dx = enemy.x - origin.x
  const dz = enemy.z - origin.z
  const dy = enemy.y + 1 - origin.y
  const distance = Math.max(0.001, Math.hypot(dx, dy, dz))
  const desiredYaw = Math.atan2(dx, dz)
  const desiredPitch = -Math.asin(dy / distance)
  const sensitivityFactor = 0.8 * 0.0025

  runtime.step(undefined, {
    look_delta_x: (desiredYaw - origin.yaw) / sensitivityFactor,
    look_delta_y: -(desiredPitch - origin.pitch) / sensitivityFactor,
  })
}

describe("@levelyst/runtime-web-3d", () => {
  it("loads the warehouse_small preset deterministically", () => {
    const preset = getScenePreset3D("warehouse_small")

    expect(preset.width).toBe(56)
    expect(preset.depth).toBe(40)
    expect(preset.player_spawn).toEqual({ id: "player_spawn_1", x: 0, z: -14 })
    expect(preset.enemy_spawns).toHaveLength(6)
  })

  it("instantiates the player, enemy wave archetype, and wave manager from a compiled FPS spec", () => {
    const runtime = createRuntimeWeb3D({
      spec: compileFpsSpec(),
    })

    const snapshot = runtime.getSnapshot()

    expect(snapshot.player?.id).toBe("player_1")
    expect(snapshot.wave?.index).toBe(1)
    expect(snapshot.enemies).toHaveLength(5)
  })

  it("moves the player forward and applies mouse-look deterministically", () => {
    const runtime = createRuntimeWeb3D({
      spec: compileFpsSpec({ withWaveManager: false }),
    })

    const beforeMove = runtime.getSnapshot()
    runtime.step(undefined, {
      forward: true,
      look_delta_x: 180,
      look_delta_y: -60,
    })

    const afterMove = runtime.getSnapshot()
    expect(afterMove.player?.z).toBeGreaterThan(beforeMove.player?.z ?? 0)
    expect(afterMove.scene.camera.yaw).not.toBe(beforeMove.scene.camera.yaw)
    expect(afterMove.scene.camera.pitch).not.toBe(beforeMove.scene.camera.pitch)
  })

  it("supports controller move, look, fire, reload, and jump inputs", () => {
    const spec = cloneSpec(compileFpsSpec({ withWaveManager: false }))
    patchEntityModuleConfig(spec, "player_1", "combat/hitscan_weapon", {
      damage: 999,
      magazine_size: 1,
    })
    spec.entities = spec.entities.map((entity) =>
      entity.id === "enemy_1"
        ? {
            ...entity,
            position: {
              x: 0,
              y: 6,
            },
          }
        : entity,
    )

    const moveController = createMutableGamepadNavigator({
      axes: [0.88, -0.95, 0.56, -0.34],
    })
    const moveRuntime = createRuntimeWeb3D({
      spec,
      navigatorLike: moveController.navigatorLike,
    })

    const beforeMove = moveRuntime.getSnapshot()
    moveRuntime.step()
    const afterMove = moveRuntime.getSnapshot()
    expect(afterMove.gamepad_connected).toBe(true)
    expect(afterMove.player?.z).toBeGreaterThan(beforeMove.player?.z ?? 0)
    expect(afterMove.scene.camera.yaw).not.toBe(beforeMove.scene.camera.yaw)

    const actionController = createMutableGamepadNavigator()
    const actionRuntime = createRuntimeWeb3D({ spec, navigatorLike: actionController.navigatorLike })
    aimAtEnemy(actionRuntime)
    const grounded = actionRuntime.getSnapshot().player
    actionController.setButton(0, true)
    actionController.setButton(7, true)
    actionRuntime.step()
    actionController.setButton(0, false)
    actionController.setButton(7, false)
    const acted = actionRuntime.getSnapshot()
    actionController.setButton(2, true)
    actionRuntime.step()
    actionController.setButton(2, false)
    for (let index = 0; index < 90; index += 1) {
      actionRuntime.step()
    }
    const afterReload = actionRuntime.getSnapshot()

    expect(acted.player?.health).toBe(grounded?.health)
    expect(acted.player?.ammo_in_magazine).toBe(0)
    expect(acted.enemies).toHaveLength(0)
    expect(acted.player?.y).toBeGreaterThan(grounded?.y ?? 0)
    expect(afterReload.player?.ammo_in_magazine).toBe(1)
  })

  it("fires a hitscan weapon, defeats an enemy, and reloads the magazine", () => {
    const spec = cloneSpec(compileFpsSpec({ withWaveManager: false }))
    patchEntityModuleConfig(spec, "player_1", "combat/hitscan_weapon", {
      damage: 999,
      magazine_size: 1,
    })
    spec.entities = spec.entities.map((entity) => {
      if (entity.id === "enemy_1") {
        return {
          ...entity,
          position: {
            x: 0,
            y: 6,
          },
        }
      }
      return entity
    })

    const runtime = createRuntimeWeb3D({ spec })
    aimAtEnemy(runtime)
    runtime.step(undefined, { fire: true })
    runtime.step(undefined, { fire: false })

    const afterShot = runtime.getSnapshot()
    expect(afterShot.enemies).toHaveLength(0)
    expect(afterShot.player?.ammo_in_magazine).toBe(0)

    runtime.step(undefined, { reload: true })
    runtime.step(undefined, { reload: false })
    for (let index = 0; index < 90; index += 1) {
      runtime.step()
    }

    const afterReload = runtime.getSnapshot()
    expect(afterReload.player?.ammo_in_magazine).toBe(1)
    expect(afterReload.player?.reserve_ammo).toBe(3)
  })

  it("emits visible tracer-style weapon feedback without changing hitscan combat", () => {
    const spec = cloneSpec(compileFpsSpec({ withWaveManager: false }))
    patchEntityModuleConfig(spec, "player_1", "combat/hitscan_weapon", {
      damage: 999,
      magazine_size: 1,
      tracer_style: "bright_tracer",
    })
    spec.entities = spec.entities.map((entity) =>
      entity.id === "enemy_1"
        ? {
            ...entity,
            position: {
              x: 0,
              y: 6,
            },
          }
        : entity,
    )

    const events: Array<{ type: string; hit?: boolean; tracer_style?: string }> = []
    const runtime = createRuntimeWeb3D({
      spec,
      onEvent(event) {
        events.push(event)
      },
    })

    aimAtEnemy(runtime)
    runtime.step(undefined, { fire: true })
    runtime.step(undefined, { fire: false })

    expect(runtime.getSnapshot().enemies).toHaveLength(0)
    expect(events).toContainEqual({
      type: "weapon_fired",
      hit: true,
      tracer_style: "bright_tracer",
    })
  })

  it("spawns the initial wave and advances to the next wave after the current one is cleared", () => {
    const spec = cloneSpec(compileFpsSpec())
    patchEntityModuleConfig(spec, "player_1", "combat/hitscan_weapon", {
      damage: 999,
      magazine_size: 12,
    })
    patchEntityModuleConfig(spec, "enemy_1", "ai/basic_zombie", {
      health: 1,
    })
    patchSystemConfig(spec, "systems/wave_manager", {
      starting_wave_size: 1,
      wave_growth: 1,
    })

    const runtime = createRuntimeWeb3D({ spec })
    expect(runtime.getSnapshot().wave?.index).toBe(1)
    expect(runtime.getSnapshot().enemies).toHaveLength(1)

    aimAtEnemy(runtime)
    runtime.step(undefined, { fire: true })
    runtime.step(undefined, { fire: false })
    expect(runtime.getSnapshot().enemies).toHaveLength(0)

    for (let index = 0; index < 120; index += 1) {
      runtime.step()
    }

    const snapshot = runtime.getSnapshot()
    expect(snapshot.wave?.index).toBe(2)
    expect(snapshot.enemies.length).toBe(2)
  })

  it("lets zombies pursue the player and apply melee damage on cooldown", () => {
    const spec = cloneSpec(compileFpsSpec({ withWaveManager: false }))
    spec.entities = spec.entities.map((entity) => {
      if (entity.id === "enemy_1") {
        return {
          ...entity,
          position: {
            x: 0,
            y: -12,
          },
        }
      }
      return entity
    })

    const runtime = createRuntimeWeb3D({ spec })
    for (let index = 0; index < 120; index += 1) {
      runtime.step()
    }

    const snapshot = runtime.getSnapshot()
    expect(snapshot.player?.health).toBeLessThan(100)
  })

  it("rejects wave-manager specs that do not include an enemy archetype", () => {
    expect(() =>
      createRuntimeWeb3D({
        spec: {
          runtime: "web_3d",
          scene: {
            environment: "warehouse_small",
            level_structure: ["intro", "gameplay_loop"],
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
      }),
    ).toThrow(/enemy archetype/i)
  })

  it("starts, stops, and destroys without double-render errors", () => {
    const runtime = createRuntimeWeb3D({
      spec: compileFpsSpec(),
    })

    runtime.start()
    expect(runtime.getSnapshot().running).toBe(true)
    runtime.start()
    runtime.stop()
    expect(runtime.getSnapshot().running).toBe(false)
    runtime.destroy()
  })
})
