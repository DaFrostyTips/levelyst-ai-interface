import { describe, expect, it } from "vitest"
import { classifyPrompt, recommendModules } from "@/lib/ai-rule-engine"

describe("ai rule engine", () => {
  it("classifies Mario-style prompts as 2D platformers", () => {
    const intent = classifyPrompt("Create a game like Mario with coins and jumping")

    expect(intent.intent).toBe("2d_platformer")
    expect(intent.matchedKeywords).toContain("mario")
  })

  it("keeps the platformer recommendation set available for Mario-style prompts", () => {
    const recommendations = recommendModules("2d_platformer")

    expect(recommendations.map((item) => item.moduleId)).toContain("player/platformer_controller")
    expect(recommendations.map((item) => item.moduleId)).toContain("systems/coin_collectible")
  })

  it("classifies Valorant-style prompts as 3D FPS prototypes", () => {
    const intent = classifyPrompt("Create a game like Valorant with tactical gunplay")

    expect(intent.intent).toBe("3d_fps")
    expect(intent.matchedKeywords).toContain("valorant")
  })

  it("classifies GTA-style prompts as the closest 3D graybox slice", () => {
    const intent = classifyPrompt("Instead of this platformer, make a game like Grand Theft Auto")

    expect(intent.intent).toBe("3d_fps")
    expect(intent.matchedKeywords).toContain("grand theft auto")
  })
})
