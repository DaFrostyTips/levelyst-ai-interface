import type {
  BlueprintPlan,
  EditorWorkspaceSnapshot,
  Genre,
  ModuleGraph,
  ProjectDetail,
  RuntimeTarget,
} from "@levelyst/contracts"

export function createDefaultWorkspaceSnapshot(): EditorWorkspaceSnapshot {
  return {
    nodes: [],
    groups: [],
    timeline_sections: [
      { id: "intro", title: "Intro", order: 0, expanded: true, module_ids: [] },
      { id: "gameplay_loop", title: "Gameplay Loop", order: 1, expanded: true, module_ids: [] },
      { id: "end", title: "End", order: 2, expanded: true, module_ids: [] },
    ],
    prompt: "",
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
  }
}

export function createProjectSkeleton(input?: {
  id?: string
  name?: string
  genre?: Genre
  runtime_target?: RuntimeTarget
  preview_thumbnail?: string
  blueprint_json?: BlueprintPlan | null
  prototype_spec?: ProjectDetail["prototype_spec"]
  module_graph?: ModuleGraph | null
  workspace_json?: EditorWorkspaceSnapshot
}): ProjectDetail {
  const timestamp = new Date().toISOString()
  return {
    id: input?.id ?? createId("project"),
    name: input?.name ?? "New Project",
    genre: input?.genre ?? "platformer",
    runtime_target: input?.runtime_target ?? "web_2d",
    preview_thumbnail:
      input?.preview_thumbnail ??
      resolveProjectPreviewThumbnail({
        name: input?.name ?? "New Project",
        genre: input?.genre ?? "platformer",
        runtime_target: input?.runtime_target ?? "web_2d",
      }),
    module_count: input?.module_graph?.nodes.length ?? 0,
    systems_summary: summarizeModuleGraph(input?.module_graph ?? null),
    simulation_ready: Boolean(input?.prototype_spec),
    created_at: timestamp,
    updated_at: timestamp,
    blueprint_json: input?.blueprint_json ?? null,
    prototype_spec: input?.prototype_spec ?? null,
    module_graph: input?.module_graph ?? null,
    workspace_json: input?.workspace_json ?? createDefaultWorkspaceSnapshot(),
    latest_job: null,
  }
}

export function summarizeModuleGraph(moduleGraph: ModuleGraph | null) {
  if (!moduleGraph || moduleGraph.nodes.length === 0) return []
  return moduleGraph.nodes.slice(0, 5).map((node) => humanizeModuleId(node.module_id))
}

export function buildPreviewThumbnail(name: string) {
  return resolveProjectPreviewThumbnail({ name })
}

export function resolveProjectPreviewThumbnail(input: {
  name: string
  genre?: Genre | string
  runtime_target?: RuntimeTarget | string
  current?: string | null
}) {
  if (input.current && !isPlaceholderPreview(input.current)) {
    return input.current
  }

  const token = `${input.name} ${input.genre ?? ""} ${input.runtime_target ?? ""}`.toLowerCase()

  if (token.includes("forest") || token.includes("temple")) {
    return "/previews/projects/forest-temple.svg"
  }
  if (token.includes("desert") || token.includes("ruins")) {
    return "/previews/projects/desert-ruins.svg"
  }
  if (token.includes("skyline") || token.includes("fps") || token.includes("wave") || token.includes("survival")) {
    return "/previews/projects/skyline-raid.svg"
  }
  if (token.includes("sci") || token.includes("orbital") || token.includes("space")) {
    return "/previews/projects/scifi-prototype.svg"
  }
  if (token.includes("action")) {
    return "/previews/projects/action-prototype.svg"
  }
  return "/previews/projects/platformer-prototype.svg"
}

export function isPlaceholderPreview(value: string | null | undefined) {
  if (!value) return true
  return value.startsWith("/placeholder.svg") || value.startsWith("data:image/svg+xml")
}

export function deriveGenreFromRuntime(runtimeTarget: RuntimeTarget): Genre {
  return runtimeTarget === "web_3d" ? "fps_wave_survival" : "platformer"
}

export function humanizeModuleId(moduleId: string) {
  const token = moduleId
    .split("/")
    .pop()
    ?.replace(/[_-]+/g, " ")
    .trim()

  if (!token) return moduleId
  return token.replace(/\b\w/g, (character) => character.toUpperCase())
}

export function createId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}
