"use client"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Kbd, KbdGroup } from "@/components/ui/kbd"
import { BookOpenText } from "lucide-react"

interface HelpOverlayProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onJumpToArea: (area: "canvas" | "library" | "copilot" | "timeline") => void
  onReplayCoachmarks: () => void
}

const shortcuts = [
  { keys: ["?"], action: "Open help overlay" },
  { keys: ["Cmd", "K"], action: "Open command palette" },
  { keys: ["Space + Drag"], action: "Pan the canvas" },
  { keys: ["Mouse Wheel"], action: "Zoom graph canvas" },
  { keys: ["Trackpad"], action: "Two-finger pan canvas" },
  { keys: ["Pinch"], action: "Trackpad zoom around cursor" },
  { keys: ["Shift + Click"], action: "Multi-select nodes" },
  { keys: ["Esc"], action: "Clear graph selection" },
  { keys: ["Tab"], action: "Cycle graph nodes" },
  { keys: ["Arrow Keys"], action: "Nudge selected node" },
]

export function HelpOverlay({ open, onOpenChange, onJumpToArea, onReplayCoachmarks }: HelpOverlayProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="lv-glass-modal max-w-2xl text-white">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <BookOpenText className="h-5 w-5 text-cyan-200" />
            Engine Help
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 md:grid-cols-2">
          <section className="rounded-xl border border-white/10 bg-black/25 p-4">
            <p className="text-xs uppercase tracking-[0.16em] text-cyan-100/80">Shortcuts</p>
            <div className="mt-3 space-y-2 text-sm">
              {shortcuts.map((shortcut) => (
                <div key={`${shortcut.action}-${shortcut.keys.join("-")}`} className="flex items-center justify-between gap-3">
                  <span className="text-cyan-50/90">{shortcut.action}</span>
                  <KbdGroup>
                    {shortcut.keys.map((key) => (
                      <Kbd key={key} className="bg-white/10 text-cyan-50">
                        {key}
                      </Kbd>
                    ))}
                  </KbdGroup>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-white/10 bg-black/25 p-4">
            <p className="text-xs uppercase tracking-[0.16em] text-cyan-100/80">Quick Jump</p>
            <div className="mt-3 grid gap-2">
              <Button variant="outline" className="lv-chrome-control justify-start text-white" onClick={() => onJumpToArea("canvas")}>
                Game Graph Canvas
              </Button>
              <Button variant="outline" className="lv-chrome-control justify-start text-white" onClick={() => onJumpToArea("library")}>
                Module Library
              </Button>
              <Button variant="outline" className="lv-chrome-control justify-start text-white" onClick={() => onJumpToArea("copilot")}>
                AI Copilot
              </Button>
              <Button variant="outline" className="lv-chrome-control justify-start text-white" onClick={() => onJumpToArea("timeline")}>
                Timeline + Inspector
              </Button>
            </div>

            <div className="lv-glass-hud mt-4 rounded-lg p-3 text-xs text-cyan-50/85">
              Use Blueprint review to confirm systems before generation. Simulation works best once core dependencies are connected.
            </div>
            <Button
              variant="outline"
              className="lv-chrome-control mt-3 w-full justify-center text-white"
              onClick={onReplayCoachmarks}
            >
              Replay Coach Marks
            </Button>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  )
}
