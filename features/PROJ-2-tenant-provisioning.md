# PROJ-2: Tenant Provisioning

## Status: Planned
**Created:** 2026-03-26
**Last Updated:** 2026-03-26

## Dependencies
- Requires: PROJ-1 (Subdomain Routing) — Subdomain-Slug muss vor Erstellung validiert werden

## User Stories
- Als Owner möchte ich über ein internes Admin-Interface eine neue Agentur anlegen können, inkl. Name, Subdomain und initialen Admin-User.
- Als Owner möchte ich, dass die vergebene Subdomain sofort reserviert ist, damit keine zwei Agenturen dieselbe Subdomain erhalten.
- Als Owner möchte ich einen Tenant deaktivieren können, ohne seine Daten zu löschen.
- Als neuer Admin (Agentur-Inhaber) möchte ich nach der Tenant-Erstellung eine Einladungs-E-Mail mit meinen Login-Daten erhalten.
- Als Owner möchte ich alle existierenden Tenants mit Status (aktiv/inaktiv) in einer Übersicht sehen.

## Acceptance Criteria
- [ ] Owner kann Formular ausfüllen: Agentur-Name, Subdomain-Slug, Admin-E-Mail
- [ ] Subdomain-Slug wird auf Eindeutigkeit in der DB geprüft (Unique Constraint)
- [ ] Subdomain-Slug erlaubt nur Kleinbuchstaben, Ziffern und Bindestriche (Regex-Validation)
- [ ] Bei erfolgreicher Erstellung: Tenant-Datensatz in DB mit generierter `tenant_id`
- [ ] Initialer Admin-User wird angelegt und per E-Mail benachrichtigt (via PROJ-4)
- [ ] Tenant hat einen Status-Wert: `active` | `inactive`
- [ ] Owner kann Tenant-Status von `active` auf `inactive` setzen (und zurück)
- [ ] Inaktiver Tenant blockiert alle Logins für seine Mitglieder

## Edge Cases
- Subdomain bereits vergeben → Fehlermeldung mit klarem Hinweis, Formular bleibt offen
- Subdomain enthält verbotene Zeichen → Inline-Validierung vor dem Submit
- Reservierte Subdomains (z. B. `www`, `api`, `admin`, `app`) → Blockliste, wird abgelehnt
- Admin-E-Mail existiert bereits im System als User eines anderen Tenants → Fehler oder Warnung
- Tenant-Erstellung schlägt nach DB-Write fehl (E-Mail-Fehler) → Rollback, kein halbfertiger Tenant

## Technical Requirements
- Security: Tenant-Erstellung nur für authentifizierte Owner-Role erreichbar
- Atomarität: Tenant + Admin-User-Erstellung als eine Transaktion
- Validation: Subdomain max. 63 Zeichen (DNS-Limit)

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)
_To be added by /architecture_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
