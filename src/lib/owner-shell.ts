import { createClient } from '@/lib/supabase'

export interface OwnerShellContext {
  user: {
    id: string
    email: string
    firstName: string | null
    lastName: string | null
    avatarUrl: string | null
  }
}

export async function requireOwnerShellContext(): Promise<OwnerShellContext> {
  const supabase = await createClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user?.email) {
    throw new Error('Owner shell context requires an authenticated user.')
  }

  const { data: admin, error: adminError } = await supabase
    .from('platform_admins')
    .select('user_id')
    .eq('user_id', user.id)
    .single()

  if (adminError || !admin) {
    throw new Error('Owner shell context requires platform admin access.')
  }

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('first_name, last_name, avatar_url')
    .eq('user_id', user.id)
    .maybeSingle()

  return {
    user: {
      id: user.id,
      email: user.email,
      firstName: profile?.first_name ?? null,
      lastName: profile?.last_name ?? null,
      avatarUrl: profile?.avatar_url ?? null,
    },
  }
}
