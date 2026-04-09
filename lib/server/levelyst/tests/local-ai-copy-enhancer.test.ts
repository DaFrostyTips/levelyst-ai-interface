import { afterEach, describe, expect, it, vi } from "vitest"
import { maybeEnhancePlannerDiagnosticsCopy } from "@/lib/server/levelyst/local-ai-copy-enhancer"

const baseDiagnostics = {
  tokens: ["platformer", "coins"],
  phrases: [],
  expanded_terms: [],
  capability_scores: {
    "movement.side_scroll": 4,
  },
  resolved_capabilities: ["movement.side_scroll"],
  selected_bundle: "2d_platformer",
  closest_playable_slice: "2d_platformer" as const,
  adaptation_note: null,
  translated_modules: ["camera/side_scroll", "player/platformer_controller", "systems/coin_collectible"],
  dependency_graph_preview: {
    nodes: ["camera/side_scroll", "player/platformer_controller", "systems/coin_collectible"],
    edges: [
      {
        from: "player/platformer_controller",
        to: "camera/side_scroll",
        kind: "requires" as const,
      },
    ],
  },
  edit_category: null,
  supported_changes: [],
  unsupported_requests: [],
  suggested_supported_prompts: ["Make the hero red"],
  planned_patch_operations: [],
  explanation: {
    game_type_label: "2D Platformer",
    player_experience: "Run, jump, and collect coins through a side-scrolling level.",
    core_gameplay: ["Run and jump between platforms."],
    game_structure: ["Intro", "Gameplay Loop", "End"],
    environment_label: "Graybox Rooftops",
    prompt_interpretation: [
      {
        term: "platformer",
        meaning: "A side-scrolling action game focused on running and jumping.",
      },
    ],
    selected_family_label: "2D Platformer",
  },
}

describe("local AI copy enhancer", () => {
  afterEach(() => {
    delete process.env.LEVELYST_LOCAL_AI_MODE
    delete process.env.LEVELYST_LOCAL_AI_MODEL
    delete process.env.LEVELYST_LOCAL_AI_TIMEOUT_MS
    delete process.env.LEVELYST_PLANNER_PROVIDER
    vi.unstubAllGlobals()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it("uses enhanced wording when Ollama returns valid structured copy within the timeout", async () => {
    process.env.LEVELYST_LOCAL_AI_MODE = "copy_only"
    process.env.LEVELYST_LOCAL_AI_MODEL = "qwen3:4b"
    process.env.LEVELYST_LOCAL_AI_TIMEOUT_MS = "800"
    process.env.LEVELYST_PLANNER_PROVIDER = "rule_based"

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            message: {
              content: JSON.stringify({
                player_experience: "Dash through rooftops, grab coins, and keep the run moving with clean platforming momentum.",
                adaptation_note: null,
                prompt_interpretation_meanings: ["A fast side-scrolling platform build with responsive movement."],
                supported_changes: [],
                suggested_supported_prompts: ["Make the hero glow red"],
              }),
            },
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
            },
          },
        ),
      ),
    )

    const diagnostics = await maybeEnhancePlannerDiagnosticsCopy({
      prompt: "Create a platformer with coins",
      mode: "replace",
      diagnostics: baseDiagnostics,
    })

    expect(diagnostics.explanation.player_experience).toContain("rooftops")
    expect(diagnostics.explanation.prompt_interpretation[0]?.term).toBe("platformer")
    expect(diagnostics.explanation.prompt_interpretation[0]?.meaning).toContain("side-scrolling")
    expect(diagnostics.suggested_supported_prompts).toEqual(["Make the hero glow red"])
  })

  it("falls back to deterministic copy when Ollama returns invalid JSON", async () => {
    process.env.LEVELYST_LOCAL_AI_MODE = "copy_only"
    process.env.LEVELYST_LOCAL_AI_MODEL = "qwen3:4b"
    process.env.LEVELYST_PLANNER_PROVIDER = "rule_based"

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            message: {
              content: "{not valid json",
            },
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
            },
          },
        ),
      ),
    )

    const diagnostics = await maybeEnhancePlannerDiagnosticsCopy({
      prompt: "Create a platformer with coins",
      mode: "replace",
      diagnostics: baseDiagnostics,
    })

    expect(diagnostics).toEqual(baseDiagnostics)
  })

  it("falls back to deterministic copy when the local AI request times out", async () => {
    process.env.LEVELYST_LOCAL_AI_MODE = "copy_only"
    process.env.LEVELYST_LOCAL_AI_MODEL = "qwen3:4b"
    process.env.LEVELYST_LOCAL_AI_TIMEOUT_MS = "10"
    process.env.LEVELYST_PLANNER_PROVIDER = "rule_based"

    vi.useFakeTimers()
    vi.stubGlobal(
      "fetch",
      vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
        const signal = init?.signal

        return new Promise<Response>((_resolve, reject) => {
          signal?.addEventListener("abort", () => {
            const error = new Error("Request aborted.")
            error.name = "AbortError"
            reject(error)
          })
        })
      }),
    )

    const pendingDiagnostics = maybeEnhancePlannerDiagnosticsCopy({
      prompt: "Create a platformer with coins",
      mode: "replace",
      diagnostics: baseDiagnostics,
    })

    await vi.advanceTimersByTimeAsync(20)
    const diagnostics = await pendingDiagnostics

    expect(diagnostics).toEqual(baseDiagnostics)
  })

  it("falls back to deterministic copy when Ollama is offline", async () => {
    process.env.LEVELYST_LOCAL_AI_MODE = "copy_only"
    process.env.LEVELYST_LOCAL_AI_MODEL = "qwen3:4b"
    process.env.LEVELYST_PLANNER_PROVIDER = "rule_based"

    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("connect ECONNREFUSED 127.0.0.1:11434")),
    )

    const diagnostics = await maybeEnhancePlannerDiagnosticsCopy({
      prompt: "Create a platformer with coins",
      mode: "replace",
      diagnostics: baseDiagnostics,
    })

    expect(diagnostics).toEqual(baseDiagnostics)
  })
})
