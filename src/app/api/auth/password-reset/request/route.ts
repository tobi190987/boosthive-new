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
    return NextResponse.json({ error: 'Ungueltiger JSON-Body.' }, { status: 400 })
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

  const { data, error } = await supabaseAdmin.rpc('create_password_reset_request', {
    p_email: parsed.data.email,
    p_tenant_id: tenantId,
    p_token_hash: tokenHash,
    p_expires_at: expiresAt.toISOString(),
  })

  if (error) {
    console.error('[POST /api/auth/password-reset/request] RPC-Fehler:', error)
    return NextResponse.json(
      { error: 'Reset-Anfrage konnte nicht verarbeitet werden.' },
      { status: 500 }
    )
  }

  if (data?.created) {
    const resetUrl = buildPasswordResetUrl(request, rawToken)

    after(async () => {
      try {
        await sendPasswordReset({
          to: data.email,
          tenantName: data.tenant_name,
          tenantSlug: data.tenant_slug,
          resetUrl,
        })

        const { data: finalizeData, error: finalizeError } = await supabaseAdmin.rpc(
          'finalize_password_reset_request',
          {
            p_token_id: data.token_id,
            p_user_id: data.user_id,
            p_tenant_id: tenantId,
          }
        )

        if (finalizeError || !finalizeData?.finalized) {
          console.error(
            '[POST /api/auth/password-reset/request] Token-Aktivierung fehlgeschlagen:',
            finalizeError ?? finalizeData
          )
          await supabaseAdmin.rpc('cancel_password_reset_request', {
            p_token_id: data.token_id,
            p_tenant_id: tenantId,
          })
        }
      } catch (mailError) {
        console.error('[POST /api/auth/password-reset/request] Mailversand fehlgeschlagen:', mailError)
        await supabaseAdmin.rpc('cancel_password_reset_request', {
          p_token_id: data.token_id,
          p_tenant_id: tenantId,
        })
      }
    })
  }

  return NextResponse.json({ success: true, message: GENERIC_SUCCESS_MESSAGE })
}
