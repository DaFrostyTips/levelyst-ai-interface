import { getLevelystRepository } from "@/lib/server/levelyst/project-repository"
import { getLevelystRequestContextForRoute } from "@/lib/server/levelyst/request-context"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const requestContext = await getLevelystRequestContextForRoute(request)
  const repository = await getLevelystRepository(requestContext)
  const params = await context.params
  const job = await repository.getJob(params.id)

  if (!job) {
    return new Response(JSON.stringify({ error: "Job not found." }), {
      status: 404,
      headers: {
        "Content-Type": "application/json",
      },
    })
  }

  const events = await repository.listJobEvents(job.id)
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(encoder.encode(`event: init\ndata: ${JSON.stringify({ job_id: job.id })}\n\n`))

      for (const event of events) {
        if (event.delay_ms > 0) {
          await wait(event.delay_ms)
        }

        controller.enqueue(
          encoder.encode(`event: ${event.event_type}\ndata: ${JSON.stringify(event)}\n\n`),
        )
      }

      controller.enqueue(encoder.encode("event: complete\ndata: {}\n\n"))
      controller.close()
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  })
}

function wait(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}
