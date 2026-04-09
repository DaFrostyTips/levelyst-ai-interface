import {
  blueprintPlanSchema,
  editorWorkspaceSnapshotSchema,
  generationJobEventSchema,
  generationJobSchema,
  patchOperationSchema,
  projectDetailSchema,
  projectSummarySchema,
  prototypeSpecSchema,
  type BlueprintPlan,
  type EditorWorkspaceSnapshot,
  type GenerationJob,
  type GenerationJobEvent,
  type PatchOperation,
  type ProjectDetail,
  type ProjectSummary,
  type PrototypeSpec,
} from "@levelyst/contracts"

export async function listProjects() {
  const payload = await apiFetch<{ projects: ProjectSummary[] }>("/api/projects")
  return {
    projects: payload.projects.map((project) => projectSummarySchema.parse(project)),
  }
}

export async function createProject(input: {
  name?: string
  genre?: ProjectDetail["genre"]
  runtime_target?: ProjectDetail["runtime_target"]
  duplicate_from?: string
}) {
  const payload = await apiFetch<{ project: ProjectDetail }>("/api/projects", {
    method: "POST",
    body: JSON.stringify(input),
  })
  return {
    project: projectDetailSchema.parse(payload.project),
  }
}

export async function getProject(projectId: string) {
  const payload = await apiFetch<{ project: ProjectDetail }>(`/api/projects/${projectId}`)
  return {
    project: projectDetailSchema.parse(payload.project),
  }
}

export async function deleteProject(projectId: string) {
  const payload = await apiFetch<{ project: ProjectDetail }>(`/api/projects/${projectId}`, {
    method: "DELETE",
  })
  return {
    project: projectDetailSchema.parse(payload.project),
  }
}

export async function submitPrompt(
  projectId: string,
  prompt: string,
  options: {
    planning_profile?: "default" | "presentation"
  } = {},
) {
  const payload = await apiFetch<{ project: ProjectDetail }>(`/api/projects/${projectId}/prompt`, {
    method: "POST",
    body: JSON.stringify({
      prompt,
      planning_profile: options.planning_profile,
    }),
  })
  return {
    project: projectDetailSchema.parse(payload.project),
  }
}

export async function updateBlueprint(projectId: string, blueprintJson: BlueprintPlan) {
  const payload = await apiFetch<{ project: ProjectDetail }>(`/api/projects/${projectId}/blueprint`, {
    method: "PATCH",
    body: JSON.stringify({
      blueprint_json: blueprintPlanSchema.parse(blueprintJson),
    }),
  })
  return {
    project: projectDetailSchema.parse(payload.project),
  }
}

export async function generatePrototype(projectId: string) {
  return apiFetch<{ job_id: string; project_id: string; status: GenerationJob["status"] }>(`/api/projects/${projectId}/generate`, {
    method: "POST",
  })
}

export async function updateWorkspace(projectId: string, workspaceJson: EditorWorkspaceSnapshot) {
  const payload = await apiFetch<{ project: ProjectDetail }>(`/api/projects/${projectId}/workspace`, {
    method: "PATCH",
    body: JSON.stringify({
      workspace_json: editorWorkspaceSnapshotSchema.parse(workspaceJson),
    }),
  })
  return {
    project: projectDetailSchema.parse(payload.project),
  }
}

export async function getProjectSpec(projectId: string) {
  const payload = await apiFetch<{ prototype_spec: PrototypeSpec | null }>(`/api/projects/${projectId}/spec`)
  return {
    prototype_spec: payload.prototype_spec ? prototypeSpecSchema.parse(payload.prototype_spec) : null,
  }
}

export async function patchProjectSpec(projectId: string, operations: PatchOperation[]) {
  const payload = await apiFetch<{ project: ProjectDetail }>(`/api/projects/${projectId}/spec`, {
    method: "PATCH",
    body: JSON.stringify({
      operations: operations.map((operation) => patchOperationSchema.parse(operation)),
    }),
  })
  return {
    project: projectDetailSchema.parse(payload.project),
  }
}

export async function resetKioskSession() {
  const payload = await apiFetch<{ project: ProjectDetail }>("/api/kiosk/reset", {
    method: "POST",
  })
  return {
    project: projectDetailSchema.parse(payload.project),
  }
}

export async function getJob(jobId: string) {
  const payload = await apiFetch<{ job: GenerationJob }>(`/api/jobs/${jobId}`)
  return {
    job: generationJobSchema.parse(payload.job),
  }
}

export function streamGenerationEvents(
  jobId: string,
  handlers: {
    onEvent: (event: GenerationJobEvent) => void
    onComplete?: () => void
    onError?: (error: Event) => void
  },
) {
  const source = new EventSource(`/api/jobs/${jobId}/events`)
  const eventTypes = [
    "job_started",
    "node_added",
    "edge_added",
    "compile_started",
    "compile_completed",
    "job_completed",
    "job_failed",
  ] as const

  eventTypes.forEach((eventType) => {
    source.addEventListener(eventType, (event) => {
      const message = event as MessageEvent<string>
      handlers.onEvent(generationJobEventSchema.parse(JSON.parse(message.data)))
    })
  })

  source.addEventListener("complete", () => {
    handlers.onComplete?.()
    source.close()
  })

  source.onerror = (event) => {
    handlers.onError?.(event)
  }

  return source
}

async function apiFetch<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  })

  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    const retryAfter = payload?.retry_after_seconds
    const message =
      typeof payload?.error === "string"
        ? typeof retryAfter === "number"
          ? `${payload.error} Try again in ${retryAfter} seconds.`
          : payload.error
        : `Request failed with status ${response.status}.`
    throw new Error(message)
  }

  return payload as T
}
