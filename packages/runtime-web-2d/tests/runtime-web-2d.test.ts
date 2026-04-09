import { describe, expect, it } from "vitest"
import { createSeededModuleRegistry } from "@levelyst/module-registry"
import { resolveRequiredModules } from "@levelyst/dependency-resolver"
import { PrototypeSpecCompiler } from "@levelyst/spec-compiler"
import type { GamepadNavigatorLike } from "@levelyst/runtime-input"
import { createRuntimeWeb2D, getScenePreset } from "../src"

function compilePlatformerSpec() {
  const registry = createSeededModuleRegistry()
  const blueprint = {
    game_type: "2d_platformer" as const,
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
      target_runtime: "web_2d" as const,
    },
  }

  const resolved = resolveRequiredModules({
    required_modules: blueprint.required_modules,
    runtime_target: blueprint.constraints.target_runtime,
    registry,
  })

  return PrototypeSpecCompiler.compile(blueprint, resolved)
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

describe("@levelyst/runtime-web-2d", () => {
  it("loads the graybox rooftops preset deterministically", () => {
    const preset = getScenePreset("graybox_rooftops")

    expect(preset.width).toBe(2800)
    expect(preset.player_spawn).toEqual({ id: "player_spawn_1", x: 132, y: 792 })
    expect(preset.coin_markers).toHaveLength(7)
    expect(preset.checkpoint_markers).toHaveLength(2)
  })

  it("instantiates actors and systems from a compiled platformer spec", () => {
    const runtime = createRuntimeWeb2D({
      spec: compilePlatformerSpec(),
    })

    const snapshot = runtime.getSnapshot()

    expect(snapshot.player?.id).toBe("player_1")
    expect(snapshot.enemies.map((enemy) => enemy.id)).toEqual(["enemy_1"])
    expect(snapshot.coins).toHaveLength(7)
    expect(snapshot.checkpoints).toHaveLength(2)
  })

  it("supports scene-level enemy count overrides for follow-up tuning patches", () => {
    const spec = compilePlatformerSpec()
    spec.scene.parameters = {
      ...spec.scene.parameters,
      enemy_count: 3,
      visual_theme: "neon",
      background_variant: "neon_grid",
    }

    const runtime = createRuntimeWeb2D({ spec })
    const snapshot = runtime.getSnapshot()

    expect(snapshot.enemies).toHaveLength(3)
    expect(snapshot.player?.id).toBe("player_1")
  })

  it("applies gravity and collision so the player lands and stays grounded", () => {
    const runtime = createRuntimeWeb2D({
      spec: compilePlatformerSpec(),
    })

    for (let index = 0; index < 160; index += 1) {
      runtime.step()
    }

    const snapshot = runtime.getSnapshot()
    expect(snapshot.player?.grounded).toBe(true)
    expect(snapshot.player?.y).toBeGreaterThan(700)
    expect(snapshot.player?.y).toBeLessThan(900)
  })

  it("moves the player right and performs a deterministic jump arc", () => {
    const runtime = createRuntimeWeb2D({
      spec: compilePlatformerSpec(),
    })

    for (let index = 0; index < 120; index += 1) {
      runtime.step()
    }
    const beforeMove = runtime.getSnapshot().player
    runtime.step(undefined, { right: true })
    for (let index = 0; index < 24; index += 1) {
      runtime.step(undefined, { right: true })
    }
    const moved = runtime.getSnapshot().player

    runtime.step(undefined, { right: true, jump: true })
    runtime.step(undefined, { right: true, jump: false })
    for (let index = 0; index < 18; index += 1) {
      runtime.step(undefined, { right: true })
    }
    const jumped = runtime.getSnapshot().player

    expect(moved?.x).toBeGreaterThan(beforeMove?.x ?? 0)
    expect(jumped?.y).toBeLessThan(moved?.y ?? 0)
  })

  it("supports controller movement and jump via the Gamepad API", () => {
    const controller = createMutableGamepadNavigator({
      axes: [0.92, 0, 0, 0],
    })

    const runtime = createRuntimeWeb2D({
      spec: compilePlatformerSpec(),
      navigatorLike: controller.navigatorLike,
    })

    for (let index = 0; index < 120; index += 1) {
      runtime.step()
    }
    const beforeMove = runtime.getSnapshot().player

    runtime.step()
    for (let index = 0; index < 18; index += 1) {
      runtime.step()
    }
    const moved = runtime.getSnapshot().player

    const jumpController = createMutableGamepadNavigator({
      axes: [0.82, 0, 0, 0],
    })
    const jumpRuntime = createRuntimeWeb2D({ spec: compilePlatformerSpec(), navigatorLike: jumpController.navigatorLike })
    for (let index = 0; index < 120; index += 1) {
      jumpRuntime.step()
    }
    const grounded = jumpRuntime.getSnapshot().player
    jumpController.setButton(0, true)
    jumpRuntime.step()
    jumpController.setButton(0, false)
    for (let index = 0; index < 10; index += 1) {
      jumpRuntime.step()
    }
    const jumped = jumpRuntime.getSnapshot().player

    expect(runtime.getSnapshot().gamepad_connected).toBe(true)
    expect(moved?.x).toBeGreaterThan(beforeMove?.x ?? 0)
    expect(jumped?.y).toBeLessThan(grounded?.y ?? 0)
  })

  it("collects coins and increments score", () => {
    const spec = compilePlatformerSpec()
    spec.entities = spec.entities.map((entity) =>
      entity.id === "player_1"
        ? {
            ...entity,
            position: {
              x: 214,
              y: 778,
            },
          }
        : entity,
    )

    const runtime = createRuntimeWeb2D({ spec })
    runtime.step()

    const snapshot = runtime.getSnapshot()
    expect(snapshot.score).toBe(1)
    expect(snapshot.coins.find((coin) => coin.id === "coin_1")?.collected).toBe(true)
  })

  it("activates checkpoints when the player reaches them", () => {
    const spec = compilePlatformerSpec()
    spec.entities = spec.entities.map((entity) => {
      if (entity.id === "player_1") {
        return {
          ...entity,
          position: {
            x: 1098,
            y: 540,
          },
        }
      }

      return entity
    })

    const runtime = createRuntimeWeb2D({ spec })
    runtime.step()

    const snapshot = runtime.getSnapshot()
    expect(snapshot.activeCheckpointId).toBe("checkpoint_1")
  })

  it("uses enemy contact as knockback instead of an immediate respawn", () => {
    const spec = compilePlatformerSpec()
    spec.entities = spec.entities.map((entity) => {
      if (entity.id === "player_1" || entity.id === "enemy_1") {
        return {
          ...entity,
          position: {
            x: 1098,
            y: 540,
          },
        }
      }

      return entity
    })

    const runtime = createRuntimeWeb2D({ spec })
    runtime.step()
    const snapshot = runtime.getSnapshot()
    expect(snapshot.activeCheckpointId).toBe("checkpoint_1")
    expect(snapshot.player?.active).toBe(true)
    expect(snapshot.player?.x).not.toBeCloseTo(1099, 0)
    expect(snapshot.player?.y).toBeLessThan(608)
  })

  it("respawns the player after falling out of the level", () => {
    const spec = compilePlatformerSpec()
    spec.entities = spec.entities.map((entity) =>
      entity.id === "player_1"
        ? {
            ...entity,
            position: {
              x: 132,
              y: 1300,
            },
          }
        : entity,
    )

    const events: string[] = []
    const runtime = createRuntimeWeb2D({
      spec,
      onEvent(event) {
        events.push(event.type)
      },
    })
    runtime.step()
    for (let index = 0; index < 60; index += 1) {
      runtime.step()
    }

    expect(events).toContain("player_respawned")
  })

  it("starts, stops, and destroys without double-scheduling errors", () => {
    const runtime = createRuntimeWeb2D({
      spec: compilePlatformerSpec(),
    })

    runtime.start()
    expect(runtime.getSnapshot().running).toBe(true)
    runtime.start()
    runtime.stop()
    expect(runtime.getSnapshot().running).toBe(false)
    runtime.destroy()
  })
})
