import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase'
import { createAdminClient } from '@/lib/supabase-admin'
import { ResetPasswordConfirmSchema } from '@/lib/schemas/auth'
import { hashPasswordResetToken } from '@/lib/password-reset'

const INVALID_TOKEN_ERROR =
  'Der Link ist ungültig oder abgelaufen. Bitte fordere einen neuen Reset-Link an.'

export async function POST(request: NextRequest) {
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) {
    return NextResponse.json({ error: INVALID_TOKEN_ERROR }, { status: 400 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Ungültiger JSON-Body.' }, { status: 400 })
  }

  const parsed = ResetPasswordConfirmSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validierungsfehler.', details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    )
  }

  const tokenHash = hashPasswordResetToken(parsed.data.token)
  const supabaseAdmin = createAdminClient()

  const { data, error } = await supabaseAdmin.rpc('consume_password_reset_token', {
    p_token_hash: tokenHash,
    p_tenant_id: tenantId,
  })

  if (error) {
    console.error('[POST /api/auth/password-reset/confirm] RPC-Fehler:', error)
    return NextResponse.json({ error: 'Passwort konnte nicht aktualisiert werden.' }, { status: 500 })
  }

  if (!data?.consumed || !data.token_id || !data.user_id || !data.email || !data.role) {
    return NextResponse.json({ error: INVALID_TOKEN_ERROR }, { status: 400 })
  }

  const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(data.user_id, {
    password: parsed.data.password,
    email_confirm: true,
    app_metadata: { tenant_id: tenantId, role: data.role },
  })

  if (updateError) {
    console.error('[POST /api/auth/password-reset/confirm] Passwort-Update fehlgeschlagen:', updateError)

    const { error: rollbackError } = await supabaseAdmin
      .from('password_reset_tokens')
      .update({
        status: 'active',
        used_at: null,
      })
      .eq('id', data.token_id)
      .eq('tenant_id', tenantId)
      .eq('status', 'used')

    if (rollbackError) {
      console.error(
        '[POST /api/auth/password-reset/confirm] Token-Rollback fehlgeschlagen:',
        rollbackError
      )
    }

    return NextResponse.json({ error: 'Passwort konnte nicht aktualisiert werden.' }, { status: 500 })
  }

  const supabase = await createClient()
  await supabase.auth.signOut()

  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: data.email,
    password: parsed.data.password,
  })

  if (signInError) {
    console.error('[POST /api/auth/password-reset/confirm] Auto-Login fehlgeschlagen:', signInError)
    return NextResponse.json(
      { error: 'Passwort wurde gesetzt, aber die Anmeldung ist fehlgeschlagen. Bitte melde dich erneut an.' },
      { status: 500 }
    )
  }

  return NextResponse.json({ success: true, redirectTo: '/dashboard' })
}
