import { z } from "zod"
import { gameTypeSchema, jsonValueSchema, runtimeTargetSchema } from "../primitives"

export const blueprintConstraintsSchema = z
  .object({
    target_runtime: runtimeTargetSchema,
  })
  .catchall(jsonValueSchema)

export const blueprintPlanSchema = z
  .object({
    game_type: gameTypeSchema,
    core_systems: z.array(z.string().min(1)).min(1),
    gameplay_systems: z.array(z.string().min(1)),
    required_modules: z.array(z.string().min(1)).min(1),
    environment: z.string().min(1),
    level_structure: z.array(z.string().min(1)).min(1),
    constraints: blueprintConstraintsSchema,
  })
  .strict()

export type BlueprintPlan = z.infer<typeof blueprintPlanSchema>
