"use client"

import { useEffect, useRef, useState } from "react"
import type { PrototypeSpec } from "@levelyst/contracts"
import type { RuntimeSnapshot } from "@levelyst/runtime-web-2d"
import type { RuntimeSnapshot3D } from "@levelyst/runtime-web-3d"

interface SimulationViewportProps {
  active: boolean
  spec: PrototypeSpec | null
  onRuntimeError: (message: string) => void
  promptValue?: string
  onPromptChange?: (value: string) => void
  onPromptSubmit?: () => void
  promptDisabled?: boolean
  readOnly?: boolean
}

export function SimulationViewport({
  active,
  spec,
  onRuntimeError,
  promptValue = "",
  onPromptChange,
  onPromptSubmit,
  promptDisabled = false,
  readOnly = false,
}: SimulationViewportProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [snapshot, setSnapshot] = useState<RuntimeSnapshot | RuntimeSnapshot3D | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const syncSize = () => {
      const rect = container.getBoundingClientRect()
      const width = Math.max(1, Math.floor(rect.width))
      const height = Math.max(1, Math.floor(rect.height))
      if (canvas.width === width && canvas.height === height) return
      canvas.width = width
      canvas.height = height
      canvas.style.width = `${rect.width}px`
      canvas.style.height = `${rect.height}px`
    }

    syncSize()
    const observer = new ResizeObserver(syncSize)
    observer.observe(container)
    window.addEventListener("resize", syncSize)

    return () => {
      observer.disconnect()
      window.removeEventListener("resize", syncSize)
    }
  }, [])

  useEffect(() => {
    if (!active) return

    if (!spec) {
      setSnapshot(null)
      onRuntimeError("Simulation spec is unavailable. Review the AI Blueprint and click Generate Prototype first.")
      return
    }

    const canvas = canvasRef.current
    if (!canvas) return

    let disposed = false
    let runtime:
      | {
          start(): void
          stop(): void
          destroy(): void
          getSnapshot(): RuntimeSnapshot | RuntimeSnapshot3D
        }
      | null = null
    let frameId: number | null = null

    const syncSnapshot = () => {
      if (!runtime || disposed) return
      setSnapshot(runtime.getSnapshot())
      if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
        frameId = window.requestAnimationFrame(syncSnapshot)
      }
    }

    void (async () => {
      try {
        if (spec.runtime === "web_2d") {
          const runtimeModule = await import("@levelyst/runtime-web-2d")
          runtime = runtimeModule.createRuntimeWeb2D({
            spec,
            canvas,
            onEvent(event) {
              if (event.type === "runtime_error") {
                onRuntimeError(event.message)
                return
              }

              if (runtime) {
                setSnapshot(runtime.getSnapshot())
              }
            },
          })
        } else if (spec.runtime === "web_3d") {
          const runtimeModule = await import("@levelyst/runtime-web-3d")
          runtime = runtimeModule.createRuntimeWeb3D({
            spec,
            canvas,
            onEvent(event) {
              if (event.type === "runtime_error") {
                onRuntimeError(event.message)
                return
              }

              if (runtime) {
                setSnapshot(runtime.getSnapshot())
              }
            },
          })
        } else {
          throw new Error(`Simulation Mode does not support "${spec.runtime}" runtime targets.`)
        }

        if (disposed || !runtime) {
          runtime?.destroy()
          return
        }

        setSnapshot(runtime.getSnapshot())
        runtime.start()
        syncSnapshot()
      } catch (error) {
        const message = error instanceof Error ? error.message : "Runtime failed to start."
        setSnapshot(null)
        onRuntimeError(message)
      }
    })()

    return () => {
      disposed = true
      if (frameId !== null && typeof window !== "undefined" && typeof window.cancelAnimationFrame === "function") {
        window.cancelAnimationFrame(frameId)
      }
      runtime?.destroy()
    }
  }, [active, onRuntimeError, spec])

  if (!active) return null

  const isWeb3D = snapshot?.runtime === "web_3d" || spec?.runtime === "web_3d"
  const web3DSnapshot = snapshot?.runtime === "web_3d" ? (snapshot as RuntimeSnapshot3D) : null
  const web2DSnapshot = snapshot?.runtime === "web_2d" ? (snapshot as RuntimeSnapshot) : null

  const handlePointerCapture = () => {
    const canvas = canvasRef.current
    if (!canvas || typeof canvas.requestPointerLock !== "function") return
    void canvas.requestPointerLock()
  }
  const canSubmitPrompt = Boolean(promptValue.trim()) && !promptDisabled && !readOnly

  return (
    <div ref={containerRef} className="absolute inset-0 overflow-hidden rounded-3xl bg-[#08101f]">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      {isWeb3D ? (
        <>
          <div className="pointer-events-none absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-200/60">
            <div className="absolute left-1/2 top-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-100" />
          </div>
          <div className="lv-glass-hud pointer-events-none absolute right-5 top-5 rounded-xl border border-cyan-300/25 px-3 py-2 text-xs text-cyan-100/88">
            <p className="font-semibold text-white">
              {web3DSnapshot?.status === "running" ? "Wave Survival Runtime" : "Preparing Runtime"}
            </p>
            <p className="mt-1 text-cyan-100/72">{spec?.scene.environment ?? "warehouse_small"}</p>
            <p className="mt-1 text-cyan-100/72">Wave: {web3DSnapshot?.wave?.index ?? 0}</p>
            <p className="mt-1 text-cyan-100/72">Enemies: {web3DSnapshot?.wave?.alive_enemies ?? 0}</p>
            <p className="mt-1 text-cyan-100/72">
              Ammo: {web3DSnapshot?.player?.ammo_in_magazine ?? 0}/{web3DSnapshot?.player?.reserve_ammo ?? 0}
            </p>
            <p className="mt-1 text-cyan-100/72">HP: {web3DSnapshot?.player?.health ?? 0}</p>
            <p className="mt-1 text-cyan-100/72">
              {web3DSnapshot?.gamepad_connected ? "Controller connected" : "Mouse + keyboard ready"}
            </p>
          </div>
          {!web3DSnapshot?.pointer_locked ? (
            <button
              type="button"
              onClick={handlePointerCapture}
              className="lv-glass-hud absolute left-1/2 top-6 -translate-x-1/2 rounded-full border border-cyan-300/30 px-4 py-2 text-xs font-medium tracking-[0.24em] text-cyan-100 shadow-[0_16px_32px_rgba(0,0,0,0.35)]"
            >
              Click To Capture Mouse
            </button>
          ) : null}
        </>
      ) : (
        <div className="lv-glass-hud pointer-events-none absolute right-5 top-5 rounded-xl border border-cyan-300/25 px-3 py-2 text-xs text-cyan-100/88">
          <p className="font-semibold text-white">{snapshot?.status === "running" ? "Playable Runtime" : "Preparing Runtime"}</p>
          <p className="mt-1 text-cyan-100/72">{spec?.scene.environment ?? "graybox_rooftops"}</p>
          <p className="mt-1 text-cyan-100/72">
            Score: {web2DSnapshot?.score ?? 0}
          </p>
          <p className="mt-1 text-cyan-100/72">
            {web2DSnapshot?.gamepad_connected ? "Controller connected" : "Keyboard ready"}
          </p>
        </div>
      )}
      {onPromptChange && onPromptSubmit ? (
        <form
          onSubmit={(event) => {
            event.preventDefault()
            if (canSubmitPrompt) onPromptSubmit()
          }}
          onMouseDown={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
          className="lv-glass-hud absolute bottom-5 left-1/2 flex w-[min(760px,calc(100%-40px))] -translate-x-1/2 items-center gap-2 rounded-2xl border border-cyan-300/25 bg-slate-950/78 p-2 shadow-[0_18px_50px_rgba(0,0,0,0.38)]"
        >
          <label htmlFor="simulation-prompt" className="sr-only">
            Prompt the current game
          </label>
          <input
            id="simulation-prompt"
            value={promptValue}
            onChange={(event) => onPromptChange(event.target.value)}
            disabled={promptDisabled || readOnly}
            placeholder={readOnly ? "Prompting is disabled in demo mode" : "Prompt this game while you play..."}
            className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-sm text-white outline-none placeholder:text-cyan-100/50 focus:border-cyan-200/60"
          />
          <button
            type="submit"
            disabled={!canSubmitPrompt}
            className="rounded-xl bg-cyan-300 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-45"
          >
            Apply
          </button>
        </form>
      ) : null}
    </div>
  )
}
