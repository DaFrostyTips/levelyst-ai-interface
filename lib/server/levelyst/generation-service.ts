import {
  editorWorkspaceSnapshotSchema,
  generationJobEventSchema,
  generationJobSchema,
  type PatchOperation,
  type BlueprintPlan,
  type GenerationJob,
  type GenerationJobEvent,
  type ProjectDetail,
  type PrototypeSpec,
} from "@levelyst/contracts"
import { applyPatchOperation, PrototypeSpecCompiler } from "@levelyst/spec-compiler"
import { createSeededModuleRegistry } from "@levelyst/module-registry"
import { buildModuleGraph } from "./graph-builder-service"
import { humanizeModuleId, summarizeModuleGraph } from "./defaults"
import type { LevelystRepository } from "./project-repository"
import { patchProjectSpec } from "./workspace-patch-service"

const moduleRegistry = createSeededModuleRegistry()

export interface GenerationResult {
  project: ProjectDetail
  job: GenerationJob
}

export async function generatePrototypeForProject(
  repository: LevelystRepository,
  projectId: string,
): Promise<GenerationResult> {
  const project = await repository.getProjectDetail(projectId)
  if (!project) {
    throw new Error(`Project "${projectId}" was not found.`)
  }

  const blueprintPlan = project.workspace_json.pending_blueprint ?? project.blueprint_json
  const pendingPromptMode = project.workspace_json.pending_prompt_mode ?? "replace"

  if (!blueprintPlan) {
    throw new Error("Project must have a blueprint before generation can begin.")
  }

  const initialJob = await repository.createJob(project.id)
  let job = await repository.updateJob(initialJob.id, { status: "running" })

  try {
    const generated = await attemptPromptModeGeneration(repository, project, blueprintPlan, pendingPromptMode)
    const events = buildGenerationEvents(
      job.id,
      project.id,
      generated.project.blueprint_json ?? blueprintPlan,
      generated.project.module_graph,
      generated.orderedModuleIds,
      generated.project.prototype_spec!,
    )
    await repository.replaceJobEvents(job.id, events)
    job = await repository.updateJob(job.id, { status: "completed", error_message: null })
    const updatedProject = await repository.updateProject(project.id, {
      latest_job: job,
    })

    return {
      project: updatedProject,
      job,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Prototype generation failed."
    const failedEvents = [
      generationJobEventSchema.parse({
        job_id: job.id,
        sequence: 0,
        event_type: "job_started",
        payload_json: {
          project_id: project.id,
        },
        delay_ms: 0,
      }),
      generationJobEventSchema.parse({
        job_id: job.id,
        sequence: 1,
        event_type: "job_failed",
        payload_json: {
          message,
        },
        delay_ms: 80,
      }),
    ]
    await repository.replaceJobEvents(job.id, failedEvents)
    job = await repository.updateJob(job.id, {
      status: "failed",
      error_message: message,
    })
    await repository.updateProject(project.id, { latest_job: job })
    throw new Error(message)
  }
}

async function attemptPromptModeGeneration(
  repository: LevelystRepository,
  project: ProjectDetail,
  blueprintPlan: BlueprintPlan,
  promptMode: "replace" | "patch",
) {
  if (promptMode === "patch" && project.blueprint_json && project.prototype_spec) {
    const diagnostics = project.workspace_json.pending_blueprint_diagnostics
    const plannedPatchOperations = diagnostics?.planned_patch_operations ?? []
    const derivedPatchOperations = derivePatchOperations(project, blueprintPlan) ?? []
    const patchOperations = [...derivedPatchOperations, ...plannedPatchOperations]

    if (patchOperations.length === 0 && (diagnostics?.supported_changes.length ?? 0) === 0) {
      throw new Error("That prompt does not map to a supported prototype change yet. Try one of the suggested follow-up prompts.")
    }

    if (patchOperations.length > 0) {
      try {
        const patchedProject = await patchProjectSpec(repository, project.id, patchOperations)
        const finalizedProject = await repository.updateProject(project.id, {
          workspace_json: editorWorkspaceSnapshotSchema.parse({
            ...patchedProject.workspace_json,
            prompt: project.workspace_json.prompt,
            pending_blueprint: null,
            pending_blueprint_diagnostics: null,
            pending_prompt_mode: null,
            blueprint_state: "idle",
          }),
        })
        const builtGraph = buildModuleGraph(finalizedProject.blueprint_json ?? blueprintPlan, finalizedProject.module_graph)
        return {
          project: finalizedProject,
          orderedModuleIds: builtGraph.resolved_modules.ordered_modules.map((module) => module.id),
        }
      } catch {
        // Fall through to a full rebuild when structured patching cannot safely complete.
      }
    }
  }

  const builtGraph = buildModuleGraph(blueprintPlan, project.module_graph)
  const compiledPrototypeSpec = PrototypeSpecCompiler.compile(blueprintPlan, builtGraph.resolved_modules)
  const prototypeSpec = applySafePlannedOperations(
    compiledPrototypeSpec,
    project.workspace_json.pending_blueprint_diagnostics?.planned_patch_operations ?? [],
  )
  const nextWorkspace = buildWorkspaceSnapshot(project, blueprintPlan, builtGraph.module_graph)
  const updatedProject = await repository.updateProject(project.id, {
    runtime_target: blueprintPlan.constraints.target_runtime,
    genre: blueprintPlan.game_type === "3d_fps" ? "fps_wave_survival" : "platformer",
    blueprint_json: blueprintPlan,
    prototype_spec: prototypeSpec,
    module_graph: builtGraph.module_graph,
    workspace_json: nextWorkspace,
  })

  return {
    project: updatedProject,
    orderedModuleIds: builtGraph.resolved_modules.ordered_modules.map((module) => module.id),
  }
}

function applySafePlannedOperations(spec: PrototypeSpec, operations: PatchOperation[]) {
  return operations.reduce((currentSpec, operation) => {
    try {
      return applyPatchOperation(currentSpec, operation, { registry: moduleRegistry })
    } catch {
      return currentSpec
    }
  }, spec)
}

function buildGenerationEvents(
  jobId: string,
  projectId: string,
  blueprintPlan: BlueprintPlan,
  moduleGraph: ProjectDetail["module_graph"],
  orderedModuleIds: string[],
  prototypeSpec: NonNullable<ProjectDetail["prototype_spec"]>,
) {
  const events: GenerationJobEvent[] = [
    {
      job_id: jobId,
      sequence: 0,
      event_type: "job_started",
      payload_json: {
        project_id: projectId,
        runtime_target: blueprintPlan.constraints.target_runtime,
      },
      delay_ms: 0,
    },
  ]

  let sequence = 1
  const nodesById = new Map((moduleGraph?.nodes ?? []).map((node) => [node.id, node] as const))
  const orderedNodes = orderedModuleIds
    .map((moduleId) => nodesById.get(moduleId))
    .filter((node): node is NonNullable<ProjectDetail["module_graph"]>["nodes"][number] => Boolean(node))

  const graphEdges = moduleGraph?.edges ?? []

  orderedNodes.forEach((node, index) => {
    events.push(
      generationJobEventSchema.parse({
        job_id: jobId,
        sequence: sequence++,
        event_type: "node_added",
        payload_json: {
          node,
        },
        delay_ms: index === 0 ? 140 : 180,
      }),
    )

    graphEdges
      .filter((edge) => edge.to_node_id === node.id)
      .forEach((edge) => {
        events.push(
          generationJobEventSchema.parse({
            job_id: jobId,
            sequence: sequence++,
            event_type: "edge_added",
            payload_json: {
              edge,
            },
            delay_ms: 70,
          }),
        )
      })
  })

  events.push(
    generationJobEventSchema.parse({
      job_id: jobId,
      sequence: sequence++,
      event_type: "compile_started",
      payload_json: {
        runtime: blueprintPlan.constraints.target_runtime,
      },
      delay_ms: 120,
    }),
  )

  events.push(
    generationJobEventSchema.parse({
      job_id: jobId,
      sequence: sequence++,
      event_type: "compile_completed",
      payload_json: {
        runtime: prototypeSpec.runtime,
        entity_count: prototypeSpec.entities.length,
        system_count: prototypeSpec.systems.length,
      },
      delay_ms: 120,
    }),
  )

  events.push(
    generationJobEventSchema.parse({
      job_id: jobId,
      sequence,
      event_type: "job_completed",
      payload_json: {
        module_count: moduleGraph?.nodes.length ?? 0,
      },
      delay_ms: 90,
    }),
  )

  return events
}

function buildWorkspaceSnapshot(project: ProjectDetail, blueprintPlan: BlueprintPlan, moduleGraph: NonNullable<ProjectDetail["module_graph"]>) {
  return editorWorkspaceSnapshotSchema.parse({
    nodes: moduleGraph.nodes.map((node) => ({
      id: `node_${node.id.replaceAll("/", "_")}`,
      module_id: node.module_id,
      x: node.position.x,
      y: node.position.y,
      active: true,
    })),
    groups: [],
    timeline_sections: blueprintPlan.level_structure.map((section, index) => ({
      id: section,
      title: humanizeSection(section),
      order: index,
      expanded: true,
      module_ids: [],
    })),
    prompt: project.workspace_json.prompt,
    game_plan: summarizeModuleGraph(moduleGraph).length > 0 ? summarizeModuleGraph(moduleGraph) : moduleGraph.nodes.map((node) => humanizeModuleId(node.module_id)),
    planning_steps: [],
    canvas_viewport: project.workspace_json.canvas_viewport,
    pending_blueprint: null,
    pending_blueprint_diagnostics: null,
    pending_prompt_mode: null,
    blueprint_state: "idle",
  })
}

function humanizeSection(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase())
}

function derivePatchOperations(project: ProjectDetail, nextBlueprint: BlueprintPlan): PatchOperation[] | null {
  const currentBlueprint = project.blueprint_json
  const currentSpec = project.prototype_spec
  if (!currentBlueprint || !currentSpec) return null
  if (currentBlueprint.constraints.target_runtime !== nextBlueprint.constraints.target_runtime) return null

  const operations: PatchOperation[] = []
  const currentModules = new Set(currentBlueprint.required_modules)
  const nextModules = new Set(nextBlueprint.required_modules)

  const removedModuleIds = [...currentModules].filter((moduleId) => !nextModules.has(moduleId)).sort((left, right) =>
    left.localeCompare(right),
  )
  const addedModuleIds = [...nextModules].filter((moduleId) => !currentModules.has(moduleId)).sort((left, right) =>
    left.localeCompare(right),
  )

  for (const moduleId of removedModuleIds) {
    const module = moduleRegistry.getModule(moduleId)
    if (!module) continue
    if (module.category === "enemy_ai") {
      const entityId = findEntityIdForModule(currentSpec, moduleId)
      if (!entityId) return null
      operations.push({
        op: "remove_entity",
        entity_id: entityId,
      })
      continue
    }

    if (module.category === "systems" || module.category === "ui") {
      operations.push({
        op: "remove_system",
        module: moduleId,
      })
      continue
    }

    const entityId = findEntityIdForModule(currentSpec, moduleId)
    if (!entityId) {
      return null
    }

    operations.push({
      op: "remove_module",
      entity_id: entityId,
      module: moduleId,
    })
  }

  for (const moduleId of addedModuleIds) {
    const module = moduleRegistry.getModule(moduleId)
    if (!module) continue
    if (module.category === "enemy_ai") {
      operations.push({
        op: "add_entity",
        entity: {
          id: createEntityIdForModule(currentSpec, moduleId),
          kind: "enemy",
          modules: [moduleId],
          module_configs: {},
        },
      })
      continue
    }

    if (module.category === "systems" || module.category === "ui") {
      operations.push({
        op: "add_system",
        module: moduleId,
        changes: {},
      })
      continue
    }

    const entityId = resolveTargetEntityIdForAddition(currentSpec, moduleId)
    if (!entityId) {
      return null
    }

    operations.push({
      op: "add_module",
      entity_id: entityId,
      module: moduleId,
      changes: {},
    })
  }

  if (currentBlueprint.environment !== nextBlueprint.environment) {
    operations.push({
      op: "update_environment",
      environment: nextBlueprint.environment,
    })
  }

  if (JSON.stringify(currentBlueprint.level_structure) !== JSON.stringify(nextBlueprint.level_structure)) {
    operations.push({
      op: "reorder_level_structure",
      level_structure: [...nextBlueprint.level_structure],
    })
  }

  return operations
}

function createEntityIdForModule(spec: NonNullable<ProjectDetail["prototype_spec"]>, moduleId: string) {
  const base = moduleId.includes("zombie") ? "enemy_zombie" : "enemy"
  let index = spec.entities.filter((entity) => entity.kind === "enemy").length + 1
  let candidate = `${base}_${index}`

  const existingIds = new Set(spec.entities.map((entity) => entity.id))
  while (existingIds.has(candidate)) {
    index += 1
    candidate = `${base}_${index}`
  }

  return candidate
}

function findEntityIdForModule(spec: NonNullable<ProjectDetail["prototype_spec"]>, moduleId: string) {
  return spec.entities.find((entity) => entity.modules.includes(moduleId))?.id ?? null
}

function resolveTargetEntityIdForAddition(spec: NonNullable<ProjectDetail["prototype_spec"]>, moduleId: string) {
  const module = moduleRegistry.getModule(moduleId)
  if (!module) return null

  if (["player_mechanics", "camera", "combat", "physics"].includes(module.category)) {
    return spec.entities.find((entity) => entity.kind === "player")?.id ?? null
  }

  if (module.category === "enemy_ai") {
    return spec.entities.find((entity) => entity.kind === "enemy")?.id ?? null
  }

  return null
}
