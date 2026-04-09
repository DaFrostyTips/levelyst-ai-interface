import type {
  AIPlanningStep,
  BlueprintGenerateRequest,
  BlueprintSystemItem,
  CopilotSuggestion,
  DependencyEdge,
  IntentBlueprint,
  LevelSection,
  ModuleCategory,
  ModuleGroup,
  ModuleNode,
  NodeHighlightState,
  PanelDockSlot,
  SimulationReadiness,
} from "@/lib/editor-v2-model"
import { getSystemLabel, normalizeSectionLabel } from "@/lib/editor-v2-lexicon"
import { editorPromptAliases } from "@/lib/levelyst/adapters/editor-v2"
import { createSeededModuleRegistry } from "@levelyst/module-registry"

export interface GraphBuildStage {
  typeId: string
  delayMs: number
}

export interface GraphBuildPlan {
  planningSteps: AIPlanningStep[]
  nodeStages: GraphBuildStage[]
}

export interface IntentPlannerOutput {
  game_type: string
  core_systems: string[]
  gameplay_systems: string[]
  required_modules: string[]
  environment: string
  level_structure: string[]
}

export interface BlueprintCatalogItem {
  typeId: string
  name: string
  category: ModuleCategory
}

export type BlueprintEditAction =
  | { type: "remove_system"; bucket: "core" | "gameplay"; typeId: string }
  | { type: "add_system"; bucket: "core" | "gameplay"; typeId: string }
  | { type: "reorder_level_section"; fromIndex: number; toIndex: number }

const moduleRegistry = createSeededModuleRegistry()

const BLUEPRINT_ALIAS_MAP: Record<string, string> = {
  ...editorPromptAliases,
  player_controller: "player/platformer_controller",
  platformer: "player/platformer_controller",
  platformer_camera: "camera/side_scroll",
  fps: "player/fps_controller",
  shooter: "combat/hitscan_weapon",
  zombie_survival: "systems/wave_manager",
}

export function deriveDependencyEdges(nodes: ModuleNode[]): DependencyEdge[] {
  const presentTypes = new Set(nodes.filter((node) => !node.isGroup).map((node) => node.typeId))
  const dedupe = new Set<string>()
  const edges: DependencyEdge[] = []

  nodes
    .filter((node) => !node.isGroup)
    .forEach((node) => {
      node.dependencies
        .filter((dependencyId) => presentTypes.has(dependencyId))
        .sort((left, right) => left.localeCompare(right))
        .forEach((dependencyId) => {
          const key = `${dependencyId}->${node.typeId}:required`
          if (dedupe.has(key)) return
          dedupe.add(key)
          edges.push({
            fromTypeId: dependencyId,
            toTypeId: node.typeId,
            kind: "required",
          })
        })
    })

  return edges
}

export function deriveSimulationReadiness(nodes: ModuleNode[], edges: DependencyEdge[]): SimulationReadiness {
  if (nodes.length === 0) {
    return {
      status: "missing_dependencies",
      message: "No systems placed yet.",
      missingLinks: ["Add a controller module to begin building a prototype."],
    }
  }

  const realNodes = nodes.filter((node) => !node.isGroup)
  const presentTypes = new Set(realNodes.map((node) => node.typeId))
  const edgeSet = new Set(edges.map((edge) => `${edge.fromTypeId}->${edge.toTypeId}`))
  const missingLinks = realNodes
    .flatMap((node) =>
      node.dependencies
        .filter((dependencyId) => !presentTypes.has(dependencyId) || !edgeSet.has(`${dependencyId}->${node.typeId}`))
        .map((dependencyId) => `${getSystemLabel(dependencyId)} → ${getSystemLabel(node.typeId)}`),
    )
    .filter((value, index, array) => array.indexOf(value) === index)

  if (missingLinks.length > 0) {
    return {
      status: "missing_dependencies",
      message: "Missing required system links.",
      missingLinks,
    }
  }

  const hasController = realNodes.some((node) => node.typeId.startsWith("player/"))
  const hasSupportSystems = realNodes.length >= 2

  if (hasController && hasSupportSystems) {
    return {
      status: "prototype_ready",
      message: "Prototype ready for simulation.",
      missingLinks: [],
    }
  }

  return {
    status: "systems_connected",
    message: "Systems connected. Add one core chain to simulate.",
    missingLinks: [],
  }
}

export function isPrototypeReady(nodes: ModuleNode[], edges: DependencyEdge[]): boolean {
  return deriveSimulationReadiness(nodes, edges).status === "prototype_ready"
}

export function resolveDockSlot(
  pointer: { x: number; y: number },
  bounds: Pick<DOMRect, "left" | "right" | "top" | "bottom" | "width" | "height">,
  snapZone = 24,
): PanelDockSlot | null {
  const leftDistance = pointer.x - bounds.left
  const rightDistance = bounds.right - pointer.x
  const bottomDistance = bounds.bottom - pointer.y

  const candidates: Array<{ edge: "left" | "right" | "bottom"; distance: number }> = []
  if (leftDistance <= snapZone) candidates.push({ edge: "left", distance: leftDistance })
  if (rightDistance <= snapZone) candidates.push({ edge: "right", distance: rightDistance })
  if (bottomDistance <= snapZone) candidates.push({ edge: "bottom", distance: bottomDistance })

  if (candidates.length === 0) return null
  candidates.sort((a, b) => a.distance - b.distance)
  const edge = candidates[0].edge

  if (edge === "left" || edge === "right") {
    const relativeY = clamp((pointer.y - bounds.top) / Math.max(bounds.height, 1), 0, 0.999)
    if (relativeY < 1 / 3) return `${edge}-top`
    if (relativeY < 2 / 3) return `${edge}-middle`
    return `${edge}-bottom`
  }

  const relativeX = clamp((pointer.x - bounds.left) / Math.max(bounds.width, 1), 0, 0.999)
  if (relativeX < 1 / 3) return "bottom-left"
  if (relativeX < 2 / 3) return "bottom-center"
  return "bottom-right"
}

export function autoArrangeNodes(nodes: ModuleNode[], edges: DependencyEdge[], groups: ModuleGroup[]): ModuleNode[] {
  const groupMemberNodeIds = new Set(groups.flatMap((group) => group.nodeIds))
  const arrangeableNodes = nodes.filter((node) => !node.isGroup && !groupMemberNodeIds.has(node.id))
  const groupedNodes = nodes.filter((node) => !node.isGroup && groupMemberNodeIds.has(node.id))

  const depthByType = deriveDepthByType(edges, arrangeableNodes)
  const columns = new Map<number, ModuleNode[]>()
  arrangeableNodes.forEach((node) => {
    const depth = depthByType.get(node.typeId) ?? 0
    const bucket = columns.get(depth)
    if (bucket) {
      bucket.push(node)
      return
    }
    columns.set(depth, [node])
  })

  const updates = new Map<string, { x: number; y: number }>()
  const orderedDepths = [...columns.keys()].sort((a, b) => a - b)

  orderedDepths.forEach((depth) => {
    const nodesInColumn = (columns.get(depth) ?? []).sort((a, b) => {
      if (a.category !== b.category) return a.category.localeCompare(b.category)
      return a.name.localeCompare(b.name)
    })
    nodesInColumn.forEach((node, index) => {
      updates.set(node.id, {
        x: 140 + depth * 300,
        y: 120 + index * 165,
      })
    })
  })

  // Keep grouped members clustered relative to each group centroid.
  groups.forEach((group) => {
    const members = groupedNodes.filter((node) => group.nodeIds.includes(node.id))
    if (members.length === 0) return
    const base = deriveGroupBounds(nodes, group.nodeIds)
    members
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach((member, index) => {
        updates.set(member.id, {
          x: base.x + 32 + (index % 2) * 180,
          y: base.y + 62 + Math.floor(index / 2) * 120,
        })
      })
  })

  return nodes.map((node) => {
    const update = updates.get(node.id)
    if (!update) return node
    return { ...node, x: update.x, y: update.y }
  })
}

export function buildGraphAnimationPlan(promptIntentLabel: string, moduleTypeIds: string[]): GraphBuildPlan {
  const planningSteps: AIPlanningStep[] = [
    {
      id: "detect-genre",
      label: `Detecting genre (${promptIntentLabel})`,
      status: "pending",
    },
    {
      id: "plan-systems",
      label: "Planning systems",
      status: "pending",
    },
    {
      id: "module-blueprint",
      label: "Generating module blueprint",
      status: "pending",
    },
  ]

  const nodeStages = moduleTypeIds.map((typeId, index) => ({
    typeId,
    delayMs: index === 0 ? 220 : 280,
  }))

  return { planningSteps, nodeStages }
}

export function createBlueprintFromPlannerOutput(
  output: IntentPlannerOutput,
  gameIdea: string,
  catalog: BlueprintCatalogItem[],
): IntentBlueprint {
  const catalogByType = new Map(catalog.map((item) => [item.typeId, item]))
  const unmapped = new Set<string>()

  const toSystems = (items: string[]) => {
    const systems: BlueprintSystemItem[] = []
    const seen = new Set<string>()

    items.forEach((raw) => {
      const normalized = normalizeSystemKey(raw)
      const typeId = BLUEPRINT_ALIAS_MAP[normalized] ?? normalized
      if (seen.has(typeId)) return
      seen.add(typeId)

      const catalogItem = catalogByType.get(typeId)
      if (!catalogItem) {
        unmapped.add(raw)
        return
      }

      systems.push({
        typeId: catalogItem.typeId,
        name: getSystemLabel(catalogItem.typeId, catalogItem.name),
        category: catalogItem.category,
      })
    })

    return systems
  }

  const draft: IntentBlueprint = {
    gameType: output.game_type || "general",
    gameTypeLabel: toHumanLabel(output.game_type || "general"),
    gameIdea,
    playerExperience: "Generate a prototype from this prompt and refine it in the Blueprint review.",
    coreGameplay: [],
    gameStructure: output.level_structure.map(normalizeSectionLabel).filter(Boolean),
    environmentLabel: toHumanLabel(output.environment || "prototype_test_arena"),
    promptInterpretation: [],
    adaptationNote: null,
    coreSystems: toSystems(output.core_systems),
    gameplaySystems: toSystems(output.gameplay_systems),
    environment: toHumanLabel(output.environment || "prototype_test_arena"),
    levelStructure: output.level_structure.map(normalizeSectionLabel).filter(Boolean),
    unmappedSystems: [...unmapped],
  }

  return normalizeBlueprint(draft, catalog)
}

export function normalizeBlueprint(blueprint: IntentBlueprint, catalog: BlueprintCatalogItem[]): IntentBlueprint {
  const catalogByType = new Map(catalog.map((item) => [item.typeId, item]))

  const normalizeBucket = (items: BlueprintSystemItem[]) => {
    const seen = new Set<string>()
    const next: BlueprintSystemItem[] = []

    items.forEach((item) => {
      const catalogItem = catalogByType.get(item.typeId)
      if (!catalogItem || seen.has(item.typeId)) return
      seen.add(item.typeId)
      next.push({
        typeId: catalogItem.typeId,
        name: getSystemLabel(catalogItem.typeId, catalogItem.name),
        category: catalogItem.category,
      })
    })

    return next
  }

  const coreSystems = normalizeBucket(blueprint.coreSystems)
  const gameplaySystems = normalizeBucket(blueprint.gameplaySystems).filter(
    (system) => !coreSystems.some((core) => core.typeId === system.typeId),
  )

  const levelSeen = new Set<string>()
  const levelStructure = blueprint.levelStructure
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .filter((entry) => {
      const key = entry.toLowerCase()
      if (levelSeen.has(key)) return false
      levelSeen.add(key)
      return true
    })

  return {
    ...blueprint,
    coreSystems,
    gameplaySystems,
    levelStructure: levelStructure.length > 0 ? levelStructure : ["Intro", "Gameplay Loop", "Boss Fight", "End"],
    unmappedSystems: [...new Set(blueprint.unmappedSystems)].slice(0, 8),
    coreGameplay: [...new Set(blueprint.coreGameplay)].slice(0, 8),
    gameStructure: [...new Set(blueprint.gameStructure)].slice(0, 8),
    promptInterpretation: blueprint.promptInterpretation.slice(0, 8),
  }
}

export function buildBlueprintModuleSequence(blueprint: IntentBlueprint): BlueprintGenerateRequest {
  const sourceIds = [...blueprint.coreSystems, ...blueprint.gameplaySystems].map((item) => item.typeId)
  const unique = [...new Set(sourceIds)]
  const resolution = moduleRegistry.resolveModuleDependencies(unique)
  const prioritized = resolution.resolved.length > 0 ? resolution.resolved : unique

  return {
    blueprint,
    moduleTypeIds: prioritized,
  }
}

export function applyBlueprintEdit(
  blueprint: IntentBlueprint,
  action: BlueprintEditAction,
  catalog: BlueprintCatalogItem[],
): IntentBlueprint {
  const catalogByType = new Map(catalog.map((item) => [item.typeId, item]))

  if (action.type === "remove_system") {
    const key = action.bucket === "core" ? "coreSystems" : "gameplaySystems"
    return normalizeBlueprint(
      {
        ...blueprint,
        [key]: blueprint[key].filter((item) => item.typeId !== action.typeId),
      },
      catalog,
    )
  }

  if (action.type === "add_system") {
    const target = catalogByType.get(action.typeId)
    if (!target) return blueprint

    const nextSystem: BlueprintSystemItem = {
      typeId: target.typeId,
      name: getSystemLabel(target.typeId, target.name),
      category: target.category,
    }

    const key = action.bucket === "core" ? "coreSystems" : "gameplaySystems"
    return normalizeBlueprint(
      {
        ...blueprint,
        [key]: [...blueprint[key], nextSystem],
      },
      catalog,
    )
  }

  if (action.type === "reorder_level_section") {
    const from = clamp(action.fromIndex, 0, Math.max(blueprint.levelStructure.length - 1, 0))
    const to = clamp(action.toIndex, 0, Math.max(blueprint.levelStructure.length - 1, 0))
    if (from === to) return blueprint
    const next = [...blueprint.levelStructure]
    const [moved] = next.splice(from, 1)
    if (!moved) return blueprint
    next.splice(to, 0, moved)
    return normalizeBlueprint(
      {
        ...blueprint,
        levelStructure: next,
      },
      catalog,
    )
  }

  return blueprint
}

export function remapEdgesForCollapsedGroups(
  nodes: ModuleNode[],
  groups: ModuleGroup[],
  edges: DependencyEdge[],
): DependencyEdge[] {
  const typeToCollapsedGroup = new Map<string, string>()
  const nodeById = new Map(nodes.map((node) => [node.id, node]))

  groups
    .filter((group) => group.collapsed)
    .forEach((group) => {
      group.nodeIds.forEach((nodeId) => {
        const node = nodeById.get(nodeId)
        if (!node || node.isGroup) return
        typeToCollapsedGroup.set(node.typeId, `group:${group.id}`)
      })
    })

  const dedupe = new Set<string>()
  const remapped: DependencyEdge[] = []

  edges.forEach((edge) => {
    const fromTypeId = typeToCollapsedGroup.get(edge.fromTypeId) ?? edge.fromTypeId
    const toTypeId = typeToCollapsedGroup.get(edge.toTypeId) ?? edge.toTypeId
    if (fromTypeId === toTypeId) return

    const key = `${fromTypeId}->${toTypeId}:${edge.kind}`
    if (dedupe.has(key)) return
    dedupe.add(key)
    remapped.push({
      fromTypeId,
      toTypeId,
      kind: edge.kind,
    })
  })

  return remapped
}

export function deriveGroupBounds(nodes: ModuleNode[], nodeIds: string[], padding = 28) {
  const members = nodes.filter((node) => nodeIds.includes(node.id))
  if (members.length === 0) {
    return { x: 120, y: 120, width: 280, height: 180 }
  }

  const minX = Math.min(...members.map((node) => node.x))
  const minY = Math.min(...members.map((node) => node.y))
  const maxX = Math.max(...members.map((node) => node.x + 244))
  const maxY = Math.max(...members.map((node) => node.y + 128))

  return {
    x: minX - padding,
    y: minY - padding,
    width: maxX - minX + padding * 2,
    height: maxY - minY + padding * 2,
  }
}

export function detectBuildGaps(nodes: ModuleNode[], timelineSections: LevelSection[]): CopilotSuggestion[] {
  const presentTypes = new Set(nodes.filter((node) => !node.isGroup).map((node) => node.typeId))
  const suggestions: CopilotSuggestion[] = []
  const missingDependencyIds = nodes
    .filter((node) => !node.isGroup)
    .flatMap((node) =>
      node.dependencies
        .filter((dependencyId) => !presentTypes.has(dependencyId))
        .map((dependencyId) => ({
          node,
          dependencyId,
        })),
    )

  missingDependencyIds
    .sort((left, right) => left.dependencyId.localeCompare(right.dependencyId))
    .forEach(({ node, dependencyId }) => {
      if (suggestions.some((suggestion) => suggestion.moduleTypeIds.includes(dependencyId))) return
      suggestions.push({
        id: `add-${dependencyId.replace(/[^\w]+/g, "-")}`,
        title: `Add ${getSystemLabel(dependencyId)}`,
        reason: `${getSystemLabel(node.typeId)} depends on ${getSystemLabel(dependencyId)} to run cleanly.`,
        moduleTypeIds: [dependencyId],
      })
    })

  const emptySections = timelineSections.filter((section) => section.moduleIds.length === 0)
  if (timelineSections.length > 0 && emptySections.length >= Math.ceil(timelineSections.length / 2)) {
    suggestions.push({
      id: "attach-modules-to-timeline",
      title: "Attach Modules to Timeline",
      reason: "Most level sections are unassigned; map modules to improve narrative flow.",
      moduleTypeIds: [],
    })
  }

  return suggestions.slice(0, 3)
}

export function buildNodeHighlightState(
  nodes: ModuleNode[],
  edges: DependencyEdge[],
  hoveredNodeId: string | null,
): NodeHighlightState {
  if (!hoveredNodeId) {
    return {
      hoveredNodeId: null,
      directNodeIds: [],
      transitiveNodeIds: [],
      directTypeIds: [],
      transitiveTypeIds: [],
    }
  }

  const hoveredNode = nodes.find((node) => node.id === hoveredNodeId)
  if (!hoveredNode) {
    return {
      hoveredNodeId: null,
      directNodeIds: [],
      transitiveNodeIds: [],
      directTypeIds: [],
      transitiveTypeIds: [],
    }
  }

  const nodesByType = new Map<string, ModuleNode[]>()
  nodes.forEach((node) => {
    const bucket = nodesByType.get(node.typeId)
    if (bucket) {
      bucket.push(node)
      return
    }
    nodesByType.set(node.typeId, [node])
  })

  const outgoing = new Map<string, Set<string>>()
  const incoming = new Map<string, Set<string>>()

  edges.forEach((edge) => {
    if (!outgoing.has(edge.fromTypeId)) {
      outgoing.set(edge.fromTypeId, new Set())
    }
    if (!incoming.has(edge.toTypeId)) {
      incoming.set(edge.toTypeId, new Set())
    }
    outgoing.get(edge.fromTypeId)?.add(edge.toTypeId)
    incoming.get(edge.toTypeId)?.add(edge.fromTypeId)
  })

  const directTypeIds = new Set<string>([
    ...(outgoing.get(hoveredNode.typeId) ?? []),
    ...(incoming.get(hoveredNode.typeId) ?? []),
  ])

  const transitiveTypeIds = new Set<string>()
  const queue: string[] = [hoveredNode.typeId]

  while (queue.length > 0) {
    const current = queue.shift()
    if (!current || transitiveTypeIds.has(current)) continue
    transitiveTypeIds.add(current)

    for (const next of outgoing.get(current) ?? []) {
      if (!transitiveTypeIds.has(next)) queue.push(next)
    }

    for (const previous of incoming.get(current) ?? []) {
      if (!transitiveTypeIds.has(previous)) queue.push(previous)
    }
  }

  const directNodeIds = [...directTypeIds].flatMap((typeId) => (nodesByType.get(typeId) ?? []).map((node) => node.id))
  const transitiveNodeIds = [...transitiveTypeIds].flatMap((typeId) =>
    (nodesByType.get(typeId) ?? []).map((node) => node.id),
  )

  return {
    hoveredNodeId,
    directNodeIds,
    transitiveNodeIds,
    directTypeIds: [...directTypeIds],
    transitiveTypeIds: [...transitiveTypeIds],
  }
}

export function buildPlanningSteps(promptIntentLabel: string): AIPlanningStep[] {
  return buildGraphAnimationPlan(promptIntentLabel, []).planningSteps
}

export type PlanningAction =
  | { type: "reset"; steps: AIPlanningStep[] }
  | { type: "start" }
  | { type: "advance"; stepId: string }
  | { type: "complete" }

export function planningStepsReducer(state: AIPlanningStep[], action: PlanningAction): AIPlanningStep[] {
  switch (action.type) {
    case "reset":
      return action.steps
    case "start":
      return state.map((step, index) => ({
        ...step,
        status: index === 0 ? "running" : "pending",
      }))
    case "advance": {
      const currentIndex = state.findIndex((step) => step.id === action.stepId)
      if (currentIndex === -1) return state
      return state.map((step, index) => {
        if (index <= currentIndex) return { ...step, status: "done" }
        if (index === currentIndex + 1) return { ...step, status: "running" }
        return { ...step, status: "pending" }
      })
    }
    case "complete":
      return state.map((step) => ({ ...step, status: "done" }))
    default:
      return state
  }
}

function normalizeSystemKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s-]+/g, "_")
}

function toHumanLabel(value: string) {
  const normalized = value
    .replace(/[_-]+/g, " ")
    .trim()
    .replace(/\s+/g, " ")

  if (!normalized) return ""
  return normalized.replace(/\b\w/g, (char) => char.toUpperCase())
}

function deriveDepthByType(edges: DependencyEdge[], nodes: ModuleNode[]) {
  const types = new Set(nodes.map((node) => node.typeId))
  const incomingCount = new Map<string, number>()
  const outgoing = new Map<string, string[]>()

  types.forEach((typeId) => {
    incomingCount.set(typeId, 0)
    outgoing.set(typeId, [])
  })

  edges.forEach((edge) => {
    if (!types.has(edge.fromTypeId) || !types.has(edge.toTypeId)) return
    outgoing.set(edge.fromTypeId, [...(outgoing.get(edge.fromTypeId) ?? []), edge.toTypeId])
    incomingCount.set(edge.toTypeId, (incomingCount.get(edge.toTypeId) ?? 0) + 1)
  })

  const queue = [...types].filter((typeId) => (incomingCount.get(typeId) ?? 0) === 0)
  const depth = new Map<string, number>()
  queue.forEach((typeId) => depth.set(typeId, 0))

  while (queue.length > 0) {
    const current = queue.shift()
    if (!current) continue
    const currentDepth = depth.get(current) ?? 0
    const neighbors = outgoing.get(current) ?? []

    neighbors.forEach((neighbor) => {
      const nextDepth = Math.max(depth.get(neighbor) ?? 0, currentDepth + 1)
      depth.set(neighbor, nextDepth)
      incomingCount.set(neighbor, (incomingCount.get(neighbor) ?? 1) - 1)
      if ((incomingCount.get(neighbor) ?? 0) <= 0) {
        queue.push(neighbor)
      }
    })
  }

  types.forEach((typeId) => {
    if (!depth.has(typeId)) depth.set(typeId, 0)
  })

  return depth
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}
