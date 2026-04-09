import type { BlueprintPlan, PlannerDiagnostics, PrototypeSpec } from "@levelyst/contracts"

export type EditorMode = "build" | "simulate" | "debug"
export type WorkspaceLayoutMode = "mobile" | "compact" | "wide"

export type ModuleCategory = "CORE" | "AI" | "COMBAT" | "PHYSICS" | "UI" | "AUDIO"

export interface ModulePort {
  id: string
  label: string
  kind: "input" | "output"
}

export interface ModuleNode {
  id: string
  typeId: string
  name: string
  category: ModuleCategory
  description: string
  inputs: string[]
  outputs: string[]
  dependencies: string[]
  inputPorts: ModulePort[]
  outputPorts: ModulePort[]
  x: number
  y: number
  aiCompatible: boolean
  active: boolean
  isGroup?: boolean
  groupId?: string
  groupMembers?: string[]
}

export interface DependencyEdge {
  fromTypeId: string
  toTypeId: string
  kind: "required" | "recommended"
}

export interface LevelSection {
  id: string
  title: string
  order: number
  expanded: boolean
  moduleIds: string[]
}

export interface AIPlanningStep {
  id: string
  label: string
  status: "pending" | "running" | "done"
}

export interface CopilotSuggestion {
  id: string
  title: string
  reason: string
  moduleTypeIds: string[]
}

export type MotionIntensity = "high" | "medium" | "reduced"

export interface EditorUiPreferences {
  coachmarksSeenVersion: number
  motionIntensity: MotionIntensity
  helpOverlayDismissed: boolean
}

export type CommandActionId =
  | "mode-build"
  | "mode-simulate"
  | "mode-debug"
  | "panel-library"
  | "panel-copilot"
  | "panel-timeline"
  | "auto-arrange"
  | "group-selection"
  | "simulate"
  | "add-movement"
  | "add-camera"
  | "add-combat"
  | "add-enemy-ai"
  | "add-wave-manager"
  | "open-project"

export interface CommandAction {
  id: CommandActionId
  label: string
  group: "Mode" | "Panels" | "Graph" | "Modules" | "Projects"
  shortcut?: string
  disabledReason?: string
  meta?: string
}

export interface CommandContext {
  mode: EditorMode
  selectedNodeCount: number
  readiness: SimulationReadiness["status"]
  credits: number
}

export type UiBlockerState =
  | "credits_exhausted"
  | "missing_dependencies"
  | "no_compatible_modules"
  | "simulation_error"
  | "none"

export interface BlueprintSystemItem {
  typeId: string
  name: string
  category: ModuleCategory
}

export interface IntentBlueprint {
  gameType: string
  gameTypeLabel: string
  gameIdea: string
  playerExperience: string
  coreGameplay: string[]
  gameStructure: string[]
  environmentLabel: string
  promptInterpretation: Array<{
    term: string
    meaning: string
  }>
  adaptationNote: string | null
  coreSystems: BlueprintSystemItem[]
  gameplaySystems: BlueprintSystemItem[]
  environment: string
  levelStructure: string[]
  unmappedSystems: string[]
  plannerDiagnostics?: PlannerDiagnostics | null
}

export type BlueprintState = "idle" | "planning" | "review" | "generating"
export type PendingPromptMode = "replace" | "patch" | null

export interface BlueprintGenerateRequest {
  blueprint: IntentBlueprint
  moduleTypeIds: string[]
}

export interface CanvasViewport {
  x: number
  y: number
  scale: number
  isPanning: boolean
}

export type CanvasHudWidgetId = "info" | "suggestions" | "tools" | "minimap"

export type CanvasHudAnchor =
  | "top-left"
  | "top-right"
  | "top-center"
  | "right-middle"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right"

export interface CanvasHudWidgetLayout {
  anchor: CanvasHudAnchor
  collapsed: boolean
}

export interface CanvasHudLayout {
  info: CanvasHudWidgetLayout
  suggestions: CanvasHudWidgetLayout
  tools: CanvasHudWidgetLayout
  minimap: CanvasHudWidgetLayout
}

export type PanelDockEdge = "left" | "right" | "bottom"

export type PanelDockSlot =
  | "left-top"
  | "left-middle"
  | "left-bottom"
  | "right-top"
  | "right-middle"
  | "right-bottom"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right"

export type PanelDockMode = "floating" | "docked"

export interface PanelRect {
  x: number
  y: number
  width: number
  height: number
}

export interface FloatingPanelState {
  x: number
  y: number
  width: number
  height: number
  collapsed: boolean
  zIndex: number
  dockMode: PanelDockMode
  dockSlot: PanelDockSlot | null
  isSnapped: boolean
  lastFloatingRect: PanelRect
  minWidth: number
  maxWidth: number
  minHeight: number
  maxHeight: number
}

export interface ModuleGroup {
  id: string
  label: string
  nodeIds: string[]
  collapsed: boolean
  bounds: PanelRect
}

export interface ProjectWorkspace {
  nodes: ModuleNode[]
  timelineSections: LevelSection[]
  groups: ModuleGroup[]
  prompt: string
  gamePlan: string[]
  planningSteps: AIPlanningStep[]
  canvasViewport: CanvasViewport
  pendingBlueprint: IntentBlueprint | null
  pendingPromptMode: PendingPromptMode
  blueprintState: BlueprintState
}

export interface ProjectRecord {
  id: string
  name: string
  genre: string
  lastModified: Date
  previewThumbnail: string
  blueprintPlan: BlueprintPlan | null
  prototypeSpec: PrototypeSpec | null
  workspace: ProjectWorkspace
}

export interface SimulationReadiness {
  status: "missing_dependencies" | "systems_connected" | "prototype_ready"
  message: string
  missingLinks: string[]
}

export interface NodeHighlightState {
  hoveredNodeId: string | null
  directNodeIds: string[]
  transitiveNodeIds: string[]
  directTypeIds: string[]
  transitiveTypeIds: string[]
}

export interface CommunityProject {
  id: string
  name: string
  genre: string
  modulesCount: number
  aiCreated: boolean
  thumbnail: string
  previewLoopSrc: string
  previewPoster: string
}
