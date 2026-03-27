export interface UserProfileLike {
  first_name?: string | null
  last_name?: string | null
  avatar_url?: string | null
}

export interface BillingDetailsLike {
  billing_company?: string | null
  billing_street?: string | null
  billing_zip?: string | null
  billing_city?: string | null
  billing_country?: string | null
  billing_vat_id?: string | null
  billing_onboarding_completed_at?: string | null
}

export function getUserDisplayName(
  profile: UserProfileLike | null | undefined,
  email: string
) {
  const firstName = profile?.first_name?.trim() ?? ''
  const lastName = profile?.last_name?.trim() ?? ''
  const fullName = [firstName, lastName].filter(Boolean).join(' ').trim()

  if (firstName) return firstName
  if (fullName) return fullName
  return email
}

export function getUserInitials(
  profile: UserProfileLike | null | undefined,
  email: string
) {
  const parts = [profile?.first_name, profile?.last_name]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value))

  if (parts.length > 0) {
    return parts
      .slice(0, 2)
      .map((value) => value[0]?.toUpperCase() ?? '')
      .join('')
  }

  return email.slice(0, 2).toUpperCase()
}

export function hasCompletedBaseProfile(profile: UserProfileLike | null | undefined) {
  return Boolean(profile?.first_name?.trim() && profile?.last_name?.trim())
}

export function hasRequiredBillingDetails(tenant: BillingDetailsLike | null | undefined) {
  return Boolean(
    tenant?.billing_company?.trim() &&
      tenant?.billing_street?.trim() &&
      tenant?.billing_zip?.trim() &&
      tenant?.billing_city?.trim() &&
      tenant?.billing_country?.trim()
  )
}

export function isOnboardingComplete(params: {
  role: 'admin' | 'member'
  profile: UserProfileLike | null | undefined
  tenant: BillingDetailsLike | null | undefined
  onboardingCompletedAt?: string | null
}) {
  if (!params.onboardingCompletedAt) {
    return false
  }

  if (!hasCompletedBaseProfile(params.profile)) {
    return false
  }

  if (params.role === 'member') {
    return true
  }

  return Boolean(
    hasRequiredBillingDetails(params.tenant) && params.tenant?.billing_onboarding_completed_at
  )
}
