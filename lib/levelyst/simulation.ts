import { blueprintPlanSchema, type BlueprintPlan, type GameType, type PrototypeSpec, type RuntimeTarget } from "@levelyst/contracts"
import { resolveRequiredModules } from "@levelyst/dependency-resolver"
import { createSeededModuleRegistry } from "@levelyst/module-registry"
import { PrototypeSpecCompiler } from "@levelyst/spec-compiler"
import type { IntentBlueprint, ProjectRecord, ProjectWorkspace } from "@/lib/editor-v2-model"
import { getEditorModuleTemplate } from "@/lib/levelyst/adapters/editor-v2"

const moduleRegistry = createSeededModuleRegistry()

export interface PreparedSimulationProject {
  blueprintPlan: BlueprintPlan
  prototypeSpec: PrototypeSpec
}

export function buildBlueprintPlanFromIntentBlueprint(blueprint: IntentBlueprint): BlueprintPlan {
  const gameType = blueprint.gameType === "3d_fps" ? "3d_fps" : "2d_platformer"
  const runtimeTarget = gameType === "3d_fps" ? "web_3d" : "web_2d"

  return blueprintPlanSchema.parse({
    game_type: gameType,
    core_systems: dedupeAndSort(blueprint.coreSystems.map((system) => system.typeId)),
    gameplay_systems: dedupeAndSort(blueprint.gameplaySystems.map((system) => system.typeId)),
    required_modules: dedupeAndSort([
      ...blueprint.coreSystems.map((system) => system.typeId),
      ...blueprint.gameplaySystems.map((system) => system.typeId),
    ]),
    environment: blueprint.environment,
    level_structure: blueprint.levelStructure.map(canonicalizeLevelSection),
    constraints: {
      target_runtime: runtimeTarget,
    },
  })
}

export function serializeWorkspaceToBlueprintPlan(
  workspace: ProjectWorkspace,
  previousBlueprintPlan: BlueprintPlan | null,
): BlueprintPlan {
  const realNodes = workspace.nodes.filter((node) => !node.isGroup)
  if (realNodes.length === 0) {
    throw new Error("Add at least one gameplay module before starting simulation.")
  }

  const moduleTypeIds = dedupeAndSort(realNodes.map((node) => node.typeId))
  const templates = moduleTypeIds.map((typeId) => {
    const template = getEditorModuleTemplate(typeId)
    if (!template) {
      throw new Error(`Unknown module "${typeId}" in the current workspace.`)
    }
    return template
  })

  const runtimeTargets = dedupeAndSort(templates.map((template) => template.engineTarget))
  if (runtimeTargets.length > 1) {
    throw new Error("Simulation requires modules that target a single runtime. Remove mixed 2D and 3D modules before launching.")
  }

  const runtimeTarget = (runtimeTargets[0] ?? previousBlueprintPlan?.constraints.target_runtime ?? "web_2d") as RuntimeTarget
  const gameType = inferGameType(runtimeTarget)
  const levelStructure = dedupeOrdered(
    workspace.timelineSections
      .slice()
      .sort((left, right) => left.order - right.order)
      .map((section) => canonicalizeLevelSection(section.title))
      .filter(Boolean),
  )

  const coreSystems = dedupeAndSort(templates.filter((template) => template.category === "CORE").map((template) => template.typeId))
  const gameplaySystems = dedupeAndSort(
    templates.filter((template) => template.category !== "CORE").map((template) => template.typeId),
  )

  return blueprintPlanSchema.parse({
    game_type: gameType,
    core_systems: coreSystems.length > 0 ? coreSystems : [moduleTypeIds[0]],
    gameplay_systems: gameplaySystems,
    required_modules: moduleTypeIds,
    environment:
      previousBlueprintPlan?.environment ??
      (runtimeTarget === "web_3d" ? "warehouse_small" : "graybox_rooftops"),
    level_structure: levelStructure.length > 0 ? levelStructure : ["intro", "gameplay_loop", "end"],
    constraints: {
      target_runtime: runtimeTarget,
    },
  })
}

export function prepareSimulationProject(project: ProjectRecord): PreparedSimulationProject {
  const blueprintPlan = serializeWorkspaceToBlueprintPlan(project.workspace, project.blueprintPlan)
  const resolvedModules = resolveRequiredModules({
    required_modules: blueprintPlan.required_modules,
    runtime_target: blueprintPlan.constraints.target_runtime,
    registry: moduleRegistry,
  })

  if (!resolvedModules.valid) {
    throw new Error(`Unable to resolve a valid prototype graph: ${formatResolutionErrors(resolvedModules.errors)}`)
  }

  return {
    blueprintPlan,
    prototypeSpec: PrototypeSpecCompiler.compile(blueprintPlan, resolvedModules),
  }
}

function formatResolutionErrors(errors: Array<{ type: string; module_id?: string; required_by?: string | null; cycle?: string[] }>) {
  return errors
    .map((error) => {
      if (error.type === "missing_module") {
        return `missing module "${error.module_id}"${error.required_by ? ` required by "${error.required_by}"` : ""}`
      }

      if (error.type === "runtime_target_conflict") {
        return `runtime conflict on "${error.module_id}"${error.required_by ? ` required by "${error.required_by}"` : ""}`
      }

      if (error.type === "dependency_cycle") {
        return `dependency cycle ${error.cycle?.join(" -> ")}`
      }

      return error.type
    })
    .join("; ")
}

function inferGameType(runtimeTarget: RuntimeTarget): GameType {
  return runtimeTarget === "web_3d" ? "3d_fps" : "2d_platformer"
}

function canonicalizeLevelSection(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
}

function dedupeAndSort(values: string[]) {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right))
}

function dedupeOrdered(values: string[]) {
  const seen = new Set<string>()
  return values.filter((value) => {
    if (seen.has(value)) return false
    seen.add(value)
    return true
  })
}
