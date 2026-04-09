"use client"

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Button } from "@/components/ui/button"
import { HelpTooltip } from "@/components/editor-v2/help-tooltip"
import { DependencyEdges } from "@/components/editor-v2/dependency-edges"
import { getSystemLabel } from "@/lib/editor-v2-lexicon"
import { classifyCanvasWheelGesture } from "@/lib/levelyst/workbench-helpers"
import { cn } from "@/lib/utils"
import type {
  CanvasHudLayout,
  CanvasViewport,
  CopilotSuggestion,
  DependencyEdge,
  EditorMode,
  MotionIntensity,
  ModuleGroup,
  ModuleNode,
  NodeHighlightState,
} from "@/lib/editor-v2-model"
import { BringToFront, Layers3, Plus, Sparkles } from "lucide-react"

interface GameCanvasProps {
  nodes: ModuleNode[]
  edges: DependencyEdge[]
  groups: ModuleGroup[]
  mode: EditorMode
  selectedNodeId: string | null
  selectedNodeIds: string[]
  highlightState: NodeHighlightState
  viewport: CanvasViewport
  hudLayout: CanvasHudLayout
  canGroupSelection: boolean
  onGroupSelection: () => void
  onAutoArrange: () => void
  onToggleGroup: (groupId: string) => void
  onViewportChange: (patch: Partial<CanvasViewport>) => void
  onSelectNode: (nodeId: string, additive?: boolean) => void
  onClearSelection: () => void
  onHoverNode: (nodeId: string | null) => void
  onMoveNode: (nodeId: string, x: number, y: number) => void
  onDropTemplate: (typeId: string, x: number, y: number) => void
  suggestions: CopilotSuggestion[]
  onApplySuggestion: (suggestion: CopilotSuggestion) => void
  simulatePhase: "idle" | "zooming" | "handoff" | "settle"
  reducedMotion: boolean
  motionIntensity: MotionIntensity
  suppressAmbientMotion: boolean
  simulationContent?: ReactNode
  onOpenLibrary: () => void
  onAddCoreChain: () => void
  onOpenInspector: () => void
}

const NODE_WIDTH = 244
const NODE_HEIGHT = 128
const WORLD_WIDTH = 2600
const WORLD_HEIGHT = 1800
const MIN_SCALE = 0.55
const MAX_SCALE = 1.8
const MINIMAP_WIDTH = 184
const MINIMAP_HEIGHT = 128

export function GameCanvas({
  nodes,
  edges,
  groups,
  mode,
  selectedNodeId,
  selectedNodeIds,
  highlightState,
  viewport,
  hudLayout,
  canGroupSelection,
  onGroupSelection,
  onAutoArrange,
  onToggleGroup,
  onViewportChange,
  onSelectNode,
  onClearSelection,
  onHoverNode,
  onMoveNode,
  onDropTemplate,
  suggestions,
  onApplySuggestion,
  simulatePhase,
  reducedMotion,
  motionIntensity,
  suppressAmbientMotion,
  simulationContent,
  onOpenLibrary,
  onAddCoreChain,
  onOpenInspector,
}: GameCanvasProps) {
  const canvasRef = useRef<HTMLDivElement>(null)
  const minimapRef = useRef<HTMLDivElement>(null)
  const [parallax, setParallax] = useState({ x: 0, y: 0 })
  const [spacePressed, setSpacePressed] = useState(false)
  const [canvasSize, setCanvasSize] = useState({ width: 1, height: 1 })
  const [hudExpanded, setHudExpanded] = useState({
    info: false,
    suggestions: false,
    tools: false,
    minimap: false,
  })

  const nodeDragRef = useRef<{ id: string; offsetX: number; offsetY: number } | null>(null)
  const panRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null)
  const minimapDragRef = useRef<
    | {
        active: boolean
        mode: "jump" | "dragRect"
        offsetX: number
        offsetY: number
      }
    | null
  >(null)

  const suggestionCards = useMemo(() => suggestions.slice(0, 2), [suggestions])
  const transitiveSet = useMemo(() => new Set(highlightState.transitiveNodeIds), [highlightState.transitiveNodeIds])
  const directSet = useMemo(() => new Set(highlightState.directNodeIds), [highlightState.directNodeIds])
  const selectedSet = useMemo(() => new Set(selectedNodeIds), [selectedNodeIds])
  const orderedNodes = useMemo(
    () => [...nodes].sort((a, b) => (a.y === b.y ? a.x - b.x : a.y - b.y)),
    [nodes],
  )
  const ambientMotionAllowed = !reducedMotion && !suppressAmbientMotion && motionIntensity !== "reduced"
  const parallaxStrength = motionIntensity === "high" ? 16 : 10
  const ambientOpacity = motionIntensity === "high" ? 0.82 : 0.66
  const compactInfo = hudLayout.info.collapsed && !hudExpanded.info
  const compactSuggestions = hudLayout.suggestions.collapsed && !hudExpanded.suggestions
  const compactTools = hudLayout.tools.collapsed && !hudExpanded.tools
  const compactMinimap = hudLayout.minimap.collapsed && !hudExpanded.minimap

  useEffect(() => {
    setHudExpanded((prev) => ({
      info: hudLayout.info.collapsed ? prev.info : false,
      suggestions: hudLayout.suggestions.collapsed ? prev.suggestions : false,
      tools: hudLayout.tools.collapsed ? prev.tools : false,
      minimap: hudLayout.minimap.collapsed ? prev.minimap : false,
    }))
  }, [hudLayout.info.collapsed, hudLayout.minimap.collapsed, hudLayout.suggestions.collapsed, hudLayout.tools.collapsed])

  const minimapViewportRect = useMemo(() => {
    const visibleWorldX = clamp(-viewport.x / Math.max(viewport.scale, 0.001), 0, WORLD_WIDTH)
    const visibleWorldY = clamp(-viewport.y / Math.max(viewport.scale, 0.001), 0, WORLD_HEIGHT)
    const visibleWorldW = clamp(canvasSize.width / Math.max(viewport.scale, 0.001), 48, WORLD_WIDTH)
    const visibleWorldH = clamp(canvasSize.height / Math.max(viewport.scale, 0.001), 48, WORLD_HEIGHT)

    return {
      x: (visibleWorldX / WORLD_WIDTH) * MINIMAP_WIDTH,
      y: (visibleWorldY / WORLD_HEIGHT) * MINIMAP_HEIGHT,
      width: (visibleWorldW / WORLD_WIDTH) * MINIMAP_WIDTH,
      height: (visibleWorldH / WORLD_HEIGHT) * MINIMAP_HEIGHT,
    }
  }, [canvasSize.height, canvasSize.width, viewport.scale, viewport.x, viewport.y])

  useEffect(() => {
    if (!canvasRef.current) return

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      setCanvasSize({
        width: Math.max(1, entry.contentRect.width),
        height: Math.max(1, entry.contentRect.height),
      })
    })
    observer.observe(canvasRef.current)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code === "Space") {
        setSpacePressed(true)
      }
    }

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code === "Space") {
        setSpacePressed(false)
        if (viewport.isPanning) {
          panRef.current = null
          onViewportChange({ isPanning: false })
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    window.addEventListener("keyup", handleKeyUp)

    return () => {
      window.removeEventListener("keydown", handleKeyDown)
      window.removeEventListener("keyup", handleKeyUp)
    }
  }, [onViewportChange, viewport.isPanning])

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      if (nodeDragRef.current && canvasRef.current) {
        const worldPoint = screenToWorld(canvasRef.current, viewport, event.clientX, event.clientY)
        const nextX = clamp(worldPoint.x - nodeDragRef.current.offsetX, 12, WORLD_WIDTH - NODE_WIDTH - 12)
        const nextY = clamp(worldPoint.y - nodeDragRef.current.offsetY, 12, WORLD_HEIGHT - NODE_HEIGHT - 12)
        onMoveNode(nodeDragRef.current.id, nextX, nextY)
      }

      if (panRef.current) {
        const nextX = panRef.current.originX + (event.clientX - panRef.current.startX)
        const nextY = panRef.current.originY + (event.clientY - panRef.current.startY)
        onViewportChange({ x: nextX, y: nextY, isPanning: true })
      }

      if (minimapDragRef.current && minimapRef.current) {
        applyMinimapNavigation(
          minimapDragRef.current.mode,
          event.clientX,
          event.clientY,
          minimapDragRef.current.offsetX,
          minimapDragRef.current.offsetY,
          minimapRef.current,
          canvasSize,
          viewport,
          onViewportChange,
        )
      }
    }

    const handlePointerUp = () => {
      nodeDragRef.current = null
      minimapDragRef.current = null
      if (panRef.current) {
        panRef.current = null
        onViewportChange({ isPanning: false })
      }
    }

    window.addEventListener("pointermove", handlePointerMove)
    window.addEventListener("pointerup", handlePointerUp)

    return () => {
      window.removeEventListener("pointermove", handlePointerMove)
      window.removeEventListener("pointerup", handlePointerUp)
    }
  }, [canvasSize, onMoveNode, onViewportChange, viewport])

  const simulationLabel =
    simulatePhase === "zooming"
      ? "Entering simulation"
      : simulatePhase === "handoff"
        ? "Compiling playable loop"
        : mode === "simulate"
          ? "Simulation active"
          : mode === "debug"
            ? "Debug diagnostics"
            : "Build mode"

  return (
    <div className="relative h-full min-h-[420px] overflow-hidden rounded-3xl border border-white/5 bg-[radial-gradient(circle_at_20%_10%,rgba(59,130,246,0.18),transparent_45%),radial-gradient(circle_at_80%_70%,rgba(139,92,246,0.18),transparent_44%),#050914]">
      <motion.div
        ref={canvasRef}
        tabIndex={0}
        aria-label="Game graph canvas"
        className={cn(
          "relative h-full w-full",
          spacePressed ? "cursor-grab" : "cursor-default",
          viewport.isPanning && "cursor-grabbing",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60",
        )}
        animate={
          reducedMotion
            ? {}
            : simulatePhase === "zooming"
              ? { scale: 1.06, filter: "blur(0.8px)" }
              : simulatePhase === "handoff"
                ? { scale: 1.1, filter: "blur(2px)" }
                : { scale: 1, filter: "blur(0px)" }
        }
        transition={{ duration: 0.24 }}
        onPointerDown={(event) => {
          if (event.button !== 0) return
          if (spacePressed) {
            panRef.current = {
              startX: event.clientX,
              startY: event.clientY,
              originX: viewport.x,
              originY: viewport.y,
            }
            onViewportChange({ isPanning: true })
            return
          }
          onClearSelection()
        }}
        onPointerMove={(event) => {
          if (!ambientMotionAllowed || !canvasRef.current) return
          const rect = canvasRef.current.getBoundingClientRect()
          const relX = (event.clientX - rect.left) / rect.width - 0.5
          const relY = (event.clientY - rect.top) / rect.height - 0.5
          setParallax({ x: relX * parallaxStrength, y: relY * parallaxStrength })
        }}
        onPointerLeave={() => {
          setParallax({ x: 0, y: 0 })
          onHoverNode(null)
        }}
        onWheel={(event) => {
          if (!canvasRef.current || mode === "simulate") return
          const target = event.target as HTMLElement | null
          if (target?.closest("input,textarea,select,[contenteditable='true'],[data-panel-interactive='true']")) return
          event.preventDefault()

          const gesture = classifyCanvasWheelGesture({
            ctrlKey: event.ctrlKey,
            deltaMode: event.deltaMode,
            deltaX: event.deltaX,
            deltaY: event.deltaY,
          })

          if (gesture === "trackpad-pan") {
            onViewportChange({
              x: viewport.x - event.deltaX,
              y: viewport.y - event.deltaY,
              isPanning: false,
            })
            return
          }

          const nextScale =
            gesture === "pinch-zoom"
              ? clamp(viewport.scale * Math.exp(-event.deltaY * 0.0025), MIN_SCALE, MAX_SCALE)
              : clamp(viewport.scale * (event.deltaY < 0 ? 1.08 : 0.92), MIN_SCALE, MAX_SCALE)

          const rect = canvasRef.current.getBoundingClientRect()
          const pointerX = event.clientX - rect.left
          const pointerY = event.clientY - rect.top
          const worldX = (pointerX - viewport.x) / viewport.scale
          const worldY = (pointerY - viewport.y) / viewport.scale

          const nextX = pointerX - worldX * nextScale
          const nextY = pointerY - worldY * nextScale

          onViewportChange({ x: nextX, y: nextY, scale: nextScale })
        }}
        onDragOver={(event) => {
          event.preventDefault()
          event.dataTransfer.dropEffect = "copy"
        }}
        onDrop={(event) => {
          event.preventDefault()
          if (!canvasRef.current) return
          const typeId = event.dataTransfer.getData("application/x-levelyst-module")
          if (!typeId) return

          const world = screenToWorld(canvasRef.current, viewport, event.clientX, event.clientY)
          const x = clamp(world.x - NODE_WIDTH / 2, 12, WORLD_WIDTH - NODE_WIDTH - 12)
          const y = clamp(world.y - NODE_HEIGHT / 2, 12, WORLD_HEIGHT - NODE_HEIGHT - 12)
          onDropTemplate(typeId, x, y)
        }}
        onKeyDown={(event) => {
          if (nodes.length === 0) return
          const selectedIndex = orderedNodes.findIndex((node) => node.id === selectedNodeId)

          if (event.key === "Tab") {
            event.preventDefault()
            const direction = event.shiftKey ? -1 : 1
            const nextIndex =
              selectedIndex === -1
                ? 0
                : (selectedIndex + direction + orderedNodes.length) % Math.max(orderedNodes.length, 1)
            const nextNode = orderedNodes[nextIndex]
            if (!nextNode) return
            onSelectNode(nextNode.id, false)
            return
          }

          if (!selectedNodeId) {
            if (event.key === "Escape") onClearSelection()
            return
          }

          const selected = nodes.find((node) => node.id === selectedNodeId)
          if (!selected) return

          const nudgeStep = event.shiftKey ? 24 : 12
          if (event.key === "ArrowUp") {
            event.preventDefault()
            onMoveNode(selected.id, selected.x, clamp(selected.y - nudgeStep, 12, WORLD_HEIGHT - NODE_HEIGHT - 12))
            return
          }
          if (event.key === "ArrowDown") {
            event.preventDefault()
            onMoveNode(selected.id, selected.x, clamp(selected.y + nudgeStep, 12, WORLD_HEIGHT - NODE_HEIGHT - 12))
            return
          }
          if (event.key === "ArrowLeft") {
            event.preventDefault()
            onMoveNode(selected.id, clamp(selected.x - nudgeStep, 12, WORLD_WIDTH - NODE_WIDTH - 12), selected.y)
            return
          }
          if (event.key === "ArrowRight") {
            event.preventDefault()
            onMoveNode(selected.id, clamp(selected.x + nudgeStep, 12, WORLD_WIDTH - NODE_WIDTH - 12), selected.y)
            return
          }
          if (event.key === "Enter") {
            event.preventDefault()
            onOpenInspector()
            return
          }
          if (event.key === "Escape") {
            event.preventDefault()
            onClearSelection()
          }
        }}
      >
        <div
          className={cn("pointer-events-none absolute inset-0", ambientMotionAllowed ? "lv-grid-drift" : "")}
          style={{
            transform: `translate3d(${parallax.x * 0.6}px, ${parallax.y * 0.6}px, 0)`,
            opacity: ambientOpacity,
            backgroundImage:
              "linear-gradient(rgba(59,130,246,0.24) 1px, transparent 1px),linear-gradient(90deg, rgba(59,130,246,0.24) 1px, transparent 1px)",
            backgroundSize: "44px 44px",
          }}
        />

        <div
          className={cn("pointer-events-none absolute inset-0", ambientMotionAllowed ? "lv-grid-glow" : "")}
          style={{
            transform: `translate3d(${parallax.x * -0.4}px, ${parallax.y * -0.4}px, 0)`,
            opacity: motionIntensity === "high" ? 0.42 : 0.28,
            backgroundImage: "radial-gradient(circle at 22px 22px, rgba(34,211,238,0.35) 0 1.8px, transparent 2.8px)",
            backgroundSize: "44px 44px",
          }}
        />

        <div
          className="absolute left-0 top-0"
          style={{
            width: WORLD_WIDTH,
            height: WORLD_HEIGHT,
            transform: `translate3d(${viewport.x}px, ${viewport.y}px, 0) scale(${viewport.scale})`,
            transformOrigin: "0 0",
          }}
        >
          <DependencyEdges nodes={nodes} edges={edges} highlightState={highlightState} />

          {nodes.length === 0 && (
            <div className="absolute inset-0 grid place-items-center">
              <div className="lv-glass-hud rounded-2xl border border-dashed border-cyan-300/30 px-10 py-12 text-center">
                <p className="font-code text-xs uppercase tracking-[0.22em] text-cyan-200/70">Engine Canvas</p>
                <p className="mt-2 text-lg font-semibold text-white">Drag modules to build your game blueprint</p>
                <p className="mt-2 text-sm text-cyan-100/85">Hold Space + Drag to pan. Mouse wheel zooms, and trackpad gestures support two-finger pan plus pinch zoom.</p>
                <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="lv-chrome-control text-white"
                    onClick={onOpenLibrary}
                    data-panel-interactive="true"
                  >
                    Open Module Library
                  </Button>
                  <Button
                    size="sm"
                    className="bg-gradient-to-r from-blue-500 to-purple-500 text-white"
                    onClick={onAddCoreChain}
                    data-panel-interactive="true"
                  >
                    Add Core Chain
                  </Button>
                </div>
              </div>
            </div>
          )}

          {nodes.map((node) => {
            const isHovered = highlightState.hoveredNodeId === node.id
            const isDirect = directSet.has(node.id)
            const isTransitive = transitiveSet.has(node.id)
            const isDimmed = !!highlightState.hoveredNodeId && !isHovered && !isTransitive
            const isSelected = selectedSet.has(node.id) || selectedNodeId === node.id
            const metadataSections = createMetadataSections(node)

            return (
              <motion.article
                layout
                key={node.id}
                tabIndex={0}
                initial={reducedMotion ? false : { opacity: 0, scale: 0.9 }}
                animate={{
                  opacity: isDimmed ? 0.25 : 1,
                  scale: 1,
                }}
                transition={{ duration: reducedMotion ? 0.05 : 0.22 }}
                className={cn(
                  "absolute w-[244px] rounded-xl border px-4 py-4 backdrop-blur-xl transition-all duration-200",
                  node.isGroup
                    ? "border-purple-300/45 bg-[rgba(76,29,149,0.24)]"
                    : "cursor-grab border-white/12 bg-[rgba(13,19,34,0.86)]",
                  isSelected && "border-cyan-300/70 shadow-[0_0_24px_rgba(34,211,238,0.22)]",
                  node.active && !node.isGroup && ambientMotionAllowed && "lv-node-pulse",
                  isDirect && "shadow-[0_0_26px_rgba(59,130,246,0.34)]",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60",
                )}
                style={{ left: node.x, top: node.y }}
                onPointerEnter={() => onHoverNode(node.id)}
                onPointerLeave={() => onHoverNode(null)}
                onPointerDown={(event) => {
                  if (mode === "simulate" || spacePressed || !canvasRef.current) return
                  event.stopPropagation()
                  const additive = event.shiftKey
                  onSelectNode(node.id, additive)

                  if (node.isGroup || additive) return

                  const world = screenToWorld(canvasRef.current, viewport, event.clientX, event.clientY)
                  nodeDragRef.current = {
                    id: node.id,
                    offsetX: world.x - node.x,
                    offsetY: world.y - node.y,
                  }
                }}
              >
                {!node.isGroup && (
                  <>
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex flex-col justify-center gap-2">
                      {node.inputPorts.map((port, index) => (
                        <span
                          key={port.id}
                          className="absolute left-[-6px] h-2.5 w-2.5 rounded-full border border-cyan-200/70 bg-cyan-300/70 shadow-[0_0_8px_rgba(34,211,238,0.5)]"
                          style={{ top: 36 + index * 16 }}
                        />
                      ))}
                    </div>
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex flex-col justify-center gap-2">
                      {node.outputPorts.map((port, index) => (
                        <span
                          key={port.id}
                          className="absolute right-[-6px] h-2.5 w-2.5 rounded-full border border-blue-200/70 bg-blue-300/75 shadow-[0_0_8px_rgba(59,130,246,0.5)]"
                          style={{ top: 36 + index * 16 }}
                        />
                      ))}
                    </div>
                  </>
                )}

                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="font-code text-[10px] tracking-[0.12em] text-cyan-200/82">
                      {node.isGroup ? "Module Group" : `${node.category} System`}
                    </p>
                    <h3 className="text-sm font-semibold text-white">{getSystemLabel(node.typeId, node.name)}</h3>
                  </div>
                  {node.isGroup ? (
                    <Button
                      size="sm"
                      className="h-7 border border-purple-200/40 bg-purple-400/20 px-2 text-[10px] text-purple-100"
                      onClick={(event) => {
                        event.stopPropagation()
                        if (node.groupId) onToggleGroup(node.groupId)
                      }}
                      data-panel-interactive="true"
                    >
                      Expand
                    </Button>
                  ) : null}
                </div>

                {node.isGroup ? (
                  <>
                    <p className="mt-2 text-xs text-purple-100/85">
                      {node.groupMembers?.length ?? 0} modules grouped: {(node.groupMembers ?? []).join(", ")}
                    </p>
                    <p className="mt-2 text-[10px] text-purple-100/65">Collapsed container node</p>
                  </>
                ) : (
                  <>
                    <p className="mt-2 text-[13px] leading-6 text-blue-100/82">{node.description}</p>
                    {metadataSections.length > 0 ? (
                      <div className="mt-3 space-y-2 border-t border-white/10 pt-3">
                        {metadataSections.map((section) => (
                          <div key={section.label}>
                            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-100/78">
                              {section.label}
                            </p>
                            <p className="mt-1 text-[13px] leading-6 text-white/86">{section.values.join(", ")}</p>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </>
                )}
              </motion.article>
            )
          })}
        </div>

        <AnimatePresence>
          {mode === "simulate" && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0"
            >
              {simulationContent ?? (
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(59,130,246,0.28),transparent_58%)]">
                  <div className="lv-glass-hud absolute left-5 top-5 rounded-lg border border-cyan-300/35 px-3 py-2 text-xs text-cyan-100">
                    <p className="font-semibold">{simulationLabel}</p>
                    <p className="text-cyan-100/70">Runtime preview loop</p>
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {mode !== "simulate" && (
          <div className={cn("absolute z-20", hudAnchorClass(hudLayout.info.anchor))}>
          {compactInfo ? (
            <Button
              size="sm"
              variant="outline"
              className="lv-chrome-control h-8 text-cyan-100"
              onClick={() => setHudExpanded((prev) => ({ ...prev, info: true }))}
              data-panel-interactive="true"
            >
              Game Graph Canvas
            </Button>
          ) : (
            <div className="lv-glass-hud rounded-lg px-3 py-2 text-xs text-cyan-100/75">
              <div className="mb-1 flex items-center gap-2">
                <p className="font-code text-[10px] tracking-[0.12em] text-cyan-50/92">Game Graph Canvas</p>
                <HelpTooltip
                  label="Game Graph Canvas"
                  description="Primary blueprint workspace. Drag modules here, hold Space to pan, use the mouse wheel to zoom, and use trackpad two-finger pan with pinch zoom."
                />
                {hudLayout.info.collapsed && (
                  <button
                    type="button"
                    className="ml-auto text-[10px] text-cyan-100/70 hover:text-cyan-50"
                    onClick={() => setHudExpanded((prev) => ({ ...prev, info: false }))}
                    data-panel-interactive="true"
                  >
                    Minimize
                  </button>
                )}
              </div>
              <p>Zoom: {Math.round(viewport.scale * 100)}%</p>
              <p>{spacePressed ? "Pan enabled" : "Hold Space to Pan"}</p>
              <p>Mouse Wheel to Zoom</p>
              <p>Trackpad: Two-Finger Pan • Pinch to Zoom</p>
            </div>
          )}
          </div>
        )}

        {mode !== "simulate" && (
          <div className={cn("absolute z-20", hudAnchorClass(hudLayout.tools.anchor))}>
          {compactTools ? (
            <Button
              size="sm"
              variant="outline"
              className="lv-chrome-control h-8 text-cyan-100"
              onClick={() => setHudExpanded((prev) => ({ ...prev, tools: true }))}
              data-panel-interactive="true"
            >
              Graph Tools
            </Button>
          ) : (
            <div className="lv-glass-hud flex max-w-[65vw] flex-wrap items-center gap-2 rounded-xl p-2">
              <Button
                size="sm"
                variant="outline"
                className="lv-chrome-control h-8 text-cyan-100 focus-visible:ring-2 focus-visible:ring-cyan-300/60"
                onClick={onAutoArrange}
                data-panel-interactive="true"
              >
                <BringToFront className="mr-2 h-3.5 w-3.5" />
                Auto Arrange Graph
              </Button>
              <Button
                size="sm"
                className="h-8 bg-gradient-to-r from-blue-500 to-purple-500 text-white disabled:opacity-45 focus-visible:ring-2 focus-visible:ring-cyan-300/60"
                disabled={!canGroupSelection}
                onClick={onGroupSelection}
                data-panel-interactive="true"
              >
                <Layers3 className="mr-2 h-3.5 w-3.5" />
                Group Selected
              </Button>
              {groups.map((group) => (
                <button
                  key={group.id}
                  onClick={() => onToggleGroup(group.id)}
                  className="lv-chrome-control rounded-full border border-purple-300/35 bg-purple-400/10 px-3 py-1 text-[11px] text-purple-100 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-300/60"
                  data-panel-interactive="true"
                >
                  {group.collapsed ? "Expand" : "Collapse"} {group.label}
                </button>
              ))}
              {hudLayout.tools.collapsed && (
                <button
                  type="button"
                  className="lv-chrome-control rounded-full px-2.5 py-1 text-[11px] text-cyan-100/80"
                  onClick={() => setHudExpanded((prev) => ({ ...prev, tools: false }))}
                  data-panel-interactive="true"
                >
                  Minimize
                </button>
              )}
            </div>
          )}
          </div>
        )}

        {mode === "build" && suggestionCards.length > 0 && (
          <div className={cn("absolute z-20", hudAnchorClass(hudLayout.suggestions.anchor))}>
            {compactSuggestions ? (
              <Button
                size="sm"
                variant="outline"
                className="lv-chrome-control h-8 border-purple-300/35 text-purple-100"
                onClick={() => setHudExpanded((prev) => ({ ...prev, suggestions: true }))}
                data-panel-interactive="true"
              >
                Suggestions
              </Button>
            ) : (
              <div className="grid w-64 gap-3">
                {suggestionCards.map((suggestion) => (
                  <div
                    key={suggestion.id}
                    className={cn(
                      "lv-glass-hud rounded-xl border-purple-300/35 p-3",
                      ambientMotionAllowed && "lv-suggestion-float",
                    )}
                    data-panel-interactive="true"
                  >
                    <div className="mb-2 flex items-center gap-2 text-purple-100">
                      <Sparkles className="h-4 w-4 text-cyan-200" />
                      <p className="text-xs font-semibold uppercase tracking-wide">Suggestion</p>
                      {hudLayout.suggestions.collapsed && (
                        <button
                          type="button"
                          className="ml-auto text-[10px] text-purple-100/75 hover:text-purple-50"
                          onClick={() => setHudExpanded((prev) => ({ ...prev, suggestions: false }))}
                          data-panel-interactive="true"
                        >
                          Minimize
                        </button>
                      )}
                    </div>
                    <p className="text-sm font-semibold text-white">{suggestion.title}</p>
                    <p className="mt-1 text-xs text-blue-100/75">{suggestion.reason}</p>
                    {suggestion.moduleTypeIds.length > 0 && (
                      <Button
                        size="sm"
                        onClick={() => onApplySuggestion(suggestion)}
                        className="mt-3 h-8 w-full bg-gradient-to-r from-blue-500 to-purple-500 text-white focus-visible:ring-2 focus-visible:ring-cyan-300/60"
                        data-panel-interactive="true"
                      >
                        <Plus className="mr-2 h-4 w-4" />
                        Add Module
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {mode !== "simulate" && (
          <div className={cn("absolute z-20", hudAnchorClass(hudLayout.minimap.anchor))}>
          {compactMinimap ? (
            <Button
              size="sm"
              variant="outline"
              className="lv-chrome-control h-8 text-cyan-100"
              onClick={() => setHudExpanded((prev) => ({ ...prev, minimap: true }))}
              data-panel-interactive="true"
            >
              Minimap
            </Button>
          ) : (
            <div
              ref={minimapRef}
              className="lv-glass-hud relative overflow-hidden rounded-xl"
              style={{ width: MINIMAP_WIDTH, height: MINIMAP_HEIGHT }}
              data-panel-interactive="true"
              onPointerDown={(event) => {
                if (!minimapRef.current) return
                event.preventDefault()
                event.stopPropagation()
                const rect = minimapRef.current.getBoundingClientRect()
                const x = event.clientX - rect.left
                const y = event.clientY - rect.top
                const insideRect =
                  x >= minimapViewportRect.x &&
                  x <= minimapViewportRect.x + minimapViewportRect.width &&
                  y >= minimapViewportRect.y &&
                  y <= minimapViewportRect.y + minimapViewportRect.height

                minimapDragRef.current = {
                  active: true,
                  mode: insideRect ? "dragRect" : "jump",
                  offsetX: insideRect ? x - minimapViewportRect.x : minimapViewportRect.width / 2,
                  offsetY: insideRect ? y - minimapViewportRect.y : minimapViewportRect.height / 2,
                }

                applyMinimapNavigation(
                  minimapDragRef.current.mode,
                  event.clientX,
                  event.clientY,
                  minimapDragRef.current.offsetX,
                  minimapDragRef.current.offsetY,
                  minimapRef.current,
                  canvasSize,
                  viewport,
                  onViewportChange,
                )
              }}
            >
              {hudLayout.minimap.collapsed && (
                <button
                  type="button"
                  className="absolute right-1 top-1 z-30 rounded border border-white/20 bg-black/40 px-1.5 py-0.5 text-[10px] text-cyan-100/75 hover:text-cyan-50"
                  onClick={() => setHudExpanded((prev) => ({ ...prev, minimap: false }))}
                  data-panel-interactive="true"
                >
                  Min
                </button>
              )}
              <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(59,130,246,0.16)_1px,transparent_1px),linear-gradient(90deg,rgba(59,130,246,0.16)_1px,transparent_1px)] [background-size:14px_14px]" />
              {nodes.map((node) => {
                const x = (node.x / WORLD_WIDTH) * MINIMAP_WIDTH
                const y = (node.y / WORLD_HEIGHT) * MINIMAP_HEIGHT
                const width = ((node.isGroup ? 280 : NODE_WIDTH) / WORLD_WIDTH) * MINIMAP_WIDTH
                const height = ((node.isGroup ? 170 : NODE_HEIGHT) / WORLD_HEIGHT) * MINIMAP_HEIGHT
                return (
                  <div
                    key={`mini-${node.id}`}
                    className={cn(
                      "pointer-events-none absolute rounded-[2px]",
                      node.isGroup ? "border border-purple-300/70 bg-purple-400/30" : "bg-cyan-300/80",
                    )}
                    style={{ left: x, top: y, width: Math.max(2, width), height: Math.max(2, height) }}
                  />
                )
              })}
              <div
                className="pointer-events-none absolute border border-cyan-200 bg-cyan-300/10"
                style={{
                  left: minimapViewportRect.x,
                  top: minimapViewportRect.y,
                  width: Math.max(8, minimapViewportRect.width),
                  height: Math.max(8, minimapViewportRect.height),
                }}
              />
            </div>
          )}
          </div>
        )}
      </motion.div>
    </div>
  )
}

function screenToWorld(canvas: HTMLDivElement, viewport: CanvasViewport, clientX: number, clientY: number) {
  const rect = canvas.getBoundingClientRect()
  const localX = clientX - rect.left
  const localY = clientY - rect.top
  return {
    x: (localX - viewport.x) / viewport.scale,
    y: (localY - viewport.y) / viewport.scale,
  }
}

function hudAnchorClass(anchor: CanvasHudLayout["info"]["anchor"]) {
  switch (anchor) {
    case "top-left":
      return "left-4 top-4"
    case "top-right":
      return "right-4 top-4"
    case "top-center":
      return "left-1/2 top-4 -translate-x-1/2"
    case "right-middle":
      return "right-4 top-1/2 -translate-y-1/2"
    case "bottom-left":
      return "bottom-4 left-4"
    case "bottom-center":
      return "bottom-4 left-1/2 -translate-x-1/2"
    case "bottom-right":
      return "bottom-4 right-4"
    default:
      return "left-4 top-4"
  }
}

function applyMinimapNavigation(
  mode: "jump" | "dragRect",
  clientX: number,
  clientY: number,
  offsetX: number,
  offsetY: number,
  minimapEl: HTMLDivElement,
  canvasSize: { width: number; height: number },
  viewport: CanvasViewport,
  onViewportChange: (patch: Partial<CanvasViewport>) => void,
) {
  const rect = minimapEl.getBoundingClientRect()
  const localX = clamp(clientX - rect.left, 0, MINIMAP_WIDTH)
  const localY = clamp(clientY - rect.top, 0, MINIMAP_HEIGHT)

  if (mode === "jump") {
    const targetWorldX = (localX / MINIMAP_WIDTH) * WORLD_WIDTH
    const targetWorldY = (localY / MINIMAP_HEIGHT) * WORLD_HEIGHT
    const nextX = canvasSize.width / 2 - targetWorldX * viewport.scale
    const nextY = canvasSize.height / 2 - targetWorldY * viewport.scale
    onViewportChange({ x: nextX, y: nextY })
    return
  }

  const visibleWorldW = canvasSize.width / Math.max(viewport.scale, 0.001)
  const visibleWorldH = canvasSize.height / Math.max(viewport.scale, 0.001)
  const rectX = clamp(localX - offsetX, 0, Math.max(0, MINIMAP_WIDTH - (visibleWorldW / WORLD_WIDTH) * MINIMAP_WIDTH))
  const rectY = clamp(localY - offsetY, 0, Math.max(0, MINIMAP_HEIGHT - (visibleWorldH / WORLD_HEIGHT) * MINIMAP_HEIGHT))
  const visibleWorldX = (rectX / MINIMAP_WIDTH) * WORLD_WIDTH
  const visibleWorldY = (rectY / MINIMAP_HEIGHT) * WORLD_HEIGHT
  onViewportChange({
    x: -visibleWorldX * viewport.scale,
    y: -visibleWorldY * viewport.scale,
  })
}

function createMetadataSections(node: ModuleNode) {
  const inputs = cleanMetadataValues(node.inputs)
  const outputs = cleanMetadataValues(node.outputs)
  const dependencies = cleanMetadataValues(node.dependencies.map((dependency) => getSystemLabel(dependency)))

  return [
    { label: "Inputs", values: inputs },
    { label: "Outputs", values: outputs },
    { label: "Dependencies", values: dependencies },
  ].filter((section) => section.values.length > 0)
}

function cleanMetadataValues(values: string[]) {
  return values.map((value) => value.trim()).filter((value) => value.length > 0 && value !== "None")
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}
