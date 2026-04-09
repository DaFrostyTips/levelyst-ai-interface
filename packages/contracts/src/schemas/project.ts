import { z } from "zod"
import { genreSchema, isoDateTimeSchema, resourceIdSchema, runtimeTargetSchema } from "../primitives"
import { blueprintPlanSchema } from "./blueprint-plan"
import { prototypeSpecSchema } from "./prototype-spec"

export const projectSchema = z
  .object({
    id: resourceIdSchema,
    name: z.string().min(1).max(120),
    created_at: isoDateTimeSchema,
    updated_at: isoDateTimeSchema,
    genre: genreSchema,
    runtime_target: runtimeTargetSchema,
    blueprint_json: blueprintPlanSchema.nullable(),
    prototype_spec: prototypeSpecSchema.nullable(),
  })
  .strict()

export type Project = z.infer<typeof projectSchema>
