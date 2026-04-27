import { describe, expect, it } from "vitest"
import { createPresentationSyncMessage, normalizePresentationSyncMessage } from "@/lib/levelyst/presentation-sync"

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
})
