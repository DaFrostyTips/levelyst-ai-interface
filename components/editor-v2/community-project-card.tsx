"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { PlayCircle, Wand2 } from "lucide-react"
import type { CommunityProject } from "@/lib/editor-v2-model"

interface CommunityProjectCardProps {
  project: CommunityProject
  onUseAsBase?: (project: CommunityProject) => void
}

export function CommunityProjectCard({ project, onUseAsBase }: CommunityProjectCardProps) {
  const hasVideoPreview = project.previewLoopSrc.trim().toLowerCase().endsWith(".mp4")
  const canUseAsBase = Boolean(onUseAsBase)

  return (
    <Card className="lv-glass-shell group overflow-hidden transition hover:border-blue-400/45 hover:shadow-[0_0_26px_rgba(59,130,246,0.2)]">
      <CardContent className="p-4">
        <div className="space-y-4">
          <div className="relative overflow-hidden rounded-xl border border-white/10 bg-black/35">
            {hasVideoPreview ? (
              <video
                src={project.previewLoopSrc}
                poster={project.previewPoster}
                autoPlay
                muted
                loop
                playsInline
                className="h-36 w-full object-cover transition duration-500 group-hover:scale-[1.03]"
              />
            ) : (
              <img
                src={project.previewPoster || project.thumbnail}
                alt={project.name}
                className="h-36 w-full object-cover transition duration-500 group-hover:scale-[1.03]"
              />
            )}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-3 py-2">
              <p className="text-xs font-medium text-cyan-200">{hasVideoPreview ? "Preview Loop" : "Preview Art"}</p>
            </div>
          </div>

          <div>
            <h4 className="text-base font-semibold text-white">{project.name}</h4>
            <p className="text-xs text-blue-100/75">Genre: {project.genre}</p>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <Badge variant="outline" className="border-cyan-400/35 text-cyan-200">
              Modules: {project.modulesCount}
            </Badge>
            {project.aiCreated && (
              <Badge variant="outline" className="border-purple-400/40 text-purple-200">
                Created with AI
              </Badge>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" className="lv-chrome-control text-white">
              <PlayCircle className="mr-2 h-4 w-4" />
              Play Demo
            </Button>
            <Button
              onClick={() => onUseAsBase?.(project)}
              disabled={!canUseAsBase}
              className="bg-gradient-to-r from-blue-500 to-purple-500 text-white hover:from-blue-400 hover:to-purple-400"
            >
              <Wand2 className="mr-2 h-4 w-4" />
              {canUseAsBase ? "Use as Base" : "Preview Only"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
