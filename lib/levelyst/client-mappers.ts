import type {
  BlueprintPlan,
  EditorWorkspaceSnapshot,
  ModuleGraph,
  PlannerDiagnostics,
  ProjectDetail,
} from "@levelyst/contracts"
import type {
  BlueprintSystemItem,
  DependencyEdge,
  IntentBlueprint,
  ModuleGroup,
  ModuleNode,
  ProjectRecord,
  ProjectWorkspace,
} from "@/lib/editor-v2-model"
import { getSystemLabel } from "@/lib/editor-v2-lexicon"
import { normalizeBlueprint } from "@/lib/editor-v2-logic"
import { editorBlueprintCatalog, getEditorModuleTemplate } from "@/lib/levelyst/adapters/editor-v2"

export function hydrateProjectRecord(project: ProjectDetail): ProjectRecord {
  return {
    id: project.id,
    name: project.name,
    genre: project.genre === "fps_wave_survival" ? "FPS Wave Survival" : "Platformer",
    lastModified: new Date(project.updated_at),
    previewThumbnail: project.preview_thumbnail,
    blueprintPlan: project.blueprint_json,
    prototypeSpec: project.prototype_spec,
    workspace: hydrateWorkspace(project.workspace_json, project.module_graph, project.blueprint_json),
  }
}

export function hydrateWorkspace(
  workspaceJson: EditorWorkspaceSnapshot,
  moduleGraph: ModuleGraph | null,
  blueprintPlan: BlueprintPlan | null,
): ProjectWorkspace {
  const positionsByModuleId = new Map(workspaceJson.nodes.map((node) => [node.module_id, node] as const))
  const hydratedNodesByModuleId = new Map<string, ModuleNode>()

  ;(moduleGraph?.nodes ?? []).forEach((node) => {
    const storedNode = positionsByModuleId.get(node.module_id)
    hydratedNodesByModuleId.set(
      node.module_id,
      hydrateModuleNode(
        node.module_id,
        storedNode?.id ?? `node_${node.id.replaceAll("/", "_")}`,
        storedNode?.x ?? node.position.x,
        storedNode?.y ?? node.position.y,
      ),
    )
  })

  workspaceJson.nodes.forEach((node) => {
    if (hydratedNodesByModuleId.has(node.module_id)) return
    hydratedNodesByModuleId.set(
      node.module_id,
      hydrateModuleNode(node.module_id, node.id, node.x, node.y),
    )
  })

  const hydratedNodes = [...hydratedNodesByModuleId.values()]

  return {
    nodes: hydratedNodes,
    groups: workspaceJson.groups.map<ModuleGroup>((group) => ({
      id: group.id,
      label: group.label,
      nodeIds: [...group.node_ids],
      collapsed: group.collapsed,
      bounds: { ...group.bounds },
    })),
    timelineSections: workspaceJson.timeline_sections.map((section) => ({
      id: section.id,
      title: section.title,
      order: section.order,
      expanded: section.expanded,
      moduleIds: [...section.module_ids],
    })),
    prompt: workspaceJson.prompt,
    gamePlan: [...workspaceJson.game_plan],
    planningSteps: workspaceJson.planning_steps.map((step) => ({
      id: step.id,
      label: step.label,
      status: step.status,
    })),
    canvasViewport: {
      x: workspaceJson.canvas_viewport.x,
      y: workspaceJson.canvas_viewport.y,
      scale: workspaceJson.canvas_viewport.scale,
      isPanning: workspaceJson.canvas_viewport.is_panning,
    },
    pendingBlueprint: workspaceJson.pending_blueprint
      ? hydrateIntentBlueprint(
          workspaceJson.pending_blueprint,
          workspaceJson.prompt,
          workspaceJson.pending_blueprint_diagnostics,
        )
      : blueprintPlan
        ? hydrateIntentBlueprint(blueprintPlan, workspaceJson.prompt, null)
        : null,
    pendingPromptMode: workspaceJson.pending_prompt_mode,
    blueprintState: workspaceJson.blueprint_state,
  }
}

export function hydrateDependencyEdges(moduleGraph: ModuleGraph | null): DependencyEdge[] {
  if (!moduleGraph) return []
  const moduleIdByNodeId = new Map(moduleGraph.nodes.map((node) => [node.id, node.module_id] as const))

  return moduleGraph.edges
    .map<DependencyEdge | null>((edge) => {
      const fromModuleId = moduleIdByNodeId.get(edge.from_node_id)
      const toModuleId = moduleIdByNodeId.get(edge.to_node_id)
      if (!fromModuleId || !toModuleId) return null
      return {
        fromTypeId: fromModuleId,
        toTypeId: toModuleId,
        kind: "required",
      }
    })
    .filter((edge): edge is DependencyEdge => Boolean(edge))
}

export function dehydrateWorkspace(workspace: ProjectWorkspace): EditorWorkspaceSnapshot {
  return {
    nodes: workspace.nodes
      .filter((node) => !node.isGroup)
      .map((node) => ({
        id: node.id,
        module_id: node.typeId,
        x: node.x,
        y: node.y,
        active: node.active,
      })),
    groups: workspace.groups.map((group) => ({
      id: group.id,
      label: group.label,
      node_ids: [...group.nodeIds],
      collapsed: group.collapsed,
      bounds: { ...group.bounds },
    })),
    timeline_sections: workspace.timelineSections.map((section) => ({
      id: section.id,
      title: section.title,
      order: section.order,
      expanded: section.expanded,
      module_ids: [...section.moduleIds],
    })),
    prompt: workspace.prompt,
    game_plan: [...workspace.gamePlan],
    planning_steps: workspace.planningSteps.map((step) => ({
      id: step.id,
      label: step.label,
      status: step.status,
    })),
    canvas_viewport: {
      x: workspace.canvasViewport.x,
      y: workspace.canvasViewport.y,
      scale: workspace.canvasViewport.scale,
      is_panning: workspace.canvasViewport.isPanning,
    },
    pending_blueprint: workspace.pendingBlueprint ? dehydrateIntentBlueprint(workspace.pendingBlueprint) : null,
    pending_blueprint_diagnostics: workspace.pendingBlueprint?.plannerDiagnostics ?? null,
    pending_prompt_mode: workspace.pendingPromptMode,
    blueprint_state: workspace.blueprintState,
  }
}

export function hydrateIntentBlueprint(
  blueprintPlan: BlueprintPlan,
  prompt: string,
  plannerDiagnostics: PlannerDiagnostics | null = null,
): IntentBlueprint {
  const explanation = deriveBlueprintExplanation(blueprintPlan, plannerDiagnostics)
  const adaptationNote = plannerDiagnostics?.adaptation_note ?? derivePlannerNotes(prompt, blueprintPlan.game_type, plannerDiagnostics)[0] ?? null

  const toSystemItems = (moduleIds: string[]): BlueprintSystemItem[] =>
    moduleIds.map((moduleId) => {
      const catalogItem = editorBlueprintCatalog.find((item) => item.typeId === moduleId)
      return {
        typeId: moduleId,
        name: getSystemLabel(moduleId, catalogItem?.name ?? moduleId),
        category: catalogItem?.category ?? "CORE",
      }
    })

  return normalizeBlueprint(
    {
      gameType: blueprintPlan.game_type,
      familyId: blueprintPlan.family_id,
      capabilityIds: blueprintPlan.capability_ids ? [...blueprintPlan.capability_ids] : [],
      gameTypeLabel: explanation.gameTypeLabel,
      gameIdea: prompt || "Describe your game idea...",
      playerExperience: explanation.playerExperience,
      coreGameplay: explanation.coreGameplay,
      gameStructure: explanation.gameStructure,
      environmentLabel: explanation.environmentLabel,
      promptInterpretation: explanation.promptInterpretation,
      adaptationNote,
      coreSystems: toSystemItems(blueprintPlan.core_systems),
      gameplaySystems: toSystemItems(blueprintPlan.gameplay_systems),
      environment: blueprintPlan.environment,
      levelStructure: blueprintPlan.level_structure.map((section) => humanizeSection(section)),
      unmappedSystems: adaptationNote ? [adaptationNote] : derivePlannerNotes(prompt, blueprintPlan.game_type, plannerDiagnostics),
      plannerDiagnostics,
    },
    editorBlueprintCatalog,
  )
}

export function dehydrateIntentBlueprint(blueprint: IntentBlueprint): BlueprintPlan {
  const coreSystems = blueprint.coreSystems.map((system) => system.typeId)
  const gameplaySystems = blueprint.gameplaySystems.map((system) => system.typeId)
  const requiredModules = [...new Set([...coreSystems, ...gameplaySystems])].sort((left, right) => left.localeCompare(right))

  return {
    game_type: blueprint.gameType === "3d_fps" ? "3d_fps" : "2d_platformer",
    family_id: blueprint.familyId,
    capability_ids: blueprint.capabilityIds,
    core_systems: coreSystems,
    gameplay_systems: gameplaySystems,
    required_modules: requiredModules,
    environment: blueprint.environment,
    level_structure: blueprint.levelStructure.map((section) =>
      section
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, ""),
    ),
    constraints: {
      target_runtime: blueprint.gameType === "3d_fps" ? "web_3d" : "web_2d",
    },
  }
}

function hydrateModuleNode(moduleId: string, nodeId: string, x: number, y: number): ModuleNode {
  const template = getEditorModuleTemplate(moduleId)
  const displayInputs = template?.displayInputs ?? template?.dependencies ?? []
  const displayOutputs = template?.displayOutputs ?? template?.supports ?? []
  return {
    id: nodeId,
    typeId: moduleId,
    name: template?.name ?? getSystemLabel(moduleId, moduleId),
    category: template?.category ?? "CORE",
    description: template?.description ?? `${getSystemLabel(moduleId, moduleId)} module`,
    inputs: displayInputs,
    outputs: displayOutputs,
    dependencies: template?.dependencies ?? [],
    inputPorts: displayInputs.slice(0, 3).map((item, index) => ({
      id: `${moduleId}-input-${index}`,
      label: item,
      kind: "input",
    })),
    outputPorts: displayOutputs.slice(0, 3).map((item, index) => ({
      id: `${moduleId}-output-${index}`,
      label: item,
      kind: "output",
    })),
    x,
    y,
    aiCompatible: template?.aiCompatible ?? true,
    active: true,
  }
}

function humanizeSection(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase())
}

function derivePlannerNotes(
  prompt: string,
  gameType: BlueprintPlan["game_type"],
  plannerDiagnostics: PlannerDiagnostics | null,
) {
  if (plannerDiagnostics?.adaptation_note) {
    return [plannerDiagnostics.adaptation_note]
  }

  const normalized = prompt.trim().toLowerCase()
  if (!normalized) return []

  const notes: string[] = []

  if (/\bminecraft\b|\bvoxel\b|\bcrafting\b|\bblock[- ]?building\b/.test(normalized)) {
    notes.push(
      gameType === "3d_fps"
        ? "Closest supported slice: 3D FPS graybox survival. Building and crafting systems are not part of the MVP yet."
        : "Closest supported slice: 2D platformer graybox prototype. Building and crafting systems are not part of the MVP yet.",
    )
  }

  if (/\bgrand theft auto\b|\bgta\b|\bcrime\b|\bopen[- ]?world\b|\bsandbox\b/.test(normalized)) {
    notes.push(
      gameType === "3d_fps"
        ? "Closest supported slice: 3D graybox shooter/survival prototype. Open-world driving, civilians, and sandbox crime systems are not part of the MVP yet."
        : "Closest supported slice: 2D platformer graybox prototype. Open-world crime sandbox systems are not part of the MVP yet.",
    )
  }

  if (/\bvalorant\b|\bcounter[- ]?strike\b|\bcs2\b|\bcsgo\b|\bcall of duty\b|\bcod\b|\bdoom\b|\bhalo\b/.test(normalized) && gameType !== "3d_fps") {
    notes.push("Closest supported slice: 3D FPS wave survival.")
  }

  if (/\bmario\b|\bsonic\b|\bceleste\b|\bmetroid\b|\bmetroidvania\b|\bdonkey kong\b/.test(normalized) && gameType !== "2d_platformer") {
    notes.push("Closest supported slice: 2D platformer.")
  }

  return notes
}

function deriveBlueprintExplanation(blueprintPlan: BlueprintPlan, plannerDiagnostics: PlannerDiagnostics | null) {
  if (plannerDiagnostics?.explanation) {
    return {
      gameTypeLabel: plannerDiagnostics.explanation.game_type_label,
      playerExperience: plannerDiagnostics.explanation.player_experience,
      coreGameplay: plannerDiagnostics.explanation.core_gameplay,
      gameStructure: plannerDiagnostics.explanation.game_structure,
      environmentLabel: plannerDiagnostics.explanation.environment_label,
      promptInterpretation: plannerDiagnostics.explanation.prompt_interpretation,
    }
  }

  const is3D = blueprintPlan.game_type === "3d_fps"
  return {
    gameTypeLabel: is3D ? "3D FPS Survival" : "2D Platformer",
    playerExperience: is3D
      ? "Move through a 3D combat space, fight enemies, and survive escalating pressure."
      : "Run, jump, and move through a 2D graybox world while collecting rewards and avoiding threats.",
    coreGameplay: is3D
      ? ["Move and aim from a first-person view.", "Use ranged combat to survive enemy pressure."]
      : ["Run and jump through side-scrolling spaces.", "Collect pickups and reach progression markers."],
    gameStructure: blueprintPlan.level_structure.map((section) => humanizeSection(section)),
    environmentLabel: is3D ? "Open graybox arena" : "Tile-inspired 2D graybox course",
    promptInterpretation: [],
  }
}
