import {
  blueprintPlanSchema,
  patchOperationSchema,
  prototypeSpecSchema,
  type BlueprintPlan,
  type JsonValue,
  type ModuleDefinition,
  type PatchOperation,
  type PrototypeEntity,
  type PrototypeSpec,
  type PrototypeSystem,
} from "@levelyst/contracts"
import {
  resolveRequiredModules,
  type ModuleLookup,
  type ResolvedModules,
} from "@levelyst/dependency-resolver"

export interface SpecCompilerServices {
  registry: ModuleLookup
}

export class PrototypeSpecCompiler {
  static compile(blueprint: BlueprintPlan, resolvedModules: ResolvedModules): PrototypeSpec {
    const parsedBlueprint = blueprintPlanSchema.parse(blueprint)

    if (!resolvedModules.valid) {
      throw new Error(`Cannot compile prototype spec from invalid resolved modules: ${formatResolutionErrors(resolvedModules.errors)}`)
    }

    const orderedModules = resolvedModules.ordered_modules
    const moduleMap = new Map(orderedModules.map((module) => [module.id, module]))

    const playerRootIds = orderedModules
      .filter((module) => ["player_mechanics", "camera", "combat"].includes(module.category))
      .map((module) => module.id)

    const enemyRootIds = orderedModules
      .filter((module) => module.category === "enemy_ai")
      .map((module) => module.id)

    const entities: PrototypeEntity[] = []
    const assignedModuleIds = new Set<string>()

    const playerModules = collectEntityModuleIds(playerRootIds, orderedModules, moduleMap)
    if (playerModules.length > 0) {
      playerModules.forEach((moduleId) => assignedModuleIds.add(moduleId))
      entities.push({
        id: "player_1",
        kind: "player",
        modules: playerModules,
        module_configs: buildModuleConfigs(playerModules, moduleMap),
      })
    }

    enemyRootIds.forEach((enemyModuleId, index) => {
      const enemyModules = collectEntityModuleIds([enemyModuleId], orderedModules, moduleMap)
      enemyModules.forEach((moduleId) => assignedModuleIds.add(moduleId))
      entities.push({
        id: `enemy_${index + 1}`,
        kind: "enemy",
        modules: enemyModules,
        module_configs: buildModuleConfigs(enemyModules, moduleMap),
      })
    })

    const systems: PrototypeSystem[] = orderedModules
      .filter((module) => isSystemModule(module))
      .map((module) => ({
        id: buildSystemEntryId(module.id),
        module: module.id,
        config: collectDefaultConfig(module),
      }))

    const unassignedEntityModules = orderedModules
      .filter((module) => !isSystemModule(module))
      .map((module) => module.id)
      .filter((moduleId) => !assignedModuleIds.has(moduleId))

    if (unassignedEntityModules.length > 0) {
      throw new Error(`Compiler could not assign resolved modules to entities: ${unassignedEntityModules.join(", ")}`)
    }

    return prototypeSpecSchema.parse({
      runtime: parsedBlueprint.constraints.target_runtime,
      scene: {
        environment: parsedBlueprint.environment,
        level_structure: parsedBlueprint.level_structure,
        parameters: {},
      },
      entities,
      systems,
      ui: {
        hud: [],
        panels: [],
        metadata: {},
      },
    })
  }
}

export function applyPatchOperation(spec: PrototypeSpec, operation: PatchOperation, services: SpecCompilerServices): PrototypeSpec {
  const parsedSpec = prototypeSpecSchema.parse(spec)
  const parsedOperation = patchOperationSchema.parse(operation)

  switch (parsedOperation.op) {
    case "add_module":
      return addModuleToEntity(parsedSpec, parsedOperation.entity_id, parsedOperation.module, services)
    case "remove_module":
      return removeModuleFromEntity(parsedSpec, parsedOperation.entity_id, parsedOperation.module, services)
    case "update_module_config":
      return updateEntityModuleConfig(parsedSpec, parsedOperation.entity_id, parsedOperation.module, parsedOperation.changes)
    case "add_system":
      return addSystemToSpec(parsedSpec, parsedOperation.module, parsedOperation.changes, services)
    case "remove_system":
      return removeSystemFromSpec(parsedSpec, parsedOperation.module, services)
    case "reorder_level_structure":
      return prototypeSpecSchema.parse({
        ...parsedSpec,
        scene: {
          ...parsedSpec.scene,
          level_structure: [...parsedOperation.level_structure],
        },
      })
    case "update_environment":
      return prototypeSpecSchema.parse({
        ...parsedSpec,
        scene: {
          ...parsedSpec.scene,
          environment: parsedOperation.environment,
        },
      })
    case "update_scene_parameters":
      return prototypeSpecSchema.parse({
        ...parsedSpec,
        scene: {
          ...parsedSpec.scene,
          parameters: {
            ...parsedSpec.scene.parameters,
            ...parsedOperation.changes,
          },
        },
      })
    case "move_graph_node_layout":
      return parsedSpec
  }
}

export function applyPatchOperations(
  spec: PrototypeSpec,
  operations: PatchOperation[],
  services: SpecCompilerServices,
): PrototypeSpec {
  return operations.reduce(
    (currentSpec, operation) => applyPatchOperation(currentSpec, operation, services),
    prototypeSpecSchema.parse(spec),
  )
}

function addModuleToEntity(
  spec: PrototypeSpec,
  entityId: string,
  moduleId: string,
  services: SpecCompilerServices,
): PrototypeSpec {
  const entity = findEntity(spec, entityId)
  const targetModule = getModuleOrThrow(services.registry, moduleId)

  if (isSystemModule(targetModule)) {
    throw new Error(`Module "${moduleId}" must be added with add_system, not add_module.`)
  }

  const resolution = resolveRequiredModules({
    required_modules: [...entity.modules, moduleId],
    runtime_target: spec.runtime,
    registry: services.registry,
  })

  if (!resolution.valid) {
    throw new Error(`Cannot add module "${moduleId}" to "${entityId}": ${formatResolutionErrors(resolution.errors)}`)
  }

  const disallowedSystemDependencies = resolution.ordered_modules.filter((module) => isSystemModule(module))
  if (disallowedSystemDependencies.length > 0) {
    throw new Error(
      `Cannot add module "${moduleId}" to "${entityId}" because it requires global systems: ${disallowedSystemDependencies
        .map((module) => module.id)
        .join(", ")}`,
    )
  }

  const nextModuleIds = resolution.ordered_modules.map((module) => module.id)
  const moduleMap = new Map(resolution.ordered_modules.map((module) => [module.id, module]))

  return updateEntity(spec, entityId, {
    modules: nextModuleIds,
    module_configs: mergeModuleConfigs(entity.module_configs, nextModuleIds, moduleMap),
  })
}

function removeModuleFromEntity(
  spec: PrototypeSpec,
  entityId: string,
  moduleId: string,
  services: SpecCompilerServices,
): PrototypeSpec {
  const entity = findEntity(spec, entityId)
  if (!entity.modules.includes(moduleId)) {
    throw new Error(`Entity "${entityId}" does not include module "${moduleId}".`)
  }

  const remainingModules = entity.modules.filter((installedModuleId) => installedModuleId !== moduleId)
  if (remainingModules.length === 0) {
    throw new Error(`Removing "${moduleId}" would leave entity "${entityId}" with no modules.`)
  }

  const rootModuleIds = deriveRootModules(remainingModules, services.registry)
  if (rootModuleIds.length === 0) {
    throw new Error(`Entity "${entityId}" has no valid root modules after removing "${moduleId}".`)
  }

  const resolution = resolveRequiredModules({
    required_modules: rootModuleIds,
    runtime_target: spec.runtime,
    registry: services.registry,
  })

  if (!resolution.valid) {
    throw new Error(`Cannot remove module "${moduleId}" from "${entityId}": ${formatResolutionErrors(resolution.errors)}`)
  }

  const nextModuleIds = resolution.ordered_modules.filter((module) => !isSystemModule(module)).map((module) => module.id)
  const moduleMap = new Map(resolution.ordered_modules.map((module) => [module.id, module]))

  return updateEntity(spec, entityId, {
    modules: nextModuleIds,
    module_configs: mergeModuleConfigs(entity.module_configs, nextModuleIds, moduleMap),
  })
}

function updateEntityModuleConfig(
  spec: PrototypeSpec,
  entityId: string,
  moduleId: string,
  changes: Record<string, JsonValue>,
): PrototypeSpec {
  const entity = findEntity(spec, entityId)
  if (!entity.modules.includes(moduleId)) {
    throw new Error(`Entity "${entityId}" does not include module "${moduleId}".`)
  }

  return updateEntity(spec, entityId, {
    module_configs: {
      ...entity.module_configs,
      [moduleId]: {
        ...(entity.module_configs[moduleId] ?? {}),
        ...changes,
      },
    },
  })
}

function addSystemToSpec(
  spec: PrototypeSpec,
  moduleId: string,
  changes: Record<string, JsonValue>,
  services: SpecCompilerServices,
): PrototypeSpec {
  const module = getModuleOrThrow(services.registry, moduleId)
  if (!isSystemModule(module)) {
    throw new Error(`Module "${moduleId}" must be added with add_module, not add_system.`)
  }

  const resolution = resolveRequiredModules({
    required_modules: [moduleId],
    runtime_target: spec.runtime,
    registry: services.registry,
  })

  if (!resolution.valid) {
    throw new Error(`Cannot add system "${moduleId}": ${formatResolutionErrors(resolution.errors)}`)
  }

  const installedModules = collectInstalledModuleIds(spec)
  const missingDependencies = resolution.ordered_modules
    .map((resolvedModule) => resolvedModule.id)
    .filter((resolvedModuleId) => resolvedModuleId !== moduleId)
    .filter((resolvedModuleId) => !installedModules.has(resolvedModuleId))

  if (missingDependencies.length > 0) {
    throw new Error(`Cannot add system "${moduleId}" because dependencies are missing from the current spec: ${missingDependencies.join(", ")}`)
  }

  const nextSystems = [...spec.systems]
  const existingIndex = nextSystems.findIndex((system) => system.module === moduleId)
  const nextSystem = {
    id: buildSystemEntryId(moduleId),
    module: moduleId,
    config: {
      ...collectDefaultConfig(module),
      ...changes,
    },
  }

  if (existingIndex === -1) {
    nextSystems.push(nextSystem)
  } else {
    nextSystems[existingIndex] = {
      ...nextSystems[existingIndex],
      config: {
        ...nextSystems[existingIndex].config,
        ...changes,
      },
    }
  }

  return prototypeSpecSchema.parse({
    ...spec,
    systems: nextSystems,
  })
}

function removeSystemFromSpec(spec: PrototypeSpec, moduleId: string, services: SpecCompilerServices): PrototypeSpec {
  const systemIndex = spec.systems.findIndex((system) => system.module === moduleId)
  if (systemIndex === -1) {
    throw new Error(`System "${moduleId}" is not present in the current spec.`)
  }

  const remainingSystems = spec.systems.filter((system) => system.module !== moduleId)
  for (const system of remainingSystems) {
    const resolution = resolveRequiredModules({
      required_modules: [system.module],
      runtime_target: spec.runtime,
      registry: services.registry,
    })

    if (resolution.resolved.includes(moduleId)) {
      throw new Error(`Cannot remove system "${moduleId}" because "${system.module}" still depends on it.`)
    }
  }

  return prototypeSpecSchema.parse({
    ...spec,
    systems: remainingSystems,
  })
}

function collectEntityModuleIds(
  rootModuleIds: string[],
  orderedModules: ModuleDefinition[],
  moduleMap: Map<string, ModuleDefinition>,
): string[] {
  const included = new Set<string>()

  const visit = (moduleId: string) => {
    const module = moduleMap.get(moduleId)
    if (!module || included.has(moduleId) || isSystemModule(module)) return
    included.add(moduleId)
    module.dependencies.forEach(visit)
  }

  rootModuleIds.forEach(visit)

  return orderedModules
    .map((module) => module.id)
    .filter((moduleId) => included.has(moduleId))
}

function buildModuleConfigs(moduleIds: string[], moduleMap: Map<string, ModuleDefinition>) {
  return Object.fromEntries(
    moduleIds.map((moduleId) => [moduleId, collectDefaultConfig(moduleMap.get(moduleId))]),
  )
}

function mergeModuleConfigs(
  existingConfigs: PrototypeEntity["module_configs"],
  nextModuleIds: string[],
  moduleMap: Map<string, ModuleDefinition>,
) {
  return Object.fromEntries(
    nextModuleIds.map((nextModuleId) => [
      nextModuleId,
      {
        ...collectDefaultConfig(moduleMap.get(nextModuleId)),
        ...(existingConfigs[nextModuleId] ?? {}),
      },
    ]),
  )
}

function collectDefaultConfig(module: ModuleDefinition | undefined) {
  if (!module) return {}

  return Object.fromEntries(
    Object.entries(module.config_schema)
      .filter(([, value]) => value.default !== undefined)
      .map(([key, value]) => [key, value.default as JsonValue]),
  )
}

function deriveRootModules(moduleIds: string[], registry: ModuleLookup) {
  const installedIds = new Set(moduleIds)
  const requiredByOthers = new Set<string>()

  const collectDependencies = (moduleId: string, visited = new Set<string>()) => {
    if (visited.has(moduleId)) return
    visited.add(moduleId)
    const module = registry.getModule(moduleId)
    if (!module) return
    for (const dependencyId of module.dependencies) {
      if (!installedIds.has(dependencyId)) continue
      requiredByOthers.add(dependencyId)
      collectDependencies(dependencyId, visited)
    }
  }

  moduleIds.forEach((moduleId) => collectDependencies(moduleId))

  return moduleIds
    .filter((moduleId) => !requiredByOthers.has(moduleId))
    .sort((left, right) => left.localeCompare(right))
}

function findEntity(spec: PrototypeSpec, entityId: string) {
  const entity = spec.entities.find((candidate) => candidate.id === entityId)
  if (!entity) {
    throw new Error(`Entity "${entityId}" does not exist in the current spec.`)
  }
  return entity
}

function updateEntity(spec: PrototypeSpec, entityId: string, patch: Partial<PrototypeEntity>) {
  return prototypeSpecSchema.parse({
    ...spec,
    entities: spec.entities.map((entity) => (entity.id === entityId ? { ...entity, ...patch } : entity)),
  })
}

function collectInstalledModuleIds(spec: PrototypeSpec) {
  return new Set([
    ...spec.entities.flatMap((entity) => entity.modules),
    ...spec.systems.map((system) => system.module),
  ])
}

function isSystemModule(module: ModuleDefinition) {
  return module.category === "systems" || module.category === "ui"
}

function getModuleOrThrow(registry: ModuleLookup, moduleId: string) {
  const module = registry.getModule(moduleId)
  if (!module) {
    throw new Error(`Module "${moduleId}" is not registered.`)
  }
  return module
}

function buildSystemEntryId(moduleId: string) {
  return `system_${moduleId.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "")}`
}

function formatResolutionErrors(errors: ResolvedModules["errors"]) {
  return errors
    .map((error) => {
      if (error.type === "missing_module") {
        return `missing ${error.module_id}${error.required_by ? ` (required by ${error.required_by})` : ""}`
      }
      if (error.type === "runtime_target_conflict") {
        return `${error.module_id} targets ${error.module_engine_target}, expected ${error.required_runtime_target}`
      }
      return `cycle ${error.cycle.join(" -> ")}`
    })
    .join("; ")
}
