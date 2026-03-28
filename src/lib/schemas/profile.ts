import { z } from 'zod'

const trimmedRequired = (label: string) =>
  z
    .string()
    .trim()
    .min(1, `${label} ist ein Pflichtfeld.`)
    .max(120, `${label} darf maximal 120 Zeichen lang sein.`)

const trimmedOptional = (label: string, max: number) =>
  z.string().trim().max(max, `${label} darf maximal ${max} Zeichen lang sein.`)

export const BaseProfileSchema = z.object({
  first_name: trimmedRequired('Vorname'),
  last_name: trimmedRequired('Nachname'),
})

export const BillingAddressSchema = z.object({
  billing_company: trimmedRequired('Firma'),
  billing_street: trimmedRequired('Straße'),
  billing_zip: trimmedRequired('PLZ'),
  billing_city: trimmedRequired('Stadt'),
  billing_country: trimmedRequired('Land'),
  billing_vat_id: trimmedOptional('USt-IdNr.', 40),
})

export const ProfileUpdateSchema = BaseProfileSchema.extend({
  billing_company: trimmedOptional('Firma', 120).optional(),
  billing_street: trimmedOptional('Straße', 120).optional(),
  billing_zip: trimmedOptional('PLZ', 20).optional(),
  billing_city: trimmedOptional('Stadt', 80).optional(),
  billing_country: trimmedOptional('Land', 80).optional(),
  billing_vat_id: trimmedOptional('USt-IdNr.', 40).optional(),
  complete_onboarding: z.boolean().optional().default(false),
})

export type ProfileUpdateInput = z.infer<typeof ProfileUpdateSchema>
