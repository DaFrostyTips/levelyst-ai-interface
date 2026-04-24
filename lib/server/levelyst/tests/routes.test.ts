import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

describe("Phase 4 route handlers", () => {
  let dbDir = ""

  beforeEach(() => {
    dbDir = fs.mkdtempSync(path.join(os.tmpdir(), "levelyst-routes-"))
    process.env.LEVELYST_DB_PATH = path.join(dbDir, "levelyst.sqlite")
    process.env.LEVELYST_PLANNER_PROVIDER = "rule_based"
  })

  afterEach(() => {
    delete process.env.LEVELYST_DB_PATH
    delete process.env.LEVELYST_DEPLOY_MODE
    delete process.env.LEVELYST_PLANNER_PROVIDER
    delete process.env.LEVELYST_LOCAL_AI_MODE
    delete process.env.LEVELYST_LOCAL_AI_MODEL
    delete process.env.LEVELYST_LOCAL_AI_TIMEOUT_MS
    delete process.env.OPENAI_API_KEY
    fs.rmSync(dbDir, { recursive: true, force: true })
    vi.doUnmock("@/lib/server/levelyst/project-repository")
    vi.doUnmock("@/lib/server/levelyst/public-rate-limit")
    vi.resetModules()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it("scopes public project listings by anonymous session cookie", async () => {
    process.env.LEVELYST_DEPLOY_MODE = "public"
    vi.resetModules()

    vi.doMock("@/lib/server/levelyst/project-repository", () => ({
      getLevelystRepository: async (context: { ownerSessionId: string }) => ({
        listProjectSummaries: async () =>
          context.ownerSessionId === "sessionalpha123456"
            ? [{ id: "alpha-project", name: "Alpha Project" }]
            : [{ id: "beta-project", name: "Beta Project" }],
      }),
    }))

    const projectsRoute = await import("@/app/api/projects/route")

    const alphaResponse = await projectsRoute.GET(
      new Request("http://localhost/api/projects", {
        headers: {
          cookie: "levelyst_session=sessionalpha123456",
        },
      }),
    )
    const betaResponse = await projectsRoute.GET(
      new Request("http://localhost/api/projects", {
        headers: {
          cookie: "levelyst_session=sessionbeta1234567",
        },
      }),
    )

    const alphaPayload = await alphaResponse.json()
    const betaPayload = await betaResponse.json()

    expect(alphaPayload.projects).toEqual([{ id: "alpha-project", name: "Alpha Project" }])
    expect(betaPayload.projects).toEqual([{ id: "beta-project", name: "Beta Project" }])
  })

  it("returns 429 in public mode when prompt planning is rate-limited", async () => {
    process.env.LEVELYST_DEPLOY_MODE = "public"
    vi.resetModules()

    vi.doMock("@/lib/server/levelyst/public-rate-limit", () => ({
      checkPublicPromptRateLimit: async () => ({
        ok: false,
        retryAfterSeconds: 42,
        sessionRemaining: 0,
        ipRemaining: 0,
      }),
    }))

    vi.doMock("@/lib/server/levelyst/project-repository", () => ({
      getLevelystRepository: async () => ({
        getProjectDetail: async () => null,
      }),
    }))

    const promptRoute = await import("@/app/api/projects/[id]/prompt/route")
    const response = await promptRoute.POST(
      new Request("http://localhost/api/projects/project_1/prompt", {
        method: "POST",
        headers: {
          cookie: "levelyst_session=sessionalpha123456",
        },
        body: JSON.stringify({
          prompt: "Create a 2D platformer with coins and checkpoints",
        }),
      }),
      { params: Promise.resolve({ id: "project_1" }) },
    )

    const payload = await response.json()
    expect(response.status).toBe(429)
    expect(payload.code).toBe("rate_limited")
    expect(payload.retry_after_seconds).toBe(42)
  })

  it("supports prompt -> blueprint -> generate -> spec retrieval through route handlers", async () => {
    const projectsRoute = await import("@/app/api/projects/route")
    const projectRoute = await import("@/app/api/projects/[id]/route")
    const promptRoute = await import("@/app/api/projects/[id]/prompt/route")
    const generateRoute = await import("@/app/api/projects/[id]/generate/route")
    const specRoute = await import("@/app/api/projects/[id]/spec/route")
    const jobRoute = await import("@/app/api/jobs/[id]/route")
    const jobEventsRoute = await import("@/app/api/jobs/[id]/events/route")

    const createResponse = await projectsRoute.POST(
      new Request("http://localhost/api/projects", {
        method: "POST",
        body: JSON.stringify({
          name: "Prompt Project",
          runtime_target: "web_2d",
        }),
      }),
    )
    const createPayload = await createResponse.json()
    const projectId = createPayload.project.id as string

    const promptResponse = await promptRoute.POST(
      new Request(`http://localhost/api/projects/${projectId}/prompt`, {
        method: "POST",
        body: JSON.stringify({
          prompt: "Create a 2D platformer with coins and checkpoints",
        }),
      }),
      { params: Promise.resolve({ id: projectId }) },
    )
    const promptPayload = await promptResponse.json()
    expect(promptPayload.project.blueprint_json).toBeNull()
    expect(promptPayload.project.workspace_json.pending_blueprint.game_type).toBe("2d_platformer")
    expect(promptPayload.project.workspace_json.pending_blueprint_diagnostics.selected_bundle).toBe("2d_platformer")
    expect(promptPayload.project.workspace_json.pending_prompt_mode).toBe("replace")
    expect(promptPayload.project.workspace_json.blueprint_state).toBe("review")

    const generateResponse = await generateRoute.POST(
      new Request(`http://localhost/api/projects/${projectId}/generate`, { method: "POST" }),
      { params: Promise.resolve({ id: projectId }) },
    )
    const generatePayload = await generateResponse.json()
    expect(generatePayload.status).toBe("completed")

    const detailResponse = await projectRoute.GET(new Request(`http://localhost/api/projects/${projectId}`), {
      params: Promise.resolve({ id: projectId }),
    })
    const detailPayload = await detailResponse.json()
    expect(detailPayload.project.module_graph.nodes.length).toBeGreaterThan(0)

    const specResponse = await specRoute.GET(new Request(`http://localhost/api/projects/${projectId}/spec`), {
      params: Promise.resolve({ id: projectId }),
    })
    const specPayload = await specResponse.json()
    expect(specPayload.prototype_spec.runtime).toBe("web_2d")

    const jobResponse = await jobRoute.GET(new Request(`http://localhost/api/jobs/${generatePayload.job_id}`), {
      params: Promise.resolve({ id: generatePayload.job_id }),
    })
    const jobPayload = await jobResponse.json()
    expect(jobPayload.job.status).toBe("completed")

    const eventsResponse = await jobEventsRoute.GET(
      new Request(`http://localhost/api/jobs/${generatePayload.job_id}/events`),
      { params: Promise.resolve({ id: generatePayload.job_id }) },
    )
    const streamText = await readResponseBody(eventsResponse)

    expect(streamText).toContain("event: node_added")
    expect(streamText).toContain("event: compile_completed")
    expect(streamText).toContain("event: complete")
    expect(streamText.indexOf('"module_id":"physics/gravity"')).toBeLessThan(streamText.indexOf('"module_id":"player/platformer_controller"'))
    expect(streamText.indexOf('"module_id":"player/platformer_controller"')).toBeLessThan(
      streamText.indexOf('"module_id":"camera/side_scroll"'),
    )
  })

  it("persists workspace changes and applies spec patches through route handlers", async () => {
    const projectsRoute = await import("@/app/api/projects/route")
    const promptRoute = await import("@/app/api/projects/[id]/prompt/route")
    const generateRoute = await import("@/app/api/projects/[id]/generate/route")
    const workspaceRoute = await import("@/app/api/projects/[id]/workspace/route")
    const specRoute = await import("@/app/api/projects/[id]/spec/route")

    const createResponse = await projectsRoute.POST(
      new Request("http://localhost/api/projects", {
        method: "POST",
        body: JSON.stringify({
          name: "Patch Project",
          runtime_target: "web_2d",
        }),
      }),
    )
    const createPayload = await createResponse.json()
    const projectId = createPayload.project.id as string

    await promptRoute.POST(
      new Request(`http://localhost/api/projects/${projectId}/prompt`, {
        method: "POST",
        body: JSON.stringify({
          prompt: "Create a 2D platformer with coins and checkpoints",
        }),
      }),
      { params: Promise.resolve({ id: projectId }) },
    )

    await generateRoute.POST(
      new Request(`http://localhost/api/projects/${projectId}/generate`, { method: "POST" }),
      { params: Promise.resolve({ id: projectId }) },
    )

    const workspaceResponse = await workspaceRoute.PATCH(
      new Request(`http://localhost/api/projects/${projectId}/workspace`, {
        method: "PATCH",
        body: JSON.stringify({
          workspace_json: {
            nodes: [
              {
                id: "node_player_platformer_controller",
                module_id: "player/platformer_controller",
                x: 444,
                y: 333,
                active: true,
              },
            ],
            groups: [],
            timeline_sections: [
              {
                id: "intro",
                title: "Intro",
                order: 0,
                expanded: true,
                module_ids: [],
              },
            ],
            prompt: "Create a 2D platformer with coins and checkpoints",
            game_plan: [],
            planning_steps: [],
            canvas_viewport: {
              x: 10,
              y: 20,
              scale: 1,
              is_panning: false,
            },
            pending_blueprint: null,
            pending_prompt_mode: null,
            blueprint_state: "idle",
          },
        }),
      }),
      { params: Promise.resolve({ id: projectId }) },
    )
    const workspacePayload = await workspaceResponse.json()
    expect(workspacePayload.project.workspace_json.canvas_viewport.x).toBe(10)

    const patchedSpecResponse = await specRoute.PATCH(
      new Request(`http://localhost/api/projects/${projectId}/spec`, {
        method: "PATCH",
        body: JSON.stringify({
          operations: [
            {
              op: "reorder_level_structure",
              level_structure: ["gameplay_loop", "intro", "end"],
            },
          ],
        }),
      }),
      { params: Promise.resolve({ id: projectId }) },
    )
    const patchedSpecPayload = await patchedSpecResponse.json()
    expect(patchedSpecPayload.project.prototype_spec.scene.level_structure).toEqual(["gameplay_loop", "intro", "end"])
  })

  it("returns 503 when the OpenAI planner is selected without an API key", async () => {
    process.env.LEVELYST_PLANNER_PROVIDER = "openai"

    const projectsRoute = await import("@/app/api/projects/route")
    const promptRoute = await import("@/app/api/projects/[id]/prompt/route")

    const createResponse = await projectsRoute.POST(
      new Request("http://localhost/api/projects", {
        method: "POST",
        body: JSON.stringify({
          name: "Planner Config",
          runtime_target: "web_2d",
        }),
      }),
    )
    const createPayload = await createResponse.json()
    const projectId = createPayload.project.id as string

    const promptResponse = await promptRoute.POST(
      new Request(`http://localhost/api/projects/${projectId}/prompt`, {
        method: "POST",
        body: JSON.stringify({
          prompt: "Create a 2D platformer with coins and checkpoints",
        }),
      }),
      { params: Promise.resolve({ id: projectId }) },
    )

    const promptPayload = await promptResponse.json()
    expect(promptResponse.status).toBe(503)
    expect(promptPayload.error).toContain("OPENAI_API_KEY")
  })

  it("still uses rule-based planning in public mode even when OPENAI is requested", async () => {
    process.env.LEVELYST_DEPLOY_MODE = "public"
    process.env.LEVELYST_PLANNER_PROVIDER = "openai"
    vi.resetModules()

    const projectStore = new Map<string, {
      id: string
      name: string
      runtime_target: "web_2d"
      blueprint_json: null
      workspace_json: {
        prompt: string
        pending_blueprint: null
        pending_blueprint_diagnostics: null
        pending_prompt_mode: null
        blueprint_state: "idle"
      }
    }>()

    vi.doMock("@/lib/server/levelyst/project-repository", () => ({
      getLevelystRepository: async () => ({
        createProject: async (input: { name?: string }) => {
          const project = {
            id: "public-project-1",
            name: input.name ?? "New Project",
            runtime_target: "web_2d" as const,
            blueprint_json: null,
            workspace_json: {
              prompt: "",
              pending_blueprint: null,
              pending_blueprint_diagnostics: null,
              pending_prompt_mode: null,
              blueprint_state: "idle" as const,
            },
          }
          projectStore.set(project.id, project)
          return project
        },
        getProjectDetail: async (projectId: string) => projectStore.get(projectId) ?? null,
        updateProject: async (projectId: string, patch: { name?: string; workspace_json?: unknown }) => {
          const current = projectStore.get(projectId)
          if (!current) {
            throw new Error("Project not found.")
          }
          const nextProject: typeof current = {
            ...current,
            name: patch.name ?? current.name,
            workspace_json:
              (patch.workspace_json as typeof current.workspace_json | undefined) ?? current.workspace_json,
          }
          projectStore.set(projectId, nextProject)
          return nextProject
        },
      }),
    }))

    const projectsRoute = await import("@/app/api/projects/route")
    const promptRoute = await import("@/app/api/projects/[id]/prompt/route")
    const sessionCookie = "levelyst_session=publicsession123456"

    const createResponse = await projectsRoute.POST(
      new Request("http://localhost/api/projects", {
        method: "POST",
        headers: {
          cookie: sessionCookie,
        },
        body: JSON.stringify({
          name: "Public Rule Planner",
          runtime_target: "web_2d",
        }),
      }),
    )
    const createPayload = await createResponse.json()
    const projectId = createPayload.project.id as string

    const promptResponse = await promptRoute.POST(
      new Request(`http://localhost/api/projects/${projectId}/prompt`, {
        method: "POST",
        headers: {
          cookie: sessionCookie,
        },
        body: JSON.stringify({
          prompt: "Create a 2D platformer with coins and checkpoints",
        }),
      }),
      { params: Promise.resolve({ id: projectId }) },
    )

    const promptPayload = await promptResponse.json()
    expect(promptResponse.status).toBe(200)
    expect(promptPayload.project.workspace_json.pending_blueprint.game_type).toBe("2d_platformer")
  })

  it("still returns a prompt review when the local wording layer is enabled but Ollama is offline", async () => {
    process.env.LEVELYST_LOCAL_AI_MODE = "copy_only"
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("connect ECONNREFUSED 127.0.0.1:11434")),
    )

    const projectsRoute = await import("@/app/api/projects/route")
    const promptRoute = await import("@/app/api/projects/[id]/prompt/route")

    const createResponse = await projectsRoute.POST(
      new Request("http://localhost/api/projects", {
        method: "POST",
        body: JSON.stringify({
          name: "Local AI Fallback",
          runtime_target: "web_2d",
        }),
      }),
    )
    const createPayload = await createResponse.json()
    const projectId = createPayload.project.id as string

    const promptResponse = await promptRoute.POST(
      new Request(`http://localhost/api/projects/${projectId}/prompt`, {
        method: "POST",
        body: JSON.stringify({
          prompt: "Create a 2D platformer with coins and checkpoints",
        }),
      }),
      { params: Promise.resolve({ id: projectId }) },
    )
    const promptPayload = await promptResponse.json()

    expect(promptResponse.status).toBe(200)
    expect(promptPayload.project.workspace_json.pending_blueprint.game_type).toBe("2d_platformer")
    expect(promptPayload.project.workspace_json.pending_blueprint_diagnostics.explanation.player_experience).toContain(
      "side-scrolling",
    )
  })

  it("returns 502 when the planner exhausts retries", async () => {
    const projectsRoute = await import("@/app/api/projects/route")
    const plannerService = await import("@/lib/server/levelyst/planner-service")
    const promptReviewService = await import("@/lib/server/levelyst/prompt-review-service")
    const promptRoute = await import("@/app/api/projects/[id]/prompt/route")

    vi.spyOn(promptReviewService, "planProjectPromptReview").mockRejectedValue(
      new plannerService.PlannerError("failed", "invalid_output", "Planner exhausted retries."),
    )

    const createResponse = await projectsRoute.POST(
      new Request("http://localhost/api/projects", {
        method: "POST",
        body: JSON.stringify({
          name: "Planner Failure",
          runtime_target: "web_2d",
        }),
      }),
    )
    const createPayload = await createResponse.json()
    const projectId = createPayload.project.id as string

    const promptResponse = await promptRoute.POST(
      new Request(`http://localhost/api/projects/${projectId}/prompt`, {
        method: "POST",
        body: JSON.stringify({
          prompt: "Create a 2D platformer with coins and checkpoints",
        }),
      }),
      { params: Promise.resolve({ id: projectId }) },
    )

    const promptPayload = await promptResponse.json()
    expect(promptResponse.status).toBe(502)
    expect(promptPayload.error).toBe("Planner exhausted retries.")
  })

  it("detects patch and replacement prompt reviews for existing projects", async () => {
    const projectsRoute = await import("@/app/api/projects/route")
    const promptRoute = await import("@/app/api/projects/[id]/prompt/route")
    const generateRoute = await import("@/app/api/projects/[id]/generate/route")

    const createResponse = await projectsRoute.POST(
      new Request("http://localhost/api/projects", {
        method: "POST",
        body: JSON.stringify({
          name: "Prompt Modes",
          runtime_target: "web_3d",
        }),
      }),
    )
    const createPayload = await createResponse.json()
    const projectId = createPayload.project.id as string

    await promptRoute.POST(
      new Request(`http://localhost/api/projects/${projectId}/prompt`, {
        method: "POST",
        body: JSON.stringify({
          prompt: "Create a zombie survival FPS with wave spawning",
        }),
      }),
      { params: Promise.resolve({ id: projectId }) },
    )

    await generateRoute.POST(
      new Request(`http://localhost/api/projects/${projectId}/generate`, { method: "POST" }),
      { params: Promise.resolve({ id: projectId }) },
    )

    const patchResponse = await promptRoute.POST(
      new Request(`http://localhost/api/projects/${projectId}/prompt`, {
        method: "POST",
        body: JSON.stringify({
          prompt: "Remove zombies",
        }),
      }),
      { params: Promise.resolve({ id: projectId }) },
    )
    const patchPayload = await patchResponse.json()
    expect(patchPayload.project.workspace_json.pending_prompt_mode).toBe("patch")
    expect(patchPayload.project.workspace_json.pending_blueprint.required_modules).not.toContain("ai/basic_zombie")
    expect(patchPayload.project.workspace_json.pending_blueprint.required_modules).not.toContain("systems/wave_manager")

    const replaceResponse = await promptRoute.POST(
      new Request(`http://localhost/api/projects/${projectId}/prompt`, {
        method: "POST",
        body: JSON.stringify({
          prompt: "Instead of this zombie game, make a game like Grand Theft Auto",
        }),
      }),
      { params: Promise.resolve({ id: projectId }) },
    )
    const replacePayload = await replaceResponse.json()
    expect(replacePayload.project.workspace_json.pending_prompt_mode).toBe("replace")
    expect(replacePayload.project.blueprint_json.game_type).toBe("3d_fps")
  })

  it("applies supported follow-up prompt patches to the persisted prototype spec", async () => {
    const projectsRoute = await import("@/app/api/projects/route")
    const promptRoute = await import("@/app/api/projects/[id]/prompt/route")
    const generateRoute = await import("@/app/api/projects/[id]/generate/route")
    const specRoute = await import("@/app/api/projects/[id]/spec/route")

    const createResponse = await projectsRoute.POST(
      new Request("http://localhost/api/projects", {
        method: "POST",
        body: JSON.stringify({
          name: "Follow Up Patch",
          runtime_target: "web_2d",
        }),
      }),
    )
    const createPayload = await createResponse.json()
    const projectId = createPayload.project.id as string

    await promptRoute.POST(
      new Request(`http://localhost/api/projects/${projectId}/prompt`, {
        method: "POST",
        body: JSON.stringify({
          prompt: "Create a 2D platformer with coins and checkpoints",
        }),
      }),
      { params: Promise.resolve({ id: projectId }) },
    )

    await generateRoute.POST(
      new Request(`http://localhost/api/projects/${projectId}/generate`, { method: "POST" }),
      { params: Promise.resolve({ id: projectId }) },
    )

    const followUpResponse = await promptRoute.POST(
      new Request(`http://localhost/api/projects/${projectId}/prompt`, {
        method: "POST",
        body: JSON.stringify({
          prompt: "Make the main character red",
        }),
      }),
      { params: Promise.resolve({ id: projectId }) },
    )
    const followUpPayload = await followUpResponse.json()

    expect(followUpPayload.project.workspace_json.pending_prompt_mode).toBe("patch")
    expect(followUpPayload.project.workspace_json.pending_blueprint_diagnostics.edit_category).toBe("appearance_patch")
    expect(followUpPayload.project.workspace_json.pending_blueprint_diagnostics.supported_changes).toContain(
      "Update the main character palette to red.",
    )

    await generateRoute.POST(
      new Request(`http://localhost/api/projects/${projectId}/generate`, { method: "POST" }),
      { params: Promise.resolve({ id: projectId }) },
    )

    const specResponse = await specRoute.GET(new Request(`http://localhost/api/projects/${projectId}/spec`), {
      params: Promise.resolve({ id: projectId }),
    })
    const specPayload = await specResponse.json()
    const player = specPayload.prototype_spec.entities.find((entity: { id: string }) => entity.id === "player_1")
    expect(player.module_configs["player/platformer_controller"].body_color).toBe("#ef4444")
  })

  it("deletes projects through the project route handler", async () => {
    const projectsRoute = await import("@/app/api/projects/route")
    const projectRoute = await import("@/app/api/projects/[id]/route")

    const createResponse = await projectsRoute.POST(
      new Request("http://localhost/api/projects", {
        method: "POST",
        body: JSON.stringify({
          name: "Delete Me",
        }),
      }),
    )
    const createPayload = await createResponse.json()
    const projectId = createPayload.project.id as string

    const deleteResponse = await projectRoute.DELETE(new Request(`http://localhost/api/projects/${projectId}`, { method: "DELETE" }), {
      params: Promise.resolve({ id: projectId }),
    })
    expect(deleteResponse.status).toBe(200)

    const getResponse = await projectRoute.GET(new Request(`http://localhost/api/projects/${projectId}`), {
      params: Promise.resolve({ id: projectId }),
    })
    expect(getResponse.status).toBe(404)
  })
})

async function readResponseBody(response: Response) {
  const reader = response.body?.getReader()
  if (!reader) return ""

  const decoder = new TextDecoder()
  let output = ""

  while (true) {
    const chunk = await reader.read()
    if (chunk.done) break
    output += decoder.decode(chunk.value, { stream: true })
  }

  output += decoder.decode()
  return output
}
