# PROJ-4: Transactional Email (Mailtrap)

## Status: In Review
**Created:** 2026-03-26
**Last Updated:** 2026-03-27

## Dependencies
- Requires: PROJ-2 (Tenant Provisioning) — Tenant-Daten für E-Mail-Personalisierung

## User Stories
- Als System möchte ich nach der Erstellung eines neuen Tenants automatisch eine Willkommens-E-Mail an den initialen Admin senden.
- Als User möchte ich eine E-Mail mit einem Passwort-Reset-Link erhalten, wenn ich "Passwort vergessen" klicke.
- Als Admin möchte ich eine personalisierte Einladungs-E-Mail an neue Mitarbeiter senden können.
- Als Owner möchte ich, dass alle E-Mails den Namen und das Branding des jeweiligen Tenants enthalten (nicht "BoostHive generic").
- Als System möchte ich fehlgeschlagene E-Mail-Sendungen loggen und nicht still ignorieren.

## Acceptance Criteria
- [ ] SMTP-Verbindung zu Mailtrap ist konfiguriert über Umgebungsvariablen (kein Hardcoding)
- [ ] E-Mail-Service-Modul mit Methoden: `sendWelcome`, `sendPasswordReset`, `sendInvitation`
- [ ] Alle E-Mails enthalten den Tenant-Namen im Absendernamen (z. B. "Agentur X via BoostHive")
- [ ] Alle E-Mails enthalten die korrekte Tenant-Subdomain in Links (z. B. `agentur-x.boost-hive.de/reset?token=...`)
- [ ] HTML-Templates für alle E-Mail-Typen (responsive, einfaches Design)
- [ ] Plaintext-Fallback für alle Templates
- [ ] Bei Fehler beim E-Mail-Versand: Error wird geloggt, kein Silent Fail
- [ ] E-Mail-Versand blockiert nicht den Haupt-Request (async)

## E-Mail-Typen

### 1. Willkommens-E-Mail (nach Tenant-Erstellung)
- Empfänger: Initialer Admin
- Inhalt: Agentur-Name, Login-URL, temporäres Passwort oder Set-Password-Link

### 2. Passwort-Reset-E-Mail
- Empfänger: User der "Passwort vergessen" angefordert hat
- Inhalt: Reset-Link mit Token (gültig 1 Stunde), Tenant-Name

### 3. Einladungs-E-Mail (Member-Einladung)
- Empfänger: Neu eingeladener Mitarbeiter
- Inhalt: Tenant-Name, Einladungs-Link zum Account-Setup, Name des einladenden Admins

## Edge Cases
- SMTP-Verbindung nicht erreichbar → Fehlermeldung an User, Retry-Logik (1 Versuch)
- Empfänger-E-Mail-Adresse ungültig (Bounce) → Loggen, kein Crash
- Mailtrap-Sandbox vs. Produktion: Klare Env-Variable zum Umschalten (`MAILTRAP_MODE=sandbox|live`)
- Doppeltes Senden derselben E-Mail → Idempotenzprüfung wo möglich (z. B. kein zweiter Reset-Link wenn erster noch aktiv)

## Technical Requirements
- Config: `MAILTRAP_HOST`, `MAILTRAP_PORT`, `MAILTRAP_USER`, `MAILTRAP_PASS` als Env-Variablen
- Security: Keine sensiblen Daten in E-Mail-Logs (Token nur gehasht loggen)
- Templates: HTML-Dateien in `src/emails/` oder inline mit React Email / nodemailer

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

### Überblick
Zentraler Email-Service als reines Backend-Modul. Kein eigenes UI. Wird von bestehenden und zukünftigen API-Routen aufgerufen.

### Komponentenstruktur

```
src/lib/email.ts            ← Zentraler Email-Service (sendWelcome, sendPasswordReset, sendInvitation)
src/emails/
  +-- welcome.ts            ← HTML + Plaintext Template: Willkommens-E-Mail
  +-- password-reset.ts     ← HTML + Plaintext Template: Passwort-Reset
  +-- invitation.ts         ← HTML + Plaintext Template: Mitarbeiter-Einladung

Aufgerufen von:
  src/app/api/owner/tenants/route.ts   ← löst sendWelcome aus (nach Tenant-Erstellung)
  src/app/api/auth/[password-reset]    ← löst sendPasswordReset aus (PROJ-5)
  src/app/api/[invitations]            ← löst sendInvitation aus (PROJ-7)
```

### Datenfluss

1. API-Route ruft Email-Service auf und übergibt Tenant-Daten (Name, Subdomain) + Empfänger
2. Email-Service baut HTML-Template mit Tenant-spezifischem Branding
3. E-Mail wird **asynchron** via HTTP POST an Mailtrap API gesendet (blockiert API-Response nicht)
4. Bei Fehler: Fehlermeldung wird geloggt — Hauptprozess läuft weiter (kein Silent Fail)

### Tenant-Branding in E-Mails
- Absendername: `"Agentur X via BoostHive"`
- Absender-Adresse: aus `MAILTRAP_FROM`
- Links zeigen auf Tenant-Subdomain: `agentur-x.boost-hive.de/...`

### Umgebungsvariablen (aktuell vorhanden)
- `MAILTRAP_API_TOKEN` — Authentifizierung gegen Mailtrap HTTP API
- `MAILTRAP_FROM` — Absender-Adresse

### API-Endpunkte (Mailtrap)
- Sandbox (Test): `https://sandbox.api.mailtrap.io/api/send/{inbox_id}`
- Live (Produktion): `https://send.api.mailtrap.io/api/send`

Umschaltung via separatem Env-Flag oder direkt über verschiedene Token.

### Tech-Entscheidungen

| Entscheidung | Gewählt | Warum |
|---|---|---|
| Versand-Methode | Mailtrap HTTP API | Nutzer hat bereits API-Token, kein SMTP nötig |
| HTTP-Client | Native `fetch` (Node 18+) | Keine zusätzliche Dependency, in Next.js bereits verfügbar |
| Templates | TypeScript-Funktionen in `src/emails/` | Einfach, kein extra Rendering-Framework für 3 Templates |
| Async-Versand | Fire-and-forget mit Error-Catch | E-Mail-Fehler sollen API-Response nicht blockieren |
| Idempotenz | Nur bei Password Reset | DB-Check ob Token noch aktiv (verhindert E-Mail-Spam) |

### Abhängigkeiten
Keine neuen npm-Packages erforderlich — native `fetch` reicht.

### Sicherheit
- Tokens in Logs nur als gehashten Wert (nie Klartext)
- SMTP-Credentials ausschließlich als Env-Variablen
- Keine PII in Fehler-Logs

## QA Test Results
### QA Run
- Date: 2026-03-27
- Scope: Re-run after bug fixes, code review, API-flow review, build verification
- Constraints: Kein echter Browser-/Mailtrap-End-to-End-Test in dieser Session; Bewertung basiert auf Codepfaden, Specs und lokalem Build

### Acceptance Criteria Review
- PASS: Mailtrap-Konfiguration erfolgt ueber Umgebungsvariablen, kein Hardcoding im Code (`MAILTRAP_*` in `src/lib/email.ts`)
- PASS: E-Mail-Service-Modul mit `sendWelcome`, `sendPasswordReset`, `sendInvitation` ist vorhanden
- PASS: Absendername wird tenant-spezifisch gesetzt (`${tenantName} via BoostHive`)
- PASS: Alle E-Mails enthalten tenant-spezifische Links; Welcome-Mails laufen ueber tenant-direkte `email-link`-URLs, Reset-Mails ueber tenant-spezifische Reset-URLs
- PASS: HTML-Templates fuer Welcome, Password Reset und Invitation sind vorhanden
- PASS: Plaintext-Fallback ist fuer alle drei E-Mail-Typen vorhanden
- PASS: Password-Reset-Mails werden nach der Response ueber `after()` im Hintergrund versendet und blockieren den Haupt-Request nicht
- PASS: Fehler-Logs enthalten keine Klartext-E-Mail-Adressen mehr; Empfaenger werden nur gehasht protokolliert

### Findings
- No blocking defects found in the current implementation.

### Additional Notes
- Residual risk: Die in den Edge Cases erwaehnte Retry-Logik fuer temporaere Mailtrap-Fehler ist weiterhin nicht explizit implementiert. Das ist fuer diesen QA-Re-Run kein Release-Blocker, sollte aber vor breiterem Produktionsverkehr bewusst entschieden werden.
- `npm run build` war erfolgreich.
- `npm run lint` ist aktuell projektweit defekt und konnte fuer diese QA nicht als Signal genutzt werden (`next lint` wird mit falschem Projektpfad aufgerufen).

### Production Readiness
- Decision: READY
- Reason: Keine Critical- oder High-Bugs offen; verbleibend nur Testing-Gap beim echten Mailtrap-E2E und die separate Lint-Fehlkonfiguration ausserhalb des Features

## Deployment
_To be added by /deploy_
