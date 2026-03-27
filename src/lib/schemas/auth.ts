import { z } from 'zod'

/**
 * Login-Schema: Validiert E-Mail und Passwort für Tenant- und Owner-Login.
 */
export const LoginSchema = z.object({
  email: z
    .string()
    .min(1, 'E-Mail-Adresse ist erforderlich.')
    .email('Bitte eine gültige E-Mail-Adresse eingeben.'),
  password: z
    .string()
    .min(1, 'Passwort ist erforderlich.')
    .min(6, 'Passwort muss mindestens 6 Zeichen lang sein.'),
})

export type LoginInput = z.infer<typeof LoginSchema>

export const ForgotPasswordSchema = z.object({
  email: z
    .string()
    .min(1, 'E-Mail-Adresse ist erforderlich.')
    .email('Bitte eine gültige E-Mail-Adresse eingeben.'),
})

export type ForgotPasswordInput = z.infer<typeof ForgotPasswordSchema>

export const ResetPasswordSchema = z
  .object({
    password: z
      .string()
      .min(8, 'Passwort muss mindestens 8 Zeichen lang sein.'),
    confirmPassword: z
      .string()
      .min(1, 'Bitte bestätige dein neues Passwort.'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Die Passwörter muessen übereinstimmen.',
    path: ['confirmPassword'],
  })

export type ResetPasswordInput = z.infer<typeof ResetPasswordSchema>

export const ResetPasswordConfirmSchema = ResetPasswordSchema.extend({
  token: z
    .string()
    .min(1, 'Token ist erforderlich.')
    .min(32, 'Token ist ungültig.'),
})

export type ResetPasswordConfirmInput = z.infer<typeof ResetPasswordConfirmSchema>
