# PROJ-7: Member Invitation (Admin)

## Status: In Review
**Created:** 2026-03-26
**Last Updated:** 2026-03-26

## Dependencies
- Requires: PROJ-4 (Transactional Email) — Einladungs-E-Mail versenden
- Requires: PROJ-6 (Role-Based Access Control) — Nur Admins dürfen einladen

## User Stories
- Als Admin möchte ich neue Mitarbeiter per E-Mail in meinen Tenant einladen können.
- Als eingeladener Mitarbeiter möchte ich eine E-Mail mit einem Einladungs-Link erhalten und darüber mein Passwort setzen.
- Als Admin möchte ich ausstehende Einladungen sehen und bei Bedarf erneut versenden können.
- Als Admin möchte ich eine Einladung zurückziehen können, bevor sie angenommen wurde.
- Als Admin möchte ich beim Einladen die Rolle des neuen Members festlegen (Admin oder Member).

## Acceptance Criteria
- [ ] Admin-Interface: Formular mit E-Mail-Adresse und Rollenauswahl (Admin/Member)
- [ ] Einladungs-Token: kryptografisch zufällig, einmalig, 7 Tage gültig
- [ ] Einladungs-E-Mail enthält personalisierten Link: `agentur-x.boost-hive.de/accept-invite?token=...`
- [ ] Einladungs-Seite: Formular für Name, Passwort und Bestätigung
- [ ] Nach Annahme: User-Account wird erstellt, Token invalidiert, User eingeloggt
- [ ] Admin-Übersicht zeigt: Name/E-Mail, Rolle, Status (Ausstehend/Angenommen), Einladungsdatum
- [ ] "Erneut senden"-Button für ausstehende Einladungen (generiert neuen Token)
- [ ] "Einladung zurückziehen"-Button deaktiviert Token sofort
- [ ] E-Mail-Adresse kann nicht zweimal in denselben Tenant eingeladen werden (wenn Account bereits aktiv)

## Edge Cases
- Eingeladene E-Mail existiert bereits als Member in demselben Tenant → Fehler "User bereits Mitglied"
- Eingeladene E-Mail existiert in einem anderen Tenant → Kein Fehler (separate Accounts möglich)
- Einladungs-Link abgelaufen (nach 7 Tagen) → "Einladung abgelaufen" mit Hinweis an Admin
- Admin wurde selbst deaktiviert, bevor eingeladener User Link aufruft → Einladung trotzdem gültig (Token-basiert)
- Mehrfacher Klick auf "Accept"-Button → Idempotent, zweiter Klick wird ignoriert

## Technical Requirements
- Security: Token wird gehasht in DB gespeichert
- Security: Einladungs-Seite erfordert keinen vorherigen Login (öffentlich erreichbar via Token)
- UX: Nach Token-Validierung wird Tenant-Name auf der Einladungsseite angezeigt

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

### Überblick
Zwei Bereiche: Admin-Verwaltung (Einladungen versenden/widerrufen) + öffentliche Annahme-Seite (Token-basiert, kein Login nötig).

### Komponentenstruktur

```
/settings/team  (nur Admin)
+-- TeamPage
    +-- InviteButton
    |   +-- InviteDialog (Modal)
    |       +-- InviteForm (E-Mail + Rollen-Auswahl)
    +-- InvitationTable
        +-- InvitationRow (E-Mail, Rolle, Status-Badge, Datum, Aktionen)
            +-- "Erneut senden"-Button (nur bei Ausstehend)
            +-- "Widerrufen"-Button + Bestätigungs-Dialog

/accept-invite?token=...  (öffentlich)
+-- AcceptInvitePage
    +-- TenantBanner (Tenant-Name aus Token)
    +-- AcceptInviteForm (Anzeigename, Passwort, Bestätigung)
    +-- ErrorState (abgelaufen / widerrufen / bereits angenommen)
```

### Datenmodell

**Neue Tabelle: `tenant_invitations`**

| Feld | Beschreibung |
|---|---|
| id | Eindeutige ID |
| tenant_id | Welcher Tenant |
| email | E-Mail der eingeladenen Person |
| role | `admin` oder `member` |
| token_hash | SHA-256-Hash des Tokens (nie Klartext) |
| invited_by | User-ID des einladenden Admins |
| created_at | Einladungszeitpunkt |
| expires_at | created_at + 7 Tage |
| accepted_at | Annahmezeitpunkt (null = ausstehend) |
| revoked_at | Widerrufszeitpunkt (null = aktiv) |

Token-Sicherheit: 32 zufällige Bytes als Klartext in der E-Mail-URL, SHA-256-Hash in der DB gespeichert.

### API-Routen

| Route | Methode | Wer? | Zweck |
|---|---|---|---|
| `/api/tenant/invitations` | POST | Admin | Einladung erstellen + E-Mail senden |
| `/api/tenant/invitations` | GET | Admin | Alle Einladungen auflisten |
| `/api/tenant/invitations/[id]/resend` | POST | Admin | Neuen Token + E-Mail erneut senden |
| `/api/tenant/invitations/[id]` | DELETE | Admin | Einladung widerrufen |
| `/api/invitations/validate` | GET | Öffentlich | Token prüfen, Tenant-Name zurückgeben |
| `/api/invitations/accept` | POST | Öffentlich | Account erstellen, Token invalidieren, einloggen |

Admin-Routen gesichert via `requireTenantAdmin()` aus PROJ-6.

### Neue Dateien

| Datei | Zweck |
|---|---|
| `src/app/settings/team/page.tsx` | Admin-Seite: Übersicht + Einladen-Button |
| `src/components/invite-dialog.tsx` | Modal mit Einladungsformular |
| `src/components/invitation-table.tsx` | Tabelle mit Status + Aktionsbuttons |
| `src/app/accept-invite/page.tsx` | Öffentliche Annahme-Seite |
| `src/components/accept-invite-form.tsx` | Formular: Name + Passwort setzen |
| `src/app/api/tenant/invitations/route.ts` | POST + GET |
| `src/app/api/tenant/invitations/[id]/route.ts` | DELETE |
| `src/app/api/tenant/invitations/[id]/resend/route.ts` | POST |
| `src/app/api/invitations/validate/route.ts` | GET |
| `src/app/api/invitations/accept/route.ts` | POST |
| `supabase/migrations/006_invitations.sql` | Tabelle + RLS |

### Keine neuen Pakete nötig
`crypto` (Node.js eingebaut), Nodemailer/Mailtrap (PROJ-4), Supabase (PROJ-3), `requireTenantAdmin()` (PROJ-6), alle UI-Komponenten bereits in shadcn/ui vorhanden.

## QA Test Results

### Review Date: 2026-03-27
### Reviewer: Codex QA
### Status: READY

### Findings
- Keine blockierenden Findings im QA-Re-Run.

### Verification
- `npm run build` erfolgreich
- Code Review gegen Acceptance Criteria und Edge Cases durchgefuehrt
- Accept-Flow nutzt jetzt Claim-Logik fuer idempotente Token-Verarbeitung
- Create/Resend behalten bestehende funktionierende Links bis nach erfolgreichem Mailversand
- Kein echter End-to-End-Test mit Supabase/Mailtrap in dieser Session

## Deployment
_To be added by /deploy_
