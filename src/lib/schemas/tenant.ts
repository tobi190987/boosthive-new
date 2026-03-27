import { z } from 'zod'

/**
 * Reservierte Subdomains, die nicht als Tenant-Slug vergeben werden duerfen.
 */
export const RESERVED_SLUGS = ['www', 'api', 'admin', 'app', 'owner'] as const

/**
 * Regex fuer gueltige Subdomain-Slugs:
 * - Nur Kleinbuchstaben, Ziffern und Bindestriche
 * - Muss mit Buchstabe/Ziffer beginnen und enden
 * - 3-63 Zeichen (DNS-Limit)
 */
const SLUG_REGEX = /^[a-z0-9]([a-z0-9-]{1,61}[a-z0-9])?$/

export const CreateTenantSchema = z.object({
  name: z
    .string()
    .min(2, 'Agentur-Name muss mindestens 2 Zeichen lang sein.')
    .max(100, 'Agentur-Name darf maximal 100 Zeichen lang sein.'),
  slug: z
    .string()
    .min(3, 'Subdomain muss mindestens 3 Zeichen lang sein.')
    .max(63, 'Subdomain darf maximal 63 Zeichen lang sein (DNS-Limit).')
    .regex(
      SLUG_REGEX,
      'Subdomain darf nur Kleinbuchstaben, Ziffern und Bindestriche enthalten und muss mit einem Buchstaben oder einer Ziffer beginnen und enden.'
    )
    .refine(
      (slug) => !RESERVED_SLUGS.includes(slug as (typeof RESERVED_SLUGS)[number]),
      'Diese Subdomain ist reserviert und kann nicht verwendet werden.'
    ),
  adminEmail: z
    .string()
    .email('Bitte eine gueltige E-Mail-Adresse eingeben.'),
})

export type CreateTenantInput = z.infer<typeof CreateTenantSchema>

export const UpdateTenantStatusSchema = z.object({
  status: z.enum(['active', 'inactive']).refine((v) => v === 'active' || v === 'inactive', {
    message: 'Status muss "active" oder "inactive" sein.',
  }),
})

export type UpdateTenantStatusInput = z.infer<typeof UpdateTenantStatusSchema>
