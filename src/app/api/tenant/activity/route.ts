import { NextRequest, NextResponse } from 'next/server'
import { requireTenantUser } from '@/lib/auth-guards'
import { createAdminClient } from '@/lib/supabase-admin'

interface ActivityItem {
  id: string
  type: 'approval_event' | 'content_brief' | 'ad_generation'
  label: string
  subtitle: string | null
  link: string
  created_at: string
}

export async function GET(request: NextRequest) {
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })

  const authResult = await requireTenantUser(tenantId)
  if ('error' in authResult) return authResult.error

  const isAdmin = authResult.auth.role === 'admin'
  const currentUserId = authResult.auth.userId

  const admin = createAdminClient()

  let eventsQuery = admin
      .from('approval_request_events')
      .select(
        'id, event_type, actor_label, created_at, approval_request_id, approval_requests!inner(customer_name, content_title, created_by)'
      )
      .eq('approval_requests.tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(10)

  let briefsQuery = admin
      .from('content_briefs')
      .select('id, keyword, created_at')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(5)

  let adsQuery = admin
      .from('ad_generations')
      .select('id, briefing, created_at')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(5)

  if (!isAdmin) {
    eventsQuery = eventsQuery.eq('approval_requests.created_by', currentUserId)
    briefsQuery = briefsQuery.eq('created_by', currentUserId)
    adsQuery = adsQuery.eq('created_by', currentUserId)
  }

  const [eventsResult, briefsResult, adsResult] = await Promise.allSettled([
    eventsQuery,
    briefsQuery,
    adsQuery,
  ])

  const activities: ActivityItem[] = []

  if (eventsResult.status === 'fulfilled' && !eventsResult.value.error) {
    for (const event of eventsResult.value.data ?? []) {
      const ar = event.approval_requests as unknown as { customer_name: string | null; content_title: string | null } | null
      if (!ar) continue

      const eventLabels: Record<string, string> = {
        submitted: 'Freigabe eingereicht',
        resubmitted: 'Erneut eingereicht',
        approved: 'Freigabe erteilt',
        changes_requested: 'Korrektur angefragt',
        content_updated: 'Inhalt aktualisiert',
      }

      activities.push({
        id: `event-${event.id}`,
        type: 'approval_event',
        label: eventLabels[event.event_type as string] ?? event.event_type,
        subtitle: [ar.content_title, ar.customer_name].filter(Boolean).join(' - ') || null,
        link: '/tools/approvals',
        created_at: event.created_at,
      })
    }
  }

  if (briefsResult.status === 'fulfilled' && !briefsResult.value.error) {
    for (const brief of briefsResult.value.data ?? []) {
      activities.push({
        id: `brief-${brief.id}`,
        type: 'content_brief',
        label: 'Content Brief erstellt',
        subtitle: brief.keyword ?? null,
        link: `/tools/content-briefs?briefId=${brief.id}`,
        created_at: brief.created_at,
      })
    }
  }

  if (adsResult.status === 'fulfilled' && !adsResult.value.error) {
    for (const ad of adsResult.value.data ?? []) {
      const briefing = ad.briefing as Record<string, unknown> | null
      const product = typeof briefing?.product === 'string' ? briefing.product : 'Unbenannt'
      activities.push({
        id: `ad-${ad.id}`,
        type: 'ad_generation',
        label: 'Ad-Text generiert',
        subtitle: product,
        link: '/tools/ad-generator',
        created_at: ad.created_at,
      })
    }
  }

  activities.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

  return NextResponse.json({ activities: activities.slice(0, 10) })
}
