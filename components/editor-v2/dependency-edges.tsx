"use client"

import type { DependencyEdge, ModuleCategory, NodeHighlightState, ModuleNode } from "@/lib/editor-v2-model"

interface DependencyEdgesProps {
  nodes: ModuleNode[]
  edges: DependencyEdge[]
  highlightState: NodeHighlightState
}

const NODE_WIDTH = 244
const NODE_HEIGHT = 128

export function DependencyEdges({ nodes, edges, highlightState }: DependencyEdgesProps) {
  const nodeByType = new Map<string, ModuleNode>()
  nodes.forEach((node) => {
    if (!nodeByType.has(node.typeId)) {
      nodeByType.set(node.typeId, node)
    }
  })

  const isFiltering = !!highlightState.hoveredNodeId
  const transitiveSet = new Set(highlightState.transitiveNodeIds)
  const directSet = new Set(highlightState.directNodeIds)
  const transitiveTypeSet = new Set(highlightState.transitiveTypeIds)

  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
      <defs>
        <marker id="edge-arrow-solid" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="rgba(203,213,225,0.9)" />
        </marker>
        <marker id="edge-arrow-dashed" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="rgba(148,163,184,0.9)" />
        </marker>
      </defs>

      {edges.map((edge, index) => {
        const fromNode = nodeByType.get(edge.fromTypeId)
        const toNode = nodeByType.get(edge.toTypeId)
        if (!fromNode || !toNode) return null

        const fromX = fromNode.x + NODE_WIDTH
        const fromY = fromNode.y + NODE_HEIGHT / 2
        const toX = toNode.x
        const toY = toNode.y + NODE_HEIGHT / 2
        const controlOffset = Math.max(90, Math.abs(toX - fromX) / 2)
        const path = `M ${fromX} ${fromY} C ${fromX + controlOffset} ${fromY}, ${toX - controlOffset} ${toY}, ${toX} ${toY}`

        const fromNodeInPath = transitiveSet.has(fromNode.id) || transitiveTypeSet.has(fromNode.typeId)
        const toNodeInPath = transitiveSet.has(toNode.id) || transitiveTypeSet.has(toNode.typeId)
        const activeByHover = !isFiltering || (fromNodeInPath && toNodeInPath)
        const directConnection =
          !!highlightState.hoveredNodeId &&
          (fromNode.id === highlightState.hoveredNodeId || toNode.id === highlightState.hoveredNodeId)
        const directByHover = directConnection || directSet.has(fromNode.id) || directSet.has(toNode.id)

        const baseColor = edgeColorForCategory(fromNode.category)
        const strokeOpacity = activeByHover ? (directByHover ? 1 : 0.64) : 0.1
        const edgeKey = `${edge.fromTypeId}-${edge.toTypeId}-${index}`
        const markerId = edge.kind === "required" ? "edge-arrow-solid" : "edge-arrow-dashed"

        return (
          <g key={edgeKey}>
            <path
              id={`edge-path-${edgeKey}`}
              d={path}
              fill="none"
              stroke={withOpacity(baseColor, strokeOpacity)}
              strokeWidth={edge.kind === "required" ? (directByHover ? 3.2 : 2.5) : directByHover ? 2.6 : 2}
              strokeDasharray={edge.kind === "required" ? undefined : "7 6"}
              markerEnd={`url(#${markerId})`}
            />
            <path
              d={path}
              fill="none"
              stroke={withOpacity(baseColor, activeByHover ? (directByHover ? 0.62 : 0.38) : 0.08)}
              strokeWidth={edge.kind === "required" ? 3.4 : 2.6}
              strokeLinecap="round"
              strokeDasharray="2 10"
              className="lv-signal-dash"
            />
            {activeByHover && (
              <circle r="2.8" fill={withOpacity(baseColor, 0.95)}>
                <animateMotion dur={edge.kind === "required" ? "2.2s" : "3.1s"} repeatCount="indefinite" path={path} />
              </circle>
            )}
          </g>
        )
      })}
    </svg>
  )
}

function edgeColorForCategory(category: ModuleCategory): string {
  switch (category) {
    case "AI":
      return "rgb(168, 85, 247)"
    case "COMBAT":
      return "rgb(248, 113, 113)"
    case "AUDIO":
      return "rgb(74, 222, 128)"
    case "UI":
      return "rgb(34, 211, 238)"
    case "PHYSICS":
      return "rgb(148, 163, 184)"
    case "CORE":
    default:
      return "rgb(59, 130, 246)"
  }
}

function withOpacity(rgbColor: string, alpha: number): string {
  const values = rgbColor
    .replace("rgb(", "")
    .replace(")", "")
    .split(",")
    .map((part) => part.trim())

  return `rgba(${values[0]}, ${values[1]}, ${values[2]}, ${alpha})`
}
