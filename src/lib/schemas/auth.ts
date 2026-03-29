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
    message: 'Die Passwörter müssen übereinstimmen.',
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

export const EmailChangeSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, 'E-Mail-Adresse ist erforderlich.')
    .email('Bitte eine gültige E-Mail-Adresse eingeben.'),
  current_password: z
    .string()
    .min(1, 'Aktuelles Passwort ist erforderlich.')
    .min(6, 'Aktuelles Passwort ist ungültig.'),
})

export type EmailChangeInput = z.infer<typeof EmailChangeSchema>

export const PasswordChangeSchema = z
  .object({
    current_password: z
      .string()
      .min(1, 'Aktuelles Passwort ist erforderlich.')
      .min(6, 'Aktuelles Passwort ist ungültig.'),
    new_password: z
      .string()
      .min(8, 'Passwort muss mindestens 8 Zeichen lang sein.'),
    confirm_password: z
      .string()
      .min(1, 'Bitte bestätige dein neues Passwort.'),
  })
  .refine((data) => data.new_password === data.confirm_password, {
    message: 'Die Passwörter müssen übereinstimmen.',
    path: ['confirm_password'],
  })

export type PasswordChangeInput = z.infer<typeof PasswordChangeSchema>

export const AccountUpdateSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('email'),
  }).merge(EmailChangeSchema),
  z.object({
    type: z.literal('password'),
  }).merge(PasswordChangeSchema),
])

export type AccountUpdateInput = z.infer<typeof AccountUpdateSchema>
