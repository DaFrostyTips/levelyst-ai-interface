import { moduleDefinitionSchema, type ModuleDefinition, type ModuleCategory, type RuntimeTarget } from "@levelyst/contracts"
import {
  resolveRequiredModules,
  type ResolvedModules,
} from "@levelyst/dependency-resolver"
import seedModules from "./seed/modules.json"

export interface ListModulesFilters {
  ids?: string[]
  category?: ModuleCategory
  engine_target?: RuntimeTarget
  search?: string
}

export type ModuleDependencyResolution = ResolvedModules

export class ModuleRegistryService {
  private readonly modules = new Map<string, ModuleDefinition>()

  constructor(initialModules: unknown[] = []) {
    initialModules.forEach((module) => this.registerModule(module))
  }

  registerModule(module: unknown): ModuleDefinition {
    const parsed = moduleDefinitionSchema.parse(module)
    if (this.modules.has(parsed.id)) {
      throw new Error(`Module "${parsed.id}" is already registered.`)
    }

    const cloned = cloneModuleDefinition(parsed)
    this.modules.set(cloned.id, cloned)
    return cloneModuleDefinition(cloned)
  }

  getModule(id: string): ModuleDefinition | null {
    const module = this.modules.get(id)
    return module ? cloneModuleDefinition(module) : null
  }

  listModules(filters: ListModulesFilters = {}): ModuleDefinition[] {
    const requestedIds = filters.ids ? new Set(filters.ids) : null
    const search = filters.search?.trim().toLowerCase()

    return [...this.modules.values()]
      .filter((module) => (requestedIds ? requestedIds.has(module.id) : true))
      .filter((module) => (filters.category ? module.category === filters.category : true))
      .filter((module) => (filters.engine_target ? module.engine_target === filters.engine_target : true))
      .filter((module) => {
        if (!search) return true
        return module.id.toLowerCase().includes(search) || module.category.toLowerCase().includes(search)
      })
      .sort((left, right) => left.id.localeCompare(right.id))
      .map(cloneModuleDefinition)
  }

  resolveModuleDependencies(moduleIds: string[]): ModuleDependencyResolution {
    const inferredRuntimeTarget = [...new Set(moduleIds)]
      .map((moduleId) => this.modules.get(moduleId)?.engine_target)
      .find((target): target is RuntimeTarget => Boolean(target)) ?? "web_2d"

    return resolveRequiredModules({
      required_modules: moduleIds,
      runtime_target: inferredRuntimeTarget,
      registry: this,
    })
  }
}

export const seedModuleDefinitions = moduleDefinitionSchema.array().parse(seedModules)
export const createSeededModuleRegistry = () => new ModuleRegistryService(seedModuleDefinitions)

function cloneModuleDefinition(module: ModuleDefinition): ModuleDefinition {
  return {
    ...module,
    inputs: [...module.inputs],
    outputs: [...module.outputs],
    dependencies: [...module.dependencies],
    compatible_with: [...module.compatible_with],
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
