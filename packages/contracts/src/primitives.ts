import { z } from "zod"

export const resourceIdSchema = z
  .string()
  .min(1, "IDs must not be empty.")
  .max(120, "IDs must be 120 characters or fewer.")
  .regex(/^[A-Za-z0-9_:/.-]+$/, "IDs may only contain letters, numbers, underscores, dashes, slashes, periods, and colons.")

export const moduleIdSchema = resourceIdSchema
export const isoDateTimeSchema = z.string().datetime({ offset: true })
export const genreSchema = z.enum(["platformer", "fps_wave_survival"])
export const runtimeTargetSchema = z.enum(["web_2d", "web_3d"])
export const gameTypeSchema = z.enum(["2d_platformer", "3d_fps"])
export const moduleCategorySchema = z.enum([
  "player_mechanics",
  "physics",
  "camera",
  "enemy_ai",
  "systems",
  "combat",
  "ui",
])
export const semverSchema = z
  .string()
  .regex(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z-.]+)?(?:\+[0-9A-Za-z-.]+)?$/, "Versions must use semantic versioning.")

const jsonPrimitiveSchema = z.union([z.string(), z.number().finite(), z.boolean(), z.null()])

export const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([jsonPrimitiveSchema, z.array(jsonValueSchema), z.record(jsonValueSchema)]),
)

export const jsonObjectSchema = z.record(jsonValueSchema)

export const configFieldTypeSchema = z.enum([
  "string",
  "number",
  "boolean",
  "integer",
  "enum",
  "vector2",
  "vector3",
  "string_array",
  "number_array",
])

export const configFieldSchema = z
  .object({
    type: configFieldTypeSchema,
    description: z.string().min(1).optional(),
    required: z.boolean().optional(),
    default: jsonValueSchema.optional(),
    enum: z.array(z.string().min(1)).min(1).optional(),
    min: z.number().finite().optional(),
    max: z.number().finite().optional(),
  })
  .strict()
  .superRefine((field, ctx) => {
    if (field.type === "enum" && (!field.enum || field.enum.length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Enum config fields must include enum values.",
        path: ["enum"],
      })
    }

    if (field.type !== "enum" && field.enum) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Only enum config fields may declare enum values.",
        path: ["enum"],
      })
    }

    if (field.min !== undefined && field.max !== undefined && field.min > field.max) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Config field min must be less than or equal to max.",
        path: ["min"],
      })
    }
  })

export const configSchemaSchema = z.record(configFieldSchema).superRefine((value, ctx) => {
  for (const key of Object.keys(value)) {
    if (key.trim().length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Config schema keys must not be empty.",
      })
      return
    }
  }
})

export const positionSchema = z
  .object({
    x: z.number().finite(),
    y: z.number().finite(),
  })
  .strict()

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }
export type Genre = z.infer<typeof genreSchema>
export type RuntimeTarget = z.infer<typeof runtimeTargetSchema>
export type GameType = z.infer<typeof gameTypeSchema>
export type ModuleCategory = z.infer<typeof moduleCategorySchema>
export type ConfigField = z.infer<typeof configFieldSchema>
