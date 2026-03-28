import { after, NextRequest, NextResponse } from 'next/server'
import { ForgotPasswordSchema } from '@/lib/schemas/auth'
import { sendPasswordReset } from '@/lib/email'
import { createPasswordResetToken, buildPasswordResetUrl } from '@/lib/password-reset'
import { createAdminClient } from '@/lib/supabase-admin'

const GENERIC_SUCCESS_MESSAGE =
  'Wenn ein passendes Konto existiert, wurde eine E-Mail mit weiteren Schritten versendet.'

export async function POST(request: NextRequest) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Ungültiger JSON-Body.' }, { status: 400 })
  }

  const parsed = ForgotPasswordSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validierungsfehler.', details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    )
  }

  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) {
    return NextResponse.json({ success: true, message: GENERIC_SUCCESS_MESSAGE })
  }

  const { rawToken, tokenHash, expiresAt } = createPasswordResetToken()
  const supabaseAdmin = createAdminClient()
  const normalizedEmail = parsed.data.email.trim().toLowerCase()

  const { data: tenant, error: tenantError } = await supabaseAdmin
    .from('tenants')
    .select('id, name, slug')
    .eq('id', tenantId)
    .eq('status', 'active')
    .maybeSingle()

  if (tenantError) {
    console.error('[POST /api/auth/password-reset/request] Tenant-Lookup fehlgeschlagen:', tenantError)
    return NextResponse.json({ success: true, message: GENERIC_SUCCESS_MESSAGE })
  }

  if (!tenant) {
    return NextResponse.json({ success: true, message: GENERIC_SUCCESS_MESSAGE })
  }

  const existingUserLookup = await supabaseAdmin.rpc('find_auth_user_by_email', {
    p_email: normalizedEmail,
  })

  if (existingUserLookup.error) {
    console.error(
      '[POST /api/auth/password-reset/request] User-Lookup fehlgeschlagen:',
      existingUserLookup.error
    )
    return NextResponse.json({ error: 'Reset-Anfrage konnte nicht verarbeitet werden.' }, { status: 500 })
  }

  const userId = existingUserLookup.data?.[0]?.id as string | undefined
  if (!userId) {
    return NextResponse.json({ success: true, message: GENERIC_SUCCESS_MESSAGE })
  }

  const { data: membership, error: membershipError } = await supabaseAdmin
    .from('tenant_members')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle()

  if (membershipError) {
    console.error(
      '[POST /api/auth/password-reset/request] Membership-Lookup fehlgeschlagen:',
      membershipError
    )
    return NextResponse.json({ error: 'Reset-Anfrage konnte nicht verarbeitet werden.' }, { status: 500 })
  }

  if (!membership) {
    return NextResponse.json({ success: true, message: GENERIC_SUCCESS_MESSAGE })
  }

  const { data: createdToken, error: createTokenError } = await supabaseAdmin
    .from('password_reset_tokens')
    .insert({
      user_id: userId,
      tenant_id: tenantId,
      token_hash: tokenHash,
      status: 'pending',
      expires_at: expiresAt.toISOString(),
    })
    .select('id')
    .single()

  if (createTokenError || !createdToken) {
    console.error(
      '[POST /api/auth/password-reset/request] Reset-Token konnte nicht erstellt werden:',
      createTokenError
    )
    return NextResponse.json({ error: 'Reset-Anfrage konnte nicht verarbeitet werden.' }, { status: 500 })
  }

  const resetUrl = buildPasswordResetUrl(request, rawToken)

  after(async () => {
    try {
      await sendPasswordReset({
        to: normalizedEmail,
        tenantName: tenant.name,
        tenantSlug: tenant.slug,
        resetUrl,
        token: rawToken,
      })

      const { data: finalizedToken, error: finalizeError } = await supabaseAdmin
        .from('password_reset_tokens')
        .update({ status: 'active' })
        .eq('id', createdToken.id)
        .eq('tenant_id', tenantId)
        .eq('user_id', userId)
        .eq('status', 'pending')
        .select('id')
        .maybeSingle()

      if (finalizeError || !finalizedToken) {
        console.error(
          '[POST /api/auth/password-reset/request] Token-Aktivierung fehlgeschlagen:',
          finalizeError
        )
        await supabaseAdmin
          .from('password_reset_tokens')
          .update({ status: 'invalidated' })
          .eq('id', createdToken.id)
          .eq('tenant_id', tenantId)
        return
      }

      const { error: invalidateOldTokensError } = await supabaseAdmin
        .from('password_reset_tokens')
        .update({ status: 'invalidated' })
        .eq('tenant_id', tenantId)
        .eq('user_id', userId)
        .neq('id', createdToken.id)
        .in('status', ['pending', 'active'])

      if (invalidateOldTokensError) {
        console.error(
          '[POST /api/auth/password-reset/request] Ältere Reset-Tokens konnten nicht invalidiert werden:',
          invalidateOldTokensError
        )
      }
    } catch (mailError) {
      console.error('[POST /api/auth/password-reset/request] Mailversand fehlgeschlagen:', mailError)
      await supabaseAdmin
        .from('password_reset_tokens')
        .update({ status: 'invalidated' })
        .eq('id', createdToken.id)
        .eq('tenant_id', tenantId)
    }
  })

  return NextResponse.json({ success: true, message: GENERIC_SUCCESS_MESSAGE })
}
