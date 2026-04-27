import type { ModuleDefinition, RuntimeTarget } from "@levelyst/contracts"

export interface ModuleLookup {
  getModule(id: string): ModuleDefinition | null
}

export interface DependencyGraphEdge {
  from: string
  to: string
  kind: "requires"
}

export interface DependencyGraph {
  nodes: string[]
  edges: DependencyGraphEdge[]
}

export interface MissingModuleError {
  type: "missing_module"
  module_id: string
  required_by: string | null
}

export interface RuntimeTargetConflictError {
  type: "runtime_target_conflict"
  module_id: string
  module_engine_target: RuntimeTarget
  required_runtime_target: RuntimeTarget
  required_by: string | null
}

export interface DependencyCycleError {
  type: "dependency_cycle"
  cycle: string[]
}

export type DependencyResolutionError =
  | MissingModuleError
  | RuntimeTargetConflictError
  | DependencyCycleError

export interface ResolveRequiredModulesInput {
  required_modules: string[]
  runtime_target: RuntimeTarget
  registry: ModuleLookup
}

export interface ResolvedModules {
  requested: string[]
  resolved: string[]
  ordered_modules: ModuleDefinition[]
  graph: DependencyGraph
  errors: DependencyResolutionError[]
  valid: boolean
}

export function resolveRequiredModules(input: ResolveRequiredModulesInput): ResolvedModules {
  const requested = [...new Set(input.required_modules)].sort((left, right) => left.localeCompare(right))
  const orderedIds: string[] = []
  const errors: DependencyResolutionError[] = []
  const visitState = new Map<string, "visiting" | "visited">()
  const stack: string[] = []
  const graphNodeIds = new Set<string>()
  const graphEdgeKeys = new Set<string>()
  const graphEdges: DependencyGraphEdge[] = []
  const missingKeys = new Set<string>()
  const runtimeConflictKeys = new Set<string>()
  const cycleKeys = new Set<string>()

  const addMissingError = (moduleId: string, requiredBy: string | null) => {
    const key = `${moduleId}:${requiredBy ?? "root"}`
    if (missingKeys.has(key)) return
    missingKeys.add(key)
    errors.push({
      type: "missing_module",
      module_id: moduleId,
      required_by: requiredBy,
    })
  }

  const addRuntimeTargetConflictError = (
    moduleId: string,
    moduleEngineTarget: RuntimeTarget,
    requiredRuntimeTarget: RuntimeTarget,
    requiredBy: string | null,
  ) => {
    const key = `${moduleId}:${moduleEngineTarget}:${requiredRuntimeTarget}:${requiredBy ?? "root"}`
    if (runtimeConflictKeys.has(key)) return
    runtimeConflictKeys.add(key)
    errors.push({
      type: "runtime_target_conflict",
      module_id: moduleId,
      module_engine_target: moduleEngineTarget,
      required_runtime_target: requiredRuntimeTarget,
      required_by: requiredBy,
    })
  }

  const addCycleError = (cycle: string[]) => {
    const key = cycle.join("->")
    if (cycleKeys.has(key)) return
    cycleKeys.add(key)
    errors.push({
      type: "dependency_cycle",
      cycle,
    })
  }

  const addGraphEdge = (from: string, to: string) => {
    const key = `${from}->${to}`
    if (graphEdgeKeys.has(key)) return
    graphEdgeKeys.add(key)
    graphEdges.push({
      from,
      to,
      kind: "requires",
    })
  }

  const visit = (moduleId: string, requiredBy: string | null) => {
    const module = input.registry.getModule(moduleId)
    if (!module) {
      addMissingError(moduleId, requiredBy)
      return
    }

    graphNodeIds.add(module.id)

    if (module.engine_target !== input.runtime_target) {
      addRuntimeTargetConflictError(module.id, module.engine_target, input.runtime_target, requiredBy)
      return
    }

    const state = visitState.get(module.id)
    if (state === "visited") {
      return
    }

    if (state === "visiting") {
      const cycleStart = stack.indexOf(module.id)
      const cycle = [...stack.slice(cycleStart), module.id]
      addCycleError(cycle)
      return
    }

    visitState.set(module.id, "visiting")
    stack.push(module.id)

    const dependencyIds = [...module.dependencies].sort((left, right) => left.localeCompare(right))
    for (const dependencyId of dependencyIds) {
      addGraphEdge(module.id, dependencyId)
      visit(dependencyId, module.id)
    }

    stack.pop()
    visitState.set(module.id, "visited")
    orderedIds.push(module.id)
  }

  requested.forEach((moduleId) => visit(moduleId, null))

  const resolved = [...new Set(orderedIds)]
  const orderedModules = resolved
    .map((moduleId) => input.registry.getModule(moduleId))
    .filter((module): module is ModuleDefinition => Boolean(module))
    .map(cloneModuleDefinition)

  return {
    requested,
    resolved,
    ordered_modules: orderedModules,
    graph: {
      nodes: [...graphNodeIds].sort((left, right) => left.localeCompare(right)),
      edges: graphEdges.sort((left, right) => {
        const fromComparison = left.from.localeCompare(right.from)
        if (fromComparison !== 0) return fromComparison
        return left.to.localeCompare(right.to)
      }),
    },
    errors,
    valid: errors.length === 0,
  }
}

function cloneModuleDefinition(module: ModuleDefinition): ModuleDefinition {
  return {
    ...module,
    inputs: [...module.inputs],
    outputs: [...module.outputs],
    dependencies: [...module.dependencies],
    compatible_with: [...module.compatible_with],
    capabilities: module.capabilities ? [...module.capabilities] : undefined,
    prompt_aliases: module.prompt_aliases ? [...module.prompt_aliases] : undefined,
    config_schema: Object.fromEntries(
      Object.entries(module.config_schema).map(([key, value]) => [
        key,
        {
          ...value,
          enum: value.enum ? [...value.enum] : undefined,
        },
      ]),
    ),
  }
}
