import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { AccountUpdateSchema } from '@/lib/schemas/auth'
import { createAdminClient } from '@/lib/supabase-admin'
import { createClient } from '@/lib/supabase'

function buildFieldError(field: string, message: string) {
  return {
    error: 'Bitte pruefe deine Eingaben.',
    details: {
      [field]: [message],
    },
  }
}

function createCredentialCheckClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  )
}

export async function PUT(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user || !user.email) {
    return NextResponse.json(
      { error: 'Nicht authentifiziert. Bitte einloggen.' },
      { status: 401 }
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Ungueltige Eingabedaten.' }, { status: 400 })
  }

  const parsed = AccountUpdateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Bitte pruefe deine Eingaben.', details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    )
  }

  const input = parsed.data
  const currentEmail = user.email.trim().toLowerCase()
  const credentialCheckClient = createCredentialCheckClient()
  const { error: credentialError } = await credentialCheckClient.auth.signInWithPassword({
    email: currentEmail,
    password: input.current_password,
  })

  if (credentialError) {
    return NextResponse.json(
      buildFieldError('current_password', 'Das aktuelle Passwort ist nicht korrekt.'),
      { status: 400 }
    )
  }

  const supabaseAdmin = createAdminClient()

  if (input.type === 'email') {
    const nextEmail = input.email.trim().toLowerCase()

    if (nextEmail === currentEmail) {
      return NextResponse.json(
        buildFieldError('email', 'Bitte gib eine neue E-Mail-Adresse ein.'),
        { status: 400 }
      )
    }

    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
      email: nextEmail,
      email_confirm: true,
    })

    if (updateError) {
      console.error('[PUT /api/auth/account] E-Mail-Update fehlgeschlagen:', updateError)

      const message = updateError.message.toLowerCase().includes('already')
        ? 'Diese E-Mail-Adresse wird bereits verwendet.'
        : 'E-Mail-Adresse konnte nicht aktualisiert werden.'

      return NextResponse.json(buildFieldError('email', message), { status: 400 })
    }

    const { error: refreshError } = await supabase.auth.refreshSession()
    if (refreshError) {
      console.error('[PUT /api/auth/account] Session-Refresh nach E-Mail-Update fehlgeschlagen:', refreshError)
    }

    return NextResponse.json({
      success: true,
      email: nextEmail,
      message: 'Deine E-Mail-Adresse wurde aktualisiert.',
    })
  }

  if (input.new_password === input.current_password) {
    return NextResponse.json(
      buildFieldError('new_password', 'Bitte waehle ein neues Passwort.'),
      { status: 400 }
    )
  }

  const { error: passwordUpdateError } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
    password: input.new_password,
  })

  if (passwordUpdateError) {
    console.error('[PUT /api/auth/account] Passwort-Update fehlgeschlagen:', passwordUpdateError)
    return NextResponse.json(
      buildFieldError('new_password', 'Passwort konnte nicht aktualisiert werden.'),
      { status: 400 }
    )
  }

  const { error: refreshError } = await supabase.auth.refreshSession()
  if (refreshError) {
    console.error('[PUT /api/auth/account] Session-Refresh nach Passwort-Update fehlgeschlagen:', refreshError)
  }

  return NextResponse.json({
    success: true,
    message: 'Dein Passwort wurde aktualisiert.',
  })
}
