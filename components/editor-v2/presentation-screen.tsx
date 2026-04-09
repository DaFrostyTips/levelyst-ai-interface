"use client"

import { useEffect, useMemo, useState } from "react"
import type { ProjectDetail, PrototypeSpec } from "@levelyst/contracts"
import { useRouter } from "next/navigation"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { getProject, getProjectSpec } from "@/lib/levelyst/api-client"
import { hydrateIntentBlueprint } from "@/lib/levelyst/client-mappers"
import { SimulationViewport } from "@/components/editor-v2/simulation-viewport"

interface PresentationScreenProps {
  initialProject: ProjectDetail
}

export function PresentationScreen({ initialProject }: PresentationScreenProps) {
  const router = useRouter()
  const [project, setProject] = useState(initialProject)
  const [spec, setSpec] = useState<PrototypeSpec | null>(initialProject.prototype_spec)
  const [runtimeError, setRuntimeError] = useState<string | null>(null)
  const [refreshTick, setRefreshTick] = useState(0)

  const blueprint = useMemo(
    () =>
      project.blueprint_json
        ? hydrateIntentBlueprint(
            project.blueprint_json,
            project.workspace_json.prompt,
            project.workspace_json.pending_blueprint_diagnostics,
          )
        : null,
    [project.blueprint_json, project.workspace_json.pending_blueprint_diagnostics, project.workspace_json.prompt],
  )

  useEffect(() => {
    let cancelled = false

    const refreshProject = async (projectId = project.id) => {
      try {
        const { project: nextProject } = await getProject(projectId)
        if (cancelled) return

        let nextSpec = nextProject.prototype_spec
        if (!nextSpec) {
          const specResponse = await getProjectSpec(projectId)
          nextSpec = specResponse.prototype_spec
        }

        if (cancelled) return
        setProject({
          ...nextProject,
          prototype_spec: nextSpec,
        })
        setSpec(nextSpec)
        setRuntimeError(null)
      } catch (error) {
        if (cancelled) return
        setRuntimeError(error instanceof Error ? error.message : "Presentation refresh failed.")
      }
    }

    const channel =
      typeof window !== "undefined" && typeof BroadcastChannel !== "undefined"
        ? new BroadcastChannel("levelyst-presentation")
        : null

    const handleSync = (event: MessageEvent) => {
      const message = event.data as { type?: string; projectId?: string } | null
      if (!message || message.type !== "presentation-sync" || !message.projectId) return

      if (message.projectId !== project.id) {
        router.replace(`/present/${message.projectId}/`)
        return
      }

      void refreshProject(message.projectId)
    }

    channel?.addEventListener("message", handleSync)
    const intervalId = window.setInterval(() => {
      void refreshProject(project.id)
    }, 4000)

    return () => {
      cancelled = true
      channel?.removeEventListener("message", handleSync)
      channel?.close()
      window.clearInterval(intervalId)
    }
  }, [project.id, refreshTick, router])

  const familyLabel = blueprint?.gameTypeLabel ?? project.name

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#050914] text-white">
      <SimulationViewport
        active
        spec={spec}
        onRuntimeError={(message) => {
          setRuntimeError(message)
          setRefreshTick((value) => value + 1)
        }}
      />

      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-4 p-6">
        <div className="lv-glass-hud rounded-2xl px-4 py-3">
          <p className="text-[11px] uppercase tracking-[0.18em] text-cyan-100/70">Levelyst Presentation</p>
          <h1 className="mt-1 text-xl font-semibold text-white">{project.name}</h1>
          <p className="mt-1 text-sm text-cyan-100/80">{familyLabel}</p>
        </div>

        <div className="lv-glass-hud rounded-2xl px-4 py-3 text-sm text-cyan-50/88">
          <p className="font-semibold text-white">Controls</p>
          <p className="mt-1">Keyboard and controller supported.</p>
          <p className="mt-1 text-cyan-100/72">
            {spec?.runtime === "web_3d"
              ? "Left Stick / WASD move, Right Stick / Mouse look, RT fire, X reload, A jump."
              : "Left Stick / D-pad / A-D move, A / Cross / Space jump."}
          </p>
        </div>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center p-6">
        <div className="lv-glass-hud rounded-full border border-cyan-300/20 px-4 py-2 text-xs tracking-[0.18em] text-cyan-100/75">
          Prompt on laptop. Play on this screen.
        </div>
      </div>

      {spec ? (
        <Badge className="pointer-events-none absolute left-6 top-[104px] border border-emerald-300/35 bg-emerald-400/10 text-emerald-100">
          {spec.runtime === "web_3d" ? "3D Runtime Ready" : "2D Runtime Ready"}
        </Badge>
      ) : null}

      {runtimeError ? (
        <div className="absolute inset-0 flex items-center justify-center bg-[rgba(5,10,20,0.45)] p-6">
          <div className="lv-glass-modal max-w-lg rounded-2xl border border-amber-300/25 p-5 text-center shadow-[0_24px_60px_rgba(2,6,23,0.55)]">
            <p className="text-[11px] uppercase tracking-[0.18em] text-amber-100/80">Presentation Status</p>
            <p className="mt-3 text-lg font-semibold text-white">Prototype not ready yet</p>
            <p className="mt-2 text-sm leading-relaxed text-cyan-100/78">{runtimeError}</p>
            <Button
              type="button"
              variant="outline"
              className="lv-chrome-control pointer-events-auto mt-4 text-white"
              onClick={() => setRefreshTick((value) => value + 1)}
            >
              Retry Refresh
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
