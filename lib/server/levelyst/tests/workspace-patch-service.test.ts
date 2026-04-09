import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { createLevelystRepository } from "@/lib/server/levelyst/project-repository"
import { planPrompt } from "@/lib/server/levelyst/planner-service"
import { generatePrototypeForProject } from "@/lib/server/levelyst/generation-service"
import { patchProjectSpec } from "@/lib/server/levelyst/workspace-patch-service"

describe("workspace patch service", () => {
  let dbDir = ""

  beforeEach(() => {
    dbDir = fs.mkdtempSync(path.join(os.tmpdir(), "levelyst-workspace-patch-"))
    process.env.LEVELYST_PLANNER_PROVIDER = "rule_based"
  })

  afterEach(() => {
    delete process.env.LEVELYST_PLANNER_PROVIDER
    fs.rmSync(dbDir, { recursive: true, force: true })
  })

  it("removes stale timeline attachments when patched modules disappear", async () => {
    const repository = createLevelystRepository(path.join(dbDir, "timeline.sqlite"))
    const project = repository.createProject({
      name: "Timeline Cleanup",
      runtime_target: "web_2d",
    })
    const blueprint = await planPrompt("Create a 2D platformer with coins and checkpoints")
    repository.updateProject(project.id, {
      blueprint_json: blueprint,
      workspace_json: {
        ...project.workspace_json,
        prompt: "Create a 2D platformer with coins and checkpoints",
      },
    })

    const generated = generatePrototypeForProject(repository, project.id).project
    const workspaceWithAttachment = {
      ...generated.workspace_json,
      timeline_sections: generated.workspace_json.timeline_sections.map((section, index) =>
        index === 0
          ? {
              ...section,
              module_ids: ["node_systems_coin_collectible"],
            }
          : section,
      ),
    }

    repository.updateProject(project.id, {
      workspace_json: workspaceWithAttachment,
    })

    const patched = patchProjectSpec(repository, project.id, [
      {
        op: "remove_system",
        module: "systems/coin_collectible",
      },
    ])

    expect(patched.workspace_json.timeline_sections[0]?.module_ids).toEqual([])
    expect(patched.module_graph?.nodes.some((node) => node.module_id === "systems/coin_collectible")).toBe(false)
  })

  it("moves graph layout nodes without rebuilding the spec", async () => {
    const repository = createLevelystRepository(path.join(dbDir, "layout.sqlite"))
    const project = repository.createProject({
      name: "Layout Patch",
      runtime_target: "web_2d",
    })
    const blueprint = await planPrompt("Create a 2D platformer with coins and checkpoints")
    repository.updateProject(project.id, {
      blueprint_json: blueprint,
      workspace_json: {
        ...project.workspace_json,
        prompt: "Create a 2D platformer with coins and checkpoints",
      },
    })

    const generated = generatePrototypeForProject(repository, project.id).project
    const originalSpec = generated.prototype_spec

    const patched = patchProjectSpec(repository, project.id, [
      {
        op: "move_graph_node_layout",
        node_id: "player/platformer_controller",
        position: { x: 920, y: 460 },
      },
    ])

    const movedWorkspaceNode = patched.workspace_json.nodes.find((node) => node.module_id === "player/platformer_controller")
    const movedGraphNode = patched.module_graph?.nodes.find((node) => node.module_id === "player/platformer_controller")

    expect(movedWorkspaceNode).toMatchObject({ x: 920, y: 460 })
    expect(movedGraphNode?.position).toEqual({ x: 920, y: 460 })
    expect(patched.prototype_spec).toEqual(originalSpec)
  })
})
