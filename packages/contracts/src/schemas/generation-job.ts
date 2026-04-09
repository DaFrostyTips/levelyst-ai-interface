import { z } from "zod"
import { isoDateTimeSchema, jsonObjectSchema, resourceIdSchema } from "../primitives"

export const generationJobKindSchema = z.enum(["prototype_generation"])
export const generationJobStatusSchema = z.enum(["pending", "running", "completed", "failed"])
export const generationJobEventTypeSchema = z.enum([
  "job_started",
  "node_added",
  "edge_added",
  "compile_started",
  "compile_completed",
  "job_completed",
  "job_failed",
])

export const generationJobSchema = z
  .object({
    id: resourceIdSchema,
    project_id: resourceIdSchema,
    kind: generationJobKindSchema,
    status: generationJobStatusSchema,
    error_message: z.string().min(1).nullable(),
    created_at: isoDateTimeSchema,
    updated_at: isoDateTimeSchema,
  })
  .strict()

export const generationJobEventSchema = z
  .object({
    job_id: resourceIdSchema,
    sequence: z.number().int().nonnegative(),
    event_type: generationJobEventTypeSchema,
    payload_json: jsonObjectSchema,
    delay_ms: z.number().int().nonnegative(),
  })
  .strict()

export type GenerationJobKind = z.infer<typeof generationJobKindSchema>
export type GenerationJobStatus = z.infer<typeof generationJobStatusSchema>
export type GenerationJobEventType = z.infer<typeof generationJobEventTypeSchema>
export type GenerationJob = z.infer<typeof generationJobSchema>
export type GenerationJobEvent = z.infer<typeof generationJobEventSchema>
