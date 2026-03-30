import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { runAnalyticsProcessing } from '@/lib/visibility-analytics'

const workerSchema = z.object({
  analysis_id: z.string().uuid('Ungültige analysis_id.'),
  force: z.boolean().optional().default(false),
})

export const maxDuration = 300

export async function POST(request: NextRequest) {
  const workerSecret = process.env.VISIBILITY_WORKER_SECRET
  if (!workerSecret) {
    return NextResponse.json({ error: 'Worker-Secret nicht konfiguriert.' }, { status: 500 })
  }

  const headerSecret = request.headers.get('x-worker-secret')
  if (headerSecret !== workerSecret) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Ungültiger JSON-Body.' }, { status: 400 })
  }

  const parsed = workerSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validierungsfehler.', details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    )
  }

  try {
    const result = await runAnalyticsProcessing(parsed.data.analysis_id, { force: parsed.data.force })
    return NextResponse.json(result)
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Analytics-Verarbeitung fehlgeschlagen.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
