import { z } from "zod"
import {
  configSchemaSchema,
  moduleCategorySchema,
  moduleIdSchema,
  runtimeTargetSchema,
  semverSchema,
} from "../primitives"

export const moduleDefinitionSchema = z
  .object({
    id: moduleIdSchema,
    category: moduleCategorySchema,
    engine_target: runtimeTargetSchema,
    inputs: z.array(z.string().min(1)),
    outputs: z.array(z.string().min(1)),
    dependencies: z.array(moduleIdSchema),
    compatible_with: z.array(moduleIdSchema),
    capabilities: z.array(z.string().min(1)).optional(),
    prompt_aliases: z.array(z.string().min(1)).optional(),
    config_schema: configSchemaSchema,
    version: semverSchema,
    test_status: z.enum(["passed", "pending", "failed"]).optional(),
  })
  .strict()
  .superRefine((module, ctx) => {
    if (module.dependencies.includes(module.id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Modules cannot depend on themselves.",
        path: ["dependencies"],
      })
    }

    if (module.compatible_with.includes(module.id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Modules should not declare themselves in compatible_with.",
        path: ["compatible_with"],
      })
    }
  })

export type ModuleDefinition = z.infer<typeof moduleDefinitionSchema>
