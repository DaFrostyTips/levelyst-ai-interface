export const PRESENTATION_CHANNEL_NAME = "levelyst-presentation"
export const KIOSK_IDLE_RESET_MS = 3 * 60 * 1000

export type PresentationSyncReason =
  | "dashboard"
  | "idle_reset"
  | "project_opened"
  | "prompt_submitted"
  | "generation_started"
  | "generation_completed"
  | "manual_present"

export type PresentationSyncState = "home" | "project"

export interface PresentationSyncMessage {
  type: "presentation-sync"
  state: PresentationSyncState
  projectId?: string
  projectName?: string
  hasPrototype?: boolean
  reason: PresentationSyncReason
  timestamp: number
}

export function createPresentationSyncMessage(
  input: Omit<PresentationSyncMessage, "type" | "timestamp"> & { timestamp?: number },
): PresentationSyncMessage {
  return {
    type: "presentation-sync",
    ...input,
    timestamp: input.timestamp ?? Date.now(),
  }
}

export function normalizePresentationSyncMessage(value: unknown): PresentationSyncMessage | null {
  if (!value || typeof value !== "object") return null
  const record = value as Record<string, unknown>
  if (record.type !== "presentation-sync") return null

  const timestamp = typeof record.timestamp === "number" ? record.timestamp : Date.now()
  const reason = normalizeReason(record.reason)

  if (record.state === "home") {
    return createPresentationSyncMessage({
      state: "home",
      reason,
      timestamp,
    })
  }

  const projectId = typeof record.projectId === "string" ? record.projectId : null
  if (record.state === "project" || projectId) {
    if (!projectId) return null
    return createPresentationSyncMessage({
      state: "project",
      projectId,
      projectName: typeof record.projectName === "string" ? record.projectName : undefined,
      hasPrototype: typeof record.hasPrototype === "boolean" ? record.hasPrototype : undefined,
      reason,
      timestamp,
    })
  }

  return null
}

function normalizeReason(value: unknown): PresentationSyncReason {
  return value === "dashboard" ||
    value === "idle_reset" ||
    value === "project_opened" ||
    value === "prompt_submitted" ||
    value === "generation_started" ||
    value === "generation_completed" ||
    value === "manual_present"
    ? value
    : "project_opened"
}
