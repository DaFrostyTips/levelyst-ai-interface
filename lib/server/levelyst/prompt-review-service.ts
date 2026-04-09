import { blueprintPlanSchema, type BlueprintPlan, type PlannerDiagnostics } from "@levelyst/contracts"
import {
  analyzePromptCapabilities,
  decorateDiagnosticsForFamilyReplace,
  hasDirectEditCue,
  hasPatchCue,
  hasReplaceCue,
  planCapabilityPrompt,
} from "./capability-planner"
import { maybeEnhancePlannerDiagnosticsCopy } from "./local-ai-copy-enhancer"
import { planPromptWithDiagnostics } from "./planner-service"

export type PromptReviewMode = "replace" | "patch"

export interface PlannedProjectPromptReview {
  mode: PromptReviewMode
  blueprintPlan: BlueprintPlan
  diagnostics: PlannerDiagnostics
}

export async function planProjectPromptReview(
  prompt: string,
  options: {
    currentBlueprint?: BlueprintPlan | null
    planningProfile?: "default" | "presentation"
  } = {},
): Promise<PlannedProjectPromptReview> {
  const trimmedPrompt = prompt.trim()
  if (!trimmedPrompt) {
    throw new Error("Prompt must not be empty.")
  }

  const currentBlueprint = options.currentBlueprint ? blueprintPlanSchema.parse(options.currentBlueprint) : null
  const mode = detectPromptReviewMode(trimmedPrompt, currentBlueprint)

  if (mode === "replace" || !currentBlueprint) {
    const planned = await planPromptWithDiagnostics(trimmedPrompt, {
      planningProfile: options.planningProfile ?? "default",
    })
    const diagnostics = await maybeEnhancePlannerDiagnosticsCopy({
      prompt: trimmedPrompt,
      mode: "replace",
      diagnostics: currentBlueprint
        ? decorateDiagnosticsForFamilyReplace(planned.diagnostics, currentBlueprint)
        : planned.diagnostics,
    })

    return {
      mode: "replace",
      blueprintPlan: planned.blueprint,
      diagnostics,
    }
  }

  const planned = planCapabilityPrompt(trimmedPrompt, {
    mode: "patch",
    currentBlueprint,
    profile: options.planningProfile ?? "default",
  })
  const diagnostics = await maybeEnhancePlannerDiagnosticsCopy({
    prompt: trimmedPrompt,
    mode: "patch",
    diagnostics: planned.diagnostics,
  })

  return {
    mode: "patch",
    blueprintPlan: planned.blueprintPlan,
    diagnostics,
  }
}

export function detectPromptReviewMode(prompt: string, currentBlueprint: BlueprintPlan | null): PromptReviewMode {
  if (!currentBlueprint) return "replace"

  const normalized = prompt.trim()
  const promptAnalysis = analyzePromptCapabilities(normalized, {
    preferredSlice: currentBlueprint.game_type,
  })
  const directEditCue = hasDirectEditCue(normalized)

  if (hasReplaceCue(normalized)) {
    return "replace"
  }

  if (directEditCue) {
    return "patch"
  }

  if (promptAnalysis.closest_playable_slice !== currentBlueprint.game_type) {
    return "replace"
  }

  if (hasPatchCue(normalized, "add") || hasPatchCue(normalized, "remove")) {
    return "patch"
  }

  if (/^\s*(create|make|build)\b/i.test(normalized)) {
    return "replace"
  }

  return "patch"
}
