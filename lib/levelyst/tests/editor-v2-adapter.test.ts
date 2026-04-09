import { describe, expect, it } from "vitest"
import { editorBlueprintCatalog, editorModuleTemplates, getEditorModuleTemplate } from "../adapters/editor-v2"

describe("editor-v2 adapter", () => {
  it("exposes registry-backed module templates for the editor", () => {
    const template = getEditorModuleTemplate("player/platformer_controller")

    expect(template?.name).toBe("Platformer Controller")
    expect(template?.dependencies).toEqual(["physics/gravity"])
  })

  it("builds a blueprint catalog from the registry-backed templates", () => {
    expect(editorModuleTemplates).toHaveLength(11)
    expect(editorBlueprintCatalog.some((item) => item.typeId === "systems/wave_manager")).toBe(true)
  })
})
