import { z } from "zod"
import { moduleCategorySchema, moduleIdSchema, positionSchema, resourceIdSchema } from "../primitives"

export const moduleGraphEdgeKindSchema = z.enum(["requires"])

export const moduleGraphNodeSchema = z
  .object({
    id: resourceIdSchema,
    module_id: moduleIdSchema,
    category: moduleCategorySchema,
    position: positionSchema,
  })
  .strict()

export const moduleGraphEdgeSchema = z
  .object({
    id: resourceIdSchema,
    from_node_id: resourceIdSchema,
    to_node_id: resourceIdSchema,
    kind: moduleGraphEdgeKindSchema,
  })
  .strict()

export const moduleGraphSchema = z
  .object({
    nodes: z.array(moduleGraphNodeSchema),
    edges: z.array(moduleGraphEdgeSchema),
  })
  .strict()
  .superRefine((graph, ctx) => {
    const nodeIds = new Set<string>()

    graph.nodes.forEach((node, index) => {
      if (nodeIds.has(node.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Module graph node IDs must be unique.",
          path: ["nodes", index, "id"],
        })
      }
      nodeIds.add(node.id)
    })

    const edgeIds = new Set<string>()
    graph.edges.forEach((edge, index) => {
      if (edgeIds.has(edge.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Module graph edge IDs must be unique.",
          path: ["edges", index, "id"],
        })
      }
      if (!nodeIds.has(edge.from_node_id) || !nodeIds.has(edge.to_node_id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Module graph edges must reference existing nodes.",
          path: ["edges", index],
        })
      }
      edgeIds.add(edge.id)
    })
  })

export type ModuleGraphEdgeKind = z.infer<typeof moduleGraphEdgeKindSchema>
export type ModuleGraphNode = z.infer<typeof moduleGraphNodeSchema>
export type ModuleGraphEdge = z.infer<typeof moduleGraphEdgeSchema>
export type ModuleGraph = z.infer<typeof moduleGraphSchema>
