import { afterEach, describe, expect, it, vi } from "vitest"
import {
  OpenAIPlannerProvider,
  PlannerError,
  planPrompt,
  type PlannerModelOutput,
  type PlannerProvider,
} from "@/lib/server/levelyst/planner-service"

describe("planner service", () => {
  afterEach(() => {
    delete process.env.OPENAI_API_KEY
    vi.restoreAllMocks()
  })

  it("normalizes platformer plans into a canonical BlueprintPlan", async () => {
    const provider: PlannerProvider = {
      plan: vi.fn().mockResolvedValue({
        game_type: "2d_platformer",
        core_systems: ["player/platformer_controller"],
        gameplay_systems: [],
        environment: "graybox_rooftops",
        level_structure: ["intro", "gameplay_loop"],
      } satisfies PlannerModelOutput),
    }

    const blueprint = await planPrompt("Create a 2D platformer", { provider })

    expect(blueprint.game_type).toBe("2d_platformer")
    expect(blueprint.constraints.target_runtime).toBe("web_2d")
    expect(blueprint.core_systems).toEqual(["camera/side_scroll", "player/platformer_controller"])
    expect(blueprint.gameplay_systems).toEqual(["systems/coin_collectible"])
    expect(blueprint.required_modules).toEqual([
      "camera/side_scroll",
      "player/platformer_controller",
      "systems/coin_collectible",
    ])
    expect(blueprint.level_structure).toEqual(["intro", "gameplay_loop", "end"])
  })

  it("normalizes FPS plans into a canonical BlueprintPlan", async () => {
    const provider: PlannerProvider = {
      plan: vi.fn().mockResolvedValue({
        game_type: "3d_fps",
        core_systems: ["player/fps_controller"],
        gameplay_systems: ["ai/basic_zombie"],
        environment: "warehouse_small",
        level_structure: ["gameplay_loop", "boss_encounter"],
      } satisfies PlannerModelOutput),
    }

    const blueprint = await planPrompt("Create a zombie survival FPS", { provider })

    expect(blueprint.game_type).toBe("3d_fps")
    expect(blueprint.constraints.target_runtime).toBe("web_3d")
    expect(blueprint.core_systems).toEqual(["combat/hitscan_weapon", "player/fps_controller"])
    expect(blueprint.gameplay_systems).toEqual(["ai/basic_zombie", "systems/wave_manager"])
    expect(blueprint.required_modules).toEqual([
      "ai/basic_zombie",
      "combat/hitscan_weapon",
      "player/fps_controller",
      "systems/wave_manager",
    ])
    expect(blueprint.level_structure).toEqual(["gameplay_loop", "boss_encounter", "intro"])
  })

  it("retries when the OpenAI provider returns invalid structured output first", async () => {
    const parse = vi
      .fn()
      .mockResolvedValueOnce({
        output_parsed: null,
        output: [],
      })
      .mockResolvedValueOnce({
        output_parsed: {
          game_type: "2d_platformer",
          core_systems: ["player/platformer_controller", "camera/side_scroll"],
          gameplay_systems: ["systems/checkpoint", "systems/coin_collectible"],
          environment: "graybox_rooftops",
          level_structure: ["intro", "gameplay_loop", "end"],
        } satisfies PlannerModelOutput,
        output: [],
      })

    const provider = new OpenAIPlannerProvider({
      client: {
        responses: {
          parse,
        },
      },
      model: "gpt-5-mini",
      maxRetries: 2,
    })

    const blueprint = await planPrompt("Create a 2D platformer with coins and checkpoints", { provider })

    expect(parse).toHaveBeenCalledTimes(2)
    const firstCall = parse.mock.calls[0]?.[0]
    expect(firstCall?.text?.format?.type).toBe("json_schema")
    expect(firstCall?.text?.format?.schema?.type).toBe("object")
    expect(blueprint.required_modules).toContain("systems/checkpoint")
    expect(blueprint.required_modules).toContain("systems/coin_collectible")
  })

  it("throws a planner error after retries are exhausted", async () => {
    const provider = new OpenAIPlannerProvider({
      client: {
        responses: {
          parse: vi.fn().mockResolvedValue({
            output_parsed: null,
            output: [],
          }),
        },
      },
      model: "gpt-5-mini",
      maxRetries: 2,
    })

    await expect(planPrompt("Create a 2D platformer", { provider })).rejects.toMatchObject({
      name: "PlannerError",
      code: "failed",
      reason: "invalid_output",
    })
  })
})
