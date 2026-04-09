import fs from "node:fs"
import path from "node:path"
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
import { getDemoProject, listDemoProjects } from "./demo-projects"
import { PostgresProjectRepository } from "./public-project-repository"
import type { LevelystRequestContext } from "./request-context"

type DatabaseSync = import("node:sqlite").DatabaseSync

export interface CreateProjectInput {
  name?: string
  runtime_target?: ProjectDetail["runtime_target"]
  genre?: ProjectDetail["genre"]
  preview_thumbnail?: string
  duplicate_from?: string
}

export interface UpdateProjectInput {
  name?: string
  genre?: ProjectDetail["genre"]
  runtime_target?: ProjectDetail["runtime_target"]
  preview_thumbnail?: string
  blueprint_json?: ProjectDetail["blueprint_json"]
  prototype_spec?: ProjectDetail["prototype_spec"]
  module_graph?: ProjectDetail["module_graph"]
  workspace_json?: ProjectDetail["workspace_json"]
  latest_job?: ProjectDetail["latest_job"]
}

export interface LevelystRepository {
  listProjectSummaries(): Promise<ProjectSummary[]>
  listProjectDetails(): Promise<ProjectDetail[]>
  getProjectDetail(projectId: string): Promise<ProjectDetail | null>
  deleteProject(projectId: string): Promise<ProjectDetail>
  createProject(input?: CreateProjectInput): Promise<ProjectDetail>
  updateProject(projectId: string, input: UpdateProjectInput): Promise<ProjectDetail>
  createJob(projectId: string, kind?: GenerationJob["kind"]): Promise<GenerationJob>
  updateJob(jobId: string, patch: Partial<Pick<GenerationJob, "status" | "error_message">>): Promise<GenerationJob>
  getJob(jobId: string): Promise<GenerationJob | null>
  listJobEvents(jobId: string): Promise<GenerationJobEvent[]>
  replaceJobEvents(jobId: string, events: GenerationJobEvent[]): Promise<void>
}

const repositoryCache = new Map<string, SqliteProjectRepository>()
let demoRepository: DemoProjectRepository | null = null

function loadDatabaseSync(): typeof import("node:sqlite").DatabaseSync {
  return (require("node:sqlite") as typeof import("node:sqlite")).DatabaseSync
}

export async function getLevelystRepository(context: LevelystRequestContext): Promise<LevelystRepository> {
  if (context.deployMode === "demo") {
    demoRepository ??= new DemoProjectRepository()
    return demoRepository
  }

  if (context.deployMode === "public") {
    return new PostgresProjectRepository(context.ownerSessionId)
  }

  const dbPath = resolveDatabasePath()
  const cached = repositoryCache.get(dbPath)
  if (cached) return cached

  const repository = new SqliteProjectRepository(dbPath)
  repositoryCache.set(dbPath, repository)
  return repository
}

export function createLevelystRepository(dbPath: string) {
  return new SqliteProjectRepository(dbPath)
}

export class SqliteProjectRepository implements LevelystRepository {
  private readonly db: DatabaseSync

  constructor(private readonly dbPath: string) {
    const DatabaseSync = loadDatabaseSync()

    fs.mkdirSync(path.dirname(dbPath), { recursive: true })
    this.db = new DatabaseSync(dbPath)
    this.db.exec("PRAGMA foreign_keys = ON;")
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        genre TEXT NOT NULL,
        runtime_target TEXT NOT NULL,
        preview_thumbnail TEXT NOT NULL,
        module_count INTEGER NOT NULL DEFAULT 0,
        systems_summary_json TEXT NOT NULL DEFAULT '[]',
        simulation_ready INTEGER NOT NULL DEFAULT 0,
        blueprint_json TEXT,
        prototype_spec_json TEXT,
        module_graph_json TEXT,
        workspace_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        status TEXT NOT NULL,
        error_message TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS job_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id TEXT NOT NULL,
        sequence INTEGER NOT NULL,
        event_type TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        delay_ms INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY(job_id) REFERENCES jobs(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_jobs_project_id ON jobs(project_id);
      CREATE INDEX IF NOT EXISTS idx_job_events_job_id ON job_events(job_id);
    `)

    this.seedDefaultProjects()
  }

  async listProjectSummaries(): Promise<ProjectSummary[]> {
    const statement = this.db.prepare(`
      SELECT id, name, genre, runtime_target, preview_thumbnail, module_count, systems_summary_json, simulation_ready, created_at, updated_at
      FROM projects
      ORDER BY updated_at DESC
    `)

    return statement.all().map((row) => toProjectSummary(row as Record<string, unknown>))
  }

  async listProjectDetails(): Promise<ProjectDetail[]> {
    const statement = this.db.prepare(`
      SELECT *
      FROM projects
      ORDER BY updated_at DESC
    `)

    const rows = statement.all() as Record<string, unknown>[]
    return Promise.all(rows.map((row) => this.toProjectDetail(row)))
  }

  async getProjectDetail(projectId: string): Promise<ProjectDetail | null> {
    const statement = this.db.prepare(`
      SELECT *
      FROM projects
      WHERE id = ?
      LIMIT 1
    `)

    const row = statement.get(projectId) as Record<string, unknown> | undefined
    return row ? this.toProjectDetail(row) : null
  }

  async deleteProject(projectId: string): Promise<ProjectDetail> {
    const current = await this.getProjectDetail(projectId)
    if (!current) {
      throw new Error(`Project "${projectId}" was not found.`)
    }

    const statement = this.db.prepare(`
      DELETE FROM projects
      WHERE id = ?
    `)

    statement.run(projectId)
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

      this.insertProject(duplicate)
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

    this.insertProject(project)
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

    const statement = this.db.prepare(`
      UPDATE projects
      SET name = ?,
          genre = ?,
          runtime_target = ?,
          preview_thumbnail = ?,
          module_count = ?,
          systems_summary_json = ?,
          simulation_ready = ?,
          blueprint_json = ?,
          prototype_spec_json = ?,
          module_graph_json = ?,
          workspace_json = ?,
          updated_at = ?
      WHERE id = ?
    `)

    statement.run(
      next.name,
      next.genre,
      next.runtime_target,
      next.preview_thumbnail,
      next.module_count,
      JSON.stringify(next.systems_summary),
      next.simulation_ready ? 1 : 0,
      stringifyNullableJson(next.blueprint_json),
      stringifyNullableJson(next.prototype_spec),
      stringifyNullableJson(next.module_graph),
      JSON.stringify(next.workspace_json),
      next.updated_at,
      projectId,
    )

    return next
  }

  async createJob(projectId: string, kind: GenerationJob["kind"] = "prototype_generation"): Promise<GenerationJob> {
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

    const statement = this.db.prepare(`
      INSERT INTO jobs (id, project_id, kind, status, error_message, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)

    statement.run(job.id, job.project_id, job.kind, job.status, job.error_message, job.created_at, job.updated_at)
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

    const statement = this.db.prepare(`
      UPDATE jobs
      SET status = ?, error_message = ?, updated_at = ?
      WHERE id = ?
    `)
    statement.run(next.status, next.error_message, next.updated_at, next.id)
    return next
  }

  async getJob(jobId: string): Promise<GenerationJob | null> {
    const statement = this.db.prepare(`
      SELECT *
      FROM jobs
      WHERE id = ?
      LIMIT 1
    `)
    const row = statement.get(jobId) as Record<string, unknown> | undefined
    return row ? toGenerationJob(row) : null
  }

  async listJobEvents(jobId: string): Promise<GenerationJobEvent[]> {
    const statement = this.db.prepare(`
      SELECT job_id, sequence, event_type, payload_json, delay_ms
      FROM job_events
      WHERE job_id = ?
      ORDER BY sequence ASC, id ASC
    `)

    return statement.all(jobId).map((row) =>
      generationJobEventSchema.parse({
        job_id: row.job_id,
        sequence: Number(row.sequence),
        event_type: row.event_type,
        payload_json: parseJson(row.payload_json, {}),
        delay_ms: Number(row.delay_ms),
      }),
    )
  }

  async replaceJobEvents(jobId: string, events: GenerationJobEvent[]): Promise<void> {
    const deleteStatement = this.db.prepare(`DELETE FROM job_events WHERE job_id = ?`)

    const insertStatement = this.db.prepare(`
      INSERT INTO job_events (job_id, sequence, event_type, payload_json, delay_ms)
      VALUES (?, ?, ?, ?, ?)
    `)

    this.db.exec("BEGIN")
    try {
      deleteStatement.run(jobId)

      events.forEach((event) => {
        const parsed = generationJobEventSchema.parse(event)
        insertStatement.run(parsed.job_id, parsed.sequence, parsed.event_type, JSON.stringify(parsed.payload_json), parsed.delay_ms)
      })
      this.db.exec("COMMIT")
    } catch (error) {
      this.db.exec("ROLLBACK")
      throw error
    }
  }

  private insertProject(project: ProjectDetail) {
    const statement = this.db.prepare(`
      INSERT INTO projects (
        id, name, genre, runtime_target, preview_thumbnail, module_count, systems_summary_json, simulation_ready,
        blueprint_json, prototype_spec_json, module_graph_json, workspace_json, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    statement.run(
      project.id,
      project.name,
      project.genre,
      project.runtime_target,
      project.preview_thumbnail,
      project.module_count,
      JSON.stringify(project.systems_summary),
      project.simulation_ready ? 1 : 0,
      stringifyNullableJson(project.blueprint_json),
      stringifyNullableJson(project.prototype_spec),
      stringifyNullableJson(project.module_graph),
      JSON.stringify(project.workspace_json),
      project.created_at,
      project.updated_at,
    )
  }

  private async toProjectDetail(row: Record<string, unknown>): Promise<ProjectDetail> {
    return projectDetailSchema.parse({
      ...toProjectSummary(row),
      blueprint_json: parseNullableSchema(row.blueprint_json, null),
      prototype_spec: parseNullableSchema(row.prototype_spec_json, null),
      module_graph: parseNullableSchema(row.module_graph_json, null),
      workspace_json: editorWorkspaceSnapshotSchema.parse(parseJson(row.workspace_json, createDefaultWorkspaceSnapshot())),
      latest_job: await this.getLatestJob(String(row.id)),
    })
  }

  private async getLatestJob(projectId: string): Promise<GenerationJob | null> {
    const statement = this.db.prepare(`
      SELECT *
      FROM jobs
      WHERE project_id = ?
      ORDER BY updated_at DESC
      LIMIT 1
    `)

    const row = statement.get(projectId) as Record<string, unknown> | undefined
    return row ? toGenerationJob(row) : null
  }

  private seedDefaultProjects() {
    const countStatement = this.db.prepare(`SELECT COUNT(*) AS count FROM projects`)
    const countRow = countStatement.get() as { count?: number }
    if ((countRow.count ?? 0) > 0) return

    ;[
      { name: "Forest Temple", genre: "platformer" as const },
      { name: "Desert Ruins", genre: "platformer" as const },
      { name: "Skyline Raid", genre: "fps_wave_survival" as const, runtime_target: "web_3d" as const },
    ].forEach((seed) => {
      this.insertProject(
        createProjectSkeleton({
          name: seed.name,
          genre: seed.genre,
          runtime_target: seed.runtime_target ?? "web_2d",
          preview_thumbnail: resolveProjectPreviewThumbnail({
            name: seed.name,
            genre: seed.genre,
            runtime_target: seed.runtime_target ?? "web_2d",
          }),
        }),
      )
    })
  }
}

class DemoProjectRepository implements LevelystRepository {
  private readonly projects = listDemoProjects()

  async listProjectSummaries(): Promise<ProjectSummary[]> {
    return this.projects.map((project) => toProjectSummaryFromDetail(project))
  }

  async listProjectDetails(): Promise<ProjectDetail[]> {
    return this.projects.map((project) => cloneProjectDetail(project))
  }

  async getProjectDetail(projectId: string): Promise<ProjectDetail | null> {
    return getDemoProject(projectId)
  }

  async deleteProject(_projectId: string): Promise<ProjectDetail> {
    throw new Error("Demo mode is read-only.")
  }

  async createProject(_input: CreateProjectInput = {}): Promise<ProjectDetail> {
    throw new Error("Demo mode is read-only.")
  }

  async updateProject(_projectId: string, _input: UpdateProjectInput): Promise<ProjectDetail> {
    throw new Error("Demo mode is read-only.")
  }

  async createJob(_projectId: string, _kind: GenerationJob["kind"] = "prototype_generation"): Promise<GenerationJob> {
    throw new Error("Demo mode is read-only.")
  }

  async updateJob(_jobId: string, _patch: Partial<Pick<GenerationJob, "status" | "error_message">>): Promise<GenerationJob> {
    throw new Error("Demo mode is read-only.")
  }

  async getJob(_jobId: string): Promise<GenerationJob | null> {
    return null
  }

  async listJobEvents(_jobId: string): Promise<GenerationJobEvent[]> {
    return []
  }

  async replaceJobEvents(_jobId: string, _events: GenerationJobEvent[]): Promise<void> {
    throw new Error("Demo mode is read-only.")
  }
}

export function resolveDatabasePath() {
  return process.env.LEVELYST_DB_PATH ?? path.join(process.cwd(), ".levelyst", "levelyst.sqlite")
}

export function toProjectSummary(row: Record<string, unknown>): ProjectSummary {
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
    systems_summary: parseJson(row.systems_summary_json, []),
    simulation_ready: Boolean(row.simulation_ready),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  })
}

export function toProjectSummaryFromDetail(project: ProjectDetail): ProjectSummary {
  return projectSummarySchema.parse({
    id: project.id,
    name: project.name,
    genre: project.genre,
    runtime_target: project.runtime_target,
    preview_thumbnail: resolveProjectPreviewThumbnail({
      name: project.name,
      genre: project.genre,
      runtime_target: project.runtime_target,
      current: project.preview_thumbnail,
    }),
    module_count: project.module_count,
    systems_summary: project.systems_summary,
    simulation_ready: project.simulation_ready,
    created_at: project.created_at,
    updated_at: project.updated_at,
  })
}

export function toGenerationJob(row: Record<string, unknown>): GenerationJob {
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

export function stringifyNullableJson(value: unknown) {
  return value === null || value === undefined ? null : JSON.stringify(value)
}

export function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string" || value.length === 0) return fallback
  return JSON.parse(value) as T
}

function parseNullableSchema(value: unknown, fallback: null): null
function parseNullableSchema<T>(value: unknown, fallback: T | null): T | null
function parseNullableSchema<T>(value: unknown, fallback: T | null) {
  if (typeof value !== "string" || value.length === 0) return fallback
  return JSON.parse(value) as T
}

export function cloneProjectDetail(project: ProjectDetail) {
  return structuredClone(project)
}
