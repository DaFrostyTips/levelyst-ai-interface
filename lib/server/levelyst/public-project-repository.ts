import {
  editorWorkspaceSnapshotSchema,
  generationJobEventSchema,
  generationJobSchema,
  projectDetailSchema,
  projectSummarySchema,
  type GenerationJob,
  type GenerationJobEvent,
  type ProjectDetail,
  type ProjectSummary,
} from "@levelyst/contracts"
import {
  createDefaultWorkspaceSnapshot,
  createId,
  createProjectSkeleton,
  deriveGenreFromRuntime,
  resolveProjectPreviewThumbnail,
  summarizeModuleGraph,
} from "./defaults"
import { ensurePublicSchema, getPublicDatabase } from "./public-database"
import type { CreateProjectInput, LevelystRepository, UpdateProjectInput } from "./project-repository"

type RawRecord = Record<string, unknown>

export class PostgresProjectRepository implements LevelystRepository {
  constructor(private readonly ownerSessionId: string) {}

  async listProjectSummaries(): Promise<ProjectSummary[]> {
    await ensurePublicSchema()

    const sql = getPublicDatabase()
    const rows = (await sql`
      SELECT id, name, genre, runtime_target, preview_thumbnail, module_count, systems_summary_json, simulation_ready, created_at, updated_at
      FROM projects
      WHERE owner_session_id = ${this.ownerSessionId}
      ORDER BY updated_at DESC
    `) as RawRecord[]

    return rows.map((row) => this.toProjectSummary(row))
  }

  async listProjectDetails(): Promise<ProjectDetail[]> {
    await ensurePublicSchema()

    const sql = getPublicDatabase()
    const rows = (await sql`
      SELECT *
      FROM projects
      WHERE owner_session_id = ${this.ownerSessionId}
      ORDER BY updated_at DESC
    `) as RawRecord[]

    return Promise.all(rows.map((row) => this.toProjectDetail(row)))
  }

  async getProjectDetail(projectId: string): Promise<ProjectDetail | null> {
    await ensurePublicSchema()

    const sql = getPublicDatabase()
    const rows = (await sql`
      SELECT *
      FROM projects
      WHERE id = ${projectId} AND owner_session_id = ${this.ownerSessionId}
      LIMIT 1
    `) as RawRecord[]

    const row = rows[0]
    return row ? this.toProjectDetail(row) : null
  }

  async deleteProject(projectId: string): Promise<ProjectDetail> {
    const current = await this.getProjectDetail(projectId)
    if (!current) {
      throw new Error(`Project "${projectId}" was not found.`)
    }

    const sql = getPublicDatabase()
    await sql`
      DELETE FROM projects
      WHERE id = ${projectId} AND owner_session_id = ${this.ownerSessionId}
    `

    return current
  }

  async createProject(input: CreateProjectInput = {}): Promise<ProjectDetail> {
    if (input.duplicate_from) {
      const source = await this.getProjectDetail(input.duplicate_from)
      if (!source) {
        throw new Error(`Cannot duplicate unknown project "${input.duplicate_from}".`)
      }

      const duplicate = createProjectSkeleton({
        name: input.name ?? `${source.name} Copy`,
        genre: source.genre,
        runtime_target: source.runtime_target,
        preview_thumbnail:
          input.preview_thumbnail ??
          resolveProjectPreviewThumbnail({
            name: input.name ?? `${source.name} Copy`,
            genre: source.genre,
            runtime_target: source.runtime_target,
            current: source.preview_thumbnail,
          }),
        blueprint_json: source.blueprint_json,
        prototype_spec: source.prototype_spec,
        module_graph: source.module_graph,
        workspace_json: source.workspace_json,
      })

      await this.insertProject(duplicate)
      return duplicate
    }

    const runtimeTarget = input.runtime_target ?? "web_2d"
    const project = createProjectSkeleton({
      name: input.name ?? "New Project",
      genre: input.genre ?? deriveGenreFromRuntime(runtimeTarget),
      runtime_target: runtimeTarget,
      preview_thumbnail:
        input.preview_thumbnail ??
        resolveProjectPreviewThumbnail({
          name: input.name ?? "New Project",
          genre: input.genre ?? deriveGenreFromRuntime(runtimeTarget),
          runtime_target: runtimeTarget,
        }),
      workspace_json: createDefaultWorkspaceSnapshot(),
    })

    await this.insertProject(project)
    return project
  }

  async updateProject(projectId: string, input: UpdateProjectInput): Promise<ProjectDetail> {
    const current = await this.getProjectDetail(projectId)
    if (!current) {
      throw new Error(`Project "${projectId}" was not found.`)
    }

    const updatedAt = new Date().toISOString()
    const next: ProjectDetail = projectDetailSchema.parse({
      ...current,
      name: input.name ?? current.name,
      genre: input.genre ?? current.genre,
      runtime_target: input.runtime_target ?? current.runtime_target,
      preview_thumbnail:
        input.preview_thumbnail ??
        resolveProjectPreviewThumbnail({
          name: input.name ?? current.name,
          genre: input.genre ?? current.genre,
          runtime_target: input.runtime_target ?? current.runtime_target,
          current: current.preview_thumbnail,
        }),
      blueprint_json: input.blueprint_json !== undefined ? input.blueprint_json : current.blueprint_json,
      prototype_spec: input.prototype_spec !== undefined ? input.prototype_spec : current.prototype_spec,
      module_graph: input.module_graph !== undefined ? input.module_graph : current.module_graph,
      workspace_json: input.workspace_json !== undefined ? input.workspace_json : current.workspace_json,
      latest_job: input.latest_job !== undefined ? input.latest_job : current.latest_job,
      module_count: (input.module_graph !== undefined ? input.module_graph : current.module_graph)?.nodes.length ?? 0,
      systems_summary: summarizeModuleGraph(input.module_graph !== undefined ? input.module_graph ?? null : current.module_graph),
      simulation_ready: Boolean(input.prototype_spec !== undefined ? input.prototype_spec : current.prototype_spec),
      updated_at: updatedAt,
    })

    const sql = getPublicDatabase()
    await sql`
      UPDATE projects
      SET
        name = ${next.name},
        genre = ${next.genre},
        runtime_target = ${next.runtime_target},
        preview_thumbnail = ${next.preview_thumbnail},
        module_count = ${next.module_count},
        systems_summary_json = ${JSON.stringify(next.systems_summary)}::jsonb,
        simulation_ready = ${next.simulation_ready},
        blueprint_json = ${stringifyNullableJson(next.blueprint_json)}::jsonb,
        prototype_spec_json = ${stringifyNullableJson(next.prototype_spec)}::jsonb,
        module_graph_json = ${stringifyNullableJson(next.module_graph)}::jsonb,
        workspace_json = ${JSON.stringify(next.workspace_json)}::jsonb,
        updated_at = ${next.updated_at}
      WHERE id = ${projectId} AND owner_session_id = ${this.ownerSessionId}
    `

    return next
  }

  async createJob(projectId: string, kind: GenerationJob["kind"] = "prototype_generation"): Promise<GenerationJob> {
    const project = await this.getProjectDetail(projectId)
    if (!project) {
      throw new Error(`Project "${projectId}" was not found.`)
    }

    const timestamp = new Date().toISOString()
    const job = generationJobSchema.parse({
      id: createId("job"),
      project_id: projectId,
      kind,
      status: "pending",
      error_message: null,
      created_at: timestamp,
      updated_at: timestamp,
    })

    const sql = getPublicDatabase()
    await sql`
      INSERT INTO jobs (id, project_id, kind, status, error_message, created_at, updated_at)
      VALUES (${job.id}, ${job.project_id}, ${job.kind}, ${job.status}, ${job.error_message}, ${job.created_at}, ${job.updated_at})
    `

    return job
  }

  async updateJob(jobId: string, patch: Partial<Pick<GenerationJob, "status" | "error_message">>): Promise<GenerationJob> {
    const current = await this.getJob(jobId)
    if (!current) {
      throw new Error(`Job "${jobId}" was not found.`)
    }

    const next = generationJobSchema.parse({
      ...current,
      ...patch,
      error_message: patch.error_message !== undefined ? patch.error_message : current.error_message,
      updated_at: new Date().toISOString(),
    })

    const sql = getPublicDatabase()
    await sql`
      UPDATE jobs
      SET status = ${next.status}, error_message = ${next.error_message}, updated_at = ${next.updated_at}
      WHERE id = ${jobId}
    `

    return next
  }

  async getJob(jobId: string): Promise<GenerationJob | null> {
    await ensurePublicSchema()

    const sql = getPublicDatabase()
    const rows = (await sql`
      SELECT j.*
      FROM jobs j
      INNER JOIN projects p ON p.id = j.project_id
      WHERE j.id = ${jobId} AND p.owner_session_id = ${this.ownerSessionId}
      LIMIT 1
    `) as RawRecord[]

    const row = rows[0]
    return row ? toGenerationJob(row) : null
  }

  async listJobEvents(jobId: string): Promise<GenerationJobEvent[]> {
    await ensurePublicSchema()

    const sql = getPublicDatabase()
    const rows = (await sql`
      SELECT je.job_id, je.sequence, je.event_type, je.payload_json, je.delay_ms
      FROM job_events je
      INNER JOIN jobs j ON j.id = je.job_id
      INNER JOIN projects p ON p.id = j.project_id
      WHERE je.job_id = ${jobId} AND p.owner_session_id = ${this.ownerSessionId}
      ORDER BY je.sequence ASC, je.id ASC
    `) as RawRecord[]

    return rows.map((row) =>
      generationJobEventSchema.parse({
        job_id: String(row.job_id),
        sequence: Number(row.sequence),
        event_type: row.event_type,
        payload_json: parseJsonColumn(row.payload_json, {}),
        delay_ms: Number(row.delay_ms),
      }),
    )
  }

  async replaceJobEvents(jobId: string, events: GenerationJobEvent[]): Promise<void> {
    const job = await this.getJob(jobId)
    if (!job) {
      throw new Error(`Job "${jobId}" was not found.`)
    }

    const sql = getPublicDatabase()
    await sql.transaction([
      sql`DELETE FROM job_events WHERE job_id = ${jobId}`,
      ...events.map((event) => {
        const parsed = generationJobEventSchema.parse(event)
        return sql`
          INSERT INTO job_events (job_id, sequence, event_type, payload_json, delay_ms)
          VALUES (${parsed.job_id}, ${parsed.sequence}, ${parsed.event_type}, ${JSON.stringify(parsed.payload_json)}::jsonb, ${parsed.delay_ms})
        `
      }),
    ])
  }

  private async insertProject(project: ProjectDetail) {
    await ensurePublicSchema()

    const sql = getPublicDatabase()
    await sql`
      INSERT INTO projects (
        id,
        owner_session_id,
        name,
        genre,
        runtime_target,
        preview_thumbnail,
        module_count,
        systems_summary_json,
        simulation_ready,
        blueprint_json,
        prototype_spec_json,
        module_graph_json,
        workspace_json,
        created_at,
        updated_at
      )
      VALUES (
        ${project.id},
        ${this.ownerSessionId},
        ${project.name},
        ${project.genre},
        ${project.runtime_target},
        ${project.preview_thumbnail},
        ${project.module_count},
        ${JSON.stringify(project.systems_summary)}::jsonb,
        ${project.simulation_ready},
        ${stringifyNullableJson(project.blueprint_json)}::jsonb,
        ${stringifyNullableJson(project.prototype_spec)}::jsonb,
        ${stringifyNullableJson(project.module_graph)}::jsonb,
        ${JSON.stringify(project.workspace_json)}::jsonb,
        ${project.created_at},
        ${project.updated_at}
      )
    `
  }

  private async toProjectDetail(row: RawRecord): Promise<ProjectDetail> {
    return projectDetailSchema.parse({
      ...this.toProjectSummary(row),
      blueprint_json: parseNullableJsonColumn(row.blueprint_json),
      prototype_spec: parseNullableJsonColumn(row.prototype_spec_json),
      module_graph: parseNullableJsonColumn(row.module_graph_json),
      workspace_json: editorWorkspaceSnapshotSchema.parse(
        parseJsonColumn(row.workspace_json, createDefaultWorkspaceSnapshot()),
      ),
      latest_job: await this.getLatestJob(String(row.id)),
    })
  }

  private toProjectSummary(row: RawRecord): ProjectSummary {
    return projectSummarySchema.parse({
      id: String(row.id),
      name: String(row.name),
      genre: row.genre,
      runtime_target: row.runtime_target,
      preview_thumbnail: resolveProjectPreviewThumbnail({
        name: String(row.name),
        genre: String(row.genre),
        runtime_target: String(row.runtime_target),
        current: String(row.preview_thumbnail),
      }),
      module_count: Number(row.module_count ?? 0),
      systems_summary: parseJsonColumn(row.systems_summary_json, []),
      simulation_ready: Boolean(row.simulation_ready),
      created_at: String(row.created_at),
      updated_at: String(row.updated_at),
    })
  }

  private async getLatestJob(projectId: string) {
    const sql = getPublicDatabase()
    const rows = (await sql`
      SELECT j.*
      FROM jobs j
      INNER JOIN projects p ON p.id = j.project_id
      WHERE j.project_id = ${projectId} AND p.owner_session_id = ${this.ownerSessionId}
      ORDER BY j.updated_at DESC
      LIMIT 1
    `) as RawRecord[]

    const row = rows[0]
    return row ? toGenerationJob(row) : null
  }
}

function stringifyNullableJson(value: unknown) {
  return value === null || value === undefined ? null : JSON.stringify(value)
}

function parseJsonColumn<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) return fallback
  if (typeof value === "string") return JSON.parse(value) as T
  return value as T
}

function parseNullableJsonColumn<T>(value: unknown): T | null {
  if (value === null || value === undefined) return null
  if (typeof value === "string") return JSON.parse(value) as T
  return value as T
}

function toGenerationJob(row: RawRecord): GenerationJob {
  return generationJobSchema.parse({
    id: String(row.id),
    project_id: String(row.project_id),
    kind: row.kind,
    status: row.status,
    error_message: row.error_message === null ? null : String(row.error_message),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  })
}
