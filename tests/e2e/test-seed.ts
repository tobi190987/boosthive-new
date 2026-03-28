import { APIRequestContext, expect } from '@playwright/test'
import { rootUrl } from './helpers'

const e2eToken = process.env.E2E_TEST_HELPER_TOKEN ?? 'local-e2e-token'

export interface SeedResult {
  tenant: {
    id: string
    slug: string
    name: string
  }
  capabilities: {
    subscriptionStatusAvailable: boolean
    archivedSoftDeleteAvailable: boolean
  }
  users: {
    owner: {
      email: string
      password: string
    }
    admin: {
      email: string
      password: string
    }
    member: {
      email: string
      password: string
    }
  }
}

export interface SeedTenantOptions {
  status?: 'active' | 'inactive'
  subscriptionStatus?: string | null
  billingOnboardingCompleted?: boolean
  archived?: boolean
}

export interface InvitationTokenResult {
  type: 'invitation'
  tenant: {
    id: string
    slug: string
    name: string
  }
  invitation: {
    id: string
    email: string
    role: 'admin' | 'member'
    token: string
  }
}

export interface PasswordResetTokenResult {
  type: 'password-reset'
  tenant: {
    id: string
    slug: string
    name: string
  }
  reset: {
    email: string
    user: 'admin' | 'member'
    token: string
  }
}

export async function seedTenant(
  request: APIRequestContext,
  slug: string,
  options: SeedTenantOptions = {}
) {
  const response = await request.post(rootUrl('/api/test/e2e/seed'), {
    headers: {
      'x-e2e-token': e2eToken,
      'content-type': 'application/json',
    },
    data: {
      slug,
      status: options.status,
      subscriptionStatus: options.subscriptionStatus,
      billingOnboardingCompleted: options.billingOnboardingCompleted,
      archived: options.archived,
    },
  })

  if (!response.ok()) {
    throw new Error(
      `seedTenant(${slug}) fehlgeschlagen mit ${response.status()}: ${await response.text()}`
    )
  }
  return (await response.json()) as SeedResult
}

export async function cleanupTenant(request: APIRequestContext, slug: string) {
  const response = await request.delete(rootUrl('/api/test/e2e/seed'), {
    headers: {
      'x-e2e-token': e2eToken,
      'content-type': 'application/json',
    },
    data: { slug },
  })

  if (!response.ok()) {
    throw new Error(
      `cleanupTenant(${slug}) fehlgeschlagen mit ${response.status()}: ${await response.text()}`
    )
  }
}

export async function createInvitationToken(
  request: APIRequestContext,
  slug: string,
  role: 'admin' | 'member' = 'member'
) {
  const response = await request.post(rootUrl('/api/test/e2e/tokens'), {
    headers: {
      'x-e2e-token': e2eToken,
      'content-type': 'application/json',
    },
    data: { type: 'invitation', slug, role },
  })

  expect(response.ok()).toBeTruthy()
  return (await response.json()) as InvitationTokenResult
}

export async function createPasswordResetToken(
  request: APIRequestContext,
  slug: string,
  user: 'admin' | 'member' = 'member'
) {
  const response = await request.post(rootUrl('/api/test/e2e/tokens'), {
    headers: {
      'x-e2e-token': e2eToken,
      'content-type': 'application/json',
    },
    data: { type: 'password-reset', slug, user },
  })

  expect(response.ok()).toBeTruthy()
  return (await response.json()) as PasswordResetTokenResult
}
