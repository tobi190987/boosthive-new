import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { processRankingRun } from '@/lib/keyword-rankings'

const schema = z.object({
  run_id: z.string().uuid('Ungueltige Run-ID.'),
})

export const maxDuration = 300

export async function POST(request: NextRequest) {
  const workerSecret = process.env.KEYWORD_RANKINGS_WORKER_SECRET
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
    return NextResponse.json({ error: 'Ungueltiger JSON-Body.' }, { status: 400 })
  }

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 })
  }

  try {
    const result = await processRankingRun(parsed.data.run_id)
    return NextResponse.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Ranking-Run fehlgeschlagen.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
