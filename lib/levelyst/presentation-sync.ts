import type { PrototypeSpec } from "@levelyst/contracts"

export const PRESENTATION_CHANNEL_NAME = "levelyst-presentation"
export const PRESENTATION_STATE_STORAGE_KEY = "levelyst.presentation.state.v1"
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

export interface PresentationSyncStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
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

export function publishPresentationSyncMessage(
  channel: Pick<BroadcastChannel, "postMessage"> | null | undefined,
  input: Parameters<typeof createPresentationSyncMessage>[0],
  storage?: PresentationSyncStorage | null,
) {
  const message = createPresentationSyncMessage(input)
  writePresentationSyncMessage(message, storage)
  channel?.postMessage(message)
  return message
}

export function writePresentationSyncMessage(message: PresentationSyncMessage, storage = resolvePresentationStorage()) {
  if (!storage) return false

  try {
    storage.setItem(PRESENTATION_STATE_STORAGE_KEY, JSON.stringify(message))
    return true
  } catch {
    return false
  }
}

export function readPresentationSyncMessage(storage = resolvePresentationStorage()) {
  if (!storage) return null

  try {
    const raw = storage.getItem(PRESENTATION_STATE_STORAGE_KEY)
    if (!raw) return null
    return normalizePresentationSyncMessage(JSON.parse(raw))
  } catch {
    return null
  }
}

export function isNewerPresentationSyncMessage(message: PresentationSyncMessage, lastTimestamp: number | null) {
  return lastTimestamp === null || message.timestamp > lastTimestamp
}

export function createPrototypeSpecFingerprint(spec: PrototypeSpec | null | undefined) {
  return spec ? stableStringify(spec) : null
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

function resolvePresentationStorage(): PresentationSyncStorage | null {
  if (typeof globalThis === "undefined") return null
  const candidate = globalThis as typeof globalThis & { localStorage?: PresentationSyncStorage }
  try {
    return candidate.localStorage ?? null
  } catch {
    return null
  }
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

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value)
  }

  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(",")}]`
  }

  const record = value as Record<string, unknown>
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`
}
