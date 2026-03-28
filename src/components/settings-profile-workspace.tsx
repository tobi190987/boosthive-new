'use client'

import type { ComponentProps } from 'react'
import { TenantProfileWorkspace } from '@/components/tenant-profile-workspace'

type SettingsProfileWorkspaceProps = ComponentProps<typeof TenantProfileWorkspace>

export function SettingsProfileWorkspace(props: SettingsProfileWorkspaceProps) {
  return <TenantProfileWorkspace {...props} />
}
