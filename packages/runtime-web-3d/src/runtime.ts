import {
  Color3,
  Color4,
  DirectionalLight,
  Engine,
  HemisphericLight,
  Mesh,
  MeshBuilder,
  PointLight,
  Scene,
  StandardMaterial,
  UniversalCamera,
  Vector3,
} from "@babylonjs/core"
import { prototypeSpecSchema, type JsonValue, type PrototypeEntity, type PrototypeSpec, type PrototypeSystem } from "@levelyst/contracts"
import { sampleNormalizedGamepad } from "@levelyst/runtime-input"
import { getScenePreset3D } from "./presets"
import type {
  CreateRuntimeWeb3DOptions,
  RuntimeActorSnapshot3D,
  RuntimeInputState3D,
  RuntimeSnapshot3D,
  RuntimeWeb3D,
  RuntimeWeb3DEvent,
  ScenePreset3D,
  SceneStaticBox3D,
} from "./types"

export const FIXED_TIMESTEP_MS = 1000 / 60

const MAX_FRAME_DELTA_MS = 100
const BASE_GRAVITY = 22
const DEFAULT_JUMP_SPEED = 8.8
const DEFAULT_FIRE_COOLDOWN_MS = 160
const DEFAULT_RELOAD_MS = 1400
const DEFAULT_ATTACK_DAMAGE = 10
const DEFAULT_ATTACK_RANGE = 1.45
const DEFAULT_ATTACK_COOLDOWN_MS = 800
const DEFAULT_PLAYER_HEALTH = 100
const DEFAULT_RESPAWN_DELAY_MS = 1200
const DEFAULT_NEXT_WAVE_DELAY_MS = 1500
const DEFAULT_RESERVE_MAGAZINES = 4
const DEFAULT_EYE_HEIGHT_OFFSET = 0.14
const MAX_PITCH = Math.PI / 2.3
const DEFAULT_TRACER_DURATION_MS = 110
const DEFAULT_IMPACT_DURATION_MS = 140

const SUPPORTED_ENTITY_MODULES = new Set([
  "physics/character_body",
  "player/fps_controller",
  "combat/hitscan_weapon",
  "ai/basic_zombie",
])

const SUPPORTED_SYSTEM_MODULES = new Set(["systems/wave_manager"])

interface RuntimePlayer {
  id: string
  kind: "player"
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
  radius: number
  height: number
  grounded: boolean
  active: boolean
  modules: string[]
  moduleConfigs: PrototypeEntity["module_configs"]
  moveSpeed: number
  lookSensitivity: number
  yaw: number
  pitch: number
  health: number
  maxHealth: number
  fireDamage: number
  fireCooldownMs: number
  fireCooldownRemainingMs: number
  magazineSize: number
  ammoInMagazine: number
  reserveAmmo: number
  reloadDurationMs: number
  tracerStyle: string
  tracerColor: string
  muzzleFlashColor: string
  impactFxStyle: string
  reloadRemainingMs: number
  respawnDelayMs: number
  respawnRemainingMs: number | null
  spawn: {
    x: number
    y: number
    z: number
  }
}

interface EnemyArchetype {
  id: string
  modules: string[]
  moduleConfigs: PrototypeEntity["module_configs"]
  moveSpeed: number
  health: number
  radius: number
  height: number
  spawnOverride: {
    x: number
    z: number
  } | null
}

interface RuntimeEnemy {
  id: string
  archetypeId: string | null
  kind: "enemy"
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
  radius: number
  height: number
  health: number
  maxHealth: number
  grounded: boolean
  active: boolean
  modules: string[]
  moduleConfigs: PrototypeEntity["module_configs"]
  attackCooldownRemainingMs: number
  moveSpeed: number
}

interface RuntimeShotEffect {
  id: string
  start: Vector3
  end: Vector3
  color: string
  remainingMs: number
}

interface RuntimeImpactEffect {
  id: string
  position: Vector3
  color: string
  remainingMs: number
}

interface RuntimeWaveState {
  currentWaveIndex: number
  aliveEnemies: number
  nextWaveInMs: number | null
  startingWaveSize: number
  waveGrowth: number
}

interface RuntimeWorld {
  spec: PrototypeSpec
  preset: ScenePreset3D
  player: RuntimePlayer
  enemyArchetypes: EnemyArchetype[]
  enemies: RuntimeEnemy[]
  systems: PrototypeSystem[]
  input: RuntimeInputState3D
  previousInput: RuntimeInputState3D
  tick: number
  pointerLocked: boolean
  gamepadConnected: boolean
  wave: RuntimeWaveState | null
  shotEffects: RuntimeShotEffect[]
  impactEffects: RuntimeImpactEffect[]
  muzzleFlashRemainingMs: number
  visualTheme: RuntimeVisualTheme3D
  nextEnemySequence: number
  nextSpawnCursor: number
}

interface RuntimeVisualTheme3D {
  clearColor: string
  fogColor: string
  floorColor: string
  wallColor: string
  coverColor: string
  spawnPadPlayerColor: string
  spawnPadEnemyColor: string
  enemyColor: string
}

interface RendererState {
  engine: Engine
  scene: Scene
  camera: UniversalCamera
  floor: Mesh
  wallMeshes: Mesh[]
  coverMeshes: Mesh[]
  spawnPadMeshes: Mesh[]
  enemyMeshes: Map<string, Mesh>
  tracerMeshes: Map<string, Mesh>
  impactMeshes: Map<string, Mesh>
  environmentMeshes: Mesh[]
  muzzleFlashLight: PointLight
}

export function createRuntimeWeb3D(options: CreateRuntimeWeb3DOptions): RuntimeWeb3D {
  const spec = prototypeSpecSchema.parse(options.spec)
  if (spec.runtime !== "web_3d") {
    throw new Error(`runtime-web-3d only supports web_3d specs. Received "${spec.runtime}".`)
  }

  validateSupportedModules(spec)

  const emit = (event: RuntimeWeb3DEvent) => {
    options.onEvent?.(event)
  }

  const world = createWorld(spec, emit)
  const cleanupInput = bindRuntimeInput(world, options.canvas ?? null)
  const renderer = createRenderer(world, options.canvas ?? null)

  let destroyed = false
  let running = false
  let frameRequestId: number | null = null
  let timeoutId: ReturnType<typeof setTimeout> | null = null
  let lastFrameTime: number | null = null
  let accumulatorMs = 0

  const cancelScheduledFrame = () => {
    if (frameRequestId !== null && typeof window !== "undefined" && typeof window.cancelAnimationFrame === "function") {
      window.cancelAnimationFrame(frameRequestId)
    }
    if (timeoutId !== null) {
      clearTimeout(timeoutId)
    }
    frameRequestId = null
    timeoutId = null
  }

  const scheduleNextFrame = () => {
    if (!running || destroyed) return

    if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
      frameRequestId = window.requestAnimationFrame(onAnimationFrame)
      return
    }

    timeoutId = setTimeout(() => onAnimationFrame(Date.now()), FIXED_TIMESTEP_MS)
  }

  const onAnimationFrame = (timestamp: number) => {
    if (!running || destroyed) return

    const deltaMs = lastFrameTime === null ? FIXED_TIMESTEP_MS : Math.min(timestamp - lastFrameTime, MAX_FRAME_DELTA_MS)
    lastFrameTime = timestamp
    accumulatorMs += deltaMs

    while (accumulatorMs >= FIXED_TIMESTEP_MS) {
      advanceWorld(world, FIXED_TIMESTEP_MS, emit, options.navigatorLike)
      accumulatorMs -= FIXED_TIMESTEP_MS
    }

    renderWorld(world, renderer)
    scheduleNextFrame()
  }

  const runtime: RuntimeWeb3D = {
    start() {
      if (destroyed || running) return
      running = true
      lastFrameTime = null
      accumulatorMs = 0
      emit({ type: "runtime_started" })
      if (world.wave) {
        emit({
          type: "wave_started",
          wave_index: world.wave.currentWaveIndex,
          enemy_count: world.wave.aliveEnemies,
        })
      }
      renderWorld(world, renderer)
      scheduleNextFrame()
    },
    stop() {
      if (!running) return
      running = false
      cancelScheduledFrame()
      emit({ type: "runtime_stopped" })
    },
    destroy() {
      if (destroyed) return
      runtime.stop()
      cleanupInput()
      if (renderer) {
        renderer.scene.dispose()
        renderer.engine.dispose()
      }
      destroyed = true
    },
    step(deltaMs = FIXED_TIMESTEP_MS, inputOverride) {
      if (destroyed) {
        throw new Error("Cannot step a destroyed runtime.")
      }

      if (inputOverride) {
        world.input = {
          ...world.input,
          ...inputOverride,
        }
      }

      const boundedDeltaMs = Math.max(1, Math.min(deltaMs, MAX_FRAME_DELTA_MS))
      advanceWorld(world, boundedDeltaMs, emit, options.navigatorLike)
      renderWorld(world, renderer)
      return createSnapshot(world, running)
    },
    getSnapshot() {
      return createSnapshot(world, running)
    },
  }

  return runtime
}

function validateSupportedModules(spec: PrototypeSpec) {
  for (const entity of spec.entities) {
    for (const moduleId of entity.modules) {
      if (!SUPPORTED_ENTITY_MODULES.has(moduleId)) {
        throw new Error(`runtime-web-3d does not support entity module "${moduleId}".`)
      }
    }
  }

  for (const system of spec.systems) {
    if (!SUPPORTED_SYSTEM_MODULES.has(system.module)) {
      throw new Error(`runtime-web-3d does not support system module "${system.module}".`)
    }
  }
}

function createWorld(spec: PrototypeSpec, emit: (event: RuntimeWeb3DEvent) => void): RuntimeWorld {
  const preset = getScenePreset3D(spec.scene.environment)
  const visualTheme = resolveVisualTheme3D(spec.scene.parameters, preset)
  const playerEntity = findPlayerEntity(spec)
  const player = instantiatePlayer(playerEntity, preset)
  const enemyEntities = [...spec.entities]
    .filter((entity) => entity.id !== playerEntity.id && entity.modules.includes("ai/basic_zombie"))
    .sort((left, right) => left.id.localeCompare(right.id))
  const enemyArchetypes = enemyEntities.map(instantiateEnemyArchetype)
  const systems = [...spec.systems].sort((left, right) => left.id.localeCompare(right.id))
  const waveSystem = systems.find((system) => system.module === "systems/wave_manager")

  if (waveSystem && enemyArchetypes.length === 0) {
    emit({
      type: "runtime_error",
      message: 'systems/wave_manager requires at least one "ai/basic_zombie" enemy archetype entity.',
    })
    throw new Error('systems/wave_manager requires at least one "ai/basic_zombie" enemy archetype entity.')
  }

  const world: RuntimeWorld = {
    spec,
    preset,
    player,
    enemyArchetypes,
    enemies: [],
    systems,
    input: createInputState(),
    previousInput: createInputState(),
    tick: 0,
    pointerLocked: false,
    gamepadConnected: false,
    wave: waveSystem
      ? {
          currentWaveIndex: 0,
          aliveEnemies: 0,
          nextWaveInMs: null,
          startingWaveSize: toInteger(spec.scene.parameters.starting_wave_size_override, toInteger(waveSystem.config.starting_wave_size, 5)),
          waveGrowth: toInteger(spec.scene.parameters.wave_growth_override, toInteger(waveSystem.config.wave_growth, 2)),
        }
      : null,
    shotEffects: [],
    impactEffects: [],
    muzzleFlashRemainingMs: 0,
    visualTheme,
    nextEnemySequence: 1,
    nextSpawnCursor: 0,
  }

  if (world.wave) {
    spawnWave(world, world.wave.startingWaveSize, emit, false)
  } else {
    enemyArchetypes.forEach((archetype, index) => {
      world.enemies.push(
        spawnEnemy(
          world,
          archetype,
          archetype.spawnOverride ?? preset.enemy_spawns[index % preset.enemy_spawns.length],
        ),
      )
    })
  }

  return world
}

function instantiatePlayer(entity: PrototypeEntity, preset: ScenePreset3D): RuntimePlayer {
  const bodyConfig = entity.module_configs["physics/character_body"] ?? {}
  const controllerConfig = entity.module_configs["player/fps_controller"] ?? {}
  const weaponConfig = entity.module_configs["combat/hitscan_weapon"] ?? {}
  const position = resolveEntitySpawn(entity, preset.player_spawn.x, preset.player_spawn.z)
  const radius = toNumber(bodyConfig.radius, 0.4)
  const height = toNumber(bodyConfig.height, 1.8)
  const magazineSize = toInteger(weaponConfig.magazine_size, 30)

  return {
    id: entity.id,
    kind: "player",
    x: position.x,
    y: preset.floor_y,
    z: position.z,
    vx: 0,
    vy: 0,
    vz: 0,
    radius,
    height,
    grounded: true,
    active: true,
    modules: [...entity.modules],
    moduleConfigs: entity.module_configs,
    moveSpeed: toNumber(controllerConfig.move_speed, 5.5),
    lookSensitivity: toNumber(controllerConfig.look_sensitivity, 0.8),
    yaw: 0,
    pitch: 0,
    health: DEFAULT_PLAYER_HEALTH,
    maxHealth: DEFAULT_PLAYER_HEALTH,
    fireDamage: toNumber(weaponConfig.damage, 20),
    fireCooldownMs: toInteger(weaponConfig.fire_cooldown_ms, DEFAULT_FIRE_COOLDOWN_MS),
    fireCooldownRemainingMs: 0,
    magazineSize,
    ammoInMagazine: magazineSize,
    reserveAmmo: magazineSize * DEFAULT_RESERVE_MAGAZINES,
    reloadDurationMs: toInteger(weaponConfig.reload_duration_ms, DEFAULT_RELOAD_MS),
    tracerStyle: toStringValue(weaponConfig.tracer_style, "default"),
    tracerColor: toHexString(weaponConfig.tracer_color, "#fb923c"),
    muzzleFlashColor: toHexString(weaponConfig.muzzle_flash_color, "#fde68a"),
    impactFxStyle: toStringValue(weaponConfig.impact_fx_style, "default"),
    reloadRemainingMs: 0,
    respawnDelayMs: DEFAULT_RESPAWN_DELAY_MS,
    respawnRemainingMs: null,
    spawn: {
      x: position.x,
      y: preset.floor_y,
      z: position.z,
    },
  }
}

function instantiateEnemyArchetype(entity: PrototypeEntity): EnemyArchetype {
  const zombieConfig = entity.module_configs["ai/basic_zombie"] ?? {}
  const bodyConfig = entity.module_configs["physics/character_body"] ?? {}
  const hasPositionOverride = typeof entity.position?.x === "number" || typeof entity.position?.y === "number"

  return {
    id: entity.id,
    modules: [...entity.modules],
    moduleConfigs: entity.module_configs,
    moveSpeed: toNumber(zombieConfig.move_speed, 1.5),
    health: toNumber(zombieConfig.health, 60),
    radius: toNumber(bodyConfig.radius, 0.4),
    height: toNumber(bodyConfig.height, 1.8),
    spawnOverride: hasPositionOverride
      ? {
          x: toNumber(entity.position?.x, 0),
          z: toNumber(entity.position?.y, 0),
        }
      : null,
  }
}

function resolveVisualTheme3D(
  parameters: PrototypeSpec["scene"]["parameters"],
  preset: ScenePreset3D,
): RuntimeVisualTheme3D {
  const theme = typeof parameters.visual_theme === "string" ? parameters.visual_theme : "default"
  const themes: Record<string, RuntimeVisualTheme3D> = {
    default: {
      clearColor: preset.lighting.clear_color,
      fogColor: preset.lighting.fog_color,
      floorColor: "#111c33",
      wallColor: "#24324d",
      coverColor: "#31476d",
      spawnPadPlayerColor: "#22d3ee",
      spawnPadEnemyColor: "#fb7185",
      enemyColor: "#dc2626",
    },
    neon: {
      clearColor: "#140b34",
      fogColor: "#1d4ed8",
      floorColor: "#0f172a",
      wallColor: "#312e81",
      coverColor: "#0f766e",
      spawnPadPlayerColor: "#22d3ee",
      spawnPadEnemyColor: "#f43f5e",
      enemyColor: "#fb7185",
    },
    sunset: {
      clearColor: "#7c2d12",
      fogColor: "#f97316",
      floorColor: "#1f2937",
      wallColor: "#7c2d12",
      coverColor: "#b45309",
      spawnPadPlayerColor: "#fde68a",
      spawnPadEnemyColor: "#fb7185",
      enemyColor: "#f87171",
    },
    cyberpunk: {
      clearColor: "#12061f",
      fogColor: "#7c3aed",
      floorColor: "#111827",
      wallColor: "#312e81",
      coverColor: "#1d4ed8",
      spawnPadPlayerColor: "#67e8f9",
      spawnPadEnemyColor: "#fb7185",
      enemyColor: "#f43f5e",
    },
    night: {
      clearColor: "#08111f",
      fogColor: "#1d4ed8",
      floorColor: "#0f172a",
      wallColor: "#1e293b",
      coverColor: "#334155",
      spawnPadPlayerColor: "#60a5fa",
      spawnPadEnemyColor: "#f87171",
      enemyColor: "#ef4444",
    },
  }

  const resolved = { ...(themes[theme] ?? themes.default) }
  const arenaTint = toHexString(parameters.arena_tint, "")
  if (arenaTint) {
    resolved.wallColor = arenaTint
    resolved.coverColor = darkenHex(arenaTint, 0.22)
    resolved.spawnPadEnemyColor = lightenHex(arenaTint, 0.18)
  }
  if (typeof parameters.fog_variant === "string") {
    resolved.fogColor = toVariantFogColor(parameters.fog_variant, resolved.fogColor)
  }
  return resolved
}

function bindRuntimeInput(world: RuntimeWorld, canvas: HTMLCanvasElement | null) {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return () => {}
  }

  const handleKeyDown = (event: KeyboardEvent) => {
    switch (event.code) {
      case "KeyW":
        world.input.forward = true
        break
      case "KeyS":
        world.input.backward = true
        break
      case "KeyA":
        world.input.left = true
        break
      case "KeyD":
        world.input.right = true
        break
      case "Space":
        event.preventDefault()
        world.input.jump = true
        break
      case "KeyR":
        world.input.reload = true
        break
      default:
        break
    }
  }

  const handleKeyUp = (event: KeyboardEvent) => {
    switch (event.code) {
      case "KeyW":
        world.input.forward = false
        break
      case "KeyS":
        world.input.backward = false
        break
      case "KeyA":
        world.input.left = false
        break
      case "KeyD":
        world.input.right = false
        break
      case "Space":
        world.input.jump = false
        break
      case "KeyR":
        world.input.reload = false
        break
      default:
        break
    }
  }

  const handleMouseDown = (event: MouseEvent) => {
    if (event.button !== 0) return
    world.input.fire = true
    if (canvas && document.pointerLockElement !== canvas && typeof canvas.requestPointerLock === "function") {
      void canvas.requestPointerLock()
    }
  }

  const handleMouseUp = (event: MouseEvent) => {
    if (event.button !== 0) return
    world.input.fire = false
  }

  const handleMouseMove = (event: MouseEvent) => {
    if (canvas && document.pointerLockElement === canvas) {
      world.input.look_delta_x += event.movementX
      world.input.look_delta_y += event.movementY
    }
  }

  const handlePointerLockChange = () => {
    world.pointerLocked = Boolean(canvas && document.pointerLockElement === canvas)
  }

  const handleBlur = () => {
    world.input.forward = false
    world.input.backward = false
    world.input.left = false
    world.input.right = false
    world.input.jump = false
    world.input.fire = false
    world.input.reload = false
    world.input.look_delta_x = 0
    world.input.look_delta_y = 0
  }

  window.addEventListener("keydown", handleKeyDown)
  window.addEventListener("keyup", handleKeyUp)
  window.addEventListener("mousedown", handleMouseDown)
  window.addEventListener("mouseup", handleMouseUp)
  window.addEventListener("mousemove", handleMouseMove)
  window.addEventListener("blur", handleBlur)
  document.addEventListener("pointerlockchange", handlePointerLockChange)

  return () => {
    window.removeEventListener("keydown", handleKeyDown)
    window.removeEventListener("keyup", handleKeyUp)
    window.removeEventListener("mousedown", handleMouseDown)
    window.removeEventListener("mouseup", handleMouseUp)
    window.removeEventListener("mousemove", handleMouseMove)
    window.removeEventListener("blur", handleBlur)
    document.removeEventListener("pointerlockchange", handlePointerLockChange)
    if (canvas && document.pointerLockElement === canvas && typeof document.exitPointerLock === "function") {
      document.exitPointerLock()
    }
  }
}

function createRenderer(world: RuntimeWorld, canvas: HTMLCanvasElement | null): RendererState | null {
  if (!canvas || typeof window === "undefined") {
    return null
  }

  const engine = new Engine(canvas, true)
  const scene = new Scene(engine)
  scene.clearColor = parseHexColor4(world.visualTheme.clearColor, 1)
  scene.fogColor = parseHexColor3(world.visualTheme.fogColor)
  scene.fogMode = Scene.FOGMODE_EXP2
  scene.fogDensity = 0.02

  const hemisphericLight = new HemisphericLight("hemispheric_light", new Vector3(0, 1, 0), scene)
  hemisphericLight.intensity = 0.92
  const directionalLight = new DirectionalLight("directional_light", new Vector3(-0.4, -1, 0.2), scene)
  directionalLight.intensity = 1.08
  const leftAccentLight = new PointLight("accent_light_left", new Vector3(-11, 6.5, -4), scene)
  leftAccentLight.diffuse = parseHexColor3("#5eead4")
  leftAccentLight.specular = parseHexColor3("#67e8f9")
  leftAccentLight.intensity = 0.9
  const rightAccentLight = new PointLight("accent_light_right", new Vector3(10, 6.2, 10), scene)
  rightAccentLight.diffuse = parseHexColor3("#f97316")
  rightAccentLight.specular = parseHexColor3("#fb923c")
  rightAccentLight.intensity = 0.66
  const muzzleFlashLight = new PointLight("weapon_flash", new Vector3(world.player.x, eyeY(world.player), world.player.z), scene)
  muzzleFlashLight.diffuse = parseHexColor3(world.player.muzzleFlashColor)
  muzzleFlashLight.specular = parseHexColor3(world.player.muzzleFlashColor)
  muzzleFlashLight.intensity = 0

  const camera = new UniversalCamera("player_camera", new Vector3(world.player.x, eyeY(world.player), world.player.z), scene)
  camera.minZ = 0.05
  camera.fov = 1
  camera.speed = 0

  const floor = MeshBuilder.CreateGround(
    "floor",
    {
      width: world.preset.width,
      height: world.preset.depth,
    },
    scene,
  )
  floor.position = new Vector3(0, world.preset.floor_y, 0)
  floor.material = createMaterial(scene, "floor_material", world.visualTheme.floorColor, { emissiveScale: 0.16 })

  const wallMeshes = world.preset.walls.map((wall) => createStaticBoxMesh(scene, wall, world.visualTheme.wallColor))
  const coverMeshes = world.preset.cover_boxes.map((cover) => createStaticBoxMesh(scene, cover, world.visualTheme.coverColor))
  const spawnPadMeshes = [
    createSpawnPadMesh(scene, "player_spawn_pad", world.preset.player_spawn.x, world.preset.floor_y + 0.03, world.preset.player_spawn.z, world.visualTheme.spawnPadPlayerColor),
    ...world.preset.enemy_spawns.map((spawn) =>
      createSpawnPadMesh(scene, `spawn_pad_${spawn.id}`, spawn.x, world.preset.floor_y + 0.03, spawn.z, world.visualTheme.spawnPadEnemyColor),
    ),
  ]

  return {
    engine,
    scene,
    camera,
    floor,
    wallMeshes,
    coverMeshes,
    spawnPadMeshes,
    enemyMeshes: new Map(),
    tracerMeshes: new Map(),
    impactMeshes: new Map(),
    environmentMeshes: [floor, ...wallMeshes, ...coverMeshes, ...spawnPadMeshes],
    muzzleFlashLight,
  }
}

function renderWorld(world: RuntimeWorld, renderer: RendererState | null) {
  if (!renderer) return

  syncEnemyMeshes(renderer, world.enemies)
  syncTracerMeshes(renderer, world.shotEffects)
  syncImpactMeshes(renderer, world.impactEffects)

  renderer.camera.position = new Vector3(world.player.x, eyeY(world.player), world.player.z)
  renderer.camera.rotation = new Vector3(world.player.pitch, world.player.yaw, 0)
  renderer.muzzleFlashLight.position = new Vector3(world.player.x, eyeY(world.player), world.player.z)
  renderer.muzzleFlashLight.diffuse = parseHexColor3(world.player.muzzleFlashColor)
  renderer.muzzleFlashLight.specular = parseHexColor3(world.player.muzzleFlashColor)
  renderer.muzzleFlashLight.intensity = world.muzzleFlashRemainingMs > 0 ? 1.35 : 0

  if (renderer.engine.getRenderWidth() !== renderer.engine.getRenderingCanvas()?.width ||
      renderer.engine.getRenderHeight() !== renderer.engine.getRenderingCanvas()?.height) {
    renderer.engine.resize()
  }

  renderer.scene.render()
}

function syncEnemyMeshes(renderer: RendererState, enemies: RuntimeEnemy[]) {
  const activeIds = new Set<string>()

  for (const enemy of enemies) {
    if (!enemy.active) continue
    activeIds.add(enemy.id)

    let mesh = renderer.enemyMeshes.get(enemy.id)
    if (!mesh) {
      mesh = MeshBuilder.CreateBox(
        `enemy_${enemy.id}`,
        {
          width: enemy.radius * 2,
          height: enemy.height,
          depth: enemy.radius * 2,
        },
        renderer.scene,
      )
      renderer.enemyMeshes.set(enemy.id, mesh)
    }

    const enemyColor = toHexString(enemy.moduleConfigs["ai/basic_zombie"]?.body_color, "#dc2626")
    if ((mesh.metadata as { color?: string } | undefined)?.color !== enemyColor) {
      mesh.material = createMaterial(renderer.scene, `enemy_material_${enemy.id}`, enemyColor, { emissiveScale: 0.18 })
      mesh.metadata = { color: enemyColor }
    }
    mesh.position = new Vector3(enemy.x, enemy.y + enemy.height / 2, enemy.z)
    mesh.rotation.y = Math.atan2(enemy.vx || 0.001, enemy.vz || 0.001)
    mesh.isVisible = true
  }

  for (const [enemyId, mesh] of renderer.enemyMeshes.entries()) {
    if (activeIds.has(enemyId)) continue
    mesh.dispose()
    renderer.enemyMeshes.delete(enemyId)
  }
}

function syncTracerMeshes(renderer: RendererState, shotEffects: RuntimeShotEffect[]) {
  const activeIds = new Set<string>()

  for (const effect of shotEffects) {
    activeIds.add(effect.id)
    let mesh = renderer.tracerMeshes.get(effect.id)
    if (!mesh) {
      mesh = MeshBuilder.CreateBox(
        `tracer_${effect.id}`,
        {
          width: 0.06,
          height: 0.06,
          depth: 1,
        },
        renderer.scene,
      )
      renderer.tracerMeshes.set(effect.id, mesh)
    }

    const mid = effect.start.add(effect.end).scale(0.5)
    const direction = effect.end.subtract(effect.start)
    const length = Math.max(0.2, direction.length())
    mesh.scaling.z = length
    mesh.position = mid
    mesh.lookAt(effect.end)
    if ((mesh.metadata as { color?: string } | undefined)?.color !== effect.color) {
      mesh.material = createMaterial(renderer.scene, `tracer_material_${effect.id}`, effect.color, {
        emissiveScale: 0.42,
        alpha: 0.94,
        specularScale: 0.02,
      })
      mesh.metadata = { color: effect.color }
    }
    mesh.isVisible = true
  }

  for (const [effectId, mesh] of renderer.tracerMeshes.entries()) {
    if (activeIds.has(effectId)) continue
    mesh.dispose()
    renderer.tracerMeshes.delete(effectId)
  }
}

function syncImpactMeshes(renderer: RendererState, impactEffects: RuntimeImpactEffect[]) {
  const activeIds = new Set<string>()

  for (const effect of impactEffects) {
    activeIds.add(effect.id)
    let mesh = renderer.impactMeshes.get(effect.id)
    if (!mesh) {
      mesh = MeshBuilder.CreateSphere(`impact_${effect.id}`, { diameter: 0.42 }, renderer.scene)
      renderer.impactMeshes.set(effect.id, mesh)
    }

    mesh.position = effect.position
    if ((mesh.metadata as { color?: string } | undefined)?.color !== effect.color) {
      mesh.material = createMaterial(renderer.scene, `impact_material_${effect.id}`, effect.color, {
        emissiveScale: 0.48,
        alpha: 0.86,
        specularScale: 0.04,
      })
      mesh.metadata = { color: effect.color }
    }
    mesh.isVisible = true
  }

  for (const [effectId, mesh] of renderer.impactMeshes.entries()) {
    if (activeIds.has(effectId)) continue
    mesh.dispose()
    renderer.impactMeshes.delete(effectId)
  }
}

function createStaticBoxMesh(scene: Scene, box: SceneStaticBox3D, fallbackTint?: string) {
  const mesh = MeshBuilder.CreateBox(
    box.id,
    {
      width: box.width,
      height: box.height,
      depth: box.depth,
    },
    scene,
  )
  mesh.position = new Vector3(box.x, box.y, box.z)
  mesh.material = createMaterial(scene, `${box.id}_material`, fallbackTint ?? box.tint, { emissiveScale: 0.11 })
  return mesh
}

function createSpawnPadMesh(scene: Scene, id: string, x: number, y: number, z: number, hex: string) {
  const mesh = MeshBuilder.CreateCylinder(
    id,
    {
      height: 0.08,
      diameter: 2.2,
      tessellation: 24,
    },
    scene,
  )
  mesh.position = new Vector3(x, y, z)
  mesh.material = createMaterial(scene, `${id}_material`, hex, {
    emissiveScale: 0.28,
    alpha: 0.9,
    specularScale: 0.04,
  })
  return mesh
}

function createMaterial(
  scene: Scene,
  id: string,
  hex: string,
  options: {
    emissiveScale?: number
    specularScale?: number
    alpha?: number
  } = {},
) {
  const material = new StandardMaterial(id, scene)
  material.diffuseColor = parseHexColor3(hex)
  material.specularColor = new Color3(
    options.specularScale ?? 0.08,
    options.specularScale ?? 0.08,
    options.specularScale ?? 0.08,
  )
  material.emissiveColor = material.diffuseColor.scale(options.emissiveScale ?? 0.08)
  material.alpha = options.alpha ?? 1
  return material
}

function advanceWorld(
  world: RuntimeWorld,
  deltaMs: number,
  emit: (event: RuntimeWeb3DEvent) => void,
  navigatorLike: CreateRuntimeWeb3DOptions["navigatorLike"],
) {
  const deltaSeconds = deltaMs / 1000
  world.tick += 1
  world.muzzleFlashRemainingMs = Math.max(0, world.muzzleFlashRemainingMs - deltaMs)
  world.shotEffects = world.shotEffects
    .map((effect) => ({ ...effect, remainingMs: Math.max(0, effect.remainingMs - deltaMs) }))
    .filter((effect) => effect.remainingMs > 0)
  world.impactEffects = world.impactEffects
    .map((effect) => ({ ...effect, remainingMs: Math.max(0, effect.remainingMs - deltaMs) }))
    .filter((effect) => effect.remainingMs > 0)
  const frameInput = resolveFrameInput(world.input, navigatorLike)
  world.gamepadConnected = frameInput.gamepadConnected

  updateLook(world.player, frameInput.state)
  updatePlayerCooldowns(world.player, deltaMs, emit)
  updatePlayerMovement(world.player, frameInput.state, world.previousInput)
  updateEnemyAI(world, deltaSeconds)

  integrateActor(world.player, deltaSeconds, world.preset)
  for (const enemy of world.enemies) {
    if (!enemy.active) continue
    integrateActor(enemy, deltaSeconds, world.preset)
  }

  handleWeaponFire(world, frameInput.state, emit)
  handleEnemyAttacks(world, deltaMs, emit)
  handleRespawn(world, deltaMs, emit)
  updateWaveState(world, deltaMs, emit)

  world.previousInput = {
    ...frameInput.state,
    look_delta_x: 0,
    look_delta_y: 0,
  }
  world.input.look_delta_x = 0
  world.input.look_delta_y = 0
}

function updateLook(player: RuntimePlayer, input: RuntimeInputState3D) {
  if (input.look_delta_x === 0 && input.look_delta_y === 0) return

  const sensitivity = player.lookSensitivity * 0.0025
  player.yaw += input.look_delta_x * sensitivity
  player.pitch = clamp(player.pitch - input.look_delta_y * sensitivity, -MAX_PITCH, MAX_PITCH)
}

function updatePlayerCooldowns(player: RuntimePlayer, deltaMs: number, emit: (event: RuntimeWeb3DEvent) => void) {
  player.fireCooldownRemainingMs = Math.max(0, player.fireCooldownRemainingMs - deltaMs)

  if (player.reloadRemainingMs > 0) {
    player.reloadRemainingMs = Math.max(0, player.reloadRemainingMs - deltaMs)
    if (player.reloadRemainingMs === 0) {
      const neededAmmo = player.magazineSize - player.ammoInMagazine
      const reloadedAmmo = Math.min(neededAmmo, player.reserveAmmo)
      player.ammoInMagazine += reloadedAmmo
      player.reserveAmmo -= reloadedAmmo
      emit({
        type: "reload_completed",
        ammo_in_magazine: player.ammoInMagazine,
        reserve_ammo: player.reserveAmmo,
      })
    }
  }
}

function updatePlayerMovement(player: RuntimePlayer, input: RuntimeInputState3D, previousInput: RuntimeInputState3D) {
  const forward = {
    x: Math.sin(player.yaw),
    z: Math.cos(player.yaw),
  }
  const right = {
    x: Math.cos(player.yaw),
    z: -Math.sin(player.yaw),
  }

  let moveX = 0
  let moveZ = 0

  if (input.forward) {
    moveX += forward.x
    moveZ += forward.z
  }
  if (input.backward) {
    moveX -= forward.x
    moveZ -= forward.z
  }
  if (input.right) {
    moveX += right.x
    moveZ += right.z
  }
  if (input.left) {
    moveX -= right.x
    moveZ -= right.z
  }

  const magnitude = Math.hypot(moveX, moveZ)
  if (magnitude > 0) {
    moveX /= magnitude
    moveZ /= magnitude
  }

  player.vx = moveX * player.moveSpeed
  player.vz = moveZ * player.moveSpeed

  if (input.jump && !previousInput.jump && player.grounded && player.active) {
    player.vy = DEFAULT_JUMP_SPEED
    player.grounded = false
  }

  if (input.reload && !previousInput.reload) {
    startReload(player)
  }
}

function updateEnemyAI(world: RuntimeWorld, deltaSeconds: number) {
  const activeEnemies = world.enemies.filter((enemy) => enemy.active)

  for (const enemy of activeEnemies) {
    if (!world.player.active) {
      enemy.vx = 0
      enemy.vz = 0
      continue
    }

    const dx = world.player.x - enemy.x
    const dz = world.player.z - enemy.z
    const distance = Math.hypot(dx, dz)
    let targetX = distance > 0.001 ? dx / distance : 0
    let targetZ = distance > 0.001 ? dz / distance : 0

    let separationX = 0
    let separationZ = 0
    for (const otherEnemy of activeEnemies) {
      if (otherEnemy.id === enemy.id) continue
      const separationDx = enemy.x - otherEnemy.x
      const separationDz = enemy.z - otherEnemy.z
      const separationDistance = Math.hypot(separationDx, separationDz)
      if (separationDistance > 0 && separationDistance < enemy.radius * 4) {
        separationX += separationDx / separationDistance
        separationZ += separationDz / separationDistance
      }
    }

    targetX += separationX * 0.45
    targetZ += separationZ * 0.45

    const targetMagnitude = Math.hypot(targetX, targetZ)
    if (targetMagnitude > 0.001) {
      targetX /= targetMagnitude
      targetZ /= targetMagnitude
    }

    enemy.vx = targetX * enemy.moveSpeed
    enemy.vz = targetZ * enemy.moveSpeed
    enemy.attackCooldownRemainingMs = Math.max(0, enemy.attackCooldownRemainingMs - deltaSeconds * 1000)
  }
}

function integrateActor(actor: RuntimePlayer | RuntimeEnemy, deltaSeconds: number, preset: ScenePreset3D) {
  actor.vy -= BASE_GRAVITY * deltaSeconds

  let nextY = actor.y + actor.vy * deltaSeconds
  if (nextY <= preset.floor_y) {
    nextY = preset.floor_y
    actor.vy = 0
    actor.grounded = true
  } else {
    actor.grounded = false
  }

  let nextX = actor.x + actor.vx * deltaSeconds
  if (intersectsStaticObstacles(nextX, actor.z, actor.radius, preset)) {
    nextX = actor.x
    actor.vx = 0
  }

  let nextZ = actor.z + actor.vz * deltaSeconds
  if (intersectsStaticObstacles(nextX, nextZ, actor.radius, preset)) {
    nextZ = actor.z
    actor.vz = 0
  }

  actor.x = clamp(nextX, preset.bounds.min_x + actor.radius, preset.bounds.max_x - actor.radius)
  actor.y = nextY
  actor.z = clamp(nextZ, preset.bounds.min_z + actor.radius, preset.bounds.max_z - actor.radius)
}

function handleWeaponFire(world: RuntimeWorld, input: RuntimeInputState3D, emit: (event: RuntimeWeb3DEvent) => void) {
  const { player, previousInput } = world
  if (!player.active || player.reloadRemainingMs > 0) return
  if (!input.fire || previousInput.fire) return

  if (player.ammoInMagazine <= 0) {
    startReload(player)
    return
  }

  if (player.fireCooldownRemainingMs > 0) return

  player.ammoInMagazine -= 1
  player.fireCooldownRemainingMs = player.fireCooldownMs
  world.muzzleFlashRemainingMs = 90

  const shotTrace = traceShot(world)
  world.shotEffects.push({
    id: `shot_${world.tick}_${world.shotEffects.length + 1}`,
    start: shotTrace.origin,
    end: shotTrace.end,
    color: player.tracerColor,
    remainingMs: DEFAULT_TRACER_DURATION_MS,
  })
  emit({
    type: "weapon_fired",
    hit: Boolean(shotTrace.enemy),
    tracer_style: player.tracerStyle,
  })

  if (shotTrace.hitPoint && player.impactFxStyle !== "none") {
    world.impactEffects.push({
      id: `impact_${world.tick}_${world.impactEffects.length + 1}`,
      position: shotTrace.hitPoint,
      color: player.muzzleFlashColor,
      remainingMs: DEFAULT_IMPACT_DURATION_MS,
    })
  }

  const hitEnemy = shotTrace.enemy
  if (!hitEnemy) return

  hitEnemy.health -= player.fireDamage
  if (hitEnemy.health > 0) return

  hitEnemy.active = false
  hitEnemy.vx = 0
  hitEnemy.vy = 0
  hitEnemy.vz = 0
  emit({
    type: "enemy_defeated",
    enemy_id: hitEnemy.id,
    wave_index: world.wave?.currentWaveIndex ?? 0,
  })
}

function handleEnemyAttacks(world: RuntimeWorld, _deltaMs: number, emit: (event: RuntimeWeb3DEvent) => void) {
  if (!world.player.active) return

  for (const enemy of world.enemies) {
    if (!enemy.active) continue
    const distance = Math.hypot(enemy.x - world.player.x, enemy.z - world.player.z)
    if (distance > DEFAULT_ATTACK_RANGE) continue
    if (enemy.attackCooldownRemainingMs > 0) continue

    enemy.attackCooldownRemainingMs = DEFAULT_ATTACK_COOLDOWN_MS
    world.player.health = Math.max(0, world.player.health - DEFAULT_ATTACK_DAMAGE)
    emit({
      type: "player_damaged",
      health: world.player.health,
    })

    if (world.player.health === 0 && world.player.respawnRemainingMs === null) {
      world.player.active = false
      world.player.respawnRemainingMs = world.player.respawnDelayMs
    }
  }
}

function handleRespawn(world: RuntimeWorld, deltaMs: number, emit: (event: RuntimeWeb3DEvent) => void) {
  if (world.player.respawnRemainingMs === null) return

  world.player.respawnRemainingMs = Math.max(0, world.player.respawnRemainingMs - deltaMs)
  if (world.player.respawnRemainingMs > 0) return

  world.player.active = true
  world.player.health = world.player.maxHealth
  world.player.x = world.player.spawn.x
  world.player.y = world.player.spawn.y
  world.player.z = world.player.spawn.z
  world.player.vx = 0
  world.player.vy = 0
  world.player.vz = 0
  world.player.grounded = true
  world.player.ammoInMagazine = world.player.magazineSize
  world.player.reserveAmmo = world.player.magazineSize * DEFAULT_RESERVE_MAGAZINES
  world.player.reloadRemainingMs = 0
  world.player.respawnRemainingMs = null
  emit({ type: "player_respawned" })
}

function updateWaveState(world: RuntimeWorld, deltaMs: number, emit: (event: RuntimeWeb3DEvent) => void) {
  if (!world.wave) return

  world.wave.aliveEnemies = world.enemies.filter((enemy) => enemy.active).length
  if (world.wave.aliveEnemies > 0) {
    world.wave.nextWaveInMs = null
    return
  }

  if (world.wave.nextWaveInMs === null) {
    world.wave.nextWaveInMs = DEFAULT_NEXT_WAVE_DELAY_MS
    return
  }

  world.wave.nextWaveInMs = Math.max(0, world.wave.nextWaveInMs - deltaMs)
  if (world.wave.nextWaveInMs > 0) return

  const nextSize = world.wave.startingWaveSize + world.wave.waveGrowth * world.wave.currentWaveIndex
  spawnWave(world, nextSize, emit)
}

function spawnWave(
  world: RuntimeWorld,
  enemyCount: number,
  emit: (event: RuntimeWeb3DEvent) => void,
  announce = true,
) {
  if (!world.wave || world.enemyArchetypes.length === 0) return

  world.wave.currentWaveIndex += 1
  world.wave.nextWaveInMs = null

  for (let index = 0; index < enemyCount; index += 1) {
    const archetype = world.enemyArchetypes[index % world.enemyArchetypes.length]
    const spawnPoint = world.preset.enemy_spawns[world.nextSpawnCursor % world.preset.enemy_spawns.length]
    world.nextSpawnCursor += 1
    world.enemies.push(spawnEnemy(world, archetype, spawnPoint))
  }

  world.wave.aliveEnemies = world.enemies.filter((enemy) => enemy.active).length
  if (announce) {
    emit({
      type: "wave_started",
      wave_index: world.wave.currentWaveIndex,
      enemy_count: world.wave.aliveEnemies,
    })
  }
}

function spawnEnemy(
  world: RuntimeWorld,
  archetype: EnemyArchetype,
  spawnPoint: {
    x: number
    z: number
  },
): RuntimeEnemy {
  const enemyId = `enemy_runtime_${world.nextEnemySequence}`
  world.nextEnemySequence += 1

  return {
    id: enemyId,
    archetypeId: archetype.id,
    kind: "enemy",
    x: spawnPoint.x,
    y: world.preset.floor_y,
    z: spawnPoint.z,
    vx: 0,
    vy: 0,
    vz: 0,
    radius: archetype.radius,
    height: archetype.height,
    health: archetype.health,
    maxHealth: archetype.health,
    grounded: true,
    active: true,
    modules: [...archetype.modules],
    moduleConfigs: archetype.moduleConfigs,
    attackCooldownRemainingMs: 0,
    moveSpeed: archetype.moveSpeed,
  }
}

function traceShot(world: RuntimeWorld) {
  const origin = {
    x: world.player.x,
    y: eyeY(world.player),
    z: world.player.z,
  }
  const direction = {
    x: Math.sin(world.player.yaw) * Math.cos(world.player.pitch),
    y: Math.sin(-world.player.pitch),
    z: Math.cos(world.player.yaw) * Math.cos(world.player.pitch),
  }

  let nearestEnemy: RuntimeEnemy | null = null
  let nearestDistance = Number.POSITIVE_INFINITY
  let hitPoint: Vector3 | null = null

  for (const enemy of world.enemies) {
    if (!enemy.active) continue
    const center = {
      x: enemy.x,
      y: enemy.y + enemy.height * 0.55,
      z: enemy.z,
    }
    const sphereRadius = Math.max(enemy.radius, enemy.height * 0.3)
    const hitDistance = intersectRaySphere(origin, direction, center, sphereRadius)
    if (hitDistance === null) continue
    if (hitDistance < nearestDistance && hitDistance <= 40) {
      nearestDistance = hitDistance
      nearestEnemy = enemy
      hitPoint = new Vector3(
        origin.x + direction.x * hitDistance,
        origin.y + direction.y * hitDistance,
        origin.z + direction.z * hitDistance,
      )
    }
  }

  const fallbackDistance = nearestEnemy ? nearestDistance : 24
  return {
    origin: new Vector3(origin.x, origin.y, origin.z),
    end: hitPoint ?? new Vector3(origin.x + direction.x * fallbackDistance, origin.y + direction.y * fallbackDistance, origin.z + direction.z * fallbackDistance),
    enemy: nearestEnemy,
    hitPoint,
  }
}

function intersectRaySphere(
  origin: { x: number; y: number; z: number },
  direction: { x: number; y: number; z: number },
  center: { x: number; y: number; z: number },
  radius: number,
) {
  const dx = origin.x - center.x
  const dy = origin.y - center.y
  const dz = origin.z - center.z

  const a = direction.x * direction.x + direction.y * direction.y + direction.z * direction.z
  const b = 2 * (dx * direction.x + dy * direction.y + dz * direction.z)
  const c = dx * dx + dy * dy + dz * dz - radius * radius
  const discriminant = b * b - 4 * a * c

  if (discriminant < 0) return null
  const sqrt = Math.sqrt(discriminant)
  const t1 = (-b - sqrt) / (2 * a)
  const t2 = (-b + sqrt) / (2 * a)

  if (t1 >= 0) return t1
  if (t2 >= 0) return t2
  return null
}

function createSnapshot(world: RuntimeWorld, running: boolean): RuntimeSnapshot3D {
  return {
    tick: world.tick,
    running,
    status: running ? "running" : world.tick === 0 ? "ready" : "stopped",
    runtime: world.spec.runtime,
    scene: {
      environment: world.spec.scene.environment,
      width: world.preset.width,
      depth: world.preset.depth,
      camera: {
        x: world.player.x,
        y: eyeY(world.player),
        z: world.player.z,
        pitch: world.player.pitch,
        yaw: world.player.yaw,
      },
    },
    player: {
      ...createActorSnapshot(world.player),
      ammo_in_magazine: world.player.ammoInMagazine,
      reserve_ammo: world.player.reserveAmmo,
      reloading: world.player.reloadRemainingMs > 0,
    },
    enemies: world.enemies.filter((enemy) => enemy.active).map(createActorSnapshot),
    wave: world.wave
      ? {
          index: world.wave.currentWaveIndex,
          alive_enemies: world.wave.aliveEnemies,
          next_wave_in_ms: world.wave.nextWaveInMs,
        }
      : null,
    pointer_locked: world.pointerLocked,
    gamepad_connected: world.gamepadConnected,
  }
}

function createActorSnapshot(actor: RuntimePlayer | RuntimeEnemy): RuntimeActorSnapshot3D {
  return {
    id: actor.id,
    archetype_id: "archetypeId" in actor ? actor.archetypeId : null,
    kind: actor.kind,
    x: actor.x,
    y: actor.y,
    z: actor.z,
    vx: actor.vx,
    vy: actor.vy,
    vz: actor.vz,
    health: actor.health,
    max_health: actor.maxHealth,
    active: actor.active,
    grounded: actor.grounded,
    modules: [...actor.modules],
  }
}

function startReload(player: RuntimePlayer) {
  if (player.reloadRemainingMs > 0) return
  if (player.ammoInMagazine >= player.magazineSize) return
  if (player.reserveAmmo <= 0) return
  player.reloadRemainingMs = player.reloadDurationMs
}

function intersectsStaticObstacles(x: number, z: number, radius: number, preset: ScenePreset3D) {
  return [...preset.cover_boxes, ...preset.walls].some((box) => circleIntersectsBox(x, z, radius, box))
}

function circleIntersectsBox(x: number, z: number, radius: number, box: SceneStaticBox3D) {
  const halfWidth = box.width / 2
  const halfDepth = box.depth / 2
  const nearestX = clamp(x, box.x - halfWidth, box.x + halfWidth)
  const nearestZ = clamp(z, box.z - halfDepth, box.z + halfDepth)
  const dx = x - nearestX
  const dz = z - nearestZ
  return dx * dx + dz * dz < radius * radius
}

function findPlayerEntity(spec: PrototypeSpec) {
  const playerEntity = [...spec.entities].find(
    (entity) => entity.kind === "player" || entity.modules.includes("player/fps_controller"),
  )

  if (!playerEntity) {
    throw new Error('runtime-web-3d requires a player entity with "player/fps_controller".')
  }

  return playerEntity
}

function resolveEntitySpawn(entity: PrototypeEntity, fallbackX: number, fallbackZ: number) {
  return {
    x: toNumber(entity.position?.x, fallbackX),
    z: toNumber(entity.position?.y, fallbackZ),
  }
}

function eyeY(player: RuntimePlayer) {
  return player.y + Math.max(0.4, player.height - DEFAULT_EYE_HEIGHT_OFFSET)
}

function parseHexColor3(hex: string) {
  const normalized = normalizeHex(hex)
  return new Color3(
    parseInt(normalized.slice(1, 3), 16) / 255,
    parseInt(normalized.slice(3, 5), 16) / 255,
    parseInt(normalized.slice(5, 7), 16) / 255,
  )
}

function parseHexColor4(hex: string, alpha: number) {
  const color = parseHexColor3(hex)
  return new Color4(color.r, color.g, color.b, alpha)
}

function normalizeHex(hex: string) {
  const trimmed = hex.trim()
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed
  return "#ffffff"
}

function toHexString(value: JsonValue | undefined, fallback: string) {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback
}

function toStringValue(value: JsonValue | undefined, fallback: string) {
  return typeof value === "string" && value.trim().length > 0 ? value : fallback
}

function lightenHex(hex: string, amount: number) {
  const normalized = normalizeHex(hex)
  const channels = [1, 3, 5].map((offset) => parseInt(normalized.slice(offset, offset + 2), 16))
  const adjusted = channels.map((channel) => Math.round(channel + (255 - channel) * amount))
  return `#${adjusted.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`
}

function darkenHex(hex: string, amount: number) {
  const normalized = normalizeHex(hex)
  const channels = [1, 3, 5].map((offset) => parseInt(normalized.slice(offset, offset + 2), 16))
  const adjusted = channels.map((channel) => Math.round(channel * (1 - amount)))
  return `#${adjusted.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`
}

function toVariantFogColor(variant: string, fallback: string) {
  switch (variant) {
    case "neon":
      return "#1d4ed8"
    case "violet":
      return "#6d28d9"
    case "amber":
      return "#f59e0b"
    case "mist":
      return "#64748b"
    case "ice":
      return "#67e8f9"
    case "ember":
      return "#f97316"
    case "night":
      return "#1e3a8a"
    case "arcade":
      return "#ec4899"
    default:
      return fallback
  }
}

function createInputState(): RuntimeInputState3D {
  return {
    forward: false,
    backward: false,
    left: false,
    right: false,
    jump: false,
    fire: false,
    reload: false,
    look_delta_x: 0,
    look_delta_y: 0,
  }
}

function resolveFrameInput(input: RuntimeInputState3D, navigatorLike: CreateRuntimeWeb3DOptions["navigatorLike"]) {
  const gamepad = sampleNormalizedGamepad({ navigatorLike })
  return {
    gamepadConnected: gamepad.connected,
    state: {
      forward: input.forward || gamepad.left_stick_y <= -0.28 || gamepad.dpad_up,
      backward: input.backward || gamepad.left_stick_y >= 0.28 || gamepad.dpad_down,
      left: input.left || gamepad.left_stick_x <= -0.28 || gamepad.dpad_left,
      right: input.right || gamepad.left_stick_x >= 0.28 || gamepad.dpad_right,
      jump: input.jump || gamepad.south,
      fire: input.fire || gamepad.right_trigger >= 0.18 || gamepad.right_bumper,
      reload: input.reload || gamepad.west,
      look_delta_x: input.look_delta_x + gamepad.right_stick_x * 12,
      look_delta_y: input.look_delta_y + gamepad.right_stick_y * 12,
    },
  }
}

function toNumber(value: JsonValue | undefined, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback
}

function toInteger(value: JsonValue | undefined, fallback: number) {
  return Math.round(toNumber(value, fallback))
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}
