import { z } from "zod"
import { jsonObjectSchema, moduleIdSchema, positionSchema, runtimeTargetSchema, resourceIdSchema } from "../primitives"

export const prototypeSceneSchema = z
  .object({
    environment: z.string().min(1),
    level_structure: z.array(z.string().min(1)).min(1),
    parameters: jsonObjectSchema.default({}),
  })
  .strict()

export const prototypeEntitySchema = z
  .object({
    id: resourceIdSchema,
    kind: z.enum(["player", "enemy", "pickup", "spawn_point", "environment", "camera_anchor"]).optional(),
    position: positionSchema.optional(),
    modules: z.array(moduleIdSchema).min(1),
    module_configs: z.record(moduleIdSchema, jsonObjectSchema).default({}),
  })
  .strict()
  .superRefine((entity, ctx) => {
    const uniqueModules = new Set(entity.modules)
    if (uniqueModules.size !== entity.modules.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Entity modules must be unique.",
        path: ["modules"],
      })
    }

    for (const moduleId of Object.keys(entity.module_configs)) {
      if (!uniqueModules.has(moduleId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Entity module_configs keys must correspond to installed entity modules.",
          path: ["module_configs", moduleId],
        })
      }
    }
  })

export const prototypeSystemSchema = z
  .object({
    id: resourceIdSchema,
    module: moduleIdSchema,
    config: jsonObjectSchema.default({}),
  })
  .strict()

export const prototypeUiSchema = z
  .object({
    hud: z.array(z.string().min(1)).default([]),
    panels: z.array(z.string().min(1)).default([]),
    metadata: jsonObjectSchema.default({}),
  })
  .strict()

export const prototypeSpecSchema = z
  .object({
    runtime: runtimeTargetSchema,
    scene: prototypeSceneSchema,
    entities: z.array(prototypeEntitySchema),
    systems: z.array(prototypeSystemSchema),
    ui: prototypeUiSchema,
  })
  .strict()
  .superRefine((spec, ctx) => {
    const entityIds = new Set<string>()
    spec.entities.forEach((entity, index) => {
      if (entityIds.has(entity.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Entity IDs must be unique.",
          path: ["entities", index, "id"],
        })
      }
      entityIds.add(entity.id)
    })

    const systemIds = new Set<string>()
    const systemModules = new Set<string>()
    spec.systems.forEach((system, index) => {
      if (systemIds.has(system.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "System IDs must be unique.",
          path: ["systems", index, "id"],
        })
      }
      if (systemModules.has(system.module)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "System modules must be unique.",
          path: ["systems", index, "module"],
        })
      }
      systemIds.add(system.id)
      systemModules.add(system.module)
    })
  })

export type PrototypeScene = z.infer<typeof prototypeSceneSchema>
export type PrototypeEntity = z.infer<typeof prototypeEntitySchema>
export type PrototypeSystem = z.infer<typeof prototypeSystemSchema>
export type PrototypeUi = z.infer<typeof prototypeUiSchema>
export type PrototypeSpec = z.infer<typeof prototypeSpecSchema>
