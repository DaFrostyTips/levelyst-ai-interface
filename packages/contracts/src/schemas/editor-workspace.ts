import { z } from "zod"
import { blueprintPlanSchema } from "./blueprint-plan"
import { plannerDiagnosticsSchema } from "./planner-diagnostics"
import { resourceIdSchema } from "../primitives"

export const planningStepStatusSchema = z.enum(["pending", "running", "done"])
export const blueprintReviewStateSchema = z.enum(["idle", "planning", "review", "generating"])
export const pendingPromptModeSchema = z.enum(["replace", "patch"]).nullable()

export const workspaceNodeSnapshotSchema = z
  .object({
    id: resourceIdSchema,
    module_id: resourceIdSchema,
    x: z.number().finite(),
    y: z.number().finite(),
    active: z.boolean().default(true),
  })
  .strict()

export const workspaceGroupSnapshotSchema = z
  .object({
    id: resourceIdSchema,
    label: z.string().min(1),
    node_ids: z.array(resourceIdSchema),
    collapsed: z.boolean(),
    bounds: z
      .object({
        x: z.number().finite(),
        y: z.number().finite(),
        width: z.number().finite(),
        height: z.number().finite(),
      })
      .strict(),
  })
  .strict()

export const workspaceLevelSectionSchema = z
  .object({
    id: resourceIdSchema,
    title: z.string().min(1),
    order: z.number().int().nonnegative(),
    expanded: z.boolean(),
    module_ids: z.array(resourceIdSchema),
  })
  .strict()

export const workspacePlanningStepSchema = z
  .object({
    id: resourceIdSchema,
    label: z.string().min(1),
    status: planningStepStatusSchema,
  })
  .strict()

export const workspaceViewportSchema = z
  .object({
    x: z.number().finite(),
    y: z.number().finite(),
    scale: z.number().finite(),
    is_panning: z.boolean(),
  })
  .strict()

export const editorWorkspaceSnapshotSchema = z
  .object({
    nodes: z.array(workspaceNodeSnapshotSchema),
    groups: z.array(workspaceGroupSnapshotSchema),
    timeline_sections: z.array(workspaceLevelSectionSchema),
    prompt: z.string(),
    game_plan: z.array(z.string()),
    planning_steps: z.array(workspacePlanningStepSchema),
    canvas_viewport: workspaceViewportSchema,
    pending_blueprint: blueprintPlanSchema.nullable(),
    pending_blueprint_diagnostics: plannerDiagnosticsSchema.nullable().default(null),
    pending_prompt_mode: pendingPromptModeSchema.default(null),
    blueprint_state: blueprintReviewStateSchema,
  })
  .strict()

export type PlanningStepStatus = z.infer<typeof planningStepStatusSchema>
export type BlueprintReviewState = z.infer<typeof blueprintReviewStateSchema>
export type PendingPromptMode = z.infer<typeof pendingPromptModeSchema>
export type WorkspaceNodeSnapshot = z.infer<typeof workspaceNodeSnapshotSchema>
export type WorkspaceGroupSnapshot = z.infer<typeof workspaceGroupSnapshotSchema>
export type WorkspaceLevelSection = z.infer<typeof workspaceLevelSectionSchema>
export type WorkspacePlanningStep = z.infer<typeof workspacePlanningStepSchema>
export type WorkspaceViewport = z.infer<typeof workspaceViewportSchema>
export type EditorWorkspaceSnapshot = z.infer<typeof editorWorkspaceSnapshotSchema>
