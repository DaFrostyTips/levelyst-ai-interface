"use client"

import { useEffect, useMemo, useRef } from "react"
import type { ReactNode, RefObject } from "react"
import { Button } from "@/components/ui/button"
import { ChevronDown, GripHorizontal } from "lucide-react"
import { cn } from "@/lib/utils"
import type { FloatingPanelState, PanelDockSlot } from "@/lib/editor-v2-model"

export type ResizeHandle = "e" | "w" | "n" | "s" | "ne" | "nw" | "se" | "sw"

interface PointerPayload {
  pointerX: number
  pointerY: number
}

interface FloatingPanelProps {
  title: string
  state: FloatingPanelState
  boundsRef: RefObject<HTMLDivElement | null>
  onFocus: () => void
  onChange: (patch: Partial<FloatingPanelState>) => void
  onDragStart?: () => void
  onDragMove?: (payload: PointerPayload) => void
  onDragEnd?: (payload: PointerPayload) => void
  resizeHandles?: ResizeHandle[]
  className?: string
  contentClassName?: string
  hidden?: boolean
  children: ReactNode
}

const EDGE_GUTTER = 8
const COLLAPSED_HEIGHT = 52
const UNDOCK_THRESHOLD = 32

const HANDLE_CLASS_MAP: Record<ResizeHandle, string> = {
  e: "right-0 top-3 bottom-3 w-2 cursor-ew-resize",
  w: "left-0 top-3 bottom-3 w-2 cursor-ew-resize",
  n: "left-3 right-3 top-0 h-2 cursor-ns-resize",
  s: "left-3 right-3 bottom-0 h-2 cursor-ns-resize",
  ne: "right-0 top-0 h-3 w-3 cursor-nesw-resize",
  nw: "left-0 top-0 h-3 w-3 cursor-nwse-resize",
  se: "right-0 bottom-0 h-3 w-3 cursor-nwse-resize",
  sw: "left-0 bottom-0 h-3 w-3 cursor-nesw-resize",
}

export function FloatingPanel({
  title,
  state,
  boundsRef,
  onFocus,
  onChange,
  onDragStart,
  onDragMove,
  onDragEnd,
  resizeHandles = [],
  className,
  contentClassName,
  hidden = false,
  children,
}: FloatingPanelProps) {
  const stateRef = useRef(state)
  const dragRef = useRef<{
    active: boolean
    pointerId: number | null
    startX: number
    startY: number
    originX: number
    originY: number
    undocked: boolean
  }>({
    active: false,
    pointerId: null,
    startX: 0,
    startY: 0,
    originX: 0,
    originY: 0,
    undocked: false,
  })
  const resizeRef = useRef<{
    active: boolean
    pointerId: number | null
    handle: ResizeHandle
    startX: number
    startY: number
    originX: number
    originY: number
    originWidth: number
    originHeight: number
  } | null>(null)

  const visibleHeight = state.collapsed ? COLLAPSED_HEIGHT : state.height

  const panelClassName = useMemo(
    () =>
      cn(
        "lv-glass-shell group absolute overflow-hidden rounded-2xl transition-all duration-500",
        hidden ? "pointer-events-none scale-[0.98] opacity-0" : "opacity-100",
        className,
      ),
    [className, hidden],
  )

  useEffect(() => {
    stateRef.current = state
  }, [state])

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const bounds = boundsRef.current?.getBoundingClientRect()
      if (!bounds) return

      if (resizeRef.current?.active) {
        const panel = stateRef.current
        if (panel.collapsed) return

        const currentResize = resizeRef.current
        if (!currentResize) return

        const dx = event.clientX - currentResize.startX
        const dy = event.clientY - currentResize.startY

        const maxWidthByBounds = Math.max(panel.minWidth, bounds.width - EDGE_GUTTER * 2)
        const maxHeightByBounds = Math.max(panel.minHeight, bounds.height - EDGE_GUTTER * 2)
        const minWidth = panel.minWidth
        const maxWidth = Math.min(panel.maxWidth, maxWidthByBounds)
        const minHeight = panel.minHeight
        const maxHeight = Math.min(panel.maxHeight, maxHeightByBounds)

        let nextX = currentResize.originX
        let nextY = currentResize.originY
        let nextWidth = currentResize.originWidth
        let nextHeight = currentResize.originHeight

        const handle = currentResize.handle

        if (handle.includes("e")) {
          nextWidth = clamp(currentResize.originWidth + dx, minWidth, maxWidth)
        }
        if (handle.includes("w")) {
          nextWidth = clamp(currentResize.originWidth - dx, minWidth, maxWidth)
          if (panel.dockMode === "floating") {
            nextX = currentResize.originX + (currentResize.originWidth - nextWidth)
          }
        }
        if (handle.includes("s")) {
          nextHeight = clamp(currentResize.originHeight + dy, minHeight, maxHeight)
        }
        if (handle.includes("n")) {
          nextHeight = clamp(currentResize.originHeight - dy, minHeight, maxHeight)
          if (panel.dockMode === "floating") {
            nextY = currentResize.originY + (currentResize.originHeight - nextHeight)
          }
        }

        if (panel.dockMode === "docked" && panel.dockSlot) {
          const anchored = alignRectToSlot(panel.dockSlot, nextWidth, nextHeight, panel.collapsed, bounds.width, bounds.height)
          nextX = anchored.x
          nextY = anchored.y
        } else {
          nextX = clamp(nextX, EDGE_GUTTER, Math.max(EDGE_GUTTER, bounds.width - nextWidth - EDGE_GUTTER))
          nextY = clamp(nextY, EDGE_GUTTER, Math.max(EDGE_GUTTER, bounds.height - nextHeight - EDGE_GUTTER))
        }

        onChange({
          x: nextX,
          y: nextY,
          width: nextWidth,
          height: nextHeight,
        })
        return
      }

      if (!dragRef.current.active) return
      onDragMove?.({ pointerX: event.clientX, pointerY: event.clientY })

      const panel = stateRef.current

      if (panel.dockMode === "docked" && !dragRef.current.undocked) {
        const dx = event.clientX - dragRef.current.startX
        const dy = event.clientY - dragRef.current.startY
        const movedAway = dragDistanceFromDock(panel.dockSlot, dx, dy)

        if (movedAway < UNDOCK_THRESHOLD) {
          return
        }

        const fallback = panel.lastFloatingRect
        const nextWidth = clamp(fallback.width, panel.minWidth, Math.min(panel.maxWidth, bounds.width - EDGE_GUTTER * 2))
        const nextHeight = clamp(fallback.height, panel.minHeight, Math.min(panel.maxHeight, bounds.height - EDGE_GUTTER * 2))
        const nextX = clamp(fallback.x, EDGE_GUTTER, Math.max(EDGE_GUTTER, bounds.width - nextWidth - EDGE_GUTTER))
        const nextY = clamp(fallback.y, EDGE_GUTTER, Math.max(EDGE_GUTTER, bounds.height - nextHeight - EDGE_GUTTER))

        onChange({
          dockMode: "floating",
          dockSlot: null,
          isSnapped: false,
          x: nextX,
          y: nextY,
          width: nextWidth,
          height: nextHeight,
        })

        dragRef.current.undocked = true
        dragRef.current.startX = event.clientX
        dragRef.current.startY = event.clientY
        dragRef.current.originX = nextX
        dragRef.current.originY = nextY
        return
      }

      const nextXUnclamped = dragRef.current.originX + (event.clientX - dragRef.current.startX)
      const nextYUnclamped = dragRef.current.originY + (event.clientY - dragRef.current.startY)
      const nextX = clamp(nextXUnclamped, EDGE_GUTTER, Math.max(EDGE_GUTTER, bounds.width - panel.width - EDGE_GUTTER))
      const nextY = clamp(nextYUnclamped, EDGE_GUTTER, Math.max(EDGE_GUTTER, bounds.height - visibleHeight - EDGE_GUTTER))

      onChange({ x: nextX, y: nextY, dockMode: "floating", dockSlot: null, isSnapped: false })
    }

    const handlePointerUp = (event: PointerEvent) => {
      if (resizeRef.current?.active) {
        resizeRef.current = null
      }
      if (dragRef.current.active) {
        dragRef.current.active = false
        dragRef.current.pointerId = null
        dragRef.current.undocked = false
        onDragEnd?.({ pointerX: event.clientX, pointerY: event.clientY })
      }
    }

    window.addEventListener("pointermove", handlePointerMove)
    window.addEventListener("pointerup", handlePointerUp)

    return () => {
      window.removeEventListener("pointermove", handlePointerMove)
      window.removeEventListener("pointerup", handlePointerUp)
    }
  }, [boundsRef, onChange, onDragEnd, onDragMove, visibleHeight])

  return (
    <div
      style={{
        left: state.x,
        top: state.y,
        width: state.width,
        height: state.collapsed ? undefined : state.height,
        zIndex: state.zIndex,
      }}
      className={panelClassName}
      onPointerDown={(event) => {
        if (event.button !== 0 || hidden) return
        const target = event.target as HTMLElement
        if (isInteractiveTarget(target)) {
          onFocus()
          return
        }

        const bounds = boundsRef.current?.getBoundingClientRect()
        if (!bounds) return

        event.preventDefault()
        onFocus()
        onDragStart?.()
        dragRef.current.active = true
        dragRef.current.pointerId = event.pointerId
        dragRef.current.startX = event.clientX
        dragRef.current.startY = event.clientY
        dragRef.current.originX = state.x
        dragRef.current.originY = state.y
        dragRef.current.undocked = state.dockMode === "floating"
      }}
    >
      <div className="lv-glass-hud flex h-12 items-center justify-between border-b border-white/10 px-3">
        <div className="flex items-center gap-2 text-cyan-100/85">
          <GripHorizontal className="h-4 w-4" />
          <p className="font-code text-[11px] uppercase tracking-[0.2em]">{title}</p>
        </div>
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7 text-cyan-100/75 hover:bg-white/10 hover:text-white"
          onClick={() => onChange({ collapsed: !state.collapsed })}
          data-panel-interactive="true"
        >
          <ChevronDown className={cn("h-4 w-4 transition-transform", state.collapsed && "rotate-180")} />
        </Button>
      </div>

      {!state.collapsed && <div className={cn("h-[calc(100%-3rem)]", contentClassName)}>{children}</div>}

      {!state.collapsed &&
        resizeHandles.map((handle) => (
          <button
            key={handle}
            type="button"
            aria-label={`${title} resize ${handle}`}
            className={cn(
              "absolute rounded-md opacity-0 transition hover:bg-cyan-300/20 group-hover:opacity-100",
              HANDLE_CLASS_MAP[handle],
            )}
            data-panel-interactive="true"
            onPointerDown={(event) => {
              if (event.button !== 0) return
              event.preventDefault()
              event.stopPropagation()
              onFocus()
              resizeRef.current = {
                active: true,
                pointerId: event.pointerId,
                handle,
                startX: event.clientX,
                startY: event.clientY,
                originX: state.x,
                originY: state.y,
                originWidth: state.width,
                originHeight: state.height,
              }
            }}
          />
        ))}
    </div>
  )
}

function isInteractiveTarget(target: HTMLElement): boolean {
  return Boolean(
    target.closest(
      [
        "button",
        "input",
        "textarea",
        "select",
        "option",
        "a",
        "label",
        "video",
        "audio",
        "summary",
        "li",
        "ul",
        "ol",
        "[role='button']",
        "[role='textbox']",
        "[role='tab']",
        "[role='tablist']",
        "[role='slider']",
        "[contenteditable='true']",
        "[draggable='true']",
        "[data-panel-interactive='true']",
      ].join(","),
    ),
  )
}

function dragDistanceFromDock(dockSlot: PanelDockSlot | null, dx: number, dy: number): number {
  if (!dockSlot) return Math.max(Math.abs(dx), Math.abs(dy))
  if (dockSlot.startsWith("left")) return dx
  if (dockSlot.startsWith("right")) return -dx
  if (dockSlot.startsWith("bottom")) return -dy
  return Math.max(Math.abs(dx), Math.abs(dy))
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function alignRectToSlot(
  dockSlot: PanelDockSlot,
  width: number,
  height: number,
  collapsed: boolean,
  surfaceWidth: number,
  surfaceHeight: number,
) {
  const panelHeight = collapsed ? COLLAPSED_HEIGHT : height

  if (dockSlot.startsWith("left")) {
    return {
      x: EDGE_GUTTER,
      y: slotVerticalY(dockSlot, panelHeight, surfaceHeight),
    }
  }

  if (dockSlot.startsWith("right")) {
    return {
      x: Math.max(EDGE_GUTTER, surfaceWidth - width - EDGE_GUTTER),
      y: slotVerticalY(dockSlot, panelHeight, surfaceHeight),
    }
  }

  return {
    x: slotHorizontalX(dockSlot, width, surfaceWidth),
    y: Math.max(EDGE_GUTTER, surfaceHeight - panelHeight - EDGE_GUTTER),
  }
}

function slotVerticalY(dockSlot: PanelDockSlot, panelHeight: number, surfaceHeight: number) {
  if (dockSlot.endsWith("top")) return EDGE_GUTTER
  if (dockSlot.endsWith("middle")) return Math.max(EDGE_GUTTER, (surfaceHeight - panelHeight) / 2)
  return Math.max(EDGE_GUTTER, surfaceHeight - panelHeight - EDGE_GUTTER)
}

function slotHorizontalX(dockSlot: PanelDockSlot, panelWidth: number, surfaceWidth: number) {
  if (dockSlot.endsWith("left")) return EDGE_GUTTER
  if (dockSlot.endsWith("center")) return Math.max(EDGE_GUTTER, (surfaceWidth - panelWidth) / 2)
  return Math.max(EDGE_GUTTER, surfaceWidth - panelWidth - EDGE_GUTTER)
}
