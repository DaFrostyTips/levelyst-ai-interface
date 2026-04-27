import { z } from "zod"
import { jsonObjectSchema, moduleIdSchema, positionSchema, resourceIdSchema } from "../primitives"
import { prototypeEntitySchema } from "./prototype-spec"

const updateModuleConfigOperationSchema = z
  .object({
    op: z.literal("update_module_config"),
    entity_id: resourceIdSchema,
    module: moduleIdSchema,
    changes: jsonObjectSchema,
  })
  .strict()

const addModuleOperationSchema = z
  .object({
    op: z.literal("add_module"),
    entity_id: resourceIdSchema,
    module: moduleIdSchema,
    changes: jsonObjectSchema.default({}),
  })
  .strict()

const removeModuleOperationSchema = z
  .object({
    op: z.literal("remove_module"),
    entity_id: resourceIdSchema,
    module: moduleIdSchema,
  })
  .strict()

const addEntityOperationSchema = z
  .object({
    op: z.literal("add_entity"),
    entity: prototypeEntitySchema,
  })
  .strict()

const removeEntityOperationSchema = z
  .object({
    op: z.literal("remove_entity"),
    entity_id: resourceIdSchema,
  })
  .strict()

const addSystemOperationSchema = z
  .object({
    op: z.literal("add_system"),
    module: moduleIdSchema,
    changes: jsonObjectSchema.default({}),
  })
  .strict()

const removeSystemOperationSchema = z
  .object({
    op: z.literal("remove_system"),
    module: moduleIdSchema,
  })
  .strict()

const reorderLevelStructureOperationSchema = z
  .object({
    op: z.literal("reorder_level_structure"),
    level_structure: z.array(z.string().min(1)).min(1),
  })
  .strict()

const moveGraphNodeLayoutOperationSchema = z
  .object({
    op: z.literal("move_graph_node_layout"),
    node_id: resourceIdSchema,
    position: positionSchema,
  })
  .strict()

const updateEnvironmentOperationSchema = z
  .object({
    op: z.literal("update_environment"),
    environment: z.string().min(1),
  })
  .strict()

const updateSceneParametersOperationSchema = z
  .object({
    op: z.literal("update_scene_parameters"),
    changes: jsonObjectSchema,
  })
  .strict()

export const patchOperationSchema = z.discriminatedUnion("op", [
  updateModuleConfigOperationSchema,
  addModuleOperationSchema,
  removeModuleOperationSchema,
  addEntityOperationSchema,
  removeEntityOperationSchema,
  addSystemOperationSchema,
  removeSystemOperationSchema,
  reorderLevelStructureOperationSchema,
  moveGraphNodeLayoutOperationSchema,
  updateEnvironmentOperationSchema,
  updateSceneParametersOperationSchema,
])

export type PatchOperation = z.infer<typeof patchOperationSchema>
