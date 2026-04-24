import type {
  EditorWorkspaceSnapshot,
  GenerationJobEvent,
  ModuleGraphEdge,
  ModuleGraphNode,
} from "@levelyst/contracts"
import type { CanvasViewport, DependencyEdge, ModuleNode, ProjectWorkspace } from "@/lib/editor-v2-model"
import { getSystemLabel } from "@/lib/editor-v2-lexicon"
import { getEditorModuleTemplate } from "@/lib/levelyst/adapters/editor-v2"

export const GRAPH_WORLD_WIDTH = 2600
export const GRAPH_WORLD_HEIGHT = 1800
export const GRAPH_NODE_WIDTH = 244
export const GRAPH_NODE_HEIGHT = 128

export interface GraphPositionOffset {
  x: number
  y: number
}

export interface CanvasWheelGestureLike {
  ctrlKey: boolean
  deltaMode: number
  deltaX: number
  deltaY: number
}

export type CanvasWheelGesture = "mouse-wheel-zoom" | "trackpad-pan" | "pinch-zoom"

export function createGenerationPlanningSteps(): ProjectWorkspace["planningSteps"] {
  return [
    { id: "job_started", label: "Preparing generation job", status: "running" },
    { id: "graph_build", label: "Building module graph", status: "pending" },
    { id: "compile", label: "Compiling prototype spec", status: "pending" },
    { id: "ready", label: "Preparing simulation handoff", status: "pending" },
  ]
}

export function updateGenerationPlanningSteps(
  steps: ProjectWorkspace["planningSteps"],
  eventType: GenerationJobEvent["event_type"],
): ProjectWorkspace["planningSteps"] {
  const milestone = eventTypeToMilestone(eventType)
  if (milestone === null) {
    return steps.map((step) => ({ ...step }))
  }

  return steps.map((step, index) => {
    if (eventType === "job_failed") {
      return {
        ...step,
        status: index < milestone ? "done" : step.status === "running" ? "done" : step.status,
      }
    }

    if (index < milestone) return { ...step, status: "done" }
    if (index === milestone) return { ...step, status: eventType === "job_completed" ? "done" : "running" }
    return { ...step, status: "pending" }
  })
}

export function createNodeFromGraphNode(node: ModuleGraphNode, offset: GraphPositionOffset = { x: 0, y: 0 }): ModuleNode {
  const template = getEditorModuleTemplate(node.module_id)
  const displayInputs = template?.displayInputs ?? template?.dependencies ?? []
  const displayOutputs = template?.displayOutputs ?? template?.supports ?? []

  return {
    id: `node_${node.id.replaceAll("/", "_")}`,
    typeId: node.module_id,
    name: template?.name ?? getSystemLabel(node.module_id, node.module_id),
    category: template?.category ?? "CORE",
    description: template?.description ?? `${getSystemLabel(node.module_id, node.module_id)} module`,
    inputs: displayInputs,
    outputs: displayOutputs,
    dependencies: template?.dependencies ?? [],
    inputPorts: displayInputs.slice(0, 3).map((item, index) => ({
      id: `${node.module_id}-input-${index}`,
      label: item,
      kind: "input",
    })),
    outputPorts: displayOutputs.slice(0, 3).map((item, index) => ({
      id: `${node.module_id}-output-${index}`,
      label: item,
      kind: "output",
    })),
    x: clamp(node.position.x + offset.x, 12, GRAPH_WORLD_WIDTH - GRAPH_NODE_WIDTH - 12),
    y: clamp(node.position.y + offset.y, 12, GRAPH_WORLD_HEIGHT - GRAPH_NODE_HEIGHT - 12),
    aiCompatible: template?.aiCompatible ?? true,
    active: true,
  }
}

export function createDependencyEdgeFromGraphEdge(edge: ModuleGraphEdge): DependencyEdge {
  return {
    fromTypeId: edge.from_node_id,
    toTypeId: edge.to_node_id,
    kind: "required",
  }
}

export function upsertGeneratedNode(nodes: ModuleNode[], nextNode: ModuleNode): ModuleNode[] {
  const existingIndex = nodes.findIndex((node) => node.typeId === nextNode.typeId)
  if (existingIndex === -1) {
    return [...nodes, nextNode]
  }

  return nodes.map((node, index) => (index === existingIndex ? nextNode : node))
}

export function upsertDependencyEdge(edges: DependencyEdge[], nextEdge: DependencyEdge): DependencyEdge[] {
  const exists = edges.some(
    (edge) =>
      edge.fromTypeId === nextEdge.fromTypeId &&
      edge.toTypeId === nextEdge.toTypeId &&
      edge.kind === nextEdge.kind,
  )

  return exists ? edges : [...edges, nextEdge]
}

export function createGenerationReplayOffset(viewportWorldCenter: { x: number; y: number }): GraphPositionOffset {
  return {
    x: viewportWorldCenter.x - GRAPH_WORLD_WIDTH / 2,
    y: viewportWorldCenter.y - GRAPH_WORLD_HEIGHT / 2,
  }
}

export function createCenteredCanvasViewport(surfaceWidth: number, surfaceHeight: number, scale = 1): CanvasViewport {
  return {
    x: surfaceWidth / 2 - (GRAPH_WORLD_WIDTH * scale) / 2,
    y: surfaceHeight / 2 - (GRAPH_WORLD_HEIGHT * scale) / 2,
    scale,
    isPanning: false,
  }
}

export function offsetWorkspaceNodePositions(
  workspace: EditorWorkspaceSnapshot,
  offset: GraphPositionOffset,
): EditorWorkspaceSnapshot {
  if (Math.abs(offset.x) < 0.5 && Math.abs(offset.y) < 0.5) {
    return workspace
  }

  return {
    ...workspace,
    nodes: workspace.nodes.map((node) => ({
      ...node,
      x: clamp(node.x + offset.x, 12, GRAPH_WORLD_WIDTH - GRAPH_NODE_WIDTH - 12),
      y: clamp(node.y + offset.y, 12, GRAPH_WORLD_HEIGHT - GRAPH_NODE_HEIGHT - 12),
    })),
  }
}

export function updateWorkspaceCanvasViewport(
  workspace: EditorWorkspaceSnapshot,
  viewport: EditorWorkspaceSnapshot["canvas_viewport"],
): EditorWorkspaceSnapshot {
  if (
    Math.abs(workspace.canvas_viewport.x - viewport.x) < 0.5 &&
    Math.abs(workspace.canvas_viewport.y - viewport.y) < 0.5 &&
    Math.abs(workspace.canvas_viewport.scale - viewport.scale) < 0.01 &&
    workspace.canvas_viewport.is_panning === viewport.is_panning
  ) {
    return workspace
  }

  return {
    ...workspace,
    canvas_viewport: { ...viewport },
  }
}

export function classifyCanvasWheelGesture(gesture: CanvasWheelGestureLike): CanvasWheelGesture {
  if (gesture.ctrlKey) {
    return "pinch-zoom"
  }

  if (gesture.deltaMode !== 0) {
    return "mouse-wheel-zoom"
  }

  const absDeltaX = Math.abs(gesture.deltaX)
  const absDeltaY = Math.abs(gesture.deltaY)
  const maxDelta = Math.max(absDeltaX, absDeltaY)
  const hasCrossAxisMotion = absDeltaX > 0.01
  const hasFinePrecision = !Number.isInteger(gesture.deltaX) || !Number.isInteger(gesture.deltaY)

  return hasCrossAxisMotion || hasFinePrecision || maxDelta < 32 ? "trackpad-pan" : "mouse-wheel-zoom"
}

export function createCompileSignature(workspace: Pick<ProjectWorkspace, "nodes" | "timelineSections">) {
  const moduleTypeIds = [...new Set(workspace.nodes.filter((node) => !node.isGroup).map((node) => node.typeId))].sort((left, right) =>
    left.localeCompare(right),
  )

  const levelStructure = [...workspace.timelineSections]
    .slice()
    .sort((left, right) => left.order - right.order)
    .map((section) => section.id)

  return JSON.stringify({
    moduleTypeIds,
    levelStructure,
  })
}

export function shouldInvalidateCompiledSpec(
  currentCompileSignature: string,
  compiledCompileSignature: string | null | undefined,
) {
  return Boolean(compiledCompileSignature) && currentCompileSignature !== compiledCompileSignature
}

function eventTypeToMilestone(eventType: GenerationJobEvent["event_type"]) {
  switch (eventType) {
    case "job_started":
      return 0
    case "node_added":
    case "edge_added":
      return 1
    case "compile_started":
      return 2
    case "compile_completed":
      return 3
    case "job_completed":
      return 3
    case "job_failed":
      return 2
    default:
      return null
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}
