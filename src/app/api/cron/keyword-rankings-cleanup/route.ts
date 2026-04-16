import { NextRequest, NextResponse } from 'next/server'
import { cleanupOldRankingData } from '@/lib/keyword-rankings'

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
    const result = await cleanupOldRankingData()
    return NextResponse.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Cleanup fehlgeschlagen.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
