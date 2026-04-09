import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { createLevelystRepository } from "@/lib/server/levelyst/project-repository"

const temporaryPaths: string[] = []

afterEach(() => {
  while (temporaryPaths.length > 0) {
    const target = temporaryPaths.pop()
    if (!target) continue
    fs.rmSync(path.dirname(target), { recursive: true, force: true })
  }
})

function createRepository() {
  const dbPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "levelyst-repo-")), "levelyst.sqlite")
  temporaryPaths.push(dbPath)
  return createLevelystRepository(dbPath)
}

describe("SqliteProjectRepository", () => {
  it("seeds default projects and returns summaries", async () => {
    const repository = createRepository()
    const summaries = await repository.listProjectSummaries()

    expect(summaries.length).toBeGreaterThanOrEqual(3)
    expect(summaries[0]?.id).toBeTruthy()
  })

  it("creates and updates projects with persisted canonical JSON blobs", async () => {
    const repository = createRepository()
    const created = await repository.createProject({
      name: "Backend Project",
      runtime_target: "web_2d",
    })

    const updated = await repository.updateProject(created.id, {
      blueprint_json: {
        game_type: "2d_platformer",
        core_systems: ["player/platformer_controller", "camera/side_scroll"],
        gameplay_systems: ["enemy/basic_enemy", "systems/checkpoint", "systems/coin_collectible"],
        required_modules: [
          "player/platformer_controller",
          "camera/side_scroll",
          "enemy/basic_enemy",
          "systems/checkpoint",
          "systems/coin_collectible",
        ],
        environment: "graybox_rooftops",
        level_structure: ["intro", "gameplay_loop", "end"],
        constraints: {
          target_runtime: "web_2d",
        },
      },
    })

    expect(updated.blueprint_json?.game_type).toBe("2d_platformer")
    expect((await repository.getProjectDetail(created.id))?.blueprint_json?.required_modules).toHaveLength(5)
  })

  it("creates jobs and persists ordered events", async () => {
    const repository = createRepository()
    const project = await repository.createProject({ name: "Job Project" })
    const job = await repository.createJob(project.id)

    await repository.replaceJobEvents(job.id, [
      {
        job_id: job.id,
        sequence: 0,
        event_type: "job_started",
        payload_json: {
          project_id: project.id,
        },
        delay_ms: 0,
      },
      {
        job_id: job.id,
        sequence: 1,
        event_type: "job_completed",
        payload_json: {
          project_id: project.id,
        },
        delay_ms: 50,
      },
    ])

    const events = await repository.listJobEvents(job.id)
    expect(events.map((event) => event.event_type)).toEqual(["job_started", "job_completed"])
  })

  it("deletes projects and cascades associated jobs", async () => {
    const repository = createRepository()
    const project = await repository.createProject({ name: "Delete Target" })
    const job = await repository.createJob(project.id)

    await repository.deleteProject(project.id)

    expect(await repository.getProjectDetail(project.id)).toBeNull()
    expect(await repository.getJob(job.id)).toBeNull()
  })
})
