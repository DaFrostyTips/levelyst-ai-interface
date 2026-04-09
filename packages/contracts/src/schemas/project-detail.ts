import { z } from "zod"
import { blueprintPlanSchema } from "./blueprint-plan"
import { editorWorkspaceSnapshotSchema } from "./editor-workspace"
import { generationJobSchema } from "./generation-job"
import { moduleGraphSchema } from "./module-graph"
import { projectSummarySchema } from "./project-summary"
import { prototypeSpecSchema } from "./prototype-spec"

export const projectDetailSchema = projectSummarySchema.extend({
  blueprint_json: blueprintPlanSchema.nullable(),
  prototype_spec: prototypeSpecSchema.nullable(),
  module_graph: moduleGraphSchema.nullable(),
  workspace_json: editorWorkspaceSnapshotSchema,
  latest_job: generationJobSchema.nullable(),
})

export type ProjectDetail = z.infer<typeof projectDetailSchema>
