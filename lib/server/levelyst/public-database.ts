import { neon, type NeonQueryFunction } from "@neondatabase/serverless"

let sqlClient: NeonQueryFunction<false, false> | null = null
let schemaReadyPromise: Promise<void> | null = null

export function hasPublicDatabaseConfig() {
  return Boolean(process.env.DATABASE_URL?.trim())
}

export function getPublicDatabase() {
  const databaseUrl = process.env.DATABASE_URL?.trim()
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required when LEVELYST_DEPLOY_MODE=public.")
  }

  if (!sqlClient) {
    sqlClient = neon(databaseUrl)
  }

  return sqlClient
}

export async function ensurePublicSchema() {
  if (schemaReadyPromise) {
    return schemaReadyPromise
  }

  schemaReadyPromise = (async () => {
    const sql = getPublicDatabase()

    await sql`
      CREATE TABLE IF NOT EXISTS projects (
        id text PRIMARY KEY,
        owner_session_id text NOT NULL,
        name text NOT NULL,
        genre text NOT NULL,
        runtime_target text NOT NULL,
        preview_thumbnail text NOT NULL,
        module_count integer NOT NULL DEFAULT 0,
        systems_summary_json jsonb NOT NULL DEFAULT '[]'::jsonb,
        simulation_ready boolean NOT NULL DEFAULT false,
        blueprint_json jsonb,
        prototype_spec_json jsonb,
        module_graph_json jsonb,
        workspace_json jsonb NOT NULL,
        created_at text NOT NULL,
        updated_at text NOT NULL
      )
    `

    await sql`
      CREATE TABLE IF NOT EXISTS jobs (
        id text PRIMARY KEY,
        project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        kind text NOT NULL,
        status text NOT NULL,
        error_message text,
        created_at text NOT NULL,
        updated_at text NOT NULL
      )
    `

    await sql`
      CREATE TABLE IF NOT EXISTS job_events (
        id bigserial PRIMARY KEY,
        job_id text NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
        sequence integer NOT NULL,
        event_type text NOT NULL,
        payload_json jsonb NOT NULL,
        delay_ms integer NOT NULL DEFAULT 0
      )
    `

    await sql`CREATE INDEX IF NOT EXISTS idx_projects_owner_updated_at ON projects(owner_session_id, updated_at DESC)`
    await sql`CREATE INDEX IF NOT EXISTS idx_jobs_project_id ON jobs(project_id)`
    await sql`CREATE INDEX IF NOT EXISTS idx_job_events_job_id ON job_events(job_id)`
  })()

  try {
    await schemaReadyPromise
  } catch (error) {
    schemaReadyPromise = null
    throw error
  }
}
