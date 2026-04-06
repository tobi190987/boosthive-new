import { expect, test } from '@playwright/test'
import { createAdminClientForTests, completeTenantOnboarding } from '../e2e/seed-data'
import { tenantGet } from './helpers/api-client'
import {
  cleanupTestSessions,
  setupTestSessions,
  type SeedResult,
  type TestSessions,
} from './helpers/fixtures'

test.describe('tenant activity api', () => {
  test.describe.configure({ mode: 'serial' })
  test.setTimeout(60_000)

  let sessions: TestSessions

  test.beforeAll(async ({ request }) => {
    sessions = await setupTestSessions(request)
    const admin = createAdminClientForTests()
    await completeTenantOnboarding(admin, sessions.tenantASeed)
    await seedTenantActivity(admin, sessions.tenantASeed)
  })

  test.afterAll(async ({ request }) => {
    await cleanupTestSessions(request, sessions)
  })

  test('member sees only own activities while admin sees tenant-wide activities', async ({ request }) => {
    const memberResponse = await tenantGet(
      request,
      sessions.tenantASeed.tenant.slug,
      '/api/tenant/activity',
      sessions.tenantASeed.tenant.id,
      sessions.tenantAMemberCookies
    )
    expect(memberResponse.status()).toBe(200)

    const memberPayload = await memberResponse.json()
    const memberLabels = (memberPayload.activities ?? []).map((item: { subtitle?: string | null }) => item.subtitle)

    expect(memberLabels).toContain('Mitglieds Brief')
    expect(memberLabels).toContain('Mitglieds Produkt')
    expect(memberLabels).toContain('Member Approval - Mitglieds Kunde')
    expect(memberLabels).not.toContain('Admin Brief')
    expect(memberLabels).not.toContain('Admin Produkt')
    expect(memberLabels).not.toContain('Admin Approval - Admin Kunde')

    const adminResponse = await tenantGet(
      request,
      sessions.tenantASeed.tenant.slug,
      '/api/tenant/activity',
      sessions.tenantASeed.tenant.id,
      sessions.tenantAAdminCookies
    )
    expect(adminResponse.status()).toBe(200)

    const adminPayload = await adminResponse.json()
    const adminLabels = (adminPayload.activities ?? []).map((item: { subtitle?: string | null }) => item.subtitle)

    expect(adminLabels).toContain('Mitglieds Brief')
    expect(adminLabels).toContain('Mitglieds Produkt')
    expect(adminLabels).toContain('Member Approval - Mitglieds Kunde')
    expect(adminLabels).toContain('Admin Brief')
    expect(adminLabels).toContain('Admin Produkt')
    expect(adminLabels).toContain('Admin Approval - Admin Kunde')
  })
})

async function seedTenantActivity(
  admin: ReturnType<typeof createAdminClientForTests>,
  seed: SeedResult
) {
  const tenantId = seed.tenant.id
  const { adminUserId, memberUserId } = await loadTenantUserIds(admin, seed)

  const { data: briefs, error: briefsError } = await admin
    .from('content_briefs')
    .insert([
      {
        tenant_id: tenantId,
        customer_id: null,
        created_by: adminUserId,
        keyword: 'Admin Brief',
        language: 'de',
        tone: 'informativ',
        word_count_target: 900,
        target_url: null,
        status: 'done',
      },
      {
        tenant_id: tenantId,
        customer_id: null,
        created_by: memberUserId,
        keyword: 'Mitglieds Brief',
        language: 'de',
        tone: 'informativ',
        word_count_target: 900,
        target_url: null,
        status: 'done',
      },
    ])
    .select('id, keyword')

  if (briefsError) throw new Error(briefsError.message)
  if (!briefs || briefs.length !== 2) throw new Error('Content-Briefs konnten nicht angelegt werden.')

  const { error: adsError } = await admin.from('ad_generations').insert([
    {
      tenant_id: tenantId,
      customer_id: null,
      created_by: adminUserId,
      briefing: { product: 'Admin Produkt', platforms: ['facebook'] },
      result: { variants: [] },
      status: 'completed',
    },
    {
      tenant_id: tenantId,
      customer_id: null,
      created_by: memberUserId,
      briefing: { product: 'Mitglieds Produkt', platforms: ['facebook'] },
      result: { variants: [] },
      status: 'completed',
    },
  ])

  if (adsError) throw new Error(adsError.message)

  const { data: approvals, error: approvalsError } = await admin
    .from('approval_requests')
    .insert([
      {
        tenant_id: tenantId,
        content_type: 'content_brief',
        content_id: briefs[0].id,
        status: 'pending_approval',
        content_title: 'Admin Approval',
        content_html: '<p>admin</p>',
        customer_name: 'Admin Kunde',
        created_by: adminUserId,
        created_by_name: 'Ada Admin',
      },
      {
        tenant_id: tenantId,
        content_type: 'content_brief',
        content_id: briefs[1].id,
        status: 'pending_approval',
        content_title: 'Member Approval',
        content_html: '<p>member</p>',
        customer_name: 'Mitglieds Kunde',
        created_by: memberUserId,
        created_by_name: 'Mia Member',
      },
    ])
    .select('id')

  if (approvalsError) throw new Error(approvalsError.message)
  if (!approvals || approvals.length !== 2) throw new Error('Approval Requests konnten nicht angelegt werden.')

  const { error: eventsError } = await admin.from('approval_request_events').insert([
    {
      approval_request_id: approvals[0].id,
      tenant_id: tenantId,
      event_type: 'submitted',
      status_after: 'pending_approval',
      actor_label: 'Ada Admin',
    },
    {
      approval_request_id: approvals[1].id,
      tenant_id: tenantId,
      event_type: 'submitted',
      status_after: 'pending_approval',
      actor_label: 'Mia Member',
    },
  ])

  if (eventsError) throw new Error(eventsError.message)
}

async function loadTenantUserIds(
  admin: ReturnType<typeof createAdminClientForTests>,
  seed: SeedResult
) {
  const { data: members, error: membersError } = await admin
    .from('tenant_members')
    .select('user_id, role')
    .eq('tenant_id', seed.tenant.id)

  if (membersError || !members) {
    throw new Error(membersError?.message ?? 'Tenant-Mitglieder konnten nicht geladen werden.')
  }

  const userIds = members.map((member) => member.user_id)
  const { data: authUsers, error: authError } = await admin.auth.admin.listUsers()
  if (authError) throw new Error(authError.message)

  const byEmail = new Map(
    authUsers.users
      .filter((user) => user.email && userIds.includes(user.id))
      .map((user) => [user.email!, user.id])
  )

  const adminUserId = byEmail.get(seed.users.admin.email)
  const memberUserId = byEmail.get(seed.users.member.email)

  if (!adminUserId || !memberUserId) {
    throw new Error('Admin- oder Member-User-ID konnte nicht aufgeloest werden.')
  }

  return { adminUserId, memberUserId }
}
