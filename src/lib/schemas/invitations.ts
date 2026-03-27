import { z } from 'zod'

export const InvitationRoleSchema = z.enum(['admin', 'member'])

export const CreateInvitationSchema = z.object({
  email: z.email('Bitte gib eine gültige E-Mail-Adresse ein.'),
  role: InvitationRoleSchema,
})

export const AcceptInvitationSchema = z
  .object({
    token: z.string().min(1, 'Einladungstoken fehlt.'),
    name: z.string().min(2, 'Bitte gib einen Anzeigenamen mit mindestens 2 Zeichen ein.'),
    password: z.string().min(8, 'Passwort muss mindestens 8 Zeichen lang sein.'),
  })

export const AcceptInvitationFormSchema = AcceptInvitationSchema.omit({
  token: true,
})

export type InvitationRole = z.infer<typeof InvitationRoleSchema>
export type CreateInvitationInput = z.infer<typeof CreateInvitationSchema>
export type AcceptInvitationInput = z.infer<typeof AcceptInvitationSchema>
export type AcceptInvitationFormInput = z.infer<typeof AcceptInvitationFormSchema>
