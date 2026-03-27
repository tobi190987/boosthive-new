import { z } from 'zod'

/**
 * Reservierte Subdomains, die nicht als Tenant-Slug vergeben werden duerfen.
 */
export const RESERVED_SLUGS = ['www', 'api', 'admin', 'app', 'owner'] as const

/**
 * Regex für gültige Subdomain-Slugs:
 * - Nur Kleinbuchstaben, Ziffern und Bindestriche
 * - Muss mit Buchstabe/Ziffer beginnen und enden
 * - 3-63 Zeichen (DNS-Limit)
 */
const SLUG_REGEX = /^[a-z0-9]([a-z0-9-]{1,61}[a-z0-9])?$/

export const TenantNameSchema = z
  .string()
  .min(2, 'Agentur-Name muss mindestens 2 Zeichen lang sein.')
  .max(100, 'Agentur-Name darf maximal 100 Zeichen lang sein.')

export const TenantSlugSchema = z
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
  )

const OptionalTrimmedString = (max: number, message: string) =>
  z.string().trim().max(max, message)

export const CreateTenantSchema = z.object({
  name: TenantNameSchema,
  slug: TenantSlugSchema,
  adminEmail: z
    .string()
    .email('Bitte eine gültige E-Mail-Adresse eingeben.'),
})

export type CreateTenantInput = z.infer<typeof CreateTenantSchema>

export const UpdateTenantStatusSchema = z.object({
  status: z.enum(['active', 'inactive']).refine((v) => v === 'active' || v === 'inactive', {
    message: 'Status muss "active" oder "inactive" sein.',
  }),
})

export type UpdateTenantStatusInput = z.infer<typeof UpdateTenantStatusSchema>

export const UpdateTenantBasicsSchema = z.object({
  type: z.literal('basics'),
  name: TenantNameSchema,
  slug: TenantSlugSchema,
})

export type UpdateTenantBasicsInput = z.infer<typeof UpdateTenantBasicsSchema>

export const UpdateTenantBillingSchema = z
  .object({
    type: z.literal('billing'),
    billing_company: OptionalTrimmedString(
      120,
      'Firmenname darf maximal 120 Zeichen lang sein.'
    ),
    billing_street: OptionalTrimmedString(
      120,
      'Strasse darf maximal 120 Zeichen lang sein.'
    ),
    billing_zip: OptionalTrimmedString(20, 'PLZ darf maximal 20 Zeichen lang sein.'),
    billing_city: OptionalTrimmedString(80, 'Stadt darf maximal 80 Zeichen lang sein.'),
    billing_country: OptionalTrimmedString(80, 'Land darf maximal 80 Zeichen lang sein.'),
    billing_vat_id: OptionalTrimmedString(
      40,
      'USt-IdNr. darf maximal 40 Zeichen lang sein.'
    ),
  })
  .superRefine((value, ctx) => {
    const hasExtraValue = [
      value.billing_street,
      value.billing_zip,
      value.billing_city,
      value.billing_country,
      value.billing_vat_id,
    ].some((field) => field.length > 0)

    if (hasExtraValue && value.billing_company.length === 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['billing_company'],
        message: 'Bitte zuerst einen Firmennamen angeben.',
      })
    }
  })

export type UpdateTenantBillingInput = z.infer<typeof UpdateTenantBillingSchema>

export const UpdateTenantContactSchema = z.object({
  type: z.literal('contact'),
  contact_person: OptionalTrimmedString(
    120,
    'Ansprechpartner darf maximal 120 Zeichen lang sein.'
  ),
  contact_phone: OptionalTrimmedString(40, 'Telefon darf maximal 40 Zeichen lang sein.'),
  contact_website: OptionalTrimmedString(160, 'Website darf maximal 160 Zeichen lang sein.')
    .refine((value) => value.length === 0 || /^https?:\/\//.test(value), {
      message: 'Bitte eine Website mit http:// oder https:// angeben.',
    }),
})

export type UpdateTenantContactInput = z.infer<typeof UpdateTenantContactSchema>

export const AssignTenantAdminSchema = z.object({
  email: z.string().trim().email('Bitte eine gültige E-Mail-Adresse eingeben.'),
})

export type AssignTenantAdminInput = z.infer<typeof AssignTenantAdminSchema>
