import { describe, expect, it } from "vitest"
import {
  classifyCanvasWheelGesture,
  createCenteredCanvasViewport,
  createCompileSignature,
  createDependencyEdgeFromGraphEdge,
  createGenerationPlanningSteps,
  createGenerationReplayOffset,
  createNodeFromGraphNode,
  offsetWorkspaceNodePositions,
  shouldInvalidateCompiledSpec,
  updateWorkspaceCanvasViewport,
  updateGenerationPlanningSteps,
  upsertDependencyEdge,
  upsertGeneratedNode,
} from "@/lib/levelyst/workbench-helpers"

describe("workbench helpers", () => {
  it("maps graph nodes into editor nodes", () => {
    const node = createNodeFromGraphNode({
      id: "player/platformer_controller",
      module_id: "player/platformer_controller",
      category: "player_mechanics",
      position: { x: 140, y: 280 },
    })

    expect(node.id).toBe("node_player_platformer_controller")
    expect(node.typeId).toBe("player/platformer_controller")
    expect(node.x).toBe(140)
    expect(node.y).toBe(280)
  })

  it("maps graph edges into dependency edges without duplication", () => {
    const edge = createDependencyEdgeFromGraphEdge({
      id: "edge_camera_side_scroll_player_platformer_controller",
      from_node_id: "camera/side_scroll",
      to_node_id: "player/platformer_controller",
      kind: "requires",
    })

    const nextEdges = upsertDependencyEdge([], edge)
    expect(nextEdges).toEqual([edge])
    expect(upsertDependencyEdge(nextEdges, edge)).toEqual([edge])
  })

  it("advances planning steps from graph build to compile completion", () => {
    const initial = createGenerationPlanningSteps()
    const graphBuild = updateGenerationPlanningSteps(initial, "node_added")
    const compile = updateGenerationPlanningSteps(graphBuild, "compile_started")
    const ready = updateGenerationPlanningSteps(compile, "job_completed")

    expect(graphBuild[0].status).toBe("done")
    expect(graphBuild[1].status).toBe("running")
    expect(compile[2].status).toBe("running")
    expect(ready.every((step) => step.status === "done")).toBe(true)
  })

  it("upserts generated nodes by module id", () => {
    const first = createNodeFromGraphNode({
      id: "camera/side_scroll",
      module_id: "camera/side_scroll",
      category: "camera",
      position: { x: 140, y: 140 },
    })
    const updated = {
      ...first,
      x: 240,
    }

    expect(upsertGeneratedNode([], first)).toEqual([first])
    expect(upsertGeneratedNode([first], updated)).toEqual([updated])
  })

  it("applies replay offsets when mapping generated graph nodes", () => {
    const node = createNodeFromGraphNode(
      {
        id: "player/platformer_controller",
        module_id: "player/platformer_controller",
        category: "player_mechanics",
        position: { x: 1000, y: 840 },
      },
      { x: 120, y: -60 },
    )

    expect(node.x).toBe(1120)
    expect(node.y).toBe(780)
  })

  it("creates a replay offset from the current visible world center", () => {
    expect(createGenerationReplayOffset({ x: 1500, y: 980 })).toEqual({ x: 200, y: 80 })
  })

  it("creates a centered canvas viewport for a fresh empty project", () => {
    expect(createCenteredCanvasViewport(1280, 720)).toEqual({
      x: -660,
      y: -540,
      scale: 1,
      isPanning: false,
    })
  })

  it("offsets persisted workspace node positions without changing non-position fields", () => {
    const workspace = offsetWorkspaceNodePositions(
      {
        nodes: [
          {
            id: "node_player_platformer_controller",
            module_id: "player/platformer_controller",
            x: 1020,
            y: 860,
            active: true,
          },
        ],
        groups: [],
        timeline_sections: [],
        prompt: "Create a platformer",
        game_plan: [],
        planning_steps: [],
        canvas_viewport: {
          x: 0,
          y: 0,
          scale: 1,
          is_panning: false,
        },
        pending_blueprint: null,
        pending_blueprint_diagnostics: null,
        pending_prompt_mode: null,
        blueprint_state: "idle",
      },
      { x: 160, y: -80 },
    )

    expect(workspace.nodes[0]).toMatchObject({
      id: "node_player_platformer_controller",
      module_id: "player/platformer_controller",
      x: 1180,
      y: 780,
    })
    expect(workspace.prompt).toBe("Create a platformer")
  })

  it("updates the persisted workspace viewport without changing graph data", () => {
    const workspace = updateWorkspaceCanvasViewport(
      {
        nodes: [
          {
            id: "node_player_platformer_controller",
            module_id: "player/platformer_controller",
            x: 1020,
            y: 860,
            active: true,
          },
        ],
        groups: [],
        timeline_sections: [],
        prompt: "Create a platformer",
        game_plan: [],
        planning_steps: [],
        canvas_viewport: {
          x: 260,
          y: 140,
          scale: 1,
          is_panning: false,
        },
        pending_blueprint: null,
        pending_blueprint_diagnostics: null,
        pending_prompt_mode: null,
        blueprint_state: "idle",
      },
      {
        x: -660,
        y: -540,
        scale: 1,
        is_panning: false,
      },
    )

    expect(workspace.canvas_viewport).toEqual({
      x: -660,
      y: -540,
      scale: 1,
      is_panning: false,
    })
    expect(workspace.nodes[0]).toMatchObject({
      id: "node_player_platformer_controller",
      x: 1020,
      y: 860,
    })
  })

  it("classifies pinch, trackpad pan, and mouse wheel gestures separately", () => {
    expect(
      classifyCanvasWheelGesture({
        ctrlKey: true,
        deltaMode: 0,
        deltaX: 0,
        deltaY: -8,
      }),
    ).toBe("pinch-zoom")

    expect(
      classifyCanvasWheelGesture({
        ctrlKey: false,
        deltaMode: 0,
        deltaX: 12.5,
        deltaY: 9.25,
      }),
    ).toBe("trackpad-pan")

    expect(
      classifyCanvasWheelGesture({
        ctrlKey: false,
        deltaMode: 1,
        deltaX: 0,
        deltaY: 3,
      }),
    ).toBe("mouse-wheel-zoom")
  })

  it("keeps the compile signature stable across layout-only node movement", () => {
    const workspace = {
      nodes: [
        {
          ...createNodeFromGraphNode({
            id: "player/platformer_controller",
            module_id: "player/platformer_controller",
            category: "player_mechanics",
            position: { x: 140, y: 280 },
          }),
          isGroup: false,
        },
      ],
      timelineSections: [{ id: "intro", title: "Intro", order: 0, expanded: true, moduleIds: [] }],
    }

    const movedWorkspace = {
      ...workspace,
      nodes: workspace.nodes.map((node) => ({ ...node, x: node.x + 200 })),
    }

    expect(createCompileSignature(movedWorkspace)).toBe(createCompileSignature(workspace))
  })

  it("invalidates the compiled spec only when compile inputs change", () => {
    const workspace = {
      nodes: [
        {
          ...createNodeFromGraphNode({
            id: "player/platformer_controller",
            module_id: "player/platformer_controller",
            category: "player_mechanics",
            position: { x: 140, y: 280 },
          }),
          isGroup: false,
        },
      ],
      timelineSections: [{ id: "intro", title: "Intro", order: 0, expanded: true, moduleIds: [] }],
    }

    const compiledSignature = createCompileSignature(workspace)
    const sameInputs = createCompileSignature({
      ...workspace,
      nodes: workspace.nodes.map((node) => ({ ...node, y: node.y + 120 })),
    })
    const changedInputs = createCompileSignature({
      ...workspace,
      nodes: [
        ...workspace.nodes,
        {
          ...createNodeFromGraphNode({
            id: "camera/side_scroll",
            module_id: "camera/side_scroll",
            category: "camera",
            position: { x: 320, y: 180 },
          }),
          isGroup: false,
        },
      ],
    })

    expect(shouldInvalidateCompiledSpec(sameInputs, compiledSignature)).toBe(false)
    expect(shouldInvalidateCompiledSpec(changedInputs, compiledSignature)).toBe(true)
  })
})
