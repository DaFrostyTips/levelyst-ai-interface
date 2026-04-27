"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import type { ProjectDetail, PrototypeSpec } from "@levelyst/contracts"
import { useRouter } from "next/navigation"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { getProject, getProjectSpec } from "@/lib/levelyst/api-client"
import { hydrateIntentBlueprint } from "@/lib/levelyst/client-mappers"
import { normalizePresentationSyncMessage, PRESENTATION_CHANNEL_NAME } from "@/lib/levelyst/presentation-sync"
import { SimulationViewport } from "@/components/editor-v2/simulation-viewport"

interface PresentationScreenProps {
  initialProject: ProjectDetail
}

export function PresentationScreen({ initialProject }: PresentationScreenProps) {
  const router = useRouter()
  const [project, setProject] = useState(initialProject)
  const [spec, setSpec] = useState<PrototypeSpec | null>(initialProject.prototype_spec)
  const [presentationMode, setPresentationMode] = useState<"project" | "home">(
    initialProject.prototype_spec ? "project" : "home",
  )
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

  const refreshProject = useCallback(async (projectId = project.id) => {
    try {
      const { project: nextProject } = await getProject(projectId)

      let nextSpec = nextProject.prototype_spec
      if (!nextSpec) {
        const specResponse = await getProjectSpec(projectId)
        nextSpec = specResponse.prototype_spec
      }

      if (!nextSpec) {
        setProject({
          ...nextProject,
          prototype_spec: null,
        })
        setSpec(null)
        setRuntimeError(null)
        setPresentationMode("home")
        return
      }

      setProject({
        ...nextProject,
        prototype_spec: nextSpec,
      })
      setSpec(nextSpec)
      setRuntimeError(null)
      setPresentationMode("project")
    } catch (error) {
      setSpec(null)
      setPresentationMode("home")
      setRuntimeError(error instanceof Error ? error.message : "Presentation refresh failed.")
    }
  }, [project.id])

  useEffect(() => {
    let cancelled = false

    const safeRefreshProject = async (projectId = project.id) => {
      if (cancelled) return
      await refreshProject(projectId)
    }

    const channel =
      typeof window !== "undefined" && typeof BroadcastChannel !== "undefined"
        ? new BroadcastChannel(PRESENTATION_CHANNEL_NAME)
        : null

    const handleSync = (event: MessageEvent) => {
      const message = normalizePresentationSyncMessage(event.data)
      if (!message) return

      if (message.state === "home") {
        setPresentationMode("home")
        setRuntimeError(null)
        return
      }

      if (message.projectId !== project.id) {
        router.replace(`/present/${message.projectId}/`)
        void safeRefreshProject(message.projectId)
        return
      }

      void safeRefreshProject(message.projectId)
    }

    channel?.addEventListener("message", handleSync)
    const intervalId = window.setInterval(() => {
      if (presentationMode === "project") {
        void safeRefreshProject(project.id)
      }
    }, 4000)

    return () => {
      cancelled = true
      channel?.removeEventListener("message", handleSync)
      channel?.close()
      window.clearInterval(intervalId)
    }
  }, [presentationMode, project.id, refreshProject, refreshTick, router])

  const familyLabel = blueprint?.gameTypeLabel ?? project.name

  if (presentationMode === "home") {
    return <PresentationAttractScreen status={runtimeError} />
  }

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
              onClick={() => {
                setRefreshTick((value) => value + 1)
                void refreshProject(project.id)
              }}
            >
              Retry Refresh
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export function PresentationAttractScreen({ status }: { status: string | null }) {
  const promptExamples = [
    "Create a neon 2D platformer with enemies",
    "Make a lava arena shooter with faster zombies",
    "Add guns and enemies I can shoot at",
  ]

  return (
    <div className="relative flex min-h-screen overflow-hidden bg-[#050914] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(34,211,238,0.22),transparent_34%),radial-gradient(circle_at_82%_68%,rgba(244,63,94,0.2),transparent_34%),linear-gradient(135deg,rgba(15,23,42,0.92),rgba(2,6,23,0.98))]" />
      <div className="absolute inset-0 opacity-[0.18] [background-image:linear-gradient(rgba(255,255,255,0.16)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.16)_1px,transparent_1px)] [background-size:44px_44px]" />

      <main className="relative z-10 flex w-full flex-col justify-between p-10">
        <div className="flex items-start justify-between gap-6">
          <div>
            <p className="text-[12px] uppercase tracking-[0.28em] text-cyan-100/72">Grad Show Kiosk</p>
            <h1 className="mt-4 text-6xl font-semibold tracking-normal text-white">Levelyst</h1>
            <p className="mt-4 max-w-2xl text-2xl leading-snug text-cyan-50/82">
              Start on the main screen. Prompt a game, generate it, then play the prototype here.
            </p>
          </div>
          <div className="lv-glass-hud rounded-2xl px-5 py-4 text-right">
            <p className="text-sm font-semibold text-white">Presentation Display</p>
            <p className="mt-1 text-sm text-cyan-100/72">Waiting for the active project</p>
          </div>
        </div>

        <div className="grid max-w-5xl grid-cols-3 gap-4">
          {promptExamples.map((example) => (
            <div key={example} className="lv-glass-panel rounded-lg border border-white/12 p-4">
              <p className="text-[11px] uppercase tracking-[0.2em] text-cyan-100/60">Try Prompting</p>
              <p className="mt-3 text-lg leading-snug text-white">{example}</p>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between gap-4 text-sm text-cyan-100/70">
          <span>Current state: home hub</span>
          {status ? <span className="max-w-xl truncate text-amber-100/82">{status}</span> : <span>Prototype will auto-refresh after generation.</span>}
        </div>
      </main>
    </div>
  )
}
