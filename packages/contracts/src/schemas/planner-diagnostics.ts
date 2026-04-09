import { z } from "zod"
import { gameTypeSchema, moduleIdSchema } from "../primitives"
import { patchOperationSchema } from "./patch-operation"

export const plannerEditCategorySchema = z.enum([
  "appearance_patch",
  "mechanics_patch",
  "family_replace",
  "unsupported_request",
])

export const plannerPromptInterpretationItemSchema = z
  .object({
    term: z.string().min(1),
    meaning: z.string().min(1),
  })
  .strict()

export const plannerDependencyGraphPreviewSchema = z
  .object({
    nodes: z.array(moduleIdSchema),
    edges: z.array(
      z
        .object({
          from: moduleIdSchema,
          to: moduleIdSchema,
          kind: z.literal("requires"),
        })
        .strict(),
    ),
  })
  .strict()

export const blueprintExplanationSchema = z
  .object({
    game_type_label: z.string().min(1),
    player_experience: z.string().min(1),
    core_gameplay: z.array(z.string().min(1)).min(1),
    game_structure: z.array(z.string().min(1)).min(1),
    environment_label: z.string().min(1),
    prompt_interpretation: z.array(plannerPromptInterpretationItemSchema),
    selected_family_label: z.string().min(1),
  })
  .strict()

export const plannerDiagnosticsSchema = z
  .object({
    tokens: z.array(z.string().min(1)),
    phrases: z.array(z.string().min(1)),
    expanded_terms: z.array(z.string().min(1)),
    capability_scores: z.record(z.string().min(1), z.number().finite()),
    resolved_capabilities: z.array(z.string().min(1)),
    selected_bundle: z.string().min(1),
    closest_playable_slice: gameTypeSchema,
    adaptation_note: z.string().min(1).nullable(),
    translated_modules: z.array(moduleIdSchema),
    dependency_graph_preview: plannerDependencyGraphPreviewSchema,
    edit_category: plannerEditCategorySchema.nullable().default(null),
    supported_changes: z.array(z.string().min(1)).default([]),
    unsupported_requests: z.array(z.string().min(1)).default([]),
    suggested_supported_prompts: z.array(z.string().min(1)).default([]),
    planned_patch_operations: z.array(patchOperationSchema).default([]),
    explanation: blueprintExplanationSchema,
  })
  .strict()

export type PlannerPromptInterpretationItem = z.infer<typeof plannerPromptInterpretationItemSchema>
export type PlannerDependencyGraphPreview = z.infer<typeof plannerDependencyGraphPreviewSchema>
export type BlueprintExplanation = z.infer<typeof blueprintExplanationSchema>
export type PlannerEditCategory = z.infer<typeof plannerEditCategorySchema>
export type PlannerDiagnostics = z.infer<typeof plannerDiagnosticsSchema>
