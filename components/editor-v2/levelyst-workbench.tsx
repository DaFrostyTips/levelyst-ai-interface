"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { BlueprintPlan, GenerationJobEvent, ProjectDetail, PrototypeSpec } from "@levelyst/contracts"
import {
  Bot,
  Brain,
  Camera,
  ChevronDown,
  ChevronUp,
  CircleHelp,
  Copy,
  Crosshair,
  Download,
  Flame,
  FolderOpen,
  Footprints,
  Gamepad2,
  Layers,
  Search,
  Music2,
  PlayCircle,
  Shield,
  Sparkles,
  Swords,
  Trash2,
  Volume2,
  Wand2,
} from "lucide-react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { TooltipProvider } from "@/components/ui/tooltip"
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command"
import type {
  BlueprintState,
  CanvasHudAnchor,
  CanvasHudLayout,
  BlueprintSystemItem,
  CanvasViewport,
  CommandAction,
  CommandContext,
  CommunityProject,
  CopilotSuggestion,
  DependencyEdge,
  EditorUiPreferences,
  EditorMode,
  FloatingPanelState,
  IntentBlueprint,
  LevelSection,
  MotionIntensity,
  ModuleGroup,
  ModuleNode,
  PendingPromptMode,
  PanelDockSlot,
  PanelRect,
  ProjectRecord,
  ProjectWorkspace,
  UiBlockerState,
  WorkspaceLayoutMode,
} from "@/lib/editor-v2-model"
import {
  applyBlueprintEdit,
  autoArrangeNodes,
  buildNodeHighlightState,
  detectBuildGaps,
  deriveDependencyEdges,
  deriveGroupBounds,
  deriveSimulationReadiness,
  type BlueprintCatalogItem,
  remapEdgesForCollapsedGroups,
  resolveDockSlot,
} from "@/lib/editor-v2-logic"
import { TopControlBar } from "@/components/editor-v2/top-control-bar"
import { ModuleLibraryPanel, type ModuleTemplate } from "@/components/editor-v2/module-library-panel"
import { GameCanvas } from "@/components/editor-v2/game-canvas"
import { SimulationViewport } from "@/components/editor-v2/simulation-viewport"
import { CopilotPanel } from "@/components/editor-v2/copilot-panel"
import { TimelineInspector } from "@/components/editor-v2/timeline-inspector"
import { CommunityProjectCard } from "@/components/editor-v2/community-project-card"
import { MobileWorkspaceBar, type MobileWorkspace } from "@/components/editor-v2/mobile-workspace-bar"
import { FloatingPanel, type ResizeHandle } from "@/components/editor-v2/floating-panel"
import { BlueprintReviewPanel } from "@/components/editor-v2/blueprint-review-panel"
import { HelpOverlay } from "@/components/editor-v2/help-overlay"
import { OnboardingCoachmarks } from "@/components/editor-v2/onboarding-coachmarks"
import { UiBlockerBanner } from "@/components/editor-v2/ui-blocker-banner"
import { getSystemLabel, normalizeSectionLabel } from "@/lib/editor-v2-lexicon"
import {
  editorBlueprintCatalog,
  editorCoreChainModuleIds,
  editorModuleTemplates as editorModuleTemplateSeeds,
  type EditorModuleIconKey,
} from "@/lib/levelyst/adapters/editor-v2"
import {
  createProject,
  deleteProject,
  generatePrototype,
  getProject,
  getProjectSpec,
  patchProjectSpec,
  resetKioskSession,
  streamGenerationEvents,
  submitPrompt,
  updateBlueprint,
  updateWorkspace,
} from "@/lib/levelyst/api-client"
import {
  dehydrateIntentBlueprint,
  dehydrateWorkspace,
  hydrateDependencyEdges,
  hydrateIntentBlueprint,
  hydrateProjectRecord,
} from "@/lib/levelyst/client-mappers"
import {
  createCenteredCanvasViewport,
  createCompileSignature,
  createGenerationReplayOffset,
  createDependencyEdgeFromGraphEdge,
  createGenerationPlanningSteps,
  createNodeFromGraphNode,
  offsetWorkspaceNodePositions,
  shouldInvalidateCompiledSpec,
  updateWorkspaceCanvasViewport,
  updateGenerationPlanningSteps,
  upsertDependencyEdge,
  upsertGeneratedNode,
} from "@/lib/levelyst/workbench-helpers"
import {
  LEVELYST_DEMO_READONLY_HINT,
  LEVELYST_DEMO_READONLY_MESSAGE,
  LEVELYST_PUBLIC_KIOSK_MESSAGE,
  LEVELYST_PUBLIC_SESSION_MESSAGE,
  type LevelystDeployMode,
} from "@/lib/levelyst/deploy-mode"
import { cn } from "@/lib/utils"
import type { CopilotLocalAiStatus } from "@/lib/levelyst/local-ai-status"

type EditorView = "dashboard" | "editor"
type PanelKey = "library" | "copilot" | "timeline"
type LeftRailTab = "prompt" | "library"
type BlueprintEntryPoint = "hub" | "copilot"

interface PanelSnapPreview {
  panel: PanelKey
  slot: PanelDockSlot
  rect: PanelRect
}

interface HudRect {
  x: number
  y: number
  width: number
  height: number
}

interface LevelystWorkbenchProps {
  initialProjects: ProjectDetail[]
  initialLocalAiStatus: CopilotLocalAiStatus
  deployMode: LevelystDeployMode
  experienceMode: "standard" | "kiosk"
}

const FLOATING_PANEL_STORAGE_KEY = "levelyst.editor.panels.v3"
const UI_PREFERENCES_STORAGE_KEY = "levelyst.editor.ui-preferences.v1"
const ONBOARDING_VERSION = 1
const PANEL_GUTTER = 8
const SNAP_ZONE_SIZE = 24
const HUD_MARGIN = 16
const LEGACY_VIEWPORT_X = 260
const LEGACY_VIEWPORT_Y = 140
const WORLD_WIDTH = 2600
const WORLD_HEIGHT = 1800
const NODE_WIDTH = 244
const NODE_HEIGHT = 128
const MOBILE_LAYOUT_MAX_WIDTH = 767
const COMPACT_LAYOUT_MAX_WIDTH = 1440
const WIDE_LAYOUT_MIN_WIDTH = 1600

const moduleIconMap: Record<EditorModuleIconKey, ModuleTemplate["icon"]> = {
  platformer_controller: Footprints,
  gravity: Layers,
  side_scroll_camera: Camera,
  basic_enemy: Brain,
  checkpoint: Shield,
  coin: Sparkles,
  fps_controller: Footprints,
  hitscan_weapon: Crosshair,
  basic_zombie: Brain,
  wave_manager: Flame,
  character_body: Layers,
}

const moduleTemplates: ModuleTemplate[] = editorModuleTemplateSeeds.map((template) => ({
  typeId: template.typeId,
  name: template.name,
  category: template.category,
  description: template.description,
  supports: template.supports,
  dependencies: template.dependencies,
  displayInputs: template.displayInputs,
  displayOutputs: template.displayOutputs,
  displayDependencies: template.displayDependencies,
  aiCompatible: template.aiCompatible,
  icon: moduleIconMap[template.iconKey],
}))

const moduleTemplateMap = new Map(moduleTemplates.map((template) => [template.typeId, template]))
const blueprintCatalog: BlueprintCatalogItem[] = editorBlueprintCatalog.map((item) => ({
  typeId: item.typeId,
  name: item.name,
  category: item.category,
}))

const defaultSections: LevelSection[] = [
  { id: "intro", title: "Intro", order: 0, expanded: true, moduleIds: [] },
  { id: "gameplay-loop", title: "Gameplay Loop", order: 1, expanded: true, moduleIds: [] },
  { id: "boss-fight", title: "Boss Fight", order: 2, expanded: true, moduleIds: [] },
  { id: "end", title: "End", order: 3, expanded: true, moduleIds: [] },
]

const communityProjects: CommunityProject[] = [
  {
    id: "cyberpunk-alley-chase",
    name: "Cyberpunk Alley Chase",
    genre: "Action",
    modulesCount: 12,
    aiCreated: true,
    thumbnail: "/previews/community/cyberpunk-alley-poster.svg",
    previewLoopSrc: "",
    previewPoster: "/previews/community/cyberpunk-alley-poster.svg",
  },
  {
    id: "forest-temple-assault",
    name: "Forest Temple Assault",
    genre: "Adventure",
    modulesCount: 10,
    aiCreated: true,
    thumbnail: "/previews/community/forest-temple-poster.svg",
    previewLoopSrc: "",
    previewPoster: "/previews/community/forest-temple-poster.svg",
  },
  {
    id: "orbital-breach",
    name: "Orbital Breach",
    genre: "Sci-Fi",
    modulesCount: 14,
    aiCreated: true,
    thumbnail: "/previews/community/orbital-breach-poster.svg",
    previewLoopSrc: "",
    previewPoster: "/previews/community/orbital-breach-poster.svg",
  },
]

const promptChips = [
  "Mario-like platformer",
  "Celeste-like challenge platformer",
  "Zombie survival FPS",
  "Tactical shooter",
  "Top-down RPG adventure",
  "Minecraft-like sandbox",
  "GTA-like action game",
]

const platformerFollowUpChips = [
  "Make the hero red",
  "Make the world neon",
  "Increase jump height",
  "Add more enemies",
  "Give the level a sunset mood",
]

const fpsFollowUpChips = [
  "Make shots more visible",
  "Increase zombie waves",
  "Give the arena a sunset mood",
  "Increase weapon damage",
  "Retint the arena neon",
]

export function LevelystWorkbench({
  initialProjects,
  initialLocalAiStatus: _initialLocalAiStatus,
  deployMode,
  experienceMode,
}: LevelystWorkbenchProps) {
  const isReadOnlyDemo = deployMode === "demo"
  const isPublicMode = deployMode === "public"
  const isKioskExperience = experienceMode === "kiosk"
  const [layoutMode, setLayoutMode] = useState<WorkspaceLayoutMode>("wide")
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false)
  const [view, setView] = useState<EditorView>("dashboard")
  const [editorMode, setEditorMode] = useState<EditorMode>("build")
  const [simulatePhase, setSimulatePhase] = useState<"idle" | "zooming" | "handoff" | "settle">("idle")
  const [mobileWorkspace, setMobileWorkspace] = useState<MobileWorkspace>("canvas")
  const [leftRailTab, setLeftRailTab] = useState<LeftRailTab>("prompt")
  const [planningProfile, setPlanningProfile] = useState<"default" | "presentation">(
    isKioskExperience ? "presentation" : "default",
  )

  const [projects, setProjects] = useState<ProjectRecord[]>(() =>
    initialProjects.length > 0
      ? initialProjects.map((project) => hydrateProjectRecord(project))
      : deployMode === "local"
        ? createInitialProjects()
        : [],
  )
  const [activeProjectId, setActiveProjectId] = useState<string | null>(initialProjects[0]?.id ?? null)

  const [nodes, setNodes] = useState<ModuleNode[]>([])
  const [graphEdges, setGraphEdges] = useState<DependencyEdge[]>([])
  const [groups, setGroups] = useState<ModuleGroup[]>([])
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([])
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null)
  const [selectedTypeId, setSelectedTypeId] = useState<string>()
  const [timelineSections, setTimelineSections] = useState<LevelSection[]>(cloneSections(defaultSections))
  const [canvasViewport, setCanvasViewport] = useState<CanvasViewport>({
    x: LEGACY_VIEWPORT_X,
    y: LEGACY_VIEWPORT_Y,
    scale: 1,
    isPanning: false,
  })
  const [prompt, setPrompt] = useState("")
  const [planningSteps, setPlanningSteps] = useState<ProjectWorkspace["planningSteps"]>([])
  const [gamePlan, setGamePlan] = useState<string[]>([
    "Player Movement",
    "Camera System",
    "Combat",
    "Enemy AI",
    "Wave Manager",
  ])
  const [hubPrompt, setHubPrompt] = useState("")
  const [hubGenerating, setHubGenerating] = useState(false)
  const [workspacePendingBlueprint, setWorkspacePendingBlueprint] = useState<IntentBlueprint | null>(null)
  const [workspacePendingPromptMode, setWorkspacePendingPromptMode] = useState<PendingPromptMode>(null)
  const [workspaceBlueprintState, setWorkspaceBlueprintState] = useState<BlueprintState>("idle")
  const [hubPendingBlueprint, setHubPendingBlueprint] = useState<IntentBlueprint | null>(null)
  const [hubBlueprintState, setHubBlueprintState] = useState<BlueprintState>("idle")
  const [blueprintEntryPoint, setBlueprintEntryPoint] = useState<BlueprintEntryPoint | null>(null)
  const [projectDeleteTarget, setProjectDeleteTarget] = useState<ProjectRecord | null>(null)
  const [timelineTab, setTimelineTab] = useState<"timeline" | "inspector">("timeline")
  const [timelineDockCollapsed, setTimelineDockCollapsed] = useState(false)
  const [uiPreferences, setUiPreferences] = useState<EditorUiPreferences>({
    coachmarksSeenVersion: 0,
    motionIntensity: "medium",
    helpOverlayDismissed: false,
  })
  const [showHelpOverlay, setShowHelpOverlay] = useState(false)
  const [showCommandPalette, setShowCommandPalette] = useState(false)

  const [showCommunityModal, setShowCommunityModal] = useState(false)
  const [showLibrarySheet, setShowLibrarySheet] = useState(false)
  const [showCopilotSheet, setShowCopilotSheet] = useState(false)
  const [showTimelineSheet, setShowTimelineSheet] = useState(false)
  const [simulationError, setSimulationError] = useState<string | null>(null)
  const [pendingProjectMode, setPendingProjectMode] = useState<EditorMode | null>(null)
  const [hasMounted, setHasMounted] = useState(false)

  const editorSurfaceRef = useRef<HTMLDivElement>(null)
  const zLayerRef = useRef(40)
  const transitionTimersRef = useRef<number[]>([])
  const activeProjectLoadedRef = useRef<string | null>(null)
  const generationSourceRef = useRef<EventSource | null>(null)
  const presentationWindowRef = useRef<Window | null>(null)
  const presentationChannelRef = useRef<BroadcastChannel | null>(null)
  const workspacePersistTimerRef = useRef<number | null>(null)
  const lastPersistedWorkspaceRef = useRef("")
  const isReplayingGenerationRef = useRef(false)
  const generationReplayOffsetRef = useRef<{ x: number; y: number } | null>(null)
  const shouldCenterGeneratedReplayRef = useRef(false)
  const compiledWorkspaceSignaturesRef = useRef<Record<string, string>>(
    Object.fromEntries(
      initialProjects
        .filter((project) => project.prototype_spec)
        .map((project) => [project.id, createCompileSignature(hydrateProjectRecord(project).workspace)]),
    ),
  )

  const [panelStates, setPanelStates] = useState<Record<PanelKey, FloatingPanelState>>(createInitialPanelStates())
  const panelStatesRef = useRef(panelStates)
  const [activePanelDrag, setActivePanelDrag] = useState<PanelKey | null>(null)
  const [snapPreview, setSnapPreview] = useState<PanelSnapPreview | null>(null)
  const readOnlyDemoMessage = `${LEVELYST_DEMO_READONLY_MESSAGE} ${LEVELYST_DEMO_READONLY_HINT}`
  const publicModeMessage = isKioskExperience ? LEVELYST_PUBLIC_KIOSK_MESSAGE : LEVELYST_PUBLIC_SESSION_MESSAGE
  const experienceStatusBadgeLabel = isKioskExperience ? "Kiosk Mode" : isPublicMode ? "Saved in Browser" : "Local Mode"
  const experienceMessageTitle = isKioskExperience ? "Grad Show Kiosk" : isPublicMode ? "Public Browser Save" : "Local Workspace"
  const showReadOnlyDemoNotice = useCallback(() => {
    setSimulationError(LEVELYST_DEMO_READONLY_MESSAGE)
  }, [])

  useEffect(() => {
    panelStatesRef.current = panelStates
  }, [panelStates])

  useEffect(() => {
    setHasMounted(true)
  }, [])

  useEffect(() => {
    if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") return

    const channel = new BroadcastChannel("levelyst-presentation")
    presentationChannelRef.current = channel

    return () => {
      presentationChannelRef.current?.close()
      presentationChannelRef.current = null
    }
  }, [])

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)")

    const updateReduced = () => setPrefersReducedMotion(reduced.matches)
    const updateLayout = () =>
      setLayoutMode((current) => deriveWorkspaceLayoutMode(window.innerWidth, current))

    updateLayout()
    updateReduced()

    window.addEventListener("resize", updateLayout)
    reduced.addEventListener("change", updateReduced)
    return () => {
      window.removeEventListener("resize", updateLayout)
      reduced.removeEventListener("change", updateReduced)
    }
  }, [])

  useEffect(() => {
    return () => {
      transitionTimersRef.current.forEach((timer) => window.clearTimeout(timer))
      if (workspacePersistTimerRef.current !== null) {
        window.clearTimeout(workspacePersistTimerRef.current)
      }
      generationSourceRef.current?.close()
      if (presentationWindowRef.current && !presentationWindowRef.current.closed) {
        presentationWindowRef.current.close()
      }
    }
  }, [])

  useEffect(() => {
    const raw = window.localStorage.getItem(FLOATING_PANEL_STORAGE_KEY)
    if (!raw) return

    try {
      const parsed = JSON.parse(raw) as Partial<Record<PanelKey, Partial<FloatingPanelState>>>
      const initial = createInitialPanelStates()
      setPanelStates({
        library: hydratePanelState(initial.library, parsed.library),
        copilot: hydratePanelState(initial.copilot, parsed.copilot),
        timeline: hydratePanelState(initial.timeline, parsed.timeline),
      })
    } catch {
      // ignore malformed persisted state
    }
  }, [])

  useEffect(() => {
    window.localStorage.setItem(FLOATING_PANEL_STORAGE_KEY, JSON.stringify(panelStates))
  }, [panelStates])

  useEffect(() => {
    const raw = window.localStorage.getItem(UI_PREFERENCES_STORAGE_KEY)
    if (!raw) return
    try {
      const parsed = JSON.parse(raw) as Partial<EditorUiPreferences>
      setUiPreferences((prev) => ({
        ...prev,
        ...parsed,
        motionIntensity:
          parsed.motionIntensity === "high" || parsed.motionIntensity === "medium" || parsed.motionIntensity === "reduced"
            ? parsed.motionIntensity
            : prev.motionIntensity,
      }))
    } catch {
      // ignore malformed ui preferences
    }
  }, [])

  useEffect(() => {
    window.localStorage.setItem(UI_PREFERENCES_STORAGE_KEY, JSON.stringify(uiPreferences))
  }, [uiPreferences])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const isTypingTarget =
        target?.closest("input,textarea,select,[contenteditable='true']") !== null ||
        target?.getAttribute("role") === "textbox"
      if (!isTypingTarget && event.key === "?") {
        event.preventDefault()
        setShowHelpOverlay(true)
        setUiPreferences((prev) => ({ ...prev, helpOverlayDismissed: false }))
      }

      const isCommand = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k"
      if (!isTypingTarget && isCommand) {
        event.preventDefault()
        setShowCommandPalette(true)
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [])

  useEffect(() => {
    const surface = editorSurfaceRef.current
    if (!surface) return

    const reflowPanels = () => {
      const bounds = surface.getBoundingClientRect()
      if (!bounds.width || !bounds.height) return

      setPanelStates((prev) => ({
        library: fitPanelToBounds(prev.library, bounds.width, bounds.height),
        copilot: fitPanelToBounds(prev.copilot, bounds.width, bounds.height),
        timeline: fitPanelToBounds(prev.timeline, bounds.width, bounds.height),
      }))
    }

    reflowPanels()
    const observer = new ResizeObserver(reflowPanels)
    observer.observe(surface)
    return () => observer.disconnect()
  }, [view, layoutMode])

  const isMobile = layoutMode === "mobile"
  const isCompactDesktop = layoutMode === "compact"
  const timelineDockExpandedHeight = isCompactDesktop ? 260 : 300
  const isDesktopFloating = false
  const activeProject = useMemo(
    () => projects.find((project) => project.id === activeProjectId) ?? projects[0],
    [activeProjectId, projects],
  )

  useEffect(() => {
    if (typeof window === "undefined") return
    if (!activeProject) return

    presentationChannelRef.current?.postMessage({
      type: "presentation-sync",
      projectId: activeProject.id,
      projectName: activeProject.name,
      hasPrototype: Boolean(activeProject.prototypeSpec),
      mode: editorMode,
      timestamp: Date.now(),
    })
  }, [activeProject, editorMode])

  const upsertProjectDetail = useCallback(
    (
      projectDetail: ProjectDetail,
      options: {
        select?: boolean
        reloadWorkspace?: boolean
        resetEdges?: boolean
      } = {},
    ) => {
      const record = hydrateProjectRecord(projectDetail)
      if (projectDetail.prototype_spec) {
        compiledWorkspaceSignaturesRef.current[record.id] = createCompileSignature(record.workspace)
      } else {
        delete compiledWorkspaceSignaturesRef.current[record.id]
      }

      if (options.reloadWorkspace || options.select || activeProjectId === record.id) {
        activeProjectLoadedRef.current = null
      }

      setProjects((prev) => {
        const withoutCurrent = prev.filter((project) => project.id !== record.id)
        return [record, ...withoutCurrent]
      })

      if (options.resetEdges) {
        setGraphEdges(hydrateDependencyEdges(projectDetail.module_graph))
      }

      if (options.select) {
        setActiveProjectId(record.id)
      }

      return record
    },
    [activeProjectId],
  )

  const buildWorkspaceSnapshot = useCallback(
    (): ProjectWorkspace => ({
      nodes: cloneNodes(nodes),
      groups: cloneGroups(groups),
      timelineSections: cloneSections(timelineSections),
      prompt,
      gamePlan: [...gamePlan],
      planningSteps: clonePlanningSteps(planningSteps),
      canvasViewport: { ...canvasViewport },
      pendingBlueprint: cloneBlueprint(workspacePendingBlueprint),
      pendingPromptMode: workspacePendingPromptMode,
      blueprintState: workspaceBlueprintState,
    }),
    [canvasViewport, gamePlan, groups, nodes, planningSteps, prompt, timelineSections, workspacePendingBlueprint, workspacePendingPromptMode, workspaceBlueprintState],
  )

  const restoreWorkspaceSnapshot = useCallback((workspace: ProjectWorkspace) => {
    const nextNodes = cloneNodes(workspace.nodes)
    setNodes(nextNodes)
    setGraphEdges(deriveDependencyEdges(nextNodes))
    setGroups(cloneGroups(workspace.groups))
    setTimelineSections(cloneSections(workspace.timelineSections))
    setPrompt(workspace.prompt)
    setPlanningSteps(clonePlanningSteps(workspace.planningSteps))
    setGamePlan([...workspace.gamePlan])
    setCanvasViewport({ ...workspace.canvasViewport })
    setWorkspacePendingBlueprint(cloneBlueprint(workspace.pendingBlueprint))
    setWorkspacePendingPromptMode(workspace.pendingPromptMode)
    setWorkspaceBlueprintState(workspace.blueprintState)
    lastPersistedWorkspaceRef.current = JSON.stringify(dehydrateWorkspace(workspace))
  }, [])

  useEffect(() => {
    if (!activeProject || activeProjectLoadedRef.current === activeProject.id) return

    const nextNodes = cloneNodes(activeProject.workspace.nodes)
    const centeredViewport =
      nextNodes.length === 0 && isLegacyDefaultViewport(activeProject.workspace.canvasViewport)
        ? (() => {
            const bounds = editorSurfaceRef.current?.getBoundingClientRect()
            return bounds
              ? createCenteredCanvasViewport(bounds.width, bounds.height, activeProject.workspace.canvasViewport.scale)
              : { ...activeProject.workspace.canvasViewport }
          })()
        : { ...activeProject.workspace.canvasViewport }
    setNodes(nextNodes)
    setGraphEdges(deriveDependencyEdges(nextNodes))
    setGroups(cloneGroups(activeProject.workspace.groups))
    setTimelineSections(cloneSections(activeProject.workspace.timelineSections))
    setPrompt(activeProject.workspace.prompt)
    setPlanningSteps(clonePlanningSteps(activeProject.workspace.planningSteps))
    setGamePlan([...activeProject.workspace.gamePlan])
    setCanvasViewport(centeredViewport)
    setWorkspacePendingBlueprint(cloneBlueprint(activeProject.workspace.pendingBlueprint))
    setWorkspacePendingPromptMode(activeProject.workspace.pendingPromptMode)
    setWorkspaceBlueprintState(activeProject.workspace.blueprintState)
    setSelectedNodeId(null)
    setSelectedNodeIds([])
    setHoveredNodeId(null)
    setSimulationError(null)
    lastPersistedWorkspaceRef.current = JSON.stringify(dehydrateWorkspace(activeProject.workspace))
    activeProjectLoadedRef.current = activeProject.id
  }, [activeProject])

  useEffect(() => {
    if (view !== "editor") return
    if (nodes.length > 0) return
    if (!isLegacyDefaultViewport(canvasViewport)) return
    const bounds = editorSurfaceRef.current?.getBoundingClientRect()
    if (!bounds) return
    const centered = createCenteredCanvasViewport(bounds.width, bounds.height, canvasViewport.scale)
    if (Math.abs(centered.x - canvasViewport.x) < 0.5 && Math.abs(centered.y - canvasViewport.y) < 0.5) return
    setCanvasViewport((prev) => ({ ...centered, scale: prev.scale, isPanning: false }))
  }, [canvasViewport, nodes.length, view])

  useEffect(() => {
    if (!activeProjectId) return
    const workspaceSnapshot = buildWorkspaceSnapshot()
    setProjects((prev) =>
      prev.map((project) => {
        if (project.id !== activeProjectId) return project
        return {
          ...project,
          lastModified: new Date(),
          workspace: workspaceSnapshot,
        }
      }),
    )
  }, [activeProjectId, buildWorkspaceSnapshot])

  useEffect(() => {
    if (!activeProjectId) return
    if (activeProjectLoadedRef.current !== activeProjectId) return
    if (isReplayingGenerationRef.current) return
    if (isReadOnlyDemo) return

    const workspaceSnapshot = dehydrateWorkspace(buildWorkspaceSnapshot())
    const serialized = JSON.stringify(workspaceSnapshot)
    if (serialized === lastPersistedWorkspaceRef.current) return

    if (workspacePersistTimerRef.current !== null) {
      window.clearTimeout(workspacePersistTimerRef.current)
    }

    workspacePersistTimerRef.current = window.setTimeout(() => {
      void updateWorkspace(activeProjectId, workspaceSnapshot)
        .then(() => {
          lastPersistedWorkspaceRef.current = serialized
        })
        .catch((error) => {
          setSimulationError(error instanceof Error ? error.message : "Workspace update failed.")
        })
    }, 420)

    return () => {
      if (workspacePersistTimerRef.current !== null) {
        window.clearTimeout(workspacePersistTimerRef.current)
      }
    }
  }, [activeProjectId, buildWorkspaceSnapshot, isReadOnlyDemo])

  useEffect(() => {
    if (!isKioskExperience) return

    let idleTimer: number | null = null
    let resetting = false

    const createResetViewport = () => {
      const bounds = editorSurfaceRef.current?.getBoundingClientRect()
      if (!bounds) {
        return {
          x: LEGACY_VIEWPORT_X,
          y: LEGACY_VIEWPORT_Y,
          scale: 1,
          isPanning: false,
        }
      }

      return createCenteredCanvasViewport(bounds.width, bounds.height, 1)
    }

    const scheduleReset = () => {
      if (idleTimer !== null) {
        window.clearTimeout(idleTimer)
      }

      idleTimer = window.setTimeout(() => {
        if (resetting) return
        resetting = true

        void resetKioskSession()
          .then(({ project }) => {
            const record = hydrateProjectRecord(project)
            if (project.prototype_spec) {
              compiledWorkspaceSignaturesRef.current[record.id] = createCompileSignature(record.workspace)
            } else {
              delete compiledWorkspaceSignaturesRef.current[record.id]
            }

            activeProjectLoadedRef.current = null
            lastPersistedWorkspaceRef.current = JSON.stringify(dehydrateWorkspace(record.workspace))
            setProjects([record])
            setActiveProjectId(record.id)
            setView("editor")
            setEditorMode("build")
            setSimulatePhase("idle")
            setPendingProjectMode(null)
            setSimulationError(null)
            setSelectedNodeId(null)
            setSelectedNodeIds([])
            setHoveredNodeId(null)
            setProjectDeleteTarget(null)
            setWorkspacePendingBlueprint(null)
            setWorkspacePendingPromptMode(null)
            setWorkspaceBlueprintState("idle")
            setHubPendingBlueprint(null)
            setHubBlueprintState("idle")
            setBlueprintEntryPoint(null)
            setHubPrompt("")
            setPrompt("")
            setPlanningSteps([])
            setPlanningProfile("presentation")
            setLeftRailTab("prompt")
            setMobileWorkspace("canvas")
            setTimelineTab("timeline")
            setTimelineDockCollapsed(false)
            setCanvasViewport(createResetViewport())
          })
          .catch((error) => {
            setSimulationError(error instanceof Error ? error.message : "Kiosk reset failed.")
          })
          .finally(() => {
            resetting = false
            scheduleReset()
          })
      }, 3 * 60 * 1000)
    }

    const handleActivity = () => scheduleReset()

    scheduleReset()
    window.addEventListener("pointerdown", handleActivity)
    window.addEventListener("pointermove", handleActivity)
    window.addEventListener("keydown", handleActivity)
    window.addEventListener("touchstart", handleActivity)
    window.addEventListener("wheel", handleActivity)

    return () => {
      if (idleTimer !== null) {
        window.clearTimeout(idleTimer)
      }
      window.removeEventListener("pointerdown", handleActivity)
      window.removeEventListener("pointermove", handleActivity)
      window.removeEventListener("keydown", handleActivity)
      window.removeEventListener("touchstart", handleActivity)
      window.removeEventListener("wheel", handleActivity)
    }
  }, [isKioskExperience])

  useEffect(() => {
    if (!activeProjectId) return
    if (activeProjectLoadedRef.current !== activeProjectId) return
    if (isReplayingGenerationRef.current) return
    if (view !== "editor") return
    if (isReadOnlyDemo) return
    const compiledSignature = compiledWorkspaceSignaturesRef.current[activeProjectId]
    if (!compiledSignature) return

    const currentSignature = createCompileSignature(buildWorkspaceSnapshot())
    if (!shouldInvalidateCompiledSpec(currentSignature, compiledSignature)) return

    setSimulationError(null)
    delete compiledWorkspaceSignaturesRef.current[activeProjectId]
    setProjects((prev) =>
      prev.map((project) => {
        if (project.id !== activeProjectId || project.prototypeSpec === null) return project
        return {
          ...project,
          prototypeSpec: null,
        }
      }),
    )
  }, [activeProjectId, buildWorkspaceSnapshot, isReadOnlyDemo, nodes, timelineSections, view])

  useEffect(() => {
    setGroups((prev) => prev.map((group) => ({ ...group, bounds: deriveGroupBounds(nodes, group.nodeIds) })))
  }, [nodes])

  const baseDependencyEdges = useMemo(
    () => (graphEdges.length > 0 ? graphEdges : deriveDependencyEdges(nodes)),
    [graphEdges, nodes],
  )
  const hasPersistedPrototypeSpec = Boolean(activeProject?.prototypeSpec)
  const readiness = useMemo(() => {
    const baseReadiness = deriveSimulationReadiness(nodes, baseDependencyEdges)
    const reviewState =
      blueprintEntryPoint === "hub" ? hubBlueprintState : blueprintEntryPoint === "copilot" ? workspaceBlueprintState : "idle"
    const hasPendingBlueprint = Boolean(activeProject?.workspace.pendingBlueprint ?? workspacePendingBlueprint ?? hubPendingBlueprint)

    if (activeProject?.prototypeSpec) {
      return {
        status: "prototype_ready" as const,
        message: "Playable prototype compiled. Simulation can launch from the saved prototype spec.",
        missingLinks: [],
      }
    }

    if (hasPendingBlueprint || reviewState !== "idle") {
      return {
        status: "systems_connected" as const,
        message: "AI Blueprint pending review. Generate it to replace the current playable build.",
        missingLinks: [],
      }
    }

    if (baseReadiness.status === "prototype_ready" && !activeProject?.prototypeSpec) {
      return {
        status: "systems_connected" as const,
        message: "Generate the prototype to compile a playable simulation.",
        missingLinks: [],
      }
    }

    return baseReadiness
  }, [
    activeProject?.prototypeSpec,
    activeProject?.workspace.pendingBlueprint,
    baseDependencyEdges,
    blueprintEntryPoint,
    hubBlueprintState,
    hubPendingBlueprint,
    nodes,
    workspaceBlueprintState,
    workspacePendingBlueprint,
  ])
  const displayEdges = useMemo(
    () => remapEdgesForCollapsedGroups(nodes, groups, baseDependencyEdges),
    [baseDependencyEdges, groups, nodes],
  )

  const collapsedNodeIds = useMemo(
    () => new Set(groups.filter((group) => group.collapsed).flatMap((group) => group.nodeIds)),
    [groups],
  )

  const collapsedGroupNodes = useMemo(
    () =>
      groups
        .filter((group) => group.collapsed)
        .map((group) => createCollapsedGroupNode(group, nodes))
        .filter((node): node is ModuleNode => Boolean(node)),
    [groups, nodes],
  )

  const displayNodes = useMemo(
    () => [...nodes.filter((node) => !collapsedNodeIds.has(node.id)), ...collapsedGroupNodes],
    [collapsedGroupNodes, collapsedNodeIds, nodes],
  )

  const suggestions = useMemo(() => detectBuildGaps(nodes, timelineSections), [nodes, timelineSections])
  const highlightState = useMemo(
    () => buildNodeHighlightState(displayNodes, displayEdges, hoveredNodeId),
    [displayEdges, displayNodes, hoveredNodeId],
  )

  const selectedNode = useMemo(
    () => displayNodes.find((node) => node.id === selectedNodeId) ?? nodes.find((node) => node.id === selectedNodeId) ?? null,
    [displayNodes, nodes, selectedNodeId],
  )

  useEffect(() => {
    if (!selectedNodeId) return
    const exists = displayNodes.some((node) => node.id === selectedNodeId)
    if (exists) return
    const collapsedGroup = groups.find((group) => group.collapsed && group.nodeIds.includes(selectedNodeId))
    if (collapsedGroup) {
      const collapsedId = `group:${collapsedGroup.id}`
      setSelectedNodeId(collapsedId)
      setSelectedNodeIds([collapsedId])
      return
    }
    setSelectedNodeId(null)
    setSelectedNodeIds([])
  }, [displayNodes, groups, selectedNodeId])

  const setPanelPatch = useCallback((panel: PanelKey, patch: Partial<FloatingPanelState>) => {
    setPanelStates((prev) => {
      const bounds = editorSurfaceRef.current?.getBoundingClientRect()
      const next = { ...prev[panel], ...patch }
      const fitted = bounds ? fitPanelToBounds(next, bounds.width, bounds.height) : next
      const snapshot =
        fitted.dockMode === "floating" && !fitted.collapsed
          ? {
              ...fitted,
              lastFloatingRect: {
                x: fitted.x,
                y: fitted.y,
                width: fitted.width,
                height: fitted.height,
              },
            }
          : fitted
      return { ...prev, [panel]: snapshot }
    })
  }, [])

  const focusPanel = useCallback(
    (panel: PanelKey) => {
      zLayerRef.current += 1
      setPanelPatch(panel, { zIndex: zLayerRef.current })
    },
    [setPanelPatch],
  )

  const dockPanel = useCallback((panel: PanelKey, slot: PanelDockSlot) => {
    const bounds = editorSurfaceRef.current?.getBoundingClientRect()
    if (!bounds) return
    setPanelStates((prev) => ({
      ...prev,
      [panel]: dockPanelState(prev[panel], slot, bounds.width, bounds.height),
    }))
  }, [])

  const handlePanelDragMove = useCallback((panel: PanelKey, pointerX: number, pointerY: number) => {
    const bounds = editorSurfaceRef.current?.getBoundingClientRect()
    if (!bounds) return
    const slot = resolveDockSlot({ x: pointerX, y: pointerY }, bounds, SNAP_ZONE_SIZE)
    if (!slot) {
      setSnapPreview(null)
      return
    }
    const previewState = dockPanelState(panelStatesRef.current[panel], slot, bounds.width, bounds.height)
    setSnapPreview({
      panel,
      slot,
      rect: {
        x: previewState.x,
        y: previewState.y,
        width: previewState.width,
        height: previewState.collapsed ? 52 : previewState.height,
      },
    })
  }, [])

  const handlePanelDragEnd = useCallback(
    (panel: PanelKey, pointerX: number, pointerY: number) => {
      const bounds = editorSurfaceRef.current?.getBoundingClientRect()
      if (!bounds) return
      const slot = resolveDockSlot({ x: pointerX, y: pointerY }, bounds, SNAP_ZONE_SIZE)
      if (slot) {
        dockPanel(panel, slot)
      }
      setActivePanelDrag(null)
      setSnapPreview(null)
    },
    [dockPanel],
  )

  const getCenteredViewport = useCallback(
    (scale = 1): CanvasViewport => {
      const bounds = editorSurfaceRef.current?.getBoundingClientRect()
      if (!bounds) {
        return createCenteredCanvasViewport(WORLD_WIDTH, WORLD_HEIGHT, scale)
      }
      return createCenteredCanvasViewport(bounds.width, bounds.height, scale)
    },
    [],
  )

  const getViewportWorldCenter = useCallback(() => {
    const bounds = editorSurfaceRef.current?.getBoundingClientRect()
    if (!bounds) {
      return { x: WORLD_WIDTH / 2, y: WORLD_HEIGHT / 2 }
    }
    const width = bounds.width
    const height = bounds.height
    return deriveViewportWorldCenter(canvasViewport, width, height)
  }, [canvasViewport])

  const addNodeFromTemplate = useCallback((typeId: string, x: number, y: number) => {
    if (isReadOnlyDemo) {
      showReadOnlyDemoNotice()
      return
    }

    const template = moduleTemplateMap.get(typeId)
    if (!template) return
    const node = createNodeFromTemplate(template, x, y)
    setNodes((prev) => [...prev, node])
    setSelectedNodeId(node.id)
    setSelectedNodeIds([node.id])
  }, [isReadOnlyDemo, showReadOnlyDemoNotice])

  const autoPlaceByTypeIds = useCallback((typeIds: string[]) => {
    const center = getViewportWorldCenter()
    setNodes((prev) => {
      const existingTypes = new Set(prev.map((node) => node.typeId))
      const queuedTypeIds = typeIds.filter((typeId) => moduleTemplateMap.has(typeId) && !existingTypes.has(typeId))
      const next = [...prev]
      queuedTypeIds.forEach((typeId, index) => {
        const template = moduleTemplateMap.get(typeId)
        if (!template) return
        existingTypes.add(typeId)
        const { x, y } = getClusterNodePosition(index, queuedTypeIds.length, center.x, center.y)
        next.push(createNodeFromTemplate(template, x, y))
      })
      return next
    })
  }, [getViewportWorldCenter])

  const runGraphBuildFromBlueprint = useCallback(
    async (blueprint: IntentBlueprint, options: { clearWorkspace: boolean }) => {
      if (!activeProjectId) return false

      const blueprintPlan = dehydrateIntentBlueprint(blueprint)
      if (blueprintPlan.required_modules.length === 0) return false
      const previousWorkspace = buildWorkspaceSnapshot()
      const surfaceBounds = editorSurfaceRef.current?.getBoundingClientRect()
      const centeredViewport = getCenteredViewport(1)
      const centeredViewportWorldCenter = deriveViewportWorldCenter(
        centeredViewport,
        surfaceBounds?.width ?? WORLD_WIDTH,
        surfaceBounds?.height ?? WORLD_HEIGHT,
      )
      shouldCenterGeneratedReplayRef.current = previousWorkspace.nodes.filter((node) => !node.isGroup).length === 0
      generationReplayOffsetRef.current = shouldCenterGeneratedReplayRef.current
        ? createGenerationReplayOffset(options.clearWorkspace ? centeredViewportWorldCenter : getViewportWorldCenter())
        : null

      isReplayingGenerationRef.current = true
      if (workspacePersistTimerRef.current !== null) {
        window.clearTimeout(workspacePersistTimerRef.current)
        workspacePersistTimerRef.current = null
      }

      setSimulationError(null)
      setNodes([])
      setGraphEdges([])
      setGroups([])
      setSelectedNodeId(null)
      setSelectedNodeIds([])
      setHoveredNodeId(null)
      setTimelineSections(createSectionsFromBlueprint(blueprint.levelStructure))
      setGamePlan([...blueprint.coreSystems, ...blueprint.gameplaySystems].slice(0, 5).map((system) => system.name))
      setPlanningSteps(createGenerationPlanningSteps())

      if (options.clearWorkspace) {
        setView("editor")
        setEditorMode("build")
        setSimulatePhase("idle")
        setCanvasViewport(getCenteredViewport(1))
      }

      try {
        const { project: savedBlueprint } = await updateBlueprint(activeProjectId, blueprintPlan)
        upsertProjectDetail(savedBlueprint)

        const generation = await generatePrototype(activeProjectId)
        generationSourceRef.current?.close()
        isReplayingGenerationRef.current = true

        return await new Promise<boolean>((resolve) => {
          let settled = false

          const finalize = async (success: boolean, message?: string) => {
            if (settled) return
            settled = true
            generationSourceRef.current?.close()
            generationSourceRef.current = null
            isReplayingGenerationRef.current = false

            if (success) {
              setWorkspacePendingBlueprint(null)
              setWorkspacePendingPromptMode(null)
              setWorkspaceBlueprintState("idle")
              setHubPendingBlueprint(null)
              setHubBlueprintState("idle")
              setBlueprintEntryPoint(null)
              const { project } = await getProject(activeProjectId)
              const centeredProject =
                shouldCenterGeneratedReplayRef.current
                  ? applyProjectWorkspaceOffset(
                      project,
                      generationReplayOffsetRef.current ?? { x: 0, y: 0 },
                      options.clearWorkspace ? toWorkspaceViewportSnapshot(centeredViewport) : undefined,
                    )
                  : project
              if (centeredProject !== project) {
                await updateWorkspace(activeProjectId, centeredProject.workspace_json)
              }
              upsertProjectDetail(centeredProject, {
                select: true,
                reloadWorkspace: true,
                resetEdges: true,
              })
              setPrompt("")
              shouldCenterGeneratedReplayRef.current = false
              generationReplayOffsetRef.current = null
              resolve(true)
              return
            }

            shouldCenterGeneratedReplayRef.current = false
            generationReplayOffsetRef.current = null
            restoreWorkspaceSnapshot(previousWorkspace)
            setSimulationError(message ?? "Prototype generation failed.")
            resolve(false)
          }

          generationSourceRef.current = streamGenerationEvents(generation.job_id, {
            onEvent: (event: GenerationJobEvent) => {
              setPlanningSteps((prev) =>
                updateGenerationPlanningSteps(prev.length > 0 ? prev : createGenerationPlanningSteps(), event.event_type),
              )

              if (event.event_type === "node_added") {
                const payload = event.payload_json as { node?: Parameters<typeof createNodeFromGraphNode>[0] }
                const graphNode = payload.node
                if (graphNode) {
                  setNodes((prev) =>
                    upsertGeneratedNode(
                      prev,
                      createNodeFromGraphNode(graphNode, generationReplayOffsetRef.current ?? undefined),
                    ),
                  )
                }
                return
              }

              if (event.event_type === "edge_added") {
                const payload = event.payload_json as { edge?: Parameters<typeof createDependencyEdgeFromGraphEdge>[0] }
                const graphEdge = payload.edge
                if (graphEdge) {
                  setGraphEdges((prev) => upsertDependencyEdge(prev, createDependencyEdgeFromGraphEdge(graphEdge)))
                }
                return
              }

              if (event.event_type === "job_failed") {
                const payload = event.payload_json as { message?: string }
                void finalize(false, payload.message ?? "Prototype generation failed.")
                return
              }

              if (event.event_type === "job_completed") {
                void finalize(true)
              }
            },
            onComplete: () => {
              void finalize(true)
            },
            onError: () => {
              void finalize(false, "Generation stream disconnected before completion.")
            },
          })
        })
      } catch (error) {
        generationSourceRef.current?.close()
        generationSourceRef.current = null
        isReplayingGenerationRef.current = false
        shouldCenterGeneratedReplayRef.current = false
        generationReplayOffsetRef.current = null
        restoreWorkspaceSnapshot(previousWorkspace)
        setSimulationError(error instanceof Error ? error.message : "Prototype generation failed.")
        return false
      }
    },
    [activeProjectId, buildWorkspaceSnapshot, getCenteredViewport, restoreWorkspaceSnapshot, upsertProjectDetail],
  )

  const prepareBlueprint = useCallback(
    async (rawPrompt: string, source: BlueprintEntryPoint) => {
      if (isReadOnlyDemo) {
        showReadOnlyDemoNotice()
        return false
      }

      const trimmed = rawPrompt.trim()
      if (!trimmed) return false
      setBlueprintEntryPoint(source)
      setSimulationError(null)
      setPlanningSteps([])

      if (source === "hub") {
        setHubBlueprintState("planning")
      } else {
        setWorkspaceBlueprintState("planning")
      }

      try {
        let projectId = activeProjectId

        if (source === "hub" || !projectId) {
          const { project } = await createProject({
            name: "Prototype Draft",
          })
          projectId = project.id
          upsertProjectDetail(project, {
            select: true,
            reloadWorkspace: true,
            resetEdges: true,
          })
        }

        const { project } = await submitPrompt(projectId, trimmed, {
          planning_profile: planningProfile,
        })
        upsertProjectDetail(project)

        const previewBlueprint = project.workspace_json.pending_blueprint ?? project.blueprint_json
        const blueprint = previewBlueprint
          ? hydrateIntentBlueprint(
              previewBlueprint,
              project.workspace_json.prompt,
              project.workspace_json.pending_blueprint_diagnostics,
            )
          : null

        if (!blueprint) {
          throw new Error("Planner returned an empty blueprint.")
        }

        setGamePlan([...blueprint.coreSystems, ...blueprint.gameplaySystems].slice(0, 5).map((system) => system.name))

        if (source === "hub") {
          setHubPendingBlueprint(blueprint)
          setHubBlueprintState("review")
          setHubGenerating(false)
        } else {
          setWorkspacePendingBlueprint(blueprint)
          setWorkspacePendingPromptMode(project.workspace_json.pending_prompt_mode)
          setWorkspaceBlueprintState("review")
        }

        if (source === "hub") {
          setWorkspacePendingPromptMode(project.workspace_json.pending_prompt_mode)
        }

        return true
      } catch (error) {
        const message = error instanceof Error ? error.message : "Prompt planning failed."
        setSimulationError(message)
        if (source === "hub") {
          setHubPendingBlueprint(null)
          setHubBlueprintState("idle")
          setHubGenerating(false)
        } else {
          setWorkspacePendingBlueprint(null)
          setWorkspacePendingPromptMode(null)
          setWorkspaceBlueprintState("idle")
        }
        if (source === "hub") {
          setWorkspacePendingPromptMode(null)
        }
        setBlueprintEntryPoint(null)
        return false
      }
    },
    [activeProjectId, isReadOnlyDemo, planningProfile, showReadOnlyDemoNotice, upsertProjectDetail],
  )

  const cacheProjectArtifacts = useCallback(
    (
      projectId: string,
      patch: {
        blueprintPlan?: BlueprintPlan | null
        prototypeSpec?: PrototypeSpec | null
      },
    ) => {
      setProjects((prev) =>
        prev.map((project) => {
          if (project.id !== projectId) return project
          return {
            ...project,
            lastModified: new Date(),
            blueprintPlan: patch.blueprintPlan !== undefined ? cloneBlueprintPlan(patch.blueprintPlan) : project.blueprintPlan,
            prototypeSpec: patch.prototypeSpec !== undefined ? clonePrototypeSpec(patch.prototypeSpec) : project.prototypeSpec,
          }
        }),
      )
    },
    [],
  )

  const handlePromptSubmit = useCallback(async () => {
    await prepareBlueprint(prompt, "copilot")
  }, [prepareBlueprint, prompt])

  const handlePromptChip = useCallback(
    async (command: string) => {
      setPrompt(command)
      await prepareBlueprint(command, "copilot")
    },
    [prepareBlueprint],
  )

  const handleHubGenerate = useCallback(async () => {
    const trimmed = hubPrompt.trim()
    if (!trimmed || hubGenerating) return

    setHubGenerating(true)
    const prepared = await prepareBlueprint(trimmed, "hub")
    if (!prepared) {
      setHubGenerating(false)
    }
  }, [hubGenerating, hubPrompt, prepareBlueprint])

  const handleHubPromptChip = useCallback(
    async (command: string) => {
      setHubPrompt(command)
      setHubGenerating(true)
      const prepared = await prepareBlueprint(command, "hub")
      if (!prepared) {
        setHubGenerating(false)
      }
    },
    [prepareBlueprint],
  )

  const handleBlueprintCancel = useCallback(() => {
    const projectId = activeProjectId
    if (blueprintEntryPoint === "hub") {
      setHubPendingBlueprint(null)
      setHubBlueprintState("idle")
      setHubGenerating(false)
    }
    if (blueprintEntryPoint === "copilot") {
      setWorkspacePendingBlueprint(null)
      setWorkspacePendingPromptMode(null)
      setWorkspaceBlueprintState("idle")
    }
    if (blueprintEntryPoint === "hub") {
      setWorkspacePendingPromptMode(null)
    }
    setBlueprintEntryPoint(null)
    if (!projectId) return

    const currentProject = projects.find((project) => project.id === projectId)
    const workspace = currentProject && currentProject.id === activeProjectId ? buildWorkspaceSnapshot() : currentProject?.workspace
    if (!workspace) return

    const clearedWorkspace: ProjectWorkspace = {
      ...workspace,
      pendingBlueprint: null,
      pendingPromptMode: null,
      blueprintState: "idle",
    }
    if (isReadOnlyDemo) {
      return
    }
    const dehydrated = dehydrateWorkspace(clearedWorkspace)
    lastPersistedWorkspaceRef.current = JSON.stringify(dehydrated)
    void updateWorkspace(projectId, dehydrated).catch(() => {
      // preserve local cancel even if the backend update fails
    })
  }, [activeProjectId, blueprintEntryPoint, buildWorkspaceSnapshot, isReadOnlyDemo, projects])

  const handleBlueprintGenerate = useCallback(async () => {
    if (isReadOnlyDemo) {
      showReadOnlyDemoNotice()
      return
    }

    if (!blueprintEntryPoint) return

    const activeBlueprint = blueprintEntryPoint === "hub" ? hubPendingBlueprint : workspacePendingBlueprint
    const activePromptMode = workspacePendingPromptMode ?? activeProject?.workspace.pendingPromptMode ?? "replace"
    if (!activeBlueprint) return
    if (dehydrateIntentBlueprint(activeBlueprint).required_modules.length === 0) return

    if (blueprintEntryPoint === "hub") {
      setHubBlueprintState("generating")
      const success = await runGraphBuildFromBlueprint(activeBlueprint, { clearWorkspace: activePromptMode !== "patch" })
      if (!success) {
        setHubBlueprintState("review")
        return
      }
      setHubPendingBlueprint(null)
      setWorkspacePendingPromptMode(null)
      setHubBlueprintState("idle")
      setBlueprintEntryPoint(null)
      setHubPrompt("")
      setHubGenerating(false)
      return
    }

    setWorkspaceBlueprintState("generating")
    const success = await runGraphBuildFromBlueprint(activeBlueprint, { clearWorkspace: activePromptMode !== "patch" })
    if (!success) {
      setWorkspaceBlueprintState("review")
      return
    }
    setWorkspacePendingBlueprint(null)
    setWorkspacePendingPromptMode(null)
    setWorkspaceBlueprintState("idle")
    setBlueprintEntryPoint(null)
  }, [
    activeProject?.workspace.pendingPromptMode,
    blueprintEntryPoint,
    hubPendingBlueprint,
    isReadOnlyDemo,
    runGraphBuildFromBlueprint,
    showReadOnlyDemoNotice,
    workspacePendingPromptMode,
    workspacePendingBlueprint,
  ])

  const handleBlueprintRemoveSystem = useCallback(
    (bucket: "core" | "gameplay", typeId: string) => {
      if (isReadOnlyDemo) return
      if (blueprintEntryPoint === "hub") {
        setHubPendingBlueprint((prev) =>
          prev ? applyBlueprintEdit(prev, { type: "remove_system", bucket, typeId }, blueprintCatalog) : prev,
        )
      }
      if (blueprintEntryPoint === "copilot") {
        setWorkspacePendingBlueprint((prev) =>
          prev ? applyBlueprintEdit(prev, { type: "remove_system", bucket, typeId }, blueprintCatalog) : prev,
        )
      }
    },
    [blueprintEntryPoint, isReadOnlyDemo],
  )

  const handleBlueprintAddSystem = useCallback(
    (bucket: "core" | "gameplay", typeId: string) => {
      if (isReadOnlyDemo) return
      if (blueprintEntryPoint === "hub") {
        setHubPendingBlueprint((prev) =>
          prev ? applyBlueprintEdit(prev, { type: "add_system", bucket, typeId }, blueprintCatalog) : prev,
        )
      }
      if (blueprintEntryPoint === "copilot") {
        setWorkspacePendingBlueprint((prev) =>
          prev ? applyBlueprintEdit(prev, { type: "add_system", bucket, typeId }, blueprintCatalog) : prev,
        )
      }
    },
    [blueprintEntryPoint, isReadOnlyDemo],
  )

  const handleBlueprintMoveLevelSection = useCallback(
    (index: number, direction: "up" | "down") => {
      if (isReadOnlyDemo) return
      const nextIndex = direction === "up" ? index - 1 : index + 1
      if (blueprintEntryPoint === "hub") {
        setHubPendingBlueprint((prev) =>
          prev
            ? applyBlueprintEdit(prev, { type: "reorder_level_section", fromIndex: index, toIndex: nextIndex }, blueprintCatalog)
            : prev,
        )
      }
      if (blueprintEntryPoint === "copilot") {
        setWorkspacePendingBlueprint((prev) =>
          prev
            ? applyBlueprintEdit(prev, { type: "reorder_level_section", fromIndex: index, toIndex: nextIndex }, blueprintCatalog)
            : prev,
        )
      }
    },
    [blueprintEntryPoint, isReadOnlyDemo],
  )

  const startSimulationTransition = useCallback(() => {
    if (prefersReducedMotion) {
      setEditorMode("simulate")
      setSimulatePhase("idle")
      return
    }

    transitionTimersRef.current.forEach((timer) => window.clearTimeout(timer))
    transitionTimersRef.current = []

    setSimulatePhase("zooming")
    const toHandoff = window.setTimeout(() => {
      setSimulatePhase("handoff")
      setEditorMode("simulate")
    }, 200)
    const toSettle = window.setTimeout(() => {
      setSimulatePhase("settle")
    }, 460)
    const toIdle = window.setTimeout(() => {
      setSimulatePhase("idle")
    }, 740)

    transitionTimersRef.current = [toHandoff, toSettle, toIdle]
  }, [prefersReducedMotion])

  const handleModeChange = useCallback(
    async (mode: EditorMode) => {
      if (mode !== "simulate") {
        transitionTimersRef.current.forEach((timer) => window.clearTimeout(timer))
        transitionTimersRef.current = []
        setSimulatePhase("idle")
        setPendingProjectMode(null)
        setSimulationError(null)
        setEditorMode(mode)
        return
      }

      if (!activeProject) {
        setSimulationError("Select a project before starting simulation.")
        return
      }

      try {
        setSimulationError(null)
        const { project } = await getProject(activeProject.id)
        upsertProjectDetail(project)

        let prototypeSpec = project.prototype_spec
        if (!prototypeSpec) {
          const specResponse = await getProjectSpec(activeProject.id)
          prototypeSpec = specResponse.prototype_spec
        }

        if (prototypeSpec) {
          setWorkspacePendingBlueprint(null)
          setWorkspacePendingPromptMode(null)
          setWorkspaceBlueprintState("idle")
          setBlueprintEntryPoint(null)
          cacheProjectArtifacts(activeProject.id, {
            blueprintPlan: project.blueprint_json,
            prototypeSpec,
          })
          startSimulationTransition()
          return
        }

        const pendingBlueprint = project.workspace_json.pending_blueprint
        if (pendingBlueprint) {
          setWorkspacePendingBlueprint(
            hydrateIntentBlueprint(
              pendingBlueprint,
              project.workspace_json.prompt,
              project.workspace_json.pending_blueprint_diagnostics,
            ),
          )
          setWorkspacePendingPromptMode(project.workspace_json.pending_prompt_mode)
          setWorkspaceBlueprintState("review")
          setBlueprintEntryPoint("copilot")
          setEditorMode("build")
          return
        }

        if (!prototypeSpec) {
          const savedBlueprint = project.workspace_json.pending_blueprint ?? project.blueprint_json
          if (savedBlueprint) {
            setWorkspacePendingBlueprint(
              hydrateIntentBlueprint(
                savedBlueprint,
                project.workspace_json.prompt,
                project.workspace_json.pending_blueprint_diagnostics,
              ),
            )
            setWorkspacePendingPromptMode(project.workspace_json.pending_prompt_mode)
            setWorkspaceBlueprintState("review")
            setBlueprintEntryPoint("copilot")
            throw new Error("Your prompt created an AI Blueprint, but the prototype graph has not been generated yet. Review the AI Blueprint panel and click Generate Prototype first.")
          }

          throw new Error("Simulation spec is unavailable. Start with a prompt, then click Generate Prototype to build the prototype graph before switching to Simulation Mode.")
        }

        cacheProjectArtifacts(activeProject.id, {
          blueprintPlan: project.blueprint_json,
          prototypeSpec,
        })
        startSimulationTransition()
      } catch (error) {
        transitionTimersRef.current.forEach((timer) => window.clearTimeout(timer))
        transitionTimersRef.current = []
        setSimulatePhase("idle")
        setEditorMode("build")
        setSimulationError(error instanceof Error ? error.message : "Simulation failed to prepare.")
      }
    },
    [activeProject, cacheProjectArtifacts, startSimulationTransition, upsertProjectDetail],
  )

  useEffect(() => {
    if (!activeProject || pendingProjectMode !== "simulate") return
    if (activeProjectLoadedRef.current !== activeProject.id) return

    setPendingProjectMode(null)
    void handleModeChange("simulate")
  }, [activeProject, handleModeChange, pendingProjectMode])

  const attachModuleToSection = useCallback((moduleId: string, sectionId: string) => {
    if (isReadOnlyDemo) {
      showReadOnlyDemoNotice()
      return
    }

    setTimelineSections((prev) =>
      prev.map((section) => {
        if (section.id !== sectionId) return { ...section, moduleIds: section.moduleIds.filter((id) => id !== moduleId) }
        if (section.moduleIds.includes(moduleId)) return section
        return { ...section, moduleIds: [...section.moduleIds, moduleId] }
      }),
    )
  }, [isReadOnlyDemo, showReadOnlyDemoNotice])

  const reorderSections = useCallback((dragId: string, targetId: string) => {
    if (isReadOnlyDemo) {
      showReadOnlyDemoNotice()
      return
    }

    const ordered = [...timelineSections].sort((a, b) => a.order - b.order)
    const dragIndex = ordered.findIndex((section) => section.id === dragId)
    const targetIndex = ordered.findIndex((section) => section.id === targetId)
    if (dragIndex === -1 || targetIndex === -1) return

    const [dragged] = ordered.splice(dragIndex, 1)
    ordered.splice(targetIndex, 0, dragged)
    const nextSections = ordered.map((section, index) => ({ ...section, order: index }))
    setTimelineSections(nextSections)

    if (!activeProjectId || !activeProject?.prototypeSpec) return

    void patchProjectSpec(activeProjectId, [
      {
        op: "reorder_level_structure",
        level_structure: [...nextSections]
          .sort((left, right) => left.order - right.order)
          .map((section) => section.id),
      },
    ])
      .then(({ project }) => {
        upsertProjectDetail(project, {
          reloadWorkspace: true,
          resetEdges: true,
        })
      })
      .catch((error) => {
        setSimulationError(error instanceof Error ? error.message : "Timeline reorder failed.")
      })
  }, [activeProject?.prototypeSpec, activeProjectId, isReadOnlyDemo, showReadOnlyDemoNotice, timelineSections, upsertProjectDetail])

  const openProject = useCallback(
    async (projectId: string, mode: EditorMode = "build") => {
      try {
        const { project } = await getProject(projectId)
        let projectDetail = project

        if (!project.prototype_spec) {
          const specResponse = await getProjectSpec(projectId)
          if (specResponse.prototype_spec) {
            projectDetail = {
              ...project,
              prototype_spec: specResponse.prototype_spec,
              simulation_ready: true,
            }
          }
        }

        upsertProjectDetail(projectDetail, {
          select: true,
          reloadWorkspace: true,
          resetEdges: true,
        })
        setView("editor")
        setSimulatePhase("idle")
        setSimulationError(null)
        setPendingProjectMode(mode === "simulate" ? "simulate" : null)
        setEditorMode(mode === "simulate" ? "build" : mode)
      } catch (error) {
        setSimulationError(error instanceof Error ? error.message : "Project failed to load.")
      }
    },
    [upsertProjectDetail],
  )

  const createNewProject = useCallback(async () => {
    if (isReadOnlyDemo) {
      showReadOnlyDemoNotice()
      return
    }

    try {
      const { project } = await createProject({
        name: `New Project ${projects.length + 1}`,
      })
      upsertProjectDetail(project, {
        select: true,
        reloadWorkspace: true,
        resetEdges: true,
      })
      setView("editor")
      setSimulationError(null)
      setPendingProjectMode(null)
      setEditorMode("build")
      setCanvasViewport(getCenteredViewport(1))
    } catch (error) {
      setSimulationError(error instanceof Error ? error.message : "Project creation failed.")
    }
  }, [getCenteredViewport, isReadOnlyDemo, projects.length, showReadOnlyDemoNotice, upsertProjectDetail])

  const openPresentationScreen = useCallback(
    async (projectId?: string) => {
      const targetProjectId = projectId ?? activeProject?.id
      if (!targetProjectId) {
        setSimulationError("Select a project before opening the presentation screen.")
        return
      }

      try {
        const { project } = await getProject(targetProjectId)
        let hydratedProject = project
        if (!project.prototype_spec) {
          const specResponse = await getProjectSpec(targetProjectId)
          if (specResponse.prototype_spec) {
            hydratedProject = {
              ...project,
              prototype_spec: specResponse.prototype_spec,
              simulation_ready: true,
            }
          }
        }

        upsertProjectDetail(hydratedProject, {
          select: targetProjectId === activeProject?.id,
          reloadWorkspace: targetProjectId === activeProject?.id,
          resetEdges: targetProjectId === activeProject?.id,
        })

        presentationChannelRef.current?.postMessage({
          type: "presentation-sync",
          projectId: targetProjectId,
          projectName: hydratedProject.name,
          hasPrototype: Boolean(hydratedProject.prototype_spec),
          mode: editorMode,
          timestamp: Date.now(),
        })

        const presentationWindow = window.open(
          `/present/${targetProjectId}/`,
          "levelyst-presentation",
          "popup=yes,width=1600,height=900,resizable=yes",
        )

        if (presentationWindow) {
          presentationWindowRef.current = presentationWindow
          setPlanningProfile("presentation")
        }
      } catch (error) {
        setSimulationError(error instanceof Error ? error.message : "Presentation screen failed to open.")
      }
    },
    [activeProject?.id, editorMode, upsertProjectDetail],
  )

  const duplicateProject = useCallback(
    async (projectId: string) => {
      if (isReadOnlyDemo) {
        showReadOnlyDemoNotice()
        return
      }

      try {
        const { project } = await createProject({
          duplicate_from: projectId,
        })
        upsertProjectDetail(project)
      } catch (error) {
        setSimulationError(error instanceof Error ? error.message : "Project duplication failed.")
      }
    },
    [isReadOnlyDemo, showReadOnlyDemoNotice, upsertProjectDetail],
  )

  const confirmDeleteProject = useCallback(async () => {
    if (!projectDeleteTarget) return
    if (isReadOnlyDemo) {
      showReadOnlyDemoNotice()
      return
    }

    try {
      const { project } = await deleteProject(projectDeleteTarget.id)
      setProjects((prev) => prev.filter((entry) => entry.id !== project.id))
      setProjectDeleteTarget(null)

      if (activeProjectId === project.id) {
        activeProjectLoadedRef.current = null
        setActiveProjectId(null)
        setView("dashboard")
        setEditorMode("build")
        setPendingProjectMode(null)
        setWorkspacePendingBlueprint(null)
        setWorkspacePendingPromptMode(null)
        setWorkspaceBlueprintState("idle")
        setSimulationError(null)
      }
    } catch (error) {
      setSimulationError(error instanceof Error ? error.message : "Project delete failed.")
    }
  }, [activeProjectId, isReadOnlyDemo, projectDeleteTarget, showReadOnlyDemoNotice])

  const exportProject = useCallback(async (projectId: string) => {
    try {
      const { project } = await getProject(projectId)
      const blob = new Blob([JSON.stringify(project, null, 2)], { type: "application/json" })
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = `${slugify(project.name)}-snapshot.json`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)
    } catch (error) {
      setSimulationError(error instanceof Error ? error.message : "Project export failed.")
    }
  }, [])

  const onApplySuggestion = useCallback(
    (suggestion: CopilotSuggestion) => {
      if (isReadOnlyDemo) {
        showReadOnlyDemoNotice()
        return
      }

      if (suggestion.moduleTypeIds.length === 0) return
      autoPlaceByTypeIds(suggestion.moduleTypeIds)
    },
    [autoPlaceByTypeIds, isReadOnlyDemo, showReadOnlyDemoNotice],
  )

  const handleSelectNode = useCallback((nodeId: string, additive = false) => {
    if (additive) {
      setSelectedNodeIds((prev) => (prev.includes(nodeId) ? prev.filter((id) => id !== nodeId) : [...prev, nodeId]))
      setSelectedNodeId(nodeId)
      return
    }

    setSelectedNodeId(nodeId)
    setSelectedNodeIds([nodeId])
  }, [])

  const handleMoveNode = useCallback(
    (nodeId: string, x: number, y: number) => {
      if (isReadOnlyDemo) {
        showReadOnlyDemoNotice()
        return
      }

      setNodes((prev) => prev.map((node) => (node.id === nodeId ? { ...node, x, y } : node)))
    },
    [isReadOnlyDemo, showReadOnlyDemoNotice],
  )

  const handleGroupSelection = useCallback(() => {
    if (isReadOnlyDemo) {
      showReadOnlyDemoNotice()
      return
    }

    const realIds = selectedNodeIds.filter((nodeId) => nodes.some((node) => node.id === nodeId))
    if (realIds.length < 2) return
    const groupId = `group-${Date.now()}`
    const nextGroup: ModuleGroup = {
      id: groupId,
      label: `Group ${groups.length + 1}`,
      nodeIds: realIds,
      collapsed: true,
      bounds: deriveGroupBounds(nodes, realIds),
    }
    setGroups((prev) => [...prev, nextGroup])
    setSelectedNodeId(`group:${groupId}`)
    setSelectedNodeIds([`group:${groupId}`])
  }, [groups.length, isReadOnlyDemo, nodes, selectedNodeIds, showReadOnlyDemoNotice])

  const handleToggleGroup = useCallback(
    (groupId: string) => {
      setGroups((prev) =>
        prev.map((group) =>
          group.id === groupId ? { ...group, collapsed: !group.collapsed, bounds: deriveGroupBounds(nodes, group.nodeIds) } : group,
        ),
      )
    },
    [nodes],
  )

  const handleAutoArrange = useCallback(() => {
    if (isReadOnlyDemo) {
      showReadOnlyDemoNotice()
      return
    }

    setNodes((prev) => autoArrangeNodes(prev, deriveDependencyEdges(prev), groups))
  }, [groups, isReadOnlyDemo, showReadOnlyDemoNotice])

  const handleRuntimeError = useCallback((message: string) => {
    transitionTimersRef.current.forEach((timer) => window.clearTimeout(timer))
    transitionTimersRef.current = []
    setSimulatePhase("idle")
    setEditorMode("build")
    setSimulationError(message)
  }, [])

  const panelsHiddenInSim = editorMode === "simulate"
  const activePrototypeSpec = activeProject?.prototypeSpec ?? null

  useEffect(() => {
    if (!isDesktopFloating || panelsHiddenInSim) {
      setActivePanelDrag(null)
      setSnapPreview(null)
    }
  }, [isDesktopFloating, panelsHiddenInSim])

  const hudLayout = useMemo<CanvasHudLayout>(() => {
    const fallback = createDefaultHudLayout()
    if (!isDesktopFloating || panelsHiddenInSim) return fallback

    const bounds = editorSurfaceRef.current?.getBoundingClientRect()
    if (!bounds) return fallback

    const occluders = Object.values(panelStates).map((panel) => ({
      x: panel.x,
      y: panel.y,
      width: panel.width,
      height: panel.collapsed ? 52 : panel.height,
    }))

    return resolveCanvasHudLayout(bounds.width, bounds.height, occluders)
  }, [isDesktopFloating, panelStates, panelsHiddenInSim])

  const selectedRealNodeCount = selectedNodeIds.filter((nodeId) => nodes.some((node) => node.id === nodeId)).length
  const activeBlueprintState: BlueprintState =
    blueprintEntryPoint === "hub" ? hubBlueprintState : blueprintEntryPoint === "copilot" ? workspaceBlueprintState : "idle"
  const activeBlueprint =
    blueprintEntryPoint === "hub" ? hubPendingBlueprint : blueprintEntryPoint === "copilot" ? workspacePendingBlueprint : null
  const activePromptMode: PendingPromptMode =
    blueprintEntryPoint === "copilot" || blueprintEntryPoint === "hub"
      ? workspacePendingPromptMode ?? activeProject?.workspace.pendingPromptMode ?? "replace"
      : null
  const activeBlueprintEngineTarget = activeBlueprint?.gameType === "3d_fps" ? "web_3d" : "web_2d"
  const activeCopilotPromptChips = useMemo(() => {
    if (!activeProject?.prototypeSpec) return promptChips
    const activeGameType = activeProject.blueprintPlan?.game_type ?? (activeProject.prototypeSpec.runtime === "web_3d" ? "3d_fps" : "2d_platformer")
    return activeGameType === "3d_fps" ? fpsFollowUpChips : platformerFollowUpChips
  }, [activeProject?.blueprintPlan?.game_type, activeProject?.prototypeSpec])
  const blueprintReviewVariant: "initial" | "update" = activeProject?.prototypeSpec ? "update" : "initial"
  const activeBlueprintTypeIds = useMemo(
    () => new Set([...(activeBlueprint?.coreSystems ?? []), ...(activeBlueprint?.gameplaySystems ?? [])].map((system) => system.typeId)),
    [activeBlueprint],
  )
  const addableCoreSystems = useMemo(
    () =>
      blueprintCatalog
        .filter((item) => item.category === "CORE" && !activeBlueprintTypeIds.has(item.typeId))
        .filter(
          (item) =>
            editorModuleTemplateSeeds.find((template) => template.typeId === item.typeId)?.engineTarget === activeBlueprintEngineTarget,
        )
        .map<BlueprintSystemItem>((item) => ({ typeId: item.typeId, name: item.name, category: item.category })),
    [activeBlueprintEngineTarget, activeBlueprintTypeIds],
  )
  const addableGameplaySystems = useMemo(
    () =>
      blueprintCatalog
        .filter((item) => item.category !== "CORE" && !activeBlueprintTypeIds.has(item.typeId))
        .filter(
          (item) =>
            editorModuleTemplateSeeds.find((template) => template.typeId === item.typeId)?.engineTarget === activeBlueprintEngineTarget,
        )
        .map<BlueprintSystemItem>((item) => ({ typeId: item.typeId, name: item.name, category: item.category })),
    [activeBlueprintEngineTarget, activeBlueprintTypeIds],
  )
  const effectiveMotionIntensity: MotionIntensity = prefersReducedMotion ? "reduced" : uiPreferences.motionIntensity
  const shouldSuppressAmbientMotion = activeBlueprintState !== "idle" || simulatePhase !== "idle"
  const shouldShowCoachmarks =
    view === "editor" && activeBlueprintState === "idle" && uiPreferences.coachmarksSeenVersion < ONBOARDING_VERSION

  const uiBlockerState: UiBlockerState = useMemo(() => {
    if (simulationError) return "simulation_error"
    if (activeBlueprint && addableCoreSystems.length === 0 && addableGameplaySystems.length === 0) return "no_compatible_modules"
    if (!hasPersistedPrototypeSpec && readiness.status === "missing_dependencies" && editorMode === "simulate") {
      return "missing_dependencies"
    }
    return "none"
  }, [
    activeBlueprint,
    addableCoreSystems.length,
    addableGameplaySystems.length,
    editorMode,
    hasPersistedPrototypeSpec,
    readiness.status,
    simulationError,
  ])

  const uiBlockerMessage = useMemo(() => {
    if (uiBlockerState === "simulation_error") return simulationError ?? "Simulation could not start."
    if (uiBlockerState === "missing_dependencies") return "Simulation blocked by missing required links in your graph."
    if (uiBlockerState === "no_compatible_modules") return "No compatible systems remain for this blueprint revision."
    return ""
  }, [simulationError, uiBlockerState])

  const focusPanelArea = useCallback(
    (panel: PanelKey) => {
      if (view === "dashboard") {
        setView("editor")
      }
      if (isMobile) {
        setMobileWorkspace(panel === "library" ? "library" : panel === "copilot" ? "copilot" : "timeline")
        return
      }

      if (panel === "timeline") {
        setTimelineDockCollapsed(false)
        return
      }

      setLeftRailTab(panel === "library" ? "library" : "prompt")
    },
    [isMobile, view],
  )

  const handleHelpJump = useCallback(
    (area: "canvas" | "library" | "copilot" | "timeline") => {
      if (view === "dashboard" && area !== "canvas") {
        setView("editor")
      }
      if (area === "canvas") {
        if (isMobile) setMobileWorkspace("canvas")
        setShowHelpOverlay(false)
        return
      }
      if (area === "timeline") setTimelineTab("timeline")
      focusPanelArea(area === "timeline" ? "timeline" : area)
      setShowHelpOverlay(false)
    },
    [focusPanelArea, isMobile, view],
  )

  const commandContext: CommandContext = {
    mode: editorMode,
    selectedNodeCount: selectedRealNodeCount,
    readiness: readiness.status,
  }

  const commandActions = useMemo<CommandAction[]>(() => {
    const readOnlyReason = isReadOnlyDemo ? "Read-only in fallback demo mode." : undefined

    return [
      { id: "mode-build", label: "Switch to Build Mode", group: "Mode", shortcut: "B" },
      {
        id: "mode-simulate",
        label: "Switch to Simulate Mode",
        group: "Mode",
        shortcut: "S",
        disabledReason:
          !hasPersistedPrototypeSpec && commandContext.readiness === "missing_dependencies"
            ? "Simulate blocked: missing required links."
            : undefined,
      },
      { id: "mode-debug", label: "Switch to Debug Mode", group: "Mode", shortcut: "D" },
      { id: "panel-library", label: "Focus Module Library", group: "Panels", shortcut: "L" },
      { id: "panel-copilot", label: "Focus AI Copilot", group: "Panels", shortcut: "C" },
      { id: "panel-timeline", label: "Focus Timeline + Inspector", group: "Panels", shortcut: "T" },
      { id: "auto-arrange", label: "Auto Arrange Graph", group: "Graph", disabledReason: readOnlyReason },
      {
        id: "group-selection",
        label: "Group Selected Nodes",
        group: "Graph",
        disabledReason: readOnlyReason ?? (commandContext.selectedNodeCount < 2 ? "Select at least two nodes first." : undefined),
      },
      {
        id: "simulate",
        label: "Run Simulation",
        group: "Graph",
        disabledReason:
          !hasPersistedPrototypeSpec && commandContext.readiness === "missing_dependencies"
              ? "Simulate blocked: missing required links."
              : undefined,
      },
      { id: "add-movement", label: "Add Platformer Controller", group: "Modules", disabledReason: readOnlyReason },
      { id: "add-camera", label: "Add Side-Scroll Camera", group: "Modules", disabledReason: readOnlyReason },
      { id: "add-combat", label: "Add Hitscan Weapon", group: "Modules", disabledReason: readOnlyReason },
      { id: "add-enemy-ai", label: "Add Basic Zombie", group: "Modules", disabledReason: readOnlyReason },
      { id: "add-wave-manager", label: "Add Wave Manager", group: "Modules", disabledReason: readOnlyReason },
      ...projects.slice(0, 8).map((project) => ({
        id: "open-project" as const,
        label: `Open ${project.name}`,
        group: "Projects" as const,
        meta: project.id,
        })),
    ]
  }, [commandContext.readiness, commandContext.selectedNodeCount, hasPersistedPrototypeSpec, isReadOnlyDemo, projects])

  const runCommandAction = useCallback(
    (action: CommandAction) => {
      if (action.disabledReason) return
      switch (action.id) {
        case "mode-build":
          handleModeChange("build")
          break
        case "mode-simulate":
          handleModeChange("simulate")
          break
        case "mode-debug":
          handleModeChange("debug")
          break
        case "panel-library":
          focusPanelArea("library")
          break
        case "panel-copilot":
          focusPanelArea("copilot")
          break
        case "panel-timeline":
          setTimelineTab("timeline")
          focusPanelArea("timeline")
          break
        case "auto-arrange":
          handleAutoArrange()
          break
        case "group-selection":
          handleGroupSelection()
          break
        case "simulate":
          handleModeChange("simulate")
          break
        case "add-movement":
          autoPlaceByTypeIds(["player/platformer_controller"])
          break
        case "add-camera":
          autoPlaceByTypeIds(["camera/side_scroll"])
          break
        case "add-combat":
          autoPlaceByTypeIds(["combat/hitscan_weapon"])
          break
        case "add-enemy-ai":
          autoPlaceByTypeIds(["ai/basic_zombie"])
          break
        case "add-wave-manager":
          autoPlaceByTypeIds(["systems/wave_manager"])
          break
        case "open-project":
          if (action.meta) openProject(action.meta)
          break
      }
      setShowCommandPalette(false)
    },
    [
      autoPlaceByTypeIds,
      focusPanelArea,
      handleAutoArrange,
      handleGroupSelection,
      handleModeChange,
      openProject,
    ],
  )

  const handleOpenLibrary = useCallback(() => {
    focusPanelArea("library")
  }, [focusPanelArea])

  const handleAddCoreChain = useCallback(() => {
    if (isReadOnlyDemo) {
      showReadOnlyDemoNotice()
      return
    }

    autoPlaceByTypeIds([...editorCoreChainModuleIds])
  }, [autoPlaceByTypeIds, isReadOnlyDemo, showReadOnlyDemoNotice])

  const handleFixDependencies = useCallback(() => {
    if (isReadOnlyDemo) {
      showReadOnlyDemoNotice()
      return
    }

    handleModeChange("build")
    handleAddCoreChain()
  }, [handleAddCoreChain, handleModeChange, isReadOnlyDemo, showReadOnlyDemoNotice])

  const handleDismissCoachmarks = useCallback(() => {
    setUiPreferences((prev) => ({ ...prev, coachmarksSeenVersion: ONBOARDING_VERSION }))
  }, [])

  const groupedCommandActions = useMemo(() => {
    const order: Array<CommandAction["group"]> = ["Mode", "Panels", "Graph", "Modules", "Projects"]
    return order
      .map((group) => ({ group, items: commandActions.filter((action) => action.group === group) }))
      .filter((entry) => entry.items.length > 0)
  }, [commandActions])

  if (view === "dashboard") {
    return (
      <TooltipProvider delayDuration={180}>
        <div
          data-lv-motion={effectiveMotionIntensity}
          className="flex min-h-screen flex-col bg-[radial-gradient(circle_at_20%_10%,rgba(59,130,246,0.25),transparent_40%),radial-gradient(circle_at_80%_80%,rgba(139,92,246,0.22),transparent_45%),var(--lv-bg)] text-white"
        >
          <header className="lv-glass-shell rounded-none border-x-0 border-t-0 px-4 py-4 lg:px-8">
            <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3">
              <div>
                <h1 className="font-display text-2xl text-white">Levelyst.AI</h1>
                <p className="text-sm text-cyan-100/70">AI Game Engine + Creative Studio</p>
              </div>
              <div className="flex items-center gap-3">
                <Badge className="border border-cyan-300/35 bg-cyan-300/10 text-cyan-100">{experienceStatusBadgeLabel}</Badge>
                <Button
                  variant="outline"
                  size="icon"
                  className="lv-chrome-control text-white"
                  onClick={() => setShowCommandPalette(true)}
                >
                  <Search className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="lv-chrome-control text-white"
                  onClick={() => {
                    setShowHelpOverlay(true)
                    setUiPreferences((prev) => ({ ...prev, helpOverlayDismissed: false }))
                  }}
                >
                  <CircleHelp className="h-4 w-4" />
                </Button>
                <Button onClick={createNewProject} disabled={isReadOnlyDemo} className="bg-gradient-to-r from-blue-500 to-purple-500 text-white">
                  <Wand2 className="mr-2 h-4 w-4" />
                  New Project
                </Button>
              </div>
            </div>
          </header>

          <main className="mx-auto w-full max-w-7xl flex-1 space-y-8 px-4 py-8 lg:px-8">
            {isReadOnlyDemo ? (
              <section className="rounded-2xl border border-amber-300/35 bg-amber-400/10 px-4 py-3 text-sm text-amber-50/90">
                <p className="font-semibold text-white">Public Demo Mode</p>
                <p className="mt-1">{readOnlyDemoMessage}</p>
              </section>
            ) : isPublicMode ? (
              <section className="rounded-2xl border border-cyan-300/35 bg-cyan-400/10 px-4 py-3 text-sm text-cyan-50/90">
                <p className="font-semibold text-white">{experienceMessageTitle}</p>
                <p className="mt-1">{publicModeMessage}</p>
              </section>
            ) : null}

            <UiBlockerBanner
              state={uiBlockerState}
              message={uiBlockerMessage}
              onFixDependencies={isReadOnlyDemo ? showReadOnlyDemoNotice : handleFixDependencies}
              onOpenLibrary={handleOpenLibrary}
              onAddCoreChain={isReadOnlyDemo ? showReadOnlyDemoNotice : handleAddCoreChain}
            />

            <section className="lv-glass-shell rounded-[28px] p-6">
              <p className="text-xs uppercase tracking-[0.2em] text-cyan-100/70">AI Prototype Builder</p>
              <h2 className="mt-2 text-2xl font-semibold">Describe your game idea</h2>
              <p className="mt-2 text-sm text-cyan-100/70">Generate a project graph and launch directly into the engine workspace.</p>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <Input
                  value={hubPrompt}
                  disabled={isReadOnlyDemo}
                  onChange={(event) => setHubPrompt(event.target.value)}
                  placeholder="Create a Mario-like platformer..."
                  className="lv-chrome-control min-w-[280px] flex-1 text-white placeholder:text-cyan-100/45"
                />
                <Button
                  onClick={handleHubGenerate}
                  disabled={isReadOnlyDemo || hubGenerating || (blueprintEntryPoint === "hub" && activeBlueprintState !== "idle")}
                  className="bg-gradient-to-r from-blue-500 to-purple-500 text-white"
                >
                  <Sparkles className="mr-2 h-4 w-4" />
                  {hubGenerating ? "Generating..." : "Generate Prototype"}
                </Button>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {promptChips.map((command) => (
                  <button
                    key={command}
                    type="button"
                    disabled={isReadOnlyDemo}
                    onClick={() => void handleHubPromptChip(command)}
                    className="lv-chrome-control rounded-full px-3 py-1 text-xs text-cyan-100/90 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
                  >
                    <Sparkles className="mr-1 inline h-3 w-3" />
                    {command}
                  </button>
                ))}
              </div>
            </section>

            <section>
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-xl font-semibold">Projects</h3>
              </div>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {projects.map((project) => (
                  <Card
                    key={project.id}
                    className="lv-glass-shell group overflow-hidden transition hover:border-cyan-300/40"
                  >
                    <CardContent className="p-4">
                      <div className="space-y-4">
                        <div className="overflow-hidden rounded-xl border border-white/10 bg-black/30">
                          <img src={project.previewThumbnail} alt={project.name} className="h-36 w-full object-cover transition duration-500 group-hover:scale-[1.03]" />
                        </div>
                        <div>
                          <p className="text-xs text-cyan-100/60">{formatProjectLastModified(project.lastModified, hasMounted)}</p>
                          <h4 className="mt-1 text-lg font-semibold">{project.name}</h4>
                          <p className="text-xs text-blue-100/75">Genre: {project.genre}</p>
                        </div>
                        <div className="lv-glass-hud rounded-lg p-3">
                          <p className="text-[10px] uppercase tracking-[0.18em] text-cyan-100/70">Systems</p>
                          <p className="mt-1 text-xs text-white/85">{summarizeSystems(project.workspace.nodes)}</p>
                        </div>
                        <div className="flex items-center gap-2 text-xs">
                          <Badge variant="outline" className="border-cyan-300/35 text-cyan-100">
                            Modules: {project.workspace.nodes.length}
                          </Badge>
                        </div>
                        <div className="space-y-2">
                          <div className="grid grid-cols-2 gap-2">
                            <Button size="sm" variant="outline" className="lv-chrome-control text-white" onClick={() => openProject(project.id, "build")}>
                              <FolderOpen className="mr-2 h-3.5 w-3.5" />
                              Open
                            </Button>
                            <Button size="sm" variant="outline" className="lv-chrome-control text-white" onClick={() => openProject(project.id, "simulate")}>
                              <PlayCircle className="mr-2 h-3.5 w-3.5" />
                              Simulate
                            </Button>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Button size="sm" variant="outline" className="lv-chrome-control flex-1 text-white sm:flex-none" onClick={() => void openPresentationScreen(project.id)}>
                              <Gamepad2 className="mr-2 h-3.5 w-3.5" />
                              Present
                            </Button>
                            <Button size="sm" variant="outline" disabled={isReadOnlyDemo} className="lv-chrome-control flex-1 text-white sm:flex-none" onClick={() => duplicateProject(project.id)}>
                              <Copy className="mr-2 h-3.5 w-3.5" />
                              Duplicate
                            </Button>
                            <Button size="sm" variant="outline" className="lv-chrome-control flex-1 text-white sm:flex-none" onClick={() => exportProject(project.id)}>
                              <Download className="mr-2 h-3.5 w-3.5" />
                              Export
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={isReadOnlyDemo}
                              className="flex-1 border-red-300/25 bg-red-500/10 text-red-100 hover:bg-red-500/20 sm:flex-none"
                              onClick={() => setProjectDeleteTarget(project)}
                            >
                              <Trash2 className="mr-2 h-3.5 w-3.5" />
                              Delete
                            </Button>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>

            <section>
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-xl font-semibold">From the Community</h3>
                <Button variant="ghost" className="text-cyan-200" onClick={() => setShowCommunityModal(true)}>
                  View All
                </Button>
              </div>
              <div className="grid gap-4 lg:grid-cols-3">
                {communityProjects.map((project) => (
                  <CommunityProjectCard key={project.id} project={project} onUseAsBase={isReadOnlyDemo ? undefined : () => createNewProject()} />
                ))}
              </div>
            </section>
          </main>

          <Dialog open={showCommunityModal} onOpenChange={setShowCommunityModal}>
            <DialogContent className="lv-glass-modal max-w-6xl text-white">
              <DialogHeader>
                <DialogTitle className="text-2xl">Community Projects</DialogTitle>
              </DialogHeader>
              <div className="lv-scrollbar-hidden grid max-h-[70vh] gap-4 overflow-auto md:grid-cols-2 xl:grid-cols-3">
                {communityProjects.map((project) => (
                  <CommunityProjectCard key={project.id} project={project} onUseAsBase={isReadOnlyDemo ? undefined : () => createNewProject()} />
                ))}
              </div>
            </DialogContent>
          </Dialog>

          <BlueprintReviewPanel
            open={blueprintEntryPoint !== null && activeBlueprintState !== "idle" && Boolean(activeBlueprint)}
            state={activeBlueprintState}
            mode={activePromptMode}
            variant={blueprintReviewVariant}
            blueprint={activeBlueprint}
            addableCoreSystems={addableCoreSystems}
            addableGameplaySystems={addableGameplaySystems}
            onCancel={handleBlueprintCancel}
            onGenerate={handleBlueprintGenerate}
            onRemoveSystem={handleBlueprintRemoveSystem}
            onAddSystem={handleBlueprintAddSystem}
            onMoveLevelSection={handleBlueprintMoveLevelSection}
            readOnly={isReadOnlyDemo}
          />

          <AlertDialog open={Boolean(projectDeleteTarget)} onOpenChange={(open) => !open && setProjectDeleteTarget(null)}>
            <AlertDialogContent className="lv-glass-modal text-white">
              <AlertDialogHeader>
                <AlertDialogTitle>Delete project?</AlertDialogTitle>
                <AlertDialogDescription className="text-cyan-100/75">
                  {projectDeleteTarget
                    ? `Delete "${projectDeleteTarget.name}" and its saved blueprint, graph, spec, and generation history. This cannot be undone.`
                    : "Delete this project and its saved prototype data. This cannot be undone."}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="lv-chrome-control text-white hover:text-white">
                  Cancel
                </AlertDialogCancel>
                <AlertDialogAction
                  className="bg-red-500 text-white hover:bg-red-400"
                  disabled={isReadOnlyDemo}
                  onClick={confirmDeleteProject}
                >
                  Delete Project
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <HelpOverlay
            open={showHelpOverlay}
            onOpenChange={(open) => {
              setShowHelpOverlay(open)
              if (!open) {
                setUiPreferences((prev) => ({ ...prev, helpOverlayDismissed: true }))
              }
            }}
            onJumpToArea={handleHelpJump}
            onReplayCoachmarks={() => {
              setUiPreferences((prev) => ({ ...prev, coachmarksSeenVersion: 0 }))
              setShowHelpOverlay(false)
            }}
          />

          <CommandDialog open={showCommandPalette} onOpenChange={setShowCommandPalette}>
            <CommandInput placeholder="Search actions..." />
            <CommandList>
              <CommandEmpty>No matching command.</CommandEmpty>
              {groupedCommandActions.map((group) => (
                <CommandGroup key={group.group} heading={group.group}>
                  {group.items.map((action) => (
                    <CommandItem
                      key={`${action.id}-${action.meta ?? ""}-${action.label}`}
                      onSelect={() => runCommandAction(action)}
                      disabled={Boolean(action.disabledReason)}
                    >
                      <span>{action.label}</span>
                      {action.disabledReason ? (
                        <CommandShortcut>{action.disabledReason}</CommandShortcut>
                      ) : (
                        action.shortcut && <CommandShortcut>{action.shortcut}</CommandShortcut>
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))}
            </CommandList>
          </CommandDialog>
        </div>
      </TooltipProvider>
    )
  }

  return (
    <TooltipProvider delayDuration={180}>
      <div
        data-lv-motion={effectiveMotionIntensity}
        className="flex h-screen flex-col overflow-hidden bg-[radial-gradient(circle_at_20%_10%,rgba(59,130,246,0.2),transparent_40%),radial-gradient(circle_at_80%_80%,rgba(139,92,246,0.18),transparent_42%),var(--lv-bg)] text-white"
      >
        <TopControlBar
          projectName={activeProject?.name ?? "Untitled Project"}
          mode={editorMode}
          motionIntensity={effectiveMotionIntensity}
          readiness={readiness}
          layoutMode={layoutMode}
          onDashboard={() => setView("dashboard")}
          onOpenHelp={() => {
            setShowHelpOverlay(true)
            setUiPreferences((prev) => ({ ...prev, helpOverlayDismissed: false }))
          }}
          onOpenCommandPalette={() => setShowCommandPalette(true)}
          onOpenPresentation={() => void openPresentationScreen()}
          onSetMotionIntensity={(motionIntensity) =>
            setUiPreferences((prev) => ({
              ...prev,
              motionIntensity,
            }))
          }
          onModeChange={handleModeChange}
        />

        <UiBlockerBanner
          state={uiBlockerState}
          message={uiBlockerMessage}
          onFixDependencies={handleFixDependencies}
          onOpenLibrary={handleOpenLibrary}
          onAddCoreChain={handleAddCoreChain}
        />

        <main className="min-h-0 flex-1 p-2 md:p-3">
          {!isMobile && (
            <div
              className={cn(
                "grid h-full min-h-0 gap-3",
                editorMode === "simulate"
                  ? "grid-cols-1"
                  : isCompactDesktop
                    ? "grid-cols-[320px_minmax(0,1fr)]"
                    : "grid-cols-[360px_minmax(0,1fr)]",
              )}
            >
              {editorMode !== "simulate" && (
                <aside className="min-h-0">
                  <Tabs value={leftRailTab} onValueChange={(value) => setLeftRailTab(value as LeftRailTab)} className="flex h-full min-h-0 flex-col">
                    <TabsList className="lv-glass-hud grid w-full grid-cols-2 rounded-2xl p-1">
                      <TabsTrigger value="prompt" className="rounded-xl data-[state=active]:bg-white/10 data-[state=active]:text-white">
                        Prompt
                      </TabsTrigger>
                      <TabsTrigger value="library" className="rounded-xl data-[state=active]:bg-white/10 data-[state=active]:text-white">
                        Smart Module Library
                      </TabsTrigger>
                    </TabsList>
                    <TabsContent value="prompt" className="mt-3 min-h-0 flex-1 data-[state=inactive]:hidden">
                      <CopilotPanel
                        prompt={prompt}
                        onPromptChange={setPrompt}
                        onPromptSubmit={handlePromptSubmit}
                        gamePlan={gamePlan}
                        promptChips={activeCopilotPromptChips}
                        onPromptChip={handlePromptChip}
                        readOnly={isReadOnlyDemo}
                        readOnlyMessage={isReadOnlyDemo ? readOnlyDemoMessage : undefined}
                      />
                    </TabsContent>
                    <TabsContent value="library" className="mt-3 min-h-0 flex-1 data-[state=inactive]:hidden">
                      <ModuleLibraryPanel templates={moduleTemplates} selectedTypeId={selectedTypeId} onSelect={setSelectedTypeId} />
                    </TabsContent>
                  </Tabs>
                </aside>
              )}

              <div
                className={cn(
                  "grid min-h-0 gap-3",
                  editorMode === "simulate"
                    ? "grid-rows-[minmax(0,1fr)]"
                    : "grid-rows-[minmax(0,1fr)_auto]",
                )}
              >
                <div ref={editorSurfaceRef} className="relative min-h-0">
                  <GameCanvas
                    nodes={displayNodes}
                    edges={displayEdges}
                    groups={groups}
                    mode={editorMode}
                    selectedNodeId={selectedNodeId}
                    selectedNodeIds={selectedNodeIds}
                    highlightState={highlightState}
                    viewport={canvasViewport}
                    hudLayout={hudLayout}
                    canGroupSelection={selectedRealNodeCount >= 2}
                    onGroupSelection={handleGroupSelection}
                    onAutoArrange={handleAutoArrange}
                    onToggleGroup={handleToggleGroup}
                    onViewportChange={(patch) => setCanvasViewport((prev) => ({ ...prev, ...patch }))}
                    onSelectNode={handleSelectNode}
                    onClearSelection={() => {
                      setSelectedNodeId(null)
                      setSelectedNodeIds([])
                    }}
                    onHoverNode={setHoveredNodeId}
                    onMoveNode={handleMoveNode}
                    onDropTemplate={addNodeFromTemplate}
                    simulatePhase={simulatePhase}
                    reducedMotion={effectiveMotionIntensity === "reduced"}
                    motionIntensity={effectiveMotionIntensity}
                    suppressAmbientMotion={shouldSuppressAmbientMotion}
                    simulationContent={
                      <SimulationViewport
                        active={editorMode === "simulate"}
                        spec={activePrototypeSpec}
                        onRuntimeError={handleRuntimeError}
                      />
                    }
                    onOpenLibrary={() => {
                      setLeftRailTab("library")
                      handleOpenLibrary()
                    }}
                    onAddCoreChain={handleAddCoreChain}
                    onOpenInspector={() => {
                      setTimelineTab("inspector")
                      focusPanelArea("timeline")
                    }}
                  />
                </div>

                {editorMode !== "simulate" && (
                  <div
                    className="lv-glass-shell overflow-hidden rounded-3xl transition-[height] duration-200"
                    style={{ height: timelineDockCollapsed ? 58 : timelineDockExpandedHeight }}
                  >
                    <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                      <div className="flex items-center gap-2">
                        <p className="text-[11px] uppercase tracking-[0.16em] text-cyan-100/75">Timeline + Inspector</p>
                        <span className="lv-chrome-control rounded-full px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-cyan-50/80">
                          {timelineTab}
                        </span>
                      </div>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        onClick={() => setTimelineDockCollapsed((collapsed) => !collapsed)}
                        className="h-8 w-8 rounded-full text-cyan-100/75 hover:bg-white/10 hover:text-white"
                      >
                        {timelineDockCollapsed ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </Button>
                    </div>
                    {!timelineDockCollapsed ? (
                      <div className="h-[calc(100%-57px)] p-2">
                        <TimelineInspector
                          sections={timelineSections}
                          nodes={nodes}
                          selectedNode={selectedNode}
                          suggestions={suggestions}
                          activeTab={timelineTab}
                          onTabChange={setTimelineTab}
                          onReorderSections={reorderSections}
                          onToggleSection={(sectionId) =>
                            setTimelineSections((prev) =>
                              prev.map((section) => (section.id === sectionId ? { ...section, expanded: !section.expanded } : section)),
                            )
                          }
                          onAttachModuleToSection={attachModuleToSection}
                          onApplySuggestion={onApplySuggestion}
                        />
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            </div>
          )}

          {isMobile && (
            <div className="flex h-full min-h-0 flex-col gap-2">
              <div className="min-h-0 flex-1">
                {mobileWorkspace === "canvas" && (
                  <GameCanvas
                    nodes={displayNodes}
                    edges={displayEdges}
                    groups={groups}
                    mode={editorMode}
                    selectedNodeId={selectedNodeId}
                    selectedNodeIds={selectedNodeIds}
                    highlightState={highlightState}
                    viewport={canvasViewport}
                    hudLayout={createDefaultHudLayout()}
                    canGroupSelection={selectedRealNodeCount >= 2}
                    onGroupSelection={handleGroupSelection}
                    onAutoArrange={handleAutoArrange}
                    onToggleGroup={handleToggleGroup}
                    onViewportChange={(patch) => setCanvasViewport((prev) => ({ ...prev, ...patch }))}
                    onSelectNode={handleSelectNode}
                    onClearSelection={() => {
                      setSelectedNodeId(null)
                      setSelectedNodeIds([])
                    }}
                    onHoverNode={setHoveredNodeId}
                    onMoveNode={handleMoveNode}
                    onDropTemplate={addNodeFromTemplate}
                    simulatePhase={simulatePhase}
                    reducedMotion={effectiveMotionIntensity === "reduced"}
                    motionIntensity={effectiveMotionIntensity}
                    suppressAmbientMotion={shouldSuppressAmbientMotion}
                    simulationContent={
                      <SimulationViewport
                        active={editorMode === "simulate"}
                        spec={activePrototypeSpec}
                        onRuntimeError={handleRuntimeError}
                      />
                    }
                    onOpenLibrary={handleOpenLibrary}
                    onAddCoreChain={handleAddCoreChain}
                    onOpenInspector={() => {
                      setTimelineTab("inspector")
                      setMobileWorkspace("timeline")
                    }}
                  />
                )}
                {mobileWorkspace === "library" && (
                  <ModuleLibraryPanel templates={moduleTemplates} selectedTypeId={selectedTypeId} onSelect={setSelectedTypeId} />
                )}
                {mobileWorkspace === "copilot" && (
                  <CopilotPanel
                    prompt={prompt}
                    onPromptChange={setPrompt}
                    onPromptSubmit={handlePromptSubmit}
                    gamePlan={gamePlan}
                    promptChips={activeCopilotPromptChips}
                    onPromptChip={handlePromptChip}
                    readOnly={isReadOnlyDemo}
                    readOnlyMessage={isReadOnlyDemo ? readOnlyDemoMessage : undefined}
                  />
                )}
                {mobileWorkspace === "timeline" && (
                  <TimelineInspector
                    sections={timelineSections}
                    nodes={nodes}
                    selectedNode={selectedNode}
                    suggestions={suggestions}
                    activeTab={timelineTab}
                    onTabChange={setTimelineTab}
                    onReorderSections={reorderSections}
                    onToggleSection={(sectionId) =>
                      setTimelineSections((prev) =>
                        prev.map((section) => (section.id === sectionId ? { ...section, expanded: !section.expanded } : section)),
                      )
                    }
                    onAttachModuleToSection={attachModuleToSection}
                    onApplySuggestion={onApplySuggestion}
                  />
                )}
              </div>
              <MobileWorkspaceBar value={mobileWorkspace} onChange={setMobileWorkspace} />
            </div>
          )}
        </main>

        <Dialog open={showCommunityModal} onOpenChange={setShowCommunityModal}>
          <DialogContent className="lv-glass-modal max-w-6xl text-white">
            <DialogHeader>
              <DialogTitle className="text-2xl">Community Projects</DialogTitle>
            </DialogHeader>
            <div className="lv-scrollbar-hidden grid max-h-[70vh] gap-4 overflow-auto md:grid-cols-2 xl:grid-cols-3">
              {communityProjects.map((project) => (
                <CommunityProjectCard
                  key={project.id}
                  project={project}
                  onUseAsBase={
                    isReadOnlyDemo
                      ? undefined
                      : () => {
                          createNewProject()
                          setShowCommunityModal(false)
                        }
                  }
                />
              ))}
            </div>
          </DialogContent>
        </Dialog>

        <BlueprintReviewPanel
          open={blueprintEntryPoint !== null && activeBlueprintState !== "idle" && Boolean(activeBlueprint)}
          state={activeBlueprintState}
          mode={activePromptMode}
          variant={blueprintReviewVariant}
          blueprint={activeBlueprint}
          addableCoreSystems={addableCoreSystems}
          addableGameplaySystems={addableGameplaySystems}
          onCancel={handleBlueprintCancel}
          onGenerate={handleBlueprintGenerate}
          onRemoveSystem={handleBlueprintRemoveSystem}
          onAddSystem={handleBlueprintAddSystem}
          onMoveLevelSection={handleBlueprintMoveLevelSection}
          readOnly={isReadOnlyDemo}
        />

        <AlertDialog open={Boolean(projectDeleteTarget)} onOpenChange={(open) => !open && setProjectDeleteTarget(null)}>
          <AlertDialogContent className="lv-glass-modal text-white">
            <AlertDialogHeader>
              <AlertDialogTitle>Delete project?</AlertDialogTitle>
              <AlertDialogDescription className="text-cyan-100/75">
                {projectDeleteTarget
                  ? `Delete "${projectDeleteTarget.name}" and its saved blueprint, graph, spec, and generation history. This cannot be undone.`
                  : "Delete this project and its saved prototype data. This cannot be undone."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="lv-chrome-control text-white hover:text-white">
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                className="bg-red-500 text-white hover:bg-red-400"
                disabled={isReadOnlyDemo}
                onClick={confirmDeleteProject}
              >
                Delete Project
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <HelpOverlay
          open={showHelpOverlay}
          onOpenChange={(open) => {
            setShowHelpOverlay(open)
            if (!open) {
              setUiPreferences((prev) => ({ ...prev, helpOverlayDismissed: true }))
            }
          }}
          onJumpToArea={handleHelpJump}
          onReplayCoachmarks={() => {
            setUiPreferences((prev) => ({ ...prev, coachmarksSeenVersion: 0 }))
            setShowHelpOverlay(false)
          }}
        />

        <CommandDialog open={showCommandPalette} onOpenChange={setShowCommandPalette}>
          <CommandInput placeholder="Search actions..." />
          <CommandList>
            <CommandEmpty>No matching command.</CommandEmpty>
            {groupedCommandActions.map((group) => (
              <CommandGroup key={group.group} heading={group.group}>
                {group.items.map((action) => (
                  <CommandItem
                    key={`${action.id}-${action.meta ?? ""}-${action.label}`}
                    onSelect={() => runCommandAction(action)}
                    disabled={Boolean(action.disabledReason)}
                  >
                    <span>{action.label}</span>
                    {action.disabledReason ? (
                      <CommandShortcut>{action.disabledReason}</CommandShortcut>
                    ) : (
                      action.shortcut && <CommandShortcut>{action.shortcut}</CommandShortcut>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </CommandDialog>

        <OnboardingCoachmarks open={shouldShowCoachmarks} onDismiss={handleDismissCoachmarks} />
      </div>
    </TooltipProvider>
  )
}

function createInitialProjects(): ProjectRecord[] {
  return [
    createProjectRecord("Forest Temple", "Adventure", undefined, "p1"),
    createProjectRecord("Desert Ruins", "Action", undefined, "p2"),
    createProjectRecord("Skyline Raid", "Sci-Fi", undefined, "p3"),
  ]
}

function createProjectRecord(name: string, genre: string, previewThumbnail?: string, id?: string): ProjectRecord {
  return {
    id: id ?? `project-${Date.now()}-${Math.floor(Math.random() * 999)}`,
    name,
    genre,
    previewThumbnail: previewThumbnail ?? resolveLocalProjectPreview(name, genre),
    lastModified: new Date(),
    blueprintPlan: null,
    prototypeSpec: null,
    workspace: createDefaultWorkspace(),
  }
}

function createDefaultWorkspace(): ProjectWorkspace {
  return {
    nodes: [],
    groups: [],
    timelineSections: cloneSections(defaultSections),
    prompt: "",
    gamePlan: ["Platformer Controller", "Gravity Physics", "Side-Scroll Camera"],
    planningSteps: [],
    canvasViewport: {
      x: LEGACY_VIEWPORT_X,
      y: LEGACY_VIEWPORT_Y,
      scale: 1,
      isPanning: false,
    },
    pendingBlueprint: null,
    pendingPromptMode: null,
    blueprintState: "idle",
  }
}

function resolveLocalProjectPreview(name: string, genre: string) {
  const token = `${name} ${genre}`.toLowerCase()
  if (token.includes("forest") || token.includes("temple")) {
    return "/previews/projects/forest-temple.svg"
  }
  if (token.includes("desert") || token.includes("ruins")) {
    return "/previews/projects/desert-ruins.svg"
  }
  if (token.includes("skyline") || token.includes("sci") || token.includes("fps")) {
    return "/previews/projects/skyline-raid.svg"
  }
  if (token.includes("action")) {
    return "/previews/projects/action-prototype.svg"
  }
  return "/previews/projects/platformer-prototype.svg"
}

function createInitialPanelStates(): Record<PanelKey, FloatingPanelState> {
  return {
    library: {
      x: 20,
      y: 20,
      width: 360,
      height: 560,
      collapsed: false,
      zIndex: 41,
      dockMode: "floating",
      dockSlot: null,
      isSnapped: false,
      lastFloatingRect: { x: 20, y: 20, width: 360, height: 560 },
      minWidth: 280,
      maxWidth: 700,
      minHeight: 260,
      maxHeight: 820,
    },
    copilot: {
      x: 1000,
      y: 24,
      width: 380,
      height: 600,
      collapsed: false,
      zIndex: 42,
      dockMode: "floating",
      dockSlot: null,
      isSnapped: false,
      lastFloatingRect: { x: 1000, y: 24, width: 380, height: 600 },
      minWidth: 300,
      maxWidth: 720,
      minHeight: 280,
      maxHeight: 840,
    },
    timeline: {
      x: 300,
      y: 610,
      width: 940,
      height: 320,
      collapsed: false,
      zIndex: 40,
      dockMode: "floating",
      dockSlot: null,
      isSnapped: false,
      lastFloatingRect: { x: 300, y: 610, width: 940, height: 320 },
      minWidth: 560,
      maxWidth: 1320,
      minHeight: 220,
      maxHeight: 720,
    },
  }
}

function createNodeFromTemplate(template: ModuleTemplate, x: number, y: number): ModuleNode {
  const displayInputs = cleanMetadataValues(template.displayInputs ?? template.dependencies)
  const displayOutputs = cleanMetadataValues(template.displayOutputs ?? template.supports)
  return {
    id: `${template.typeId}-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    typeId: template.typeId,
    name: template.name,
    category: template.category,
    description: template.description,
    inputs: displayInputs,
    outputs: displayOutputs,
    dependencies: template.dependencies,
    inputPorts: displayInputs.slice(0, 3).map((item, index) => ({
      id: `${template.typeId}-input-${index}`,
      label: item,
      kind: "input",
    })),
    outputPorts: displayOutputs.slice(0, 3).map((item, index) => ({
      id: `${template.typeId}-output-${index}`,
      label: item,
      kind: "output",
    })),
    x,
    y,
    aiCompatible: template.aiCompatible,
    active: true,
  }
}

function createCollapsedGroupNode(group: ModuleGroup, nodes: ModuleNode[]): ModuleNode | null {
  const members = nodes.filter((node) => group.nodeIds.includes(node.id))
  if (members.length === 0) return null
  return {
    id: `group:${group.id}`,
    typeId: `group:${group.id}`,
    name: group.label,
    category: "AI",
    description: "Collapsed group container",
    inputs: [],
    outputs: [],
    dependencies: [],
    inputPorts: [],
    outputPorts: [],
    x: group.bounds.x,
    y: group.bounds.y,
    aiCompatible: true,
    active: false,
    isGroup: true,
    groupId: group.id,
    groupMembers: members.map((node) => node.name),
  }
}

function applyProjectWorkspaceOffset(
  project: ProjectDetail,
  offset: { x: number; y: number },
  viewport?: ProjectDetail["workspace_json"]["canvas_viewport"],
): ProjectDetail {
  const positionedWorkspace = offsetWorkspaceNodePositions(project.workspace_json, offset)
  const framedWorkspace = viewport ? updateWorkspaceCanvasViewport(positionedWorkspace, viewport) : positionedWorkspace
  if (framedWorkspace === project.workspace_json) {
    return project
  }

  return {
    ...project,
    workspace_json: framedWorkspace,
  }
}

function deriveWorkspaceLayoutMode(width: number, current: WorkspaceLayoutMode): WorkspaceLayoutMode {
  if (width <= MOBILE_LAYOUT_MAX_WIDTH) return "mobile"
  if (current === "wide") {
    return width < COMPACT_LAYOUT_MAX_WIDTH ? "compact" : "wide"
  }
  return width >= WIDE_LAYOUT_MIN_WIDTH ? "wide" : "compact"
}

function dockPanelState(panel: FloatingPanelState, slot: PanelDockSlot, surfaceWidth: number, surfaceHeight: number): FloatingPanelState {
  const width = clamp(panel.width, panel.minWidth, Math.min(panel.maxWidth, surfaceWidth - PANEL_GUTTER * 2))
  const height = clamp(panel.height, panel.minHeight, Math.min(panel.maxHeight, surfaceHeight - PANEL_GUTTER * 2))

  const floatingSnapshot =
    panel.dockMode === "floating"
      ? { x: panel.x, y: panel.y, width: panel.width, height: panel.height }
      : panel.lastFloatingRect

  const aligned = alignToDockSlot(slot, width, height, panel.collapsed, surfaceWidth, surfaceHeight)
  return {
    ...panel,
    dockMode: "docked",
    dockSlot: slot,
    isSnapped: true,
    width,
    height,
    x: aligned.x,
    y: aligned.y,
    lastFloatingRect: floatingSnapshot,
  }
}

function fitPanelToBounds(panel: FloatingPanelState, width: number, height: number): FloatingPanelState {
  const nextWidth = clamp(panel.width, panel.minWidth, Math.min(panel.maxWidth, width - PANEL_GUTTER * 2))
  const nextHeight = clamp(panel.height, panel.minHeight, Math.min(panel.maxHeight, height - PANEL_GUTTER * 2))

  if (panel.dockMode === "docked" && panel.dockSlot) {
    const aligned = alignToDockSlot(panel.dockSlot, nextWidth, nextHeight, panel.collapsed, width, height)
    return { ...panel, width: nextWidth, height: nextHeight, x: aligned.x, y: aligned.y }
  }

  const visibleHeight = panel.collapsed ? 52 : nextHeight
  return {
    ...panel,
    width: nextWidth,
    height: nextHeight,
    x: clamp(panel.x, PANEL_GUTTER, Math.max(PANEL_GUTTER, width - nextWidth - PANEL_GUTTER)),
    y: clamp(panel.y, PANEL_GUTTER, Math.max(PANEL_GUTTER, height - visibleHeight - PANEL_GUTTER)),
  }
}

function hydratePanelState(base: FloatingPanelState, incoming?: Partial<FloatingPanelState>): FloatingPanelState {
  const next: FloatingPanelState = {
    ...base,
    ...incoming,
    lastFloatingRect: {
      ...base.lastFloatingRect,
      ...(incoming?.lastFloatingRect ?? {}),
    },
    dockMode: incoming?.dockMode ?? base.dockMode,
    dockSlot: incoming?.dockSlot ?? base.dockSlot,
  }
  return next
}

function alignToDockSlot(
  slot: PanelDockSlot,
  width: number,
  height: number,
  collapsed: boolean,
  surfaceWidth: number,
  surfaceHeight: number,
) {
  const visibleHeight = collapsed ? 52 : height
  if (slot.startsWith("left")) {
    return { x: PANEL_GUTTER, y: slotVerticalY(slot, visibleHeight, surfaceHeight) }
  }
  if (slot.startsWith("right")) {
    return { x: Math.max(PANEL_GUTTER, surfaceWidth - width - PANEL_GUTTER), y: slotVerticalY(slot, visibleHeight, surfaceHeight) }
  }
  return { x: slotHorizontalX(slot, width, surfaceWidth), y: Math.max(PANEL_GUTTER, surfaceHeight - visibleHeight - PANEL_GUTTER) }
}

function slotVerticalY(slot: PanelDockSlot, panelHeight: number, surfaceHeight: number) {
  if (slot.endsWith("top")) return PANEL_GUTTER
  if (slot.endsWith("middle")) return Math.max(PANEL_GUTTER, (surfaceHeight - panelHeight) / 2)
  return Math.max(PANEL_GUTTER, surfaceHeight - panelHeight - PANEL_GUTTER)
}

function slotHorizontalX(slot: PanelDockSlot, panelWidth: number, surfaceWidth: number) {
  if (slot.endsWith("left")) return PANEL_GUTTER
  if (slot.endsWith("center")) return Math.max(PANEL_GUTTER, (surfaceWidth - panelWidth) / 2)
  return Math.max(PANEL_GUTTER, surfaceWidth - panelWidth - PANEL_GUTTER)
}

function resolveResizeHandles(): ResizeHandle[] {
  return ["e", "w", "n", "s", "ne", "nw", "se", "sw"]
}

function createDefaultHudLayout(): CanvasHudLayout {
  return {
    info: { anchor: "top-left", collapsed: false },
    suggestions: { anchor: "top-right", collapsed: false },
    tools: { anchor: "bottom-left", collapsed: false },
    minimap: { anchor: "bottom-right", collapsed: false },
  }
}

function toWorkspaceViewportSnapshot(viewport: CanvasViewport): ProjectDetail["workspace_json"]["canvas_viewport"] {
  return {
    x: viewport.x,
    y: viewport.y,
    scale: viewport.scale,
    is_panning: viewport.isPanning,
  }
}

function isLegacyDefaultViewport(viewport: CanvasViewport) {
  return (
    Math.abs(viewport.x - LEGACY_VIEWPORT_X) < 0.5 &&
    Math.abs(viewport.y - LEGACY_VIEWPORT_Y) < 0.5 &&
    Math.abs(viewport.scale - 1) < 0.01
  )
}

function deriveViewportWorldCenter(viewport: CanvasViewport, surfaceWidth: number, surfaceHeight: number) {
  const safeScale = Math.max(viewport.scale, 0.001)
  const visibleWorldW = surfaceWidth / safeScale
  const visibleWorldH = surfaceHeight / safeScale
  const worldCenterX = -viewport.x / safeScale + visibleWorldW / 2
  const worldCenterY = -viewport.y / safeScale + visibleWorldH / 2
  return {
    x: clamp(worldCenterX, NODE_WIDTH / 2 + 24, WORLD_WIDTH - NODE_WIDTH / 2 - 24),
    y: clamp(worldCenterY, NODE_HEIGHT / 2 + 24, WORLD_HEIGHT - NODE_HEIGHT / 2 - 24),
  }
}

function getClusterNodePosition(index: number, totalCount: number, centerX: number, centerY: number) {
  const columns = Math.min(3, Math.max(totalCount, 1))
  const rows = Math.ceil(Math.max(totalCount, 1) / columns)
  const spacingX = 280
  const spacingY = 170
  const clusterWidth = (columns - 1) * spacingX
  const clusterHeight = (rows - 1) * spacingY
  const startX = centerX - clusterWidth / 2
  const startY = centerY - clusterHeight / 2
  const x = clamp(startX + (index % columns) * spacingX, 12, WORLD_WIDTH - NODE_WIDTH - 12)
  const y = clamp(startY + Math.floor(index / columns) * spacingY, 12, WORLD_HEIGHT - NODE_HEIGHT - 12)
  return { x, y }
}

function resolveCanvasHudLayout(surfaceWidth: number, surfaceHeight: number, occluders: HudRect[]): CanvasHudLayout {
  const layout = createDefaultHudLayout()
  const occupied: HudRect[] = [...occluders]
  const specs: Array<{
    id: keyof CanvasHudLayout
    candidates: CanvasHudAnchor[]
    expandedSize: { width: number; height: number }
    compactSize: { width: number; height: number }
  }> = [
    {
      id: "info",
      candidates: ["top-left", "top-right", "top-center"],
      expandedSize: { width: 232, height: 118 },
      compactSize: { width: 164, height: 36 },
    },
    {
      id: "suggestions",
      candidates: ["top-right", "right-middle", "top-center"],
      expandedSize: { width: 264, height: 292 },
      compactSize: { width: 138, height: 36 },
    },
    {
      id: "tools",
      candidates: ["bottom-left", "bottom-center", "top-center"],
      expandedSize: { width: 560, height: 56 },
      compactSize: { width: 132, height: 36 },
    },
    {
      id: "minimap",
      candidates: ["bottom-right", "bottom-left", "top-right"],
      expandedSize: { width: 184, height: 128 },
      compactSize: { width: 108, height: 36 },
    },
  ]

  for (const spec of specs) {
    const expandedPlacement = chooseHudPlacement(
      spec.candidates,
      spec.expandedSize,
      surfaceWidth,
      surfaceHeight,
      occupied,
    )
    let finalPlacement = expandedPlacement
    let collapsed = false

    if (expandedPlacement.overlapRatio > 0.16) {
      const compactPlacement = chooseHudPlacement(
        spec.candidates,
        spec.compactSize,
        surfaceWidth,
        surfaceHeight,
        occupied,
      )
      finalPlacement = compactPlacement
      collapsed = true
    }

    layout[spec.id] = {
      anchor: finalPlacement.anchor,
      collapsed,
    }
    occupied.push(finalPlacement.rect)
  }

  return layout
}

function chooseHudPlacement(
  candidates: CanvasHudAnchor[],
  size: { width: number; height: number },
  surfaceWidth: number,
  surfaceHeight: number,
  occupied: HudRect[],
) {
  let best:
    | {
        anchor: CanvasHudAnchor
        rect: HudRect
        overlapRatio: number
      }
    | null = null

  for (const anchor of candidates) {
    const rect = hudRectForAnchor(anchor, size, surfaceWidth, surfaceHeight)
    const overlapArea = occupied.reduce((sum, blocker) => sum + rectOverlapArea(rect, blocker), 0)
    const overlapRatio = overlapArea / Math.max(1, rect.width * rect.height)

    const next = { anchor, rect, overlapRatio }
    if (overlapRatio <= 0.04) return next
    if (!best || overlapRatio < best.overlapRatio) {
      best = next
    }
  }

  return (
    best ?? {
      anchor: candidates[0],
      rect: hudRectForAnchor(candidates[0], size, surfaceWidth, surfaceHeight),
      overlapRatio: 0,
    }
  )
}

function hudRectForAnchor(
  anchor: CanvasHudAnchor,
  size: { width: number; height: number },
  surfaceWidth: number,
  surfaceHeight: number,
): HudRect {
  const maxX = Math.max(HUD_MARGIN, surfaceWidth - size.width - HUD_MARGIN)
  const maxY = Math.max(HUD_MARGIN, surfaceHeight - size.height - HUD_MARGIN)

  let x = HUD_MARGIN
  let y = HUD_MARGIN
  if (anchor === "top-right") {
    x = maxX
  } else if (anchor === "top-center") {
    x = Math.max(HUD_MARGIN, (surfaceWidth - size.width) / 2)
  } else if (anchor === "right-middle") {
    x = maxX
    y = Math.max(HUD_MARGIN, (surfaceHeight - size.height) / 2)
  } else if (anchor === "bottom-left") {
    y = maxY
  } else if (anchor === "bottom-center") {
    x = Math.max(HUD_MARGIN, (surfaceWidth - size.width) / 2)
    y = maxY
  } else if (anchor === "bottom-right") {
    x = maxX
    y = maxY
  }

  return {
    x: clamp(x, HUD_MARGIN, maxX),
    y: clamp(y, HUD_MARGIN, maxY),
    width: Math.min(size.width, Math.max(0, surfaceWidth - HUD_MARGIN * 2)),
    height: Math.min(size.height, Math.max(0, surfaceHeight - HUD_MARGIN * 2)),
  }
}

function rectOverlapArea(a: HudRect, b: HudRect) {
  const xOverlap = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x))
  const yOverlap = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y))
  return xOverlap * yOverlap
}

function summarizeSystems(nodes: ModuleNode[]) {
  if (nodes.length === 0) return "No systems yet"
  return nodes
    .slice(0, 5)
    .map((node) => getSystemLabel(node.typeId, node.name).replace(" System", ""))
    .join(" • ")
}

function createSectionsFromBlueprint(levelStructure: string[]): LevelSection[] {
  const entries = levelStructure.length > 0 ? levelStructure : defaultSections.map((section) => section.title)
  return entries.map((entry, index) => ({
    id: slugify(`${normalizeSectionLabel(entry)}-${index + 1}`),
    title: normalizeSectionLabel(entry),
    order: index,
    expanded: true,
    moduleIds: [],
  }))
}

function cloneWorkspace(workspace: ProjectWorkspace): ProjectWorkspace {
  return {
    nodes: cloneNodes(workspace.nodes),
    groups: cloneGroups(workspace.groups),
    timelineSections: cloneSections(workspace.timelineSections),
    prompt: workspace.prompt,
    gamePlan: [...workspace.gamePlan],
    planningSteps: clonePlanningSteps(workspace.planningSteps),
    canvasViewport: { ...workspace.canvasViewport },
    pendingBlueprint: cloneBlueprint(workspace.pendingBlueprint),
    pendingPromptMode: workspace.pendingPromptMode,
    blueprintState: workspace.blueprintState,
  }
}

function cloneNodes(nodes: ModuleNode[]) {
  return nodes.map((node) => ({
    ...node,
    inputs: [...node.inputs],
    outputs: [...node.outputs],
    dependencies: [...node.dependencies],
    inputPorts: node.inputPorts.map((port) => ({ ...port })),
    outputPorts: node.outputPorts.map((port) => ({ ...port })),
    groupMembers: node.groupMembers ? [...node.groupMembers] : undefined,
  }))
}

function cloneGroups(groups: ModuleGroup[]) {
  return groups.map((group) => ({
    ...group,
    nodeIds: [...group.nodeIds],
    bounds: { ...group.bounds },
  }))
}

function cloneSections(sections: LevelSection[]) {
  return sections.map((section) => ({
    ...section,
    moduleIds: [...section.moduleIds],
  }))
}

function clonePlanningSteps(steps: ProjectWorkspace["planningSteps"]) {
  return steps.map((step) => ({ ...step }))
}

function cloneBlueprint(blueprint: IntentBlueprint | null): IntentBlueprint | null {
  if (!blueprint) return null
  return {
    ...blueprint,
    coreGameplay: [...blueprint.coreGameplay],
    coreSystems: blueprint.coreSystems.map((system) => ({ ...system })),
    gameStructure: [...blueprint.gameStructure],
    gameplaySystems: blueprint.gameplaySystems.map((system) => ({ ...system })),
    levelStructure: [...blueprint.levelStructure],
    promptInterpretation: blueprint.promptInterpretation.map((item) => ({ ...item })),
    unmappedSystems: [...blueprint.unmappedSystems],
    plannerDiagnostics: blueprint.plannerDiagnostics ? JSON.parse(JSON.stringify(blueprint.plannerDiagnostics)) : null,
  }
}

function cloneBlueprintPlan(blueprintPlan: BlueprintPlan | null): BlueprintPlan | null {
  if (!blueprintPlan) return null
  return JSON.parse(JSON.stringify(blueprintPlan)) as BlueprintPlan
}

function clonePrototypeSpec(prototypeSpec: PrototypeSpec | null): PrototypeSpec | null {
  if (!prototypeSpec) return null
  return JSON.parse(JSON.stringify(prototypeSpec)) as PrototypeSpec
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

function cleanMetadataValues(values: string[]) {
  return values.map((value) => value.trim()).filter((value) => value.length > 0 && value !== "None")
}

function wait(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms))
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function formatProjectLastModified(date: Date, hasMounted: boolean) {
  if (!hasMounted) {
    return `Updated ${date.toISOString().slice(0, 10)}`
  }

  const diffMs = Date.now() - date.getTime()
  const minutes = Math.floor(diffMs / (60 * 1000))
  if (minutes < 60) return `${Math.max(minutes, 1)}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}
