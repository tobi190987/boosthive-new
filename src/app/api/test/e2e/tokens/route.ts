import { NextRequest, NextResponse } from 'next/server'
import { createInvitationToken } from '@/lib/invitations'
import { createPasswordResetToken } from '@/lib/password-reset'
import { createAdminClient } from '@/lib/supabase-admin'

const E2E_TOKEN = process.env.E2E_TEST_HELPER_TOKEN ?? 'local-e2e-token'

type TokenRequestBody =
  | {
      type?: 'invitation'
      slug?: string
      role?: 'admin' | 'member'
    }
  | {
      type?: 'password-reset'
      slug?: string
      user?: 'admin' | 'member'
    }

function denyIfNotAllowed(request: NextRequest) {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 })
  }

  if (request.headers.get('x-e2e-token') !== E2E_TOKEN) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
  }

  return null
}

async function findUserIdByEmail(email: string) {
  const supabaseAdmin = createAdminClient()
  const lookup = await supabaseAdmin.rpc('find_auth_user_by_email', {
    p_email: email,
  })

  if (lookup.error) {
    throw lookup.error
  }

  return lookup.data?.[0]?.id as string | undefined
}

export async function POST(request: NextRequest) {
  const denied = denyIfNotAllowed(request)
  if (denied) return denied

  let body: TokenRequestBody | null = null
  try {
    body = (await request.json()) as TokenRequestBody
  } catch {
    body = null
  }

  const slug = body?.slug?.trim()
  if (!slug) {
    return NextResponse.json({ error: 'slug is required.' }, { status: 400 })
  }

  const supabaseAdmin = createAdminClient()
  const tenantLookup = await supabaseAdmin
    .from('tenants')
    .select('id, slug, name')
    .eq('slug', slug)
    .maybeSingle()

  if (tenantLookup.error || !tenantLookup.data) {
    return NextResponse.json({ error: 'tenant not found.' }, { status: 404 })
  }

  if (body?.type === 'invitation') {
    const role = body.role === 'admin' ? 'admin' : 'member'
    const email = `invitee+${slug}@example.com`
    const now = new Date().toISOString()
    const { rawToken, tokenHash, expiresAt } = createInvitationToken()

    const existingUserId = await findUserIdByEmail(email)
    if (existingUserId) {
      await supabaseAdmin.from('tenant_members').delete().eq('tenant_id', tenantLookup.data.id).eq('user_id', existingUserId)
      await supabaseAdmin.from('user_profiles').delete().eq('user_id', existingUserId)
      await supabaseAdmin.auth.admin.deleteUser(existingUserId)
    }

    await supabaseAdmin
      .from('tenant_invitations')
      .delete()
      .eq('tenant_id', tenantLookup.data.id)
      .eq('email', email)

    const insertResult = await supabaseAdmin
      .from('tenant_invitations')
      .insert({
        tenant_id: tenantLookup.data.id,
        email,
        role,
        token_hash: tokenHash,
        expires_at: expiresAt.toISOString(),
        last_sent_at: now,
      })
      .select('id')
      .single()

    if (insertResult.error || !insertResult.data) {
      throw insertResult.error ?? new Error('Invitation token could not be created.')
    }

    return NextResponse.json({
      type: 'invitation',
      tenant: tenantLookup.data,
      invitation: {
        id: insertResult.data.id,
        email,
        role,
        token: rawToken,
      },
    })
  }

  if (body?.type === 'password-reset') {
    const userKind = body.user === 'admin' ? 'admin' : 'member'
    const email = `${userKind}+${slug}@example.com`
    const userId = await findUserIdByEmail(email)

    if (!userId) {
      return NextResponse.json({ error: 'user not found.' }, { status: 404 })
    }

    const { rawToken, tokenHash, expiresAt } = createPasswordResetToken()
    const created = await supabaseAdmin.rpc('create_password_reset_request', {
      p_email: email,
      p_tenant_id: tenantLookup.data.id,
      p_token_hash: tokenHash,
      p_expires_at: expiresAt.toISOString(),
    })

    if (created.error) {
      throw created.error
    }

    const result = created.data as
      | { created?: boolean; token_id?: string; user_id?: string }
      | null

    if (!result?.created || !result.token_id || !result.user_id) {
      return NextResponse.json({ error: 'reset token could not be created.' }, { status: 400 })
    }

    const finalized = await supabaseAdmin.rpc('finalize_password_reset_request', {
      p_token_id: result.token_id,
      p_user_id: result.user_id,
      p_tenant_id: tenantLookup.data.id,
    })

    if (finalized.error || !(finalized.data as { finalized?: boolean } | null)?.finalized) {
      throw finalized.error ?? new Error('Reset token could not be activated.')
    }

    return NextResponse.json({
      type: 'password-reset',
      tenant: tenantLookup.data,
      reset: {
        email,
        user: userKind,
        token: rawToken,
      },
    })
  }

  return NextResponse.json({ error: 'unsupported token type.' }, { status: 400 })
}
