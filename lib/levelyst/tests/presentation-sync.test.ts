import { describe, expect, it } from "vitest"
import type { PrototypeSpec } from "@levelyst/contracts"
import {
  createPresentationSyncMessage,
  createPrototypeSpecFingerprint,
  isNewerPresentationSyncMessage,
  normalizePresentationSyncMessage,
  PRESENTATION_STATE_STORAGE_KEY,
  publishPresentationSyncMessage,
  readPresentationSyncMessage,
  writePresentationSyncMessage,
  type PresentationSyncStorage,
} from "@/lib/levelyst/presentation-sync"

describe("presentation sync messages", () => {
  it("creates home sync messages with timestamps", () => {
    expect(
      createPresentationSyncMessage({
        state: "home",
        reason: "idle_reset",
        timestamp: 123,
      }),
    ).toEqual({
      type: "presentation-sync",
      state: "home",
      reason: "idle_reset",
      timestamp: 123,
    })
  })

  it("normalizes project sync messages", () => {
    expect(
      normalizePresentationSyncMessage({
        type: "presentation-sync",
        state: "project",
        projectId: "project-1",
        projectName: "Platformer",
        hasPrototype: true,
        reason: "generation_completed",
        timestamp: 456,
      }),
    ).toEqual({
      type: "presentation-sync",
      state: "project",
      projectId: "project-1",
      projectName: "Platformer",
      hasPrototype: true,
      reason: "generation_completed",
      timestamp: 456,
    })
  })

  it("supports legacy project-only broadcasts", () => {
    const normalized = normalizePresentationSyncMessage({
      type: "presentation-sync",
      projectId: "legacy-project",
      timestamp: 789,
    })

    expect(normalized).toEqual({
      type: "presentation-sync",
      state: "project",
      projectId: "legacy-project",
      projectName: undefined,
      hasPrototype: undefined,
      reason: "project_opened",
      timestamp: 789,
    })
  })

  it("rejects invalid sync payloads", () => {
    expect(normalizePresentationSyncMessage({ type: "presentation-sync", state: "project" })).toBeNull()
    expect(normalizePresentationSyncMessage({ type: "other", projectId: "project-1" })).toBeNull()
  })

  it("writes and reads the latest sync message from storage", () => {
    const storage = createMemoryStorage()
    const message = createPresentationSyncMessage({
      state: "project",
      projectId: "project-1",
      reason: "manual_present",
      timestamp: 1000,
    })

    expect(writePresentationSyncMessage(message, storage)).toBe(true)
    expect(storage.getItem(PRESENTATION_STATE_STORAGE_KEY)).toContain("project-1")
    expect(readPresentationSyncMessage(storage)).toEqual(message)
  })

  it("publishes sync messages to storage and broadcast channel", () => {
    const storage = createMemoryStorage()
    const posted: unknown[] = []
    const message = publishPresentationSyncMessage(
      { postMessage: (value) => posted.push(value) },
      {
        state: "home",
        reason: "dashboard",
        timestamp: 2000,
      },
      storage,
    )

    expect(posted).toEqual([message])
    expect(readPresentationSyncMessage(storage)).toEqual(message)
  })

  it("detects stale sync messages by timestamp", () => {
    const message = createPresentationSyncMessage({
      state: "home",
      reason: "dashboard",
      timestamp: 3000,
    })

    expect(isNewerPresentationSyncMessage(message, null)).toBe(true)
    expect(isNewerPresentationSyncMessage(message, 2999)).toBe(true)
    expect(isNewerPresentationSyncMessage(message, 3000)).toBe(false)
  })

  it("creates stable prototype fingerprints independent of object key order", () => {
    const first = {
      runtime: "web_2d",
      scene: {
        environment: "neon",
        level_structure: ["intro"],
        parameters: {
          b: 2,
          a: 1,
        },
      },
      entities: [],
      systems: [],
      ui: {
        hud: [],
        panels: [],
        metadata: {},
      },
    } satisfies PrototypeSpec
    const second = {
      ui: {
        panels: [],
        metadata: {},
        hud: [],
      },
      systems: [],
      entities: [],
      scene: {
        parameters: {
          a: 1,
          b: 2,
        },
        level_structure: ["intro"],
        environment: "neon",
      },
      runtime: "web_2d",
    } satisfies PrototypeSpec

    expect(createPrototypeSpecFingerprint(first)).toBe(createPrototypeSpecFingerprint(second))
  })
})

function createMemoryStorage(): PresentationSyncStorage {
  const values = new Map<string, string>()
  return {
    getItem(key) {
      return values.get(key) ?? null
    },
    setItem(key, value) {
      values.set(key, value)
    },
  }
}
