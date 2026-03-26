# PROJ-4: Transactional Email (Mailtrap)

## Status: Planned
**Created:** 2026-03-26
**Last Updated:** 2026-03-26

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
_To be added by /architecture_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
