# PROJ-3: User Authentication

## Status: Planned
**Created:** 2026-03-26
**Last Updated:** 2026-03-26

## Dependencies
- Requires: PROJ-1 (Subdomain Routing) — Login-Page muss Tenant-Kontext aus Subdomain kennen
- Requires: PROJ-2 (Tenant Provisioning) — User-Accounts existieren im jeweiligen Tenant

## User Stories
- Als Member möchte ich mich auf der Login-Seite meines Tenants (`agentur-x.boost-hive.de/login`) mit E-Mail und Passwort anmelden.
- Als eingeloggter User möchte ich mich sicher ausloggen können, sodass meine Session vollständig gelöscht wird.
- Als System möchte ich sicherstellen, dass ein Login auf Tenant A niemals auf Daten von Tenant B zugreifen kann.
- Als Owner möchte ich mich über eine separate Root-Domain-Route einloggen, die keinem Tenant gehört.
- Als Member möchte ich nach erfolgreichem Login automatisch auf das Dashboard meines Tenants weitergeleitet werden.

## Acceptance Criteria
- [ ] Login-Formular auf `[subdomain].boost-hive.de/login` mit E-Mail und Passwort
- [ ] Validierung: Beide Felder erforderlich, E-Mail-Format geprüft
- [ ] Bei falschen Credentials: Generische Fehlermeldung (kein Hinweis ob E-Mail oder Passwort falsch)
- [ ] Bei erfolgreichem Login: Session wird erstellt mit `tenant_id` und `user_id` und `role`
- [ ] Session-Cookie ist an die Subdomain gebunden (kein Cross-Subdomain-Zugriff)
- [ ] Nach Login: Redirect auf `[subdomain].boost-hive.de/dashboard`
- [ ] Logout: Session wird serverseitig invalidiert und Cookie gelöscht
- [ ] Nach Logout: Redirect auf `[subdomain].boost-hive.de/login`
- [ ] Geschützte Routen leiten nicht-authentifizierte User auf `/login` um
- [ ] Owner-Login über `boost-hive.de/owner/login` (separate Route)

## Edge Cases
- User versucht Login auf falschem Tenant (E-Mail existiert, aber in anderem Tenant) → Fehlermeldung "Ungültige Zugangsdaten" (keine Info über andere Tenants)
- Session läuft ab während User aktiv ist → Graceful Redirect auf Login mit Hinweis
- Mehrfach-Login mit gleichen Credentials von verschiedenen Geräten → Alle Sessions sind gültig (kein Single-Session-Lock)
- Direkt-URL-Zugriff auf geschützte Seite ohne Login → Redirect auf Login, nach Login zurück zur ursprünglichen URL
- User-Account deaktiviert (durch Admin) → Fehlermeldung "Konto deaktiviert, wende dich an deinen Admin"

## Technical Requirements
- Security: Passwörter werden nie im Klartext gespeichert (Supabase Auth handles this)
- Security: CSRF-Schutz für Login-Formular
- Security: Rate-Limiting auf Login-Endpoint (max. 5 Versuche/Minute pro IP)
- Performance: Login-Response < 500ms

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)
_To be added by /architecture_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
