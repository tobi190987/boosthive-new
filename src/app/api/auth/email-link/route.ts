import { NextRequest, NextResponse } from 'next/server'

function getAllowedSupabaseHost(): string | null {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL

  if (!supabaseUrl) {
    return null
  }

  try {
    return new URL(supabaseUrl).host
  } catch {
    return null
  }
}

export async function GET(request: NextRequest) {
  const rawLink = request.nextUrl.searchParams.get('link')
  const fallbackUrl = new URL('/login', request.url)

  if (!rawLink) {
    return NextResponse.redirect(fallbackUrl)
  }

  let parsedLink: URL
  try {
    parsedLink = new URL(rawLink)
  } catch {
    return NextResponse.redirect(fallbackUrl)
  }

  const allowedHost = getAllowedSupabaseHost()
  const isAllowedHost = allowedHost && parsedLink.host === allowedHost
  const isAllowedPath = parsedLink.pathname.startsWith('/auth/v1/verify')

  if (!isAllowedHost || !isAllowedPath) {
    return NextResponse.redirect(fallbackUrl)
  }

  return NextResponse.redirect(parsedLink)
}
