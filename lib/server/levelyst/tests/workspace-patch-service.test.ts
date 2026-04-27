import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { createLevelystRepository } from "@/lib/server/levelyst/project-repository"
import { planPrompt } from "@/lib/server/levelyst/planner-service"
import { generatePrototypeForProject } from "@/lib/server/levelyst/generation-service"
import { patchProjectSpec } from "@/lib/server/levelyst/workspace-patch-service"
import { planProjectPromptReview } from "@/lib/server/levelyst/prompt-review-service"

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
    const project = await repository.createProject({
      name: "Timeline Cleanup",
      runtime_target: "web_2d",
    })
    const blueprint = await planPrompt("Create a 2D platformer with coins and checkpoints")
    await repository.updateProject(project.id, {
      blueprint_json: blueprint,
      workspace_json: {
        ...project.workspace_json,
        prompt: "Create a 2D platformer with coins and checkpoints",
      },
    })

    const generated = (await generatePrototypeForProject(repository, project.id)).project
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

    await repository.updateProject(project.id, {
      workspace_json: workspaceWithAttachment,
    })

    const patched = await patchProjectSpec(repository, project.id, [
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
    const project = await repository.createProject({
      name: "Layout Patch",
      runtime_target: "web_2d",
    })
    const blueprint = await planPrompt("Create a 2D platformer with coins and checkpoints")
    await repository.updateProject(project.id, {
      blueprint_json: blueprint,
      workspace_json: {
        ...project.workspace_json,
        prompt: "Create a 2D platformer with coins and checkpoints",
      },
    })

    const generated = (await generatePrototypeForProject(repository, project.id)).project
    const originalSpec = generated.prototype_spec

    const patched = await patchProjectSpec(repository, project.id, [
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

  it("adds a projectile combat module and enemy entity without rebuilding the whole project", async () => {
    const repository = createLevelystRepository(path.join(dbDir, "combat-patch.sqlite"))
    const project = await repository.createProject({
      name: "Combat Patch",
      runtime_target: "web_2d",
    })
    const blueprint = await planPrompt("Create a 2D platformer with coins")
    await repository.updateProject(project.id, {
      blueprint_json: blueprint,
      workspace_json: {
        ...project.workspace_json,
        prompt: "Create a 2D platformer with coins",
      },
    })

    const generated = (await generatePrototypeForProject(repository, project.id)).project
    const playerPosition = generated.module_graph?.nodes.find((node) => node.module_id === "player/platformer_controller")?.position

    const patched = await patchProjectSpec(repository, project.id, [
      {
        op: "add_module",
        entity_id: "player_1",
        module: "combat/side_scroller_projectile_weapon",
        changes: {},
      },
      {
        op: "add_entity",
        entity: {
          id: "enemy_1",
          kind: "enemy",
          modules: ["enemy/basic_enemy"],
          module_configs: {},
        },
      },
    ])

    const player = patched.prototype_spec?.entities.find((entity) => entity.id === "player_1")
    const enemy = patched.prototype_spec?.entities.find((entity) => entity.id === "enemy_1")
    const movedPlayerNode = patched.module_graph?.nodes.find((node) => node.module_id === "player/platformer_controller")

    expect(player?.modules).toContain("combat/side_scroller_projectile_weapon")
    expect(enemy?.modules).toEqual(["physics/gravity", "enemy/basic_enemy"])
    expect(patched.blueprint_json?.required_modules).toContain("combat/side_scroller_projectile_weapon")
    expect(patched.blueprint_json?.required_modules).toContain("enemy/basic_enemy")
    expect(movedPlayerNode?.position).toEqual(playerPosition)
  })

  it("applies replace-mode planned prompt patches to the first compiled spec", async () => {
    const repository = createLevelystRepository(path.join(dbDir, "replace-prompt-patch.sqlite"))
    const project = await repository.createProject({
      name: "Initial Appearance",
      runtime_target: "web_2d",
    })
    const prompt = "create a 2d platformer with enemies and make the character black"
    const review = await planProjectPromptReview(prompt)

    await repository.updateProject(project.id, {
      workspace_json: {
        ...project.workspace_json,
        prompt,
        pending_blueprint: review.blueprintPlan,
        pending_blueprint_diagnostics: review.diagnostics,
        pending_prompt_mode: review.mode,
        blueprint_state: "review",
      },
    })

    const generated = (await generatePrototypeForProject(repository, project.id)).project
    const player = generated.prototype_spec?.entities.find((entity) => entity.id === "player_1")

    expect(generated.blueprint_json?.required_modules).toContain("enemy/basic_enemy")
    expect(player?.module_configs["player/platformer_controller"]?.body_color).toBe("#111827")
  })
})
