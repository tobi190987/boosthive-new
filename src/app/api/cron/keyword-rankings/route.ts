import { NextRequest, NextResponse } from 'next/server'
import { createRankingRun, listDueProjects, processRankingRun } from '@/lib/keyword-rankings'

export const maxDuration = 300

function isAuthorizedCronRequest(request: NextRequest) {
  if (request.headers.get('x-vercel-cron') === '1') {
    return true
  }
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return false
  return request.headers.get('authorization') === `Bearer ${cronSecret}`
}

export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
  }

  try {
    const dueProjects = await listDueProjects()
    const results: Array<{
      projectId: string
      runId?: string
      status: string
      error?: string
    }> = []

    for (const project of dueProjects) {
      try {
        const run = await createRankingRun({
          tenantId: project.tenant_id,
          projectId: project.id,
          triggerType: 'cron',
        })
        const result = await processRankingRun(run.id)
        results.push({
          projectId: project.id,
          runId: run.id,
          status: result.status,
        })
      } catch (error) {
        results.push({
          projectId: project.id,
          status: 'failed',
          error: error instanceof Error ? error.message : 'Cron-Verarbeitung fehlgeschlagen.',
        })
      }
    }

    return NextResponse.json({
      processed: results.length,
      results,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Cron-Job fehlgeschlagen.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
