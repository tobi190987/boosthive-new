import { NextRequest, NextResponse } from 'next/server'

const PREVIEW_ACCESS_COOKIE = 'bh_preview_access'
const PREVIEW_PASSWORD = 'DigitalBee'

export async function POST(request: NextRequest) {
  let body: { password?: string; returnTo?: string } | null = null

  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Ungültiger Request-Body.' }, { status: 400 })
  }

  if (body?.password !== PREVIEW_PASSWORD) {
    return NextResponse.json(
      { error: 'Falsches Zugriffspasswort.' },
      { status: 401 }
    )
  }

  const redirectTo =
    typeof body.returnTo === 'string' &&
    body.returnTo.startsWith('/') &&
    !body.returnTo.startsWith('//')
      ? body.returnTo
      : '/'

  const response = NextResponse.json({ success: true, redirectTo })
  response.cookies.set(PREVIEW_ACCESS_COOKIE, 'granted', {
    httpOnly: true,
    sameSite: 'lax',
    secure: request.nextUrl.protocol === 'https:',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  })

  return response
}
