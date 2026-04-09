import { getDemoProject } from "./demo-projects"
import type { LevelystRepository } from "./project-repository"

const DEFAULT_KIOSK_STARTER_PROJECT_ID = "demo_platformer"

export async function ensureKioskStarterProject(repository: LevelystRepository) {
  const existingProjects = await repository.listProjectDetails()
  if (existingProjects.length > 0) {
    return existingProjects
  }

  const starter = await resetProjectsToKioskStarter(repository)
  return [starter]
}

export async function resetProjectsToKioskStarter(
  repository: LevelystRepository,
  starterProjectId = DEFAULT_KIOSK_STARTER_PROJECT_ID,
) {
  const existingProjects = await repository.listProjectSummaries()
  for (const project of existingProjects) {
    await repository.deleteProject(project.id)
  }

  const starterProject = getDemoProject(starterProjectId)
  if (!starterProject) {
    throw new Error(`Starter project "${starterProjectId}" was not found.`)
  }

  const created = await repository.createProject({
    name: starterProject.name,
    genre: starterProject.genre,
    runtime_target: starterProject.runtime_target,
  })

  return repository.updateProject(created.id, {
    name: starterProject.name,
    genre: starterProject.genre,
    runtime_target: starterProject.runtime_target,
    preview_thumbnail: starterProject.preview_thumbnail,
    blueprint_json: starterProject.blueprint_json,
    prototype_spec: starterProject.prototype_spec,
    module_graph: starterProject.module_graph,
    workspace_json: starterProject.workspace_json,
  })
}
