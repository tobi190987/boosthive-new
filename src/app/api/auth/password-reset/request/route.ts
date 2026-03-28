import { after, NextRequest, NextResponse } from 'next/server'
import { ForgotPasswordSchema } from '@/lib/schemas/auth'
import { sendPasswordReset } from '@/lib/email'
import { createPasswordResetToken, buildPasswordResetUrl } from '@/lib/password-reset'
import { createAdminClient } from '@/lib/supabase-admin'
import { logSecurity } from '@/lib/observability'
import { checkRateLimit, getClientIp, rateLimitResponse, AUTH_RESET } from '@/lib/rate-limit'

const GENERIC_SUCCESS_MESSAGE =
  'Wenn ein passendes Konto existiert, wurde eine E-Mail mit weiteren Schritten versendet.'
const INVALID_REQUEST_MESSAGE = 'Eingabe konnte nicht verarbeitet werden.'

export async function POST(request: NextRequest) {
  // Rate Limiting: 3 requests / 15 min / IP (strictest)
  const ip = getClientIp(request)
  const rl = checkRateLimit(`auth-reset:${ip}`, AUTH_RESET)
  if (!rl.allowed) {
    logSecurity('password_reset_rate_limited', { ip })
    return rateLimitResponse(rl)
  }
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: INVALID_REQUEST_MESSAGE }, { status: 400 })
  }

  const parsed = ForgotPasswordSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: INVALID_REQUEST_MESSAGE, details: parsed.error.flatten().fieldErrors },
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

  // create_password_reset_request (SECURITY DEFINER) handles:
  // 1. Tenant-Validierung (aktiv, slug)
  // 2. User-Lookup in auth.users
  // 3. Membership-Prüfung
  // 4. Token-Insert (status 'pending')
  // Alles atomar in einer DB-Transaktion.
  const { data: resetResult, error: resetError } = await supabaseAdmin.rpc(
    'create_password_reset_request',
    {
      p_email: normalizedEmail,
      p_tenant_id: tenantId,
      p_token_hash: tokenHash,
      p_expires_at: expiresAt.toISOString(),
    }
  )

  if (resetError) {
    console.error(
      '[POST /api/auth/password-reset/request] RPC fehlgeschlagen:',
      JSON.stringify(resetError)
    )
    return NextResponse.json(
      { error: 'Reset-Anfrage konnte nicht verarbeitet werden.' },
      { status: 500 }
    )
  }

  console.log('[POST /api/auth/password-reset/request] RPC result:', JSON.stringify(resetResult))

  const result = resetResult as {
    created: boolean
    token_id?: string
    user_id?: string
    email?: string
    tenant_slug?: string
    tenant_name?: string
  } | null

  if (!result?.created) {
    // E-Mail nicht gefunden oder kein aktives Mitglied → generische Erfolgsmeldung
    return NextResponse.json({ success: true, message: GENERIC_SUCCESS_MESSAGE })
  }

  const tokenId = result.token_id!
  const userId = result.user_id!
  const tenantName = result.tenant_name ?? ''
  const tenantSlug = result.tenant_slug ?? ''
  const resetUrl = buildPasswordResetUrl(request, rawToken)

  after(async () => {
    try {
      await sendPasswordReset({
        to: normalizedEmail,
        tenantName,
        tenantSlug,
        resetUrl,
        token: rawToken,
      })

      const { data: finalizeResult, error: finalizeError } = await supabaseAdmin.rpc(
        'finalize_password_reset_request',
        {
          p_token_id: tokenId,
          p_user_id: userId,
          p_tenant_id: tenantId,
        }
      )

      if (finalizeError || !(finalizeResult as { finalized?: boolean } | null)?.finalized) {
        console.error(
          '[POST /api/auth/password-reset/request] Token-Aktivierung fehlgeschlagen:',
          finalizeError
        )
        await supabaseAdmin.rpc('cancel_password_reset_request', {
          p_token_id: tokenId,
          p_tenant_id: tenantId,
        })
      }
    } catch (mailError) {
      console.error('[POST /api/auth/password-reset/request] Mailversand fehlgeschlagen:', mailError)
      await supabaseAdmin.rpc('cancel_password_reset_request', {
        p_token_id: tokenId,
        p_tenant_id: tenantId,
      })
    }
  })

  return NextResponse.json({ success: true, message: GENERIC_SUCCESS_MESSAGE })
}
