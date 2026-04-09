import { prototypeSpecSchema, type JsonValue, type PrototypeEntity, type PrototypeSpec, type PrototypeSystem } from "@levelyst/contracts"
import { sampleNormalizedGamepad } from "@levelyst/runtime-input"
import { getScenePreset } from "./presets"
import type {
  CreateRuntimeWeb2DOptions,
  RuntimeActorSnapshot,
  RuntimeCheckpointSnapshot,
  RuntimeCoinSnapshot,
  RuntimeInputState,
  RuntimeSnapshot,
  RuntimeWeb2D,
  RuntimeWeb2DEvent,
  ScenePlatform,
  ScenePreset,
} from "./types"

const FIXED_TIMESTEP_MS = 1000 / 60
const MAX_FRAME_DELTA_MS = 100
const BASE_GRAVITY = 2200
const DEFAULT_VIEWPORT_WIDTH = 1280
const DEFAULT_VIEWPORT_HEIGHT = 720
const PLAYER_SIZE = { width: 42, height: 68 }
const ENEMY_SIZE = { width: 40, height: 64 }
const COIN_RADIUS = 12
const CHECKPOINT_SIZE = { width: 22, height: 72 }
const CONTACT_GRACE_MS = 720
const CONTACT_KNOCKBACK_X = 380
const CONTACT_KNOCKBACK_Y = -320
const COLOR_HEX_MAP_2D: Record<string, string> = {
  red: "#ef4444",
  blue: "#3b82f6",
  green: "#22c55e",
  yellow: "#facc15",
  purple: "#a855f7",
  black: "#111827",
  white: "#f8fafc",
  orange: "#f97316",
}

interface RuntimeActor {
  id: string
  kind: "player" | "enemy"
  x: number
  y: number
  vx: number
  vy: number
  width: number
  height: number
  grounded: boolean
  active: boolean
  direction: -1 | 1
  modules: string[]
  moduleConfigs: PrototypeEntity["module_configs"]
  spawn: { x: number; y: number }
  patrol?: { minX: number; maxX: number }
}

interface RuntimeCoin {
  id: string
  x: number
  y: number
  radius: number
  collected: boolean
  value: number
}

interface RuntimeCheckpoint {
  id: string
  x: number
  y: number
  width: number
  height: number
  active: boolean
  respawnX: number
  respawnY: number
  respawnDelayMs: number
}

interface RuntimeWorld {
  spec: PrototypeSpec
  preset: ScenePreset
  visuals: RuntimeVisualStyle2D
  actors: RuntimeActor[]
  coins: RuntimeCoin[]
  checkpoints: RuntimeCheckpoint[]
  systems: PrototypeSystem[]
  input: RuntimeInputState
  previousInput: RuntimeInputState
  camera: {
    x: number
    y: number
    width: number
    height: number
  }
  tick: number
  score: number
  activeCheckpointId: string | null
  respawnCountdownMs: number | null
  contactGraceRemainingMs: number
  gamepadConnected: boolean
}

interface RuntimeVisualStyle2D {
  backgroundTop: string
  backgroundBottom: string
  skylineFar: string
  skylineMid: string
  cloud: string
  floorTop: string
  floorBody: string
  floorAccent: string
  platformTop: string
  platformBody: string
  platformAccent: string
  hudFill: string
  hudBorder: string
  hudText: string
  hudSubtext: string
}

const SUPPORTED_ENTITY_MODULES = new Set([
  "physics/gravity",
  "player/platformer_controller",
  "camera/side_scroll",
  "enemy/basic_enemy",
])

const SUPPORTED_SYSTEM_MODULES = new Set(["systems/checkpoint", "systems/coin_collectible"])

export function createRuntimeWeb2D(options: CreateRuntimeWeb2DOptions): RuntimeWeb2D {
  const spec = prototypeSpecSchema.parse(options.spec)
  if (spec.runtime !== "web_2d") {
    throw new Error(`runtime-web-2d only supports web_2d specs. Received "${spec.runtime}".`)
  }

  const emit = (event: RuntimeWeb2DEvent) => {
    options.onEvent?.(event)
  }

  const world = createWorld(spec)
  const inputState = world.input
  const cleanupInput = bindKeyboardInput(inputState)

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
      advanceWorld(world, FIXED_TIMESTEP_MS)
      accumulatorMs -= FIXED_TIMESTEP_MS
    }

    renderWorld(world, options.canvas ?? null)
    scheduleNextFrame()
  }

  const runtime: RuntimeWeb2D = {
    start() {
      if (destroyed || running) return
      running = true
      lastFrameTime = null
      accumulatorMs = 0
      emit({ type: "runtime_started" })
      renderWorld(world, options.canvas ?? null)
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
      advanceWorld(world, boundedDeltaMs)
      renderWorld(world, options.canvas ?? null)
      return createSnapshot(world, running)
    },
    getSnapshot() {
      return createSnapshot(world, running)
    },
  }

  return runtime

  function advanceWorld(currentWorld: RuntimeWorld, deltaMs: number) {
    const deltaSeconds = deltaMs / 1000
    currentWorld.tick += 1
    currentWorld.contactGraceRemainingMs = Math.max(0, currentWorld.contactGraceRemainingMs - deltaMs)
    const frameInput = resolveFrameInput(currentWorld.input, options.navigatorLike)
    currentWorld.gamepadConnected = frameInput.gamepadConnected

    const player = getPlayer(currentWorld)
    if (!player) {
      emit({ type: "runtime_error", message: "No player entity was instantiated for the runtime." })
      throw new Error("No player entity was instantiated for the runtime.")
    }

    sampleModuleInput(player, frameInput.state, currentWorld.previousInput)

    for (const actor of currentWorld.actors) {
      if (!actor.active) continue

      if (actor.modules.includes("player/platformer_controller")) {
        runPlatformerController(actor, frameInput.state, currentWorld.previousInput)
      }

      if (actor.modules.includes("enemy/basic_enemy")) {
        runEnemyController(actor)
      }
    }

    for (const actor of currentWorld.actors) {
      if (!actor.active) continue

      if (actor.modules.includes("physics/gravity")) {
        applyGravity(actor, deltaSeconds)
      }

      integrateActor(actor, currentWorld.preset.platforms, currentWorld.preset.width, currentWorld.preset.height, deltaSeconds)
    }

    processCheckpointCollection(currentWorld, player, emit)
    processCoinCollection(currentWorld, player, emit)
    processEnemyContacts(currentWorld, player)
    processRespawn(currentWorld, deltaMs, emit)
    updateCamera(currentWorld)
    currentWorld.previousInput = { ...frameInput.state }
  }
}

function createWorld(spec: PrototypeSpec): RuntimeWorld {
  const preset = getScenePreset(spec.scene.environment)
  const visuals = resolveVisualStyle2D(spec.scene.parameters)
  const actors = instantiateActors(spec, preset)
  const systems = [...spec.systems].sort((left, right) => left.id.localeCompare(right.id))

  const checkpoints = systems.some((system) => system.module === "systems/checkpoint")
    ? resolveCheckpointMarkers(preset.checkpoint_markers, spec.scene.parameters.checkpoint_density).map((marker) => {
        const checkpointSystem = systems.find((system) => system.module === "systems/checkpoint")
        const delayMs = toNumber(checkpointSystem?.config.respawn_delay_ms, 800)
        return {
          id: marker.id,
          x: marker.x,
          y: marker.y,
          width: CHECKPOINT_SIZE.width,
          height: CHECKPOINT_SIZE.height,
          active: false,
          respawnX: marker.x - PLAYER_SIZE.width / 2,
          respawnY: marker.y - PLAYER_SIZE.height,
          respawnDelayMs: Math.max(0, delayMs),
        }
      })
    : []

  const coins = systems.some((system) => system.module === "systems/coin_collectible")
    ? resolveCoinMarkers(preset.coin_markers, spec.scene.parameters.coin_density).map((marker) => {
        const coinSystem = systems.find((system) => system.module === "systems/coin_collectible")
        const value = Math.max(1, Math.round(toNumber(coinSystem?.config.value, 1)))
        return {
          id: marker.id,
          x: marker.x,
          y: marker.y,
          radius: COIN_RADIUS,
          collected: false,
          value,
        }
      })
    : []

  const camera = {
    x: 0,
    y: 0,
    width: DEFAULT_VIEWPORT_WIDTH,
    height: DEFAULT_VIEWPORT_HEIGHT,
  }

  const world: RuntimeWorld = {
    spec,
    preset,
    visuals,
    actors,
    coins,
    checkpoints,
    systems,
    input: { left: false, right: false, jump: false },
    previousInput: { left: false, right: false, jump: false },
    camera,
    tick: 0,
    score: 0,
    activeCheckpointId: null,
    respawnCountdownMs: null,
    contactGraceRemainingMs: 0,
    gamepadConnected: false,
  }

  updateCamera(world)
  return world
}

function instantiateActors(spec: PrototypeSpec, preset: ScenePreset): RuntimeActor[] {
  const entities = [...spec.entities].sort((left, right) => left.id.localeCompare(right.id))
  const playerSpawn = preset.player_spawn
  const playerEntity = entities.find((entity) => entity.kind === "player")
  if (!playerEntity) {
    throw new Error("runtime-web-2d requires a player entity.")
  }
  validateEntityModules(playerEntity)

  const actors: RuntimeActor[] = [
    createActorFromEntity(playerEntity, "player", playerEntity.position ?? playerSpawn),
  ]

  const enemyEntities = entities.filter((entity) => entity.kind === "enemy")
  enemyEntities.forEach(validateEntityModules)

  if (enemyEntities.length === 0) {
    return actors
  }

  const requestedEnemyCount = clampInteger(
    toInteger(spec.scene.parameters.enemy_count, enemyEntities.length),
    0,
    12,
  )

  for (let index = 0; index < requestedEnemyCount; index += 1) {
    const archetype = enemyEntities[index % enemyEntities.length]
    const spawnMarker =
      archetype.position ??
      preset.enemy_spawns[index % Math.max(preset.enemy_spawns.length, 1)] ??
      playerSpawn
    const actor = createActorFromEntity(
      {
        ...archetype,
        id: requestedEnemyCount > enemyEntities.length ? `${archetype.id}_clone_${index + 1}` : archetype.id,
      },
      "enemy",
      spawnMarker,
    )
    actor.patrol = resolvePatrolRange(actor, preset.platforms)
    actors.push(actor)
  }

  return actors
}

function createActorFromEntity(
  entity: PrototypeEntity,
  kind: "player" | "enemy",
  spawnMarker: { x: number; y: number },
): RuntimeActor {
  if (entity.kind !== kind) {
    throw new Error(`runtime-web-2d only supports ${kind} entities in this path.`)
  }

  const size = kind === "player" ? PLAYER_SIZE : ENEMY_SIZE
  return {
    id: entity.id,
    kind,
    x: spawnMarker.x,
    y: spawnMarker.y,
    vx: 0,
    vy: 0,
    width: size.width,
    height: size.height,
    grounded: false,
    active: true,
    direction: kind === "enemy" ? -1 : 1,
    modules: [...entity.modules],
    moduleConfigs: entity.module_configs,
    spawn: {
      x: spawnMarker.x,
      y: spawnMarker.y,
    },
  } satisfies RuntimeActor
}

function validateEntityModules(entity: PrototypeEntity) {
  for (const moduleId of entity.modules) {
    if (!SUPPORTED_ENTITY_MODULES.has(moduleId)) {
      throw new Error(`Unsupported 2D entity module "${moduleId}" in entity "${entity.id}".`)
    }
  }
}

function runPlatformerController(actor: RuntimeActor, input: RuntimeInputState, previousInput: RuntimeInputState) {
  const moveSpeed = toNumber(actor.moduleConfigs["player/platformer_controller"]?.move_speed, 6.5)
  const jumpForce = toNumber(actor.moduleConfigs["player/platformer_controller"]?.jump_force, 12)

  if (input.left === input.right) {
    actor.vx = 0
  } else {
    actor.vx = (input.left ? -1 : 1) * moveSpeed * 120
  }

  if (input.jump && !previousInput.jump && actor.grounded) {
    actor.vy = -jumpForce * 72
    actor.grounded = false
  }
}

function runEnemyController(actor: RuntimeActor) {
  const moveSpeed = toNumber(actor.moduleConfigs["enemy/basic_enemy"]?.move_speed, 2.5)
  if (!actor.patrol) {
    actor.vx = actor.direction * moveSpeed * 90
    return
  }

  if (actor.x <= actor.patrol.minX) {
    actor.direction = 1
  } else if (actor.x >= actor.patrol.maxX) {
    actor.direction = -1
  }

  actor.vx = actor.direction * moveSpeed * 90
}

function applyGravity(actor: RuntimeActor, deltaSeconds: number) {
  const gravityModuleId = "physics/gravity"
  const gravityScale = toNumber(actor.moduleConfigs[gravityModuleId]?.gravity_scale, 1)
  actor.vy += BASE_GRAVITY * gravityScale * deltaSeconds
}

function integrateActor(actor: RuntimeActor, platforms: ScenePlatform[], worldWidth: number, worldHeight: number, deltaSeconds: number) {
  actor.grounded = false

  actor.x += actor.vx * deltaSeconds
  actor.x = clamp(actor.x, 0, worldWidth - actor.width)

  for (const platform of platforms) {
    if (!rectsOverlap(actor.x, actor.y, actor.width, actor.height, platform.x, platform.y, platform.width, platform.height)) continue

    if (actor.vx > 0) {
      actor.x = platform.x - actor.width
    } else if (actor.vx < 0) {
      actor.x = platform.x + platform.width
    }
    actor.vx = 0
  }

  actor.y += actor.vy * deltaSeconds
  for (const platform of platforms) {
    if (!rectsOverlap(actor.x, actor.y, actor.width, actor.height, platform.x, platform.y, platform.width, platform.height)) continue

    if (actor.vy > 0) {
      actor.y = platform.y - actor.height
      actor.vy = 0
      actor.grounded = true
    } else if (actor.vy < 0) {
      actor.y = platform.y + platform.height
      actor.vy = 0
    }
  }

  if (actor.y < 0) {
    actor.y = 0
    actor.vy = 0
  }

  if (actor.y > worldHeight + 160) {
    actor.active = false
  }
}

function processCoinCollection(world: RuntimeWorld, player: RuntimeActor, emit: (event: RuntimeWeb2DEvent) => void) {
  if (!world.systems.some((system) => system.module === "systems/coin_collectible")) return

  for (const coin of world.coins) {
    if (coin.collected) continue
    if (!circleIntersectsRect(coin.x, coin.y, coin.radius, player.x, player.y, player.width, player.height)) continue

    coin.collected = true
    world.score += coin.value
    emit({ type: "coin_collected", coin_id: coin.id, score: world.score })
  }
}

function processCheckpointCollection(world: RuntimeWorld, player: RuntimeActor, emit: (event: RuntimeWeb2DEvent) => void) {
  for (const checkpoint of world.checkpoints) {
    if (!rectsOverlap(player.x, player.y, player.width, player.height, checkpoint.x, checkpoint.y, checkpoint.width, checkpoint.height)) {
      continue
    }
    if (checkpoint.active) continue

    world.activeCheckpointId = checkpoint.id
    for (const entry of world.checkpoints) {
      entry.active = entry.id === checkpoint.id
    }
    emit({ type: "checkpoint_activated", checkpoint_id: checkpoint.id })
  }
}

function processEnemyContacts(world: RuntimeWorld, player: RuntimeActor) {
  if (world.respawnCountdownMs !== null) return

  if (player.y > world.preset.height + 32 || !player.active) {
    const checkpoint = world.checkpoints.find((entry) => entry.id === world.activeCheckpointId)
    world.respawnCountdownMs = checkpoint?.respawnDelayMs ?? 800
    player.active = false
    player.vx = 0
    player.vy = 0
    return
  }

  if (world.contactGraceRemainingMs > 0) return

  const enemy = world.actors.find(
    (actor) =>
      actor.kind === "enemy" &&
      actor.active &&
      rectsOverlap(player.x, player.y, player.width, player.height, actor.x, actor.y, actor.width, actor.height),
  )

  if (enemy) {
    const direction = enemy.x < player.x ? 1 : -1
    player.vx = direction * CONTACT_KNOCKBACK_X
    player.vy = CONTACT_KNOCKBACK_Y
    player.grounded = false
    player.x = clamp(player.x + direction * 18, 0, world.preset.width - player.width)
    world.contactGraceRemainingMs = CONTACT_GRACE_MS
  }
}

function processRespawn(world: RuntimeWorld, deltaMs: number, emit: (event: RuntimeWeb2DEvent) => void) {
  if (world.respawnCountdownMs === null) return

  world.respawnCountdownMs = Math.max(0, world.respawnCountdownMs - deltaMs)
  if (world.respawnCountdownMs > 0) return

  const player = getPlayer(world)
  if (!player) return

  const checkpoint = world.checkpoints.find((entry) => entry.id === world.activeCheckpointId)
  const respawnX = checkpoint?.respawnX ?? player.spawn.x
  const respawnY = checkpoint?.respawnY ?? player.spawn.y

  player.x = respawnX
  player.y = respawnY
  player.vx = 0
  player.vy = 0
  player.active = true
  player.grounded = false
  world.respawnCountdownMs = null
  world.contactGraceRemainingMs = 0
  emit({ type: "player_respawned", checkpoint_id: checkpoint?.id ?? null })
}

function updateCamera(world: RuntimeWorld) {
  const player = getPlayer(world)
  if (!player) return

  const cameraActor = world.actors.find((actor) => actor.modules.includes("camera/side_scroll")) ?? player
  const followLag = clamp(toNumber(cameraActor.moduleConfigs["camera/side_scroll"]?.follow_lag, 0.12), 0, 1)

  const targetX = clamp(player.x + player.width / 2 - world.camera.width * 0.42, 0, Math.max(0, world.preset.width - world.camera.width))
  const targetY = clamp(player.y + player.height / 2 - world.camera.height * 0.62, 0, Math.max(0, world.preset.height - world.camera.height))

  world.camera.x += (targetX - world.camera.x) * Math.max(followLag, 0.08)
  world.camera.y += (targetY - world.camera.y) * Math.max(followLag, 0.08)
}

function renderWorld(world: RuntimeWorld, canvas: HTMLCanvasElement | null) {
  if (!canvas) return

  const context = canvas.getContext("2d")
  if (!context) return

  const viewportWidth = canvas.width > 0 ? canvas.width : DEFAULT_VIEWPORT_WIDTH
  const viewportHeight = canvas.height > 0 ? canvas.height : DEFAULT_VIEWPORT_HEIGHT
  world.camera.width = viewportWidth
  world.camera.height = viewportHeight

  const gradient = context.createLinearGradient(0, 0, 0, viewportHeight)
  gradient.addColorStop(0, world.visuals.backgroundTop)
  gradient.addColorStop(1, world.visuals.backgroundBottom)
  context.fillStyle = gradient
  context.fillRect(0, 0, viewportWidth, viewportHeight)
  context.imageSmoothingEnabled = true

  drawBackdrop(context, world, viewportWidth, viewportHeight)

  context.save()
  context.translate(-world.camera.x, -world.camera.y)

  drawPlatforms(context, world.preset.platforms, world.visuals)
  drawCoins(context, world.coins)
  drawCheckpoints(context, world.checkpoints)
  drawActors(context, world.actors)

  context.restore()
  drawHud(context, world, viewportWidth, viewportHeight)
}

function drawBackdrop(context: CanvasRenderingContext2D, world: RuntimeWorld, viewportWidth: number, viewportHeight: number) {
  const farShift = -world.camera.x * 0.12
  const midShift = -world.camera.x * 0.22
  const horizonY = viewportHeight * 0.62

  context.save()

  context.globalAlpha = 0.2
  context.fillStyle = world.visuals.cloud
  context.beginPath()
  context.arc(viewportWidth - 112, 96, 44, 0, Math.PI * 2)
  context.fill()

  context.globalAlpha = 0.22
  context.fillStyle = world.visuals.skylineFar
  for (let index = 0; index < 6; index += 1) {
    const width = 220 + index * 12
    const height = 120 + (index % 3) * 32
    const x = farShift + index * 210 - 60
    const y = horizonY - height
    context.fillRect(x, y, width, height)
  }

  context.globalAlpha = 0.34
  context.fillStyle = world.visuals.skylineMid
  for (let index = 0; index < 8; index += 1) {
    const width = 160 + (index % 2) * 36
    const height = 90 + (index % 4) * 26
    const x = midShift + index * 152 - 40
    const y = horizonY + 26 - height
    context.fillRect(x, y, width, height)
  }

  context.globalAlpha = 0.16
  context.fillStyle = world.visuals.cloud
  for (let index = 0; index < 5; index += 1) {
    const cloudX = viewportWidth * 0.12 + index * 180 + farShift * 0.35
    const cloudY = 86 + (index % 2) * 38
    context.beginPath()
    context.ellipse(cloudX, cloudY, 42, 18, 0, 0, Math.PI * 2)
    context.ellipse(cloudX + 30, cloudY - 6, 36, 15, 0, 0, Math.PI * 2)
    context.ellipse(cloudX + 56, cloudY + 3, 28, 12, 0, 0, Math.PI * 2)
    context.fill()
  }

  context.restore()
}

function drawPlatforms(context: CanvasRenderingContext2D, platforms: ScenePlatform[], visuals: RuntimeVisualStyle2D) {
  for (const platform of platforms) {
    const topColor = platform.id === "floor" ? visuals.floorTop : visuals.platformTop
    const bodyColor = platform.id === "floor" ? visuals.floorBody : visuals.platformBody
    const accentColor = platform.id === "floor" ? visuals.floorAccent : visuals.platformAccent

    context.shadowColor = "rgba(8,12,24,0.42)"
    context.shadowBlur = 18
    context.shadowOffsetY = 12
    context.fillStyle = bodyColor
    context.fillRect(platform.x, platform.y, platform.width, platform.height)
    context.shadowBlur = 0
    context.shadowOffsetY = 0

    context.fillStyle = topColor
    context.fillRect(platform.x, platform.y, platform.width, Math.min(platform.height, 12))

    context.fillStyle = accentColor
    context.fillRect(platform.x + 6, platform.y + 6, Math.max(0, platform.width - 12), 2)

    context.strokeStyle = "rgba(255,255,255,0.16)"
    context.lineWidth = 2
    context.strokeRect(platform.x, platform.y, platform.width, platform.height)
  }
}

function drawCoins(context: CanvasRenderingContext2D, coins: RuntimeCoin[]) {
  for (const coin of coins) {
    if (coin.collected) continue
    context.save()
    context.shadowColor = "rgba(246, 196, 69, 0.5)"
    context.shadowBlur = 18
    context.beginPath()
    context.arc(coin.x, coin.y, coin.radius, 0, Math.PI * 2)
    context.fillStyle = "#f6c445"
    context.fill()
    context.strokeStyle = "#fff2a7"
    context.lineWidth = 2
    context.stroke()
    context.shadowBlur = 0
    context.fillStyle = "rgba(255,255,255,0.42)"
    context.fillRect(coin.x - 1.5, coin.y - coin.radius + 4, 3, coin.radius * 1.4)
    context.restore()
  }
}

function drawCheckpoints(context: CanvasRenderingContext2D, checkpoints: RuntimeCheckpoint[]) {
  for (const checkpoint of checkpoints) {
    context.save()
    context.shadowColor = checkpoint.active ? "rgba(56,215,255,0.45)" : "rgba(23,37,84,0.35)"
    context.shadowBlur = checkpoint.active ? 22 : 10
    context.fillStyle = checkpoint.active ? "#38d7ff" : "#2f5169"
    context.fillRect(checkpoint.x, checkpoint.y, 8, checkpoint.height)
    context.beginPath()
    context.moveTo(checkpoint.x + 8, checkpoint.y + 6)
    context.lineTo(checkpoint.x + checkpoint.width, checkpoint.y + 16)
    context.lineTo(checkpoint.x + 8, checkpoint.y + 26)
    context.closePath()
    context.fillStyle = checkpoint.active ? "#7ce8ff" : "#527186"
    context.fill()
    context.restore()
  }
}

function drawActors(context: CanvasRenderingContext2D, actors: RuntimeActor[]) {
  for (const actor of actors) {
    if (!actor.active) continue
    const palette = resolveActorPalette(actor)
    const bodyColor = palette.body
    const accentColor = palette.accent
    const topColor = palette.top
    const shadowWidth = actor.width * 0.68

    context.save()
    context.fillStyle = "rgba(3,8,20,0.28)"
    context.beginPath()
    context.ellipse(actor.x + actor.width / 2, actor.y + actor.height + 8, shadowWidth, 8, 0, 0, Math.PI * 2)
    context.fill()

    context.shadowColor = actor.kind === "player" ? "rgba(79,163,255,0.28)" : "rgba(255,107,107,0.26)"
    context.shadowBlur = 14
    context.shadowOffsetY = 6
    context.fillStyle = bodyColor
    context.fillRect(actor.x, actor.y, actor.width, actor.height)
    context.shadowBlur = 0
    context.shadowOffsetY = 0
    context.fillStyle = topColor
    context.fillRect(actor.x + 4, actor.y + 4, actor.width - 8, 6)
    context.fillStyle = accentColor
    context.fillRect(actor.x + 6, actor.y + 10, 4, 4)
    context.fillRect(actor.x + actor.width - 10, actor.y + 10, 4, 4)
    context.strokeStyle = "rgba(255,255,255,0.22)"
    context.strokeRect(actor.x, actor.y, actor.width, actor.height)
    context.restore()
  }
}

function drawHud(context: CanvasRenderingContext2D, world: RuntimeWorld, viewportWidth: number, _viewportHeight: number) {
  context.save()
  context.fillStyle = world.visuals.hudFill
  context.strokeStyle = world.visuals.hudBorder
  roundRect(context, 24, 20, 268, 92, 18)
  context.fill()
  context.stroke()

  context.fillStyle = world.visuals.hudText
  context.font = "600 16px ui-sans-serif, system-ui, sans-serif"
  context.fillText("Playable Prototype", 42, 47)
  context.font = "500 13px ui-sans-serif, system-ui, sans-serif"
  context.fillStyle = world.visuals.hudSubtext
  context.fillText(`Coins: ${world.score}`, 42, 70)
  context.fillText(`Checkpoint: ${world.activeCheckpointId ?? "Not reached yet"}`, 42, 91)

  const controlsX = Math.max(24, viewportWidth - 396)
  roundRect(context, controlsX, 20, 372, 72, 18)
  context.fillStyle = world.visuals.hudFill
  context.fill()
  context.strokeStyle = world.visuals.hudBorder
  context.stroke()
  context.fillStyle = world.visuals.hudText
  context.fillText(world.gamepadConnected ? "Controller connected" : "Keyboard ready", controlsX + 18, 47)
  context.fillStyle = world.visuals.hudSubtext
  context.fillText(
    world.gamepadConnected ? "Left Stick / D-pad move • A / Cross jump" : "A / D or Arrow Keys move • Space jump",
    controlsX + 18,
    69,
  )
  context.restore()
}

function resolveVisualStyle2D(parameters: PrototypeSpec["scene"]["parameters"]): RuntimeVisualStyle2D {
  const theme = typeof parameters.visual_theme === "string" ? parameters.visual_theme : "default"
  const themes: Record<string, RuntimeVisualStyle2D> = {
    default: {
      backgroundTop: "#7dd3fc",
      backgroundBottom: "#0f172a",
      skylineFar: "#0f2240",
      skylineMid: "#17305a",
      cloud: "#d9f4ff",
      floorTop: "#34456a",
      floorBody: "#24324d",
      floorAccent: "rgba(110, 231, 255, 0.16)",
      platformTop: "#49628f",
      platformBody: "#31476d",
      platformAccent: "rgba(255,255,255,0.14)",
      hudFill: "rgba(6, 10, 20, 0.8)",
      hudBorder: "rgba(103, 232, 249, 0.28)",
      hudText: "#d9faff",
      hudSubtext: "rgba(217,250,255,0.88)",
    },
    neon: {
      backgroundTop: "#312e81",
      backgroundBottom: "#020617",
      skylineFar: "#1d4ed8",
      skylineMid: "#0f766e",
      cloud: "#99f6e4",
      floorTop: "#0f766e",
      floorBody: "#164e63",
      floorAccent: "rgba(34,211,238,0.34)",
      platformTop: "#7c3aed",
      platformBody: "#312e81",
      platformAccent: "rgba(248,113,113,0.24)",
      hudFill: "rgba(2, 6, 23, 0.84)",
      hudBorder: "rgba(167,139,250,0.45)",
      hudText: "#e0f2fe",
      hudSubtext: "rgba(191,219,254,0.9)",
    },
    sunset: {
      backgroundTop: "#fb7185",
      backgroundBottom: "#1f2937",
      skylineFar: "#7c2d12",
      skylineMid: "#b45309",
      cloud: "#fde68a",
      floorTop: "#92400e",
      floorBody: "#451a03",
      floorAccent: "rgba(253,230,138,0.24)",
      platformTop: "#f97316",
      platformBody: "#7c2d12",
      platformAccent: "rgba(255,237,213,0.18)",
      hudFill: "rgba(30, 18, 12, 0.82)",
      hudBorder: "rgba(251,146,60,0.36)",
      hudText: "#fff7ed",
      hudSubtext: "rgba(255,237,213,0.9)",
    },
    cyberpunk: {
      backgroundTop: "#1e1b4b",
      backgroundBottom: "#030712",
      skylineFar: "#581c87",
      skylineMid: "#0f766e",
      cloud: "#c4b5fd",
      floorTop: "#0f766e",
      floorBody: "#1e1b4b",
      floorAccent: "rgba(168,85,247,0.24)",
      platformTop: "#a855f7",
      platformBody: "#312e81",
      platformAccent: "rgba(34,211,238,0.24)",
      hudFill: "rgba(7, 9, 22, 0.84)",
      hudBorder: "rgba(168,85,247,0.38)",
      hudText: "#ede9fe",
      hudSubtext: "rgba(216,180,254,0.88)",
    },
    night: {
      backgroundTop: "#1d4ed8",
      backgroundBottom: "#020617",
      skylineFar: "#0f172a",
      skylineMid: "#1e293b",
      cloud: "#bfdbfe",
      floorTop: "#334155",
      floorBody: "#0f172a",
      floorAccent: "rgba(96,165,250,0.2)",
      platformTop: "#475569",
      platformBody: "#1e293b",
      platformAccent: "rgba(255,255,255,0.1)",
      hudFill: "rgba(2, 6, 23, 0.82)",
      hudBorder: "rgba(96,165,250,0.28)",
      hudText: "#e0f2fe",
      hudSubtext: "rgba(191,219,254,0.86)",
    },
  }

  const resolved = { ...(themes[theme] ?? themes.default) }
  const backgroundVariant = typeof parameters.background_variant === "string" ? parameters.background_variant : null
  const arenaTint = toHexString(parameters.arena_tint, "")
  const tintSource =
    (backgroundVariant && COLOR_HEX_MAP_2D[backgroundVariant]) ||
    (backgroundVariant && /^#[0-9a-fA-F]{6}$/.test(backgroundVariant) ? backgroundVariant : "") ||
    arenaTint

  if (tintSource) {
    resolved.backgroundTop = tintSource
    resolved.skylineMid = darkenHex(tintSource, 0.42)
    resolved.platformTop = darkenHex(tintSource, 0.18)
    resolved.platformAccent = hexToAlpha(tintSource, 0.22)
    resolved.hudBorder = hexToAlpha(tintSource, 0.3)
  }

  return resolved
}

function resolveCoinMarkers(markers: ScenePreset["coin_markers"], density: JsonValue | undefined) {
  if (density === "sparse") {
    return markers.filter((_, index) => index % 2 === 0)
  }
  if (density === "dense") {
    return markers.flatMap((marker, index) => [
      marker,
      {
        ...marker,
        id: `${marker.id}_bonus_${index + 1}`,
        x: marker.x + (index % 2 === 0 ? 26 : -26),
        y: marker.y - 16,
      },
    ])
  }
  return markers
}

function resolveCheckpointMarkers(markers: ScenePreset["checkpoint_markers"], density: JsonValue | undefined) {
  if (density === "sparse") {
    return markers.slice(0, 1)
  }
  return markers
}

function resolveActorPalette(actor: RuntimeActor) {
  const moduleId = actor.kind === "player" ? "player/platformer_controller" : "enemy/basic_enemy"
  const configuredBody = toHexString(actor.moduleConfigs[moduleId]?.body_color, actor.kind === "player" ? "#58acff" : "#ff7078")
  const configuredAccent = toHexString(actor.moduleConfigs[moduleId]?.accent_color, lightenHex(configuredBody, 0.52))
  return {
    body: configuredBody,
    top: lightenHex(configuredBody, 0.18),
    accent: configuredAccent,
  }
}

function roundRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  const clampedRadius = Math.min(radius, width / 2, height / 2)
  context.beginPath()
  context.moveTo(x + clampedRadius, y)
  context.lineTo(x + width - clampedRadius, y)
  context.quadraticCurveTo(x + width, y, x + width, y + clampedRadius)
  context.lineTo(x + width, y + height - clampedRadius)
  context.quadraticCurveTo(x + width, y + height, x + width - clampedRadius, y + height)
  context.lineTo(x + clampedRadius, y + height)
  context.quadraticCurveTo(x, y + height, x, y + height - clampedRadius)
  context.lineTo(x, y + clampedRadius)
  context.quadraticCurveTo(x, y, x + clampedRadius, y)
  context.closePath()
}

function createSnapshot(world: RuntimeWorld, running: boolean): RuntimeSnapshot {
  return {
    tick: world.tick,
    running,
    status: running ? "running" : "ready",
    runtime: world.spec.runtime,
    scene: {
      environment: world.spec.scene.environment,
      width: world.preset.width,
      height: world.preset.height,
      camera: {
        x: round(world.camera.x),
        y: round(world.camera.y),
        width: round(world.camera.width),
        height: round(world.camera.height),
      },
    },
    player: toActorSnapshot(getPlayer(world)),
    enemies: world.actors
      .filter((actor) => actor.kind === "enemy")
      .map((actor) => toActorSnapshot(actor))
      .filter((actor): actor is RuntimeActorSnapshot => Boolean(actor)),
    coins: world.coins.map<RuntimeCoinSnapshot>((coin) => ({
      id: coin.id,
      x: round(coin.x),
      y: round(coin.y),
      collected: coin.collected,
    })),
    checkpoints: world.checkpoints.map<RuntimeCheckpointSnapshot>((checkpoint) => ({
      id: checkpoint.id,
      x: round(checkpoint.x),
      y: round(checkpoint.y),
      active: checkpoint.active,
    })),
    score: world.score,
    activeCheckpointId: world.activeCheckpointId,
    gamepad_connected: world.gamepadConnected,
  }
}

function toActorSnapshot(actor: RuntimeActor | null): RuntimeActorSnapshot | null {
  if (!actor) return null
  return {
    id: actor.id,
    kind: actor.kind,
    x: round(actor.x),
    y: round(actor.y),
    vx: round(actor.vx),
    vy: round(actor.vy),
    width: actor.width,
    height: actor.height,
    grounded: actor.grounded,
    active: actor.active,
    modules: [...actor.modules],
  }
}

function getPlayer(world: RuntimeWorld): RuntimeActor | null {
  return world.actors.find((actor) => actor.kind === "player") ?? null
}

function bindKeyboardInput(input: RuntimeInputState) {
  if (typeof window === "undefined") {
    return () => undefined
  }

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.code === "ArrowLeft" || event.code === "KeyA") input.left = true
    if (event.code === "ArrowRight" || event.code === "KeyD") input.right = true
    if (event.code === "Space" || event.code === "ArrowUp" || event.code === "KeyW") input.jump = true
  }

  const handleKeyUp = (event: KeyboardEvent) => {
    if (event.code === "ArrowLeft" || event.code === "KeyA") input.left = false
    if (event.code === "ArrowRight" || event.code === "KeyD") input.right = false
    if (event.code === "Space" || event.code === "ArrowUp" || event.code === "KeyW") input.jump = false
  }

  window.addEventListener("keydown", handleKeyDown)
  window.addEventListener("keyup", handleKeyUp)

  return () => {
    window.removeEventListener("keydown", handleKeyDown)
    window.removeEventListener("keyup", handleKeyUp)
  }
}

function resolveFrameInput(input: RuntimeInputState, navigatorLike: CreateRuntimeWeb2DOptions["navigatorLike"]) {
  const gamepad = sampleNormalizedGamepad({ navigatorLike })
  return {
    gamepadConnected: gamepad.connected,
    state: {
      left: input.left || gamepad.left_stick_x <= -0.35 || gamepad.dpad_left,
      right: input.right || gamepad.left_stick_x >= 0.35 || gamepad.dpad_right,
      jump: input.jump || gamepad.south,
    },
  }
}

function resolvePatrolRange(actor: RuntimeActor, platforms: ScenePlatform[]) {
  const actorCenterX = actor.x + actor.width / 2
  const actorBottomY = actor.y + actor.height
  const supportingPlatform = platforms
    .filter(
      (platform) =>
        actorCenterX >= platform.x - 24 &&
        actorCenterX <= platform.x + platform.width + 24 &&
        Math.abs(platform.y - actorBottomY) <= 80,
    )
    .sort((left, right) => Math.abs(left.y - actorBottomY) - Math.abs(right.y - actorBottomY))[0]

  if (!supportingPlatform) {
    return {
      minX: Math.max(0, actor.x - 120),
      maxX: actor.x + 120,
    }
  }

  return {
    minX: supportingPlatform.x + 12,
    maxX: supportingPlatform.x + supportingPlatform.width - actor.width - 12,
  }
}

function sampleModuleInput(_actor: RuntimeActor, _input: RuntimeInputState, _previousInput: RuntimeInputState) {
  // Input state is sampled once per frame before module execution to keep runtime behavior deterministic.
}

function rectsOverlap(
  leftAX: number,
  topAY: number,
  widthA: number,
  heightA: number,
  leftBX: number,
  topBY: number,
  widthB: number,
  heightB: number,
) {
  return leftAX < leftBX + widthB && leftAX + widthA > leftBX && topAY < topBY + heightB && topAY + heightA > topBY
}

function circleIntersectsRect(
  circleX: number,
  circleY: number,
  radius: number,
  rectX: number,
  rectY: number,
  rectWidth: number,
  rectHeight: number,
) {
  const nearestX = clamp(circleX, rectX, rectX + rectWidth)
  const nearestY = clamp(circleY, rectY, rectY + rectHeight)
  const distanceX = circleX - nearestX
  const distanceY = circleY - nearestY
  return distanceX * distanceX + distanceY * distanceY <= radius * radius
}

function toNumber(value: JsonValue | undefined, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback
}

function toInteger(value: JsonValue | undefined, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value) : fallback
}

function toHexString(value: JsonValue | undefined, fallback: string) {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback
}

function lightenHex(hex: string, amount: number) {
  const normalized = /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : "#ffffff"
  const channels = [1, 3, 5].map((offset) => parseInt(normalized.slice(offset, offset + 2), 16))
  const adjusted = channels.map((channel) => Math.round(channel + (255 - channel) * amount))
  return `#${adjusted.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`
}

function darkenHex(hex: string, amount: number) {
  const normalized = /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : "#000000"
  const channels = [1, 3, 5].map((offset) => parseInt(normalized.slice(offset, offset + 2), 16))
  const adjusted = channels.map((channel) => Math.round(channel * (1 - amount)))
  return `#${adjusted.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`
}

function hexToAlpha(hex: string, alpha: number) {
  const normalized = /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : "#ffffff"
  const red = parseInt(normalized.slice(1, 3), 16)
  const green = parseInt(normalized.slice(3, 5), 16)
  const blue = parseInt(normalized.slice(5, 7), 16)
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function clampInteger(value: number, min: number, max: number) {
  return Math.round(clamp(value, min, max))
}

function round(value: number) {
  return Math.round(value * 100) / 100
}

export { FIXED_TIMESTEP_MS }
