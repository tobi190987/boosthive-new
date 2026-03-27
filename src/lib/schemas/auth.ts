import { z } from 'zod'

/**
 * Login-Schema: Validiert E-Mail und Passwort fuer Tenant- und Owner-Login.
 */
export const LoginSchema = z.object({
  email: z
    .string()
    .min(1, 'E-Mail-Adresse ist erforderlich.')
    .email('Bitte eine gueltige E-Mail-Adresse eingeben.'),
  password: z
    .string()
    .min(1, 'Passwort ist erforderlich.')
    .min(6, 'Passwort muss mindestens 6 Zeichen lang sein.'),
})

export type LoginInput = z.infer<typeof LoginSchema>
