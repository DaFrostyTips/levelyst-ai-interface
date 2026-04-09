import {
  editorWorkspaceSnapshotSchema,
  patchOperationSchema,
  type PatchOperation,
  type ProjectDetail,
} from "@levelyst/contracts"
import { createSeededModuleRegistry } from "@levelyst/module-registry"
import { applyPatchOperations } from "@levelyst/spec-compiler"
import { buildModuleGraph } from "./graph-builder-service"
import type { LevelystRepository } from "./project-repository"

const moduleRegistry = createSeededModuleRegistry()

export function persistWorkspaceSnapshot(
  repository: LevelystRepository,
  projectId: string,
  workspaceJson: ProjectDetail["workspace_json"],
) {
  return persistWorkspaceSnapshotAsync(repository, projectId, workspaceJson)
}

async function persistWorkspaceSnapshotAsync(
  repository: LevelystRepository,
  projectId: string,
  workspaceJson: ProjectDetail["workspace_json"],
) {
  const project = await repository.getProjectDetail(projectId)
  if (!project) {
    throw new Error(`Project "${projectId}" was not found.`)
  }

  const parsedWorkspace = editorWorkspaceSnapshotSchema.parse(workspaceJson)
  const nextModuleGraph = syncGraphPositions(project.module_graph, parsedWorkspace)

  return repository.updateProject(projectId, {
    workspace_json: parsedWorkspace,
    module_graph: nextModuleGraph,
  })
}

export function patchProjectSpec(repository: LevelystRepository, projectId: string, operations: PatchOperation[]) {
  return patchProjectSpecAsync(repository, projectId, operations)
}

async function patchProjectSpecAsync(repository: LevelystRepository, projectId: string, operations: PatchOperation[]) {
  const project = await repository.getProjectDetail(projectId)
  if (!project) {
    throw new Error(`Project "${projectId}" was not found.`)
  }

  if (!project.prototype_spec || !project.blueprint_json) {
    throw new Error("Project must have a compiled prototype spec before it can be patched.")
  }

  const parsedOperations = operations.map((operation) => patchOperationSchema.parse(operation))
  const nextPrototypeSpec = applyPatchOperations(project.prototype_spec, parsedOperations, { registry: moduleRegistry })
  const nextBlueprint = deriveBlueprintFromSpec(project.blueprint_json, nextPrototypeSpec)
  const builtGraph = buildModuleGraph(nextBlueprint, project.module_graph).module_graph
  const { moduleGraph: nextGraph, workspace: nextWorkspace } = applyLayoutOperations(
    builtGraph,
    syncWorkspaceWithGraph(project.workspace_json, builtGraph, nextPrototypeSpec.scene.level_structure),
    parsedOperations,
  )

  return repository.updateProject(projectId, {
    blueprint_json: nextBlueprint,
    prototype_spec: nextPrototypeSpec,
    module_graph: nextGraph,
    workspace_json: nextWorkspace,
  })
}

function deriveBlueprintFromSpec(currentBlueprint: NonNullable<ProjectDetail["blueprint_json"]>, prototypeSpec: NonNullable<ProjectDetail["prototype_spec"]>) {
  const entityModules = prototypeSpec.entities.flatMap((entity) =>
    entity.modules.filter((moduleId) => !moduleId.startsWith("physics/")),
  )
  const systemModules = prototypeSpec.systems.map((system) => system.module)
  const requiredModules = [...new Set([...entityModules, ...systemModules])].sort((left, right) => left.localeCompare(right))

  const coreSystems = requiredModules.filter((moduleId) => {
    return moduleId.startsWith("player/") || moduleId.startsWith("camera/") || moduleId.startsWith("combat/")
  })
  const gameplaySystems = requiredModules.filter((moduleId) => !coreSystems.includes(moduleId))

  return {
    ...currentBlueprint,
    core_systems: coreSystems,
    gameplay_systems: gameplaySystems,
    required_modules: requiredModules,
    environment: prototypeSpec.scene.environment,
    level_structure: [...prototypeSpec.scene.level_structure],
  }
}

function applyLayoutOperations(
  moduleGraph: NonNullable<ProjectDetail["module_graph"]>,
  workspace: ProjectDetail["workspace_json"],
  operations: PatchOperation[],
) {
  const positionByModuleId = new Map<string, { x: number; y: number }>()

  operations.forEach((operation) => {
    if (operation.op !== "move_graph_node_layout") return

    const workspaceNode = workspace.nodes.find(
      (node) => node.id === operation.node_id || node.module_id === operation.node_id,
    )
    const moduleId = workspaceNode?.module_id ?? moduleGraph.nodes.find((node) => node.id === operation.node_id || node.module_id === operation.node_id)?.module_id
    if (!moduleId) return
    positionByModuleId.set(moduleId, operation.position)
  })

  if (positionByModuleId.size === 0) {
    return {
      moduleGraph,
      workspace,
    }
  }

  const nextGraph = {
    ...moduleGraph,
    nodes: moduleGraph.nodes.map((node) => ({
      ...node,
      position: positionByModuleId.get(node.module_id) ?? node.position,
    })),
  }

  const nextWorkspace = editorWorkspaceSnapshotSchema.parse({
    ...workspace,
    nodes: workspace.nodes.map((node) => ({
      ...node,
      x: positionByModuleId.get(node.module_id)?.x ?? node.x,
      y: positionByModuleId.get(node.module_id)?.y ?? node.y,
    })),
  })

  return {
    moduleGraph: nextGraph,
    workspace: nextWorkspace,
  }
}

function syncWorkspaceWithGraph(
  workspace: ProjectDetail["workspace_json"],
  moduleGraph: NonNullable<ProjectDetail["module_graph"]>,
  levelStructure: string[],
) {
  const positionsByModuleId = new Map(
    workspace.nodes.map((node) => [node.module_id, { x: node.x, y: node.y, id: node.id, active: node.active }] as const),
  )
  const nextNodes = moduleGraph.nodes.map((node) => ({
    id: positionsByModuleId.get(node.module_id)?.id ?? `node_${node.id.replaceAll("/", "_")}`,
    module_id: node.module_id,
    x: positionsByModuleId.get(node.module_id)?.x ?? node.position.x,
    y: positionsByModuleId.get(node.module_id)?.y ?? node.position.y,
    active: positionsByModuleId.get(node.module_id)?.active ?? true,
  }))
  const nextModuleIds = new Set(nextNodes.map((node) => node.module_id))

  return editorWorkspaceSnapshotSchema.parse({
    ...workspace,
    nodes: nextNodes,
    timeline_sections: levelStructure.map((section, index) => {
      const existing = workspace.timeline_sections.find((entry) => entry.id === section)
      return {
        id: section,
        title: existing?.title ?? humanizeSection(section),
        order: index,
        expanded: existing?.expanded ?? true,
        module_ids: (existing?.module_ids ?? []).filter((moduleId) => nextModuleIds.has(moduleId)),
      }
    }),
  })
}

function syncGraphPositions(
  moduleGraph: ProjectDetail["module_graph"],
  workspaceJson: ProjectDetail["workspace_json"],
) {
  if (!moduleGraph) return null
  const nodePositions = new Map(workspaceJson.nodes.map((node) => [node.module_id, { x: node.x, y: node.y }]))

  return {
    ...moduleGraph,
    nodes: moduleGraph.nodes.map((node) => ({
      ...node,
      position: nodePositions.get(node.module_id) ?? node.position,
    })),
  }
}

function humanizeSection(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase())
}
