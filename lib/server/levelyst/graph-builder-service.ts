import {
  moduleGraphSchema,
  type BlueprintPlan,
  type ModuleGraph,
  type ModuleGraphEdge,
  type ModuleGraphNode,
} from "@levelyst/contracts"
import { resolveRequiredModules, type ResolvedModules } from "@levelyst/dependency-resolver"
import { createSeededModuleRegistry } from "@levelyst/module-registry"

const moduleRegistry = createSeededModuleRegistry()
const COLUMN_WIDTH = 300
const ROW_HEIGHT = 168
const START_X = 140
const START_Y = 140
const WORLD_WIDTH = 2600
const WORLD_HEIGHT = 1800
const NODE_WIDTH = 244
const NODE_HEIGHT = 128

export interface BuiltModuleGraph {
  module_graph: ModuleGraph
  resolved_modules: ResolvedModules
}

export function buildModuleGraph(blueprintPlan: BlueprintPlan, previousGraph: ModuleGraph | null = null): BuiltModuleGraph {
  const resolvedModules = resolveRequiredModules({
    required_modules: blueprintPlan.required_modules,
    runtime_target: blueprintPlan.constraints.target_runtime,
    registry: moduleRegistry,
  })

  if (!resolvedModules.valid) {
    throw new Error(
      `Module graph could not be resolved: ${resolvedModules.errors
        .map((error) => (error.type === "dependency_cycle" ? error.cycle.join(" -> ") : error.module_id))
        .join(", ")}`,
    )
  }

  const depthByModuleId = new Map<string, number>()
  const moduleMap = new Map(resolvedModules.ordered_modules.map((module) => [module.id, module]))
  const previousPositionByNodeId = new Map((previousGraph?.nodes ?? []).map((node) => [node.id, node.position]))

  const getDepth = (moduleId: string): number => {
    const cached = depthByModuleId.get(moduleId)
    if (cached !== undefined) return cached

    const module = moduleMap.get(moduleId)
    if (!module || module.dependencies.length === 0) {
      depthByModuleId.set(moduleId, 0)
      return 0
    }

    const depth = Math.max(...module.dependencies.map((dependencyId) => getDepth(dependencyId))) + 1
    depthByModuleId.set(moduleId, depth)
    return depth
  }

  resolvedModules.ordered_modules.forEach((module) => getDepth(module.id))

  const rowsByDepth = new Map<number, string[]>()
  resolvedModules.ordered_modules
    .slice()
    .sort((left, right) => {
      const depthDelta = (depthByModuleId.get(left.id) ?? 0) - (depthByModuleId.get(right.id) ?? 0)
      if (depthDelta !== 0) return depthDelta
      const categoryDelta = left.category.localeCompare(right.category)
      if (categoryDelta !== 0) return categoryDelta
      return left.id.localeCompare(right.id)
    })
    .forEach((module) => {
      const depth = depthByModuleId.get(module.id) ?? 0
      const rows = rowsByDepth.get(depth) ?? []
      rows.push(module.id)
      rowsByDepth.set(depth, rows)
    })

  const hasPreviousLayout = (previousGraph?.nodes.length ?? 0) > 0
  const freshLayoutOrigin = resolveFreshLayoutOrigin(rowsByDepth)

  const nodes = resolvedModules.ordered_modules.map<ModuleGraphNode>((module) => {
    const previousPosition = previousPositionByNodeId.get(module.id)
    if (previousPosition) {
      return {
        id: module.id,
        module_id: module.id,
        category: module.category,
        position: previousPosition,
      }
    }

    const depth = depthByModuleId.get(module.id) ?? 0
    const rowIndex = (rowsByDepth.get(depth) ?? []).indexOf(module.id)
    return {
      id: module.id,
      module_id: module.id,
      category: module.category,
      position: {
        x: (hasPreviousLayout ? START_X : freshLayoutOrigin.x) + depth * COLUMN_WIDTH,
        y: (hasPreviousLayout ? START_Y : freshLayoutOrigin.y) + Math.max(0, rowIndex) * ROW_HEIGHT,
      },
    }
  })

  const edges = resolvedModules.graph.edges
    .map<ModuleGraphEdge>((edge) => ({
      id: `edge_${edge.to.replaceAll("/", "_")}_${edge.from.replaceAll("/", "_")}`,
      from_node_id: edge.to,
      to_node_id: edge.from,
      kind: "requires",
    }))
    .sort((left, right) => {
      const fromDelta = left.from_node_id.localeCompare(right.from_node_id)
      if (fromDelta !== 0) return fromDelta
      return left.to_node_id.localeCompare(right.to_node_id)
    })

  return {
    module_graph: moduleGraphSchema.parse({
      nodes: nodes.sort((left, right) => left.id.localeCompare(right.id)),
      edges,
    }),
    resolved_modules: resolvedModules,
  }
}

function resolveFreshLayoutOrigin(rowsByDepth: Map<number, string[]>) {
  const columnCount = Math.max(rowsByDepth.size, 1)
  const rowCount = Math.max(...[...rowsByDepth.values()].map((rows) => rows.length), 1)
  const clusterWidth = (columnCount - 1) * COLUMN_WIDTH + NODE_WIDTH
  const clusterHeight = (rowCount - 1) * ROW_HEIGHT + NODE_HEIGHT

  return {
    x: Math.max(12, Math.round(WORLD_WIDTH / 2 - clusterWidth / 2)),
    y: Math.max(12, Math.round(WORLD_HEIGHT / 2 - clusterHeight / 2)),
  }
}
