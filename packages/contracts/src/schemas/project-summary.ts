import { z } from "zod"
import { genreSchema, isoDateTimeSchema, resourceIdSchema, runtimeTargetSchema } from "../primitives"

export const projectSummarySchema = z
  .object({
    id: resourceIdSchema,
    name: z.string().min(1).max(120),
    genre: genreSchema,
    runtime_target: runtimeTargetSchema,
    preview_thumbnail: z.string().min(1),
    module_count: z.number().int().nonnegative(),
    systems_summary: z.array(z.string().min(1)),
    simulation_ready: z.boolean(),
    created_at: isoDateTimeSchema,
    updated_at: isoDateTimeSchema,
  })
  .strict()

export type ProjectSummary = z.infer<typeof projectSummarySchema>
