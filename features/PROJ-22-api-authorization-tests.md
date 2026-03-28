# PROJ-22: API Authorization Tests

## Status: In Progress
**Created:** 2026-03-28
**Last Updated:** 2026-03-28

## Dependencies
- Requires: PROJ-3 (User Authentication)
- Requires: PROJ-6 (Role-Based Access Control)
- Requires: PROJ-17 (Owner Audit Log) optional

## Overview
Zusätzlich zu Playwright sollen gezielte API-Tests für Auth-, Rollen- und Tenant-Isolation entstehen. Ziel ist schnellere und präzisere Regressionserkennung bei Guards und Berechtigungen.

## User Stories
- Als Entwickler möchte ich Guard-Fehler ohne kompletten Browserlauf erkennen.
- Als QA möchte ich kritische Security-Fälle gezielt und reproduzierbar testen.
- Als Team möchte ich Berechtigungslogik robuster absichern.

## Acceptance Criteria
- [ ] Es gibt API-nahe Tests für Owner-, Admin- und Member-Berechtigungen.
- [ ] Cross-Tenant-Zugriffe werden negativ getestet.
- [ ] Invite-, Reset- und Login-Routen haben Autorisierungs- und Status-Tests.
- [ ] Pausierte oder gesperrte Tenants werden API-seitig abgedeckt.
- [ ] Die Tests laufen unabhängig von den großen E2E-Flows.

## Edge Cases
- Fehlender Tenant-Header
- Falscher Tenant-Header
- Member gegen Admin-only API
- Owner gegen Tenant-API ohne Tenant-Kontext
- Inaktive Membership bei gültiger Session

## Technical Requirements
- Test-Setup für API- oder Integrations-Tests
- Wiederverwendbare Seeds / Fixtures
- Fokus auf Guards, Status und Response-Codes

## Implementation Notes
- Kein Ersatz für Playwright, sondern Ergänzung
- Erst die sicherheitskritischen Routen abdecken, dann schrittweise erweitern

## Tech Design (Solution Architect)

### Ansatz: Playwright API Testing (kein neues Test-Framework)

Playwright ist bereits installiert und enthält API-Testing-Support (`request`-Fixture ohne Browser). Kein Vitest/Jest nötig — nutzt bestehende Seed-Infrastruktur weiter.

### Test-Struktur

```
tests/
+-- e2e/                           (bestehend — Browser-Tests, unverändert)
+-- api/                           (neu — API-only, kein Browser)
    +-- auth/
    |   +-- login.spec.ts              Login-Routen: Status-Codes, Rate Limits
    |   +-- owner-login.spec.ts        Owner-Login: Strengere Limits, Fehlerfälle
    |   +-- password-reset.spec.ts     Reset-Request: Limits, falsche Tokens
    +-- guards/
    |   +-- owner-routes.spec.ts       Owner-API ohne Owner-Session → 403
    |   +-- admin-routes.spec.ts       Admin-only ohne Admin-Rolle → 403
    |   +-- member-routes.spec.ts      Member gegen Admin-only → 403
    |   +-- cross-tenant.spec.ts       Admin Tenant A gegen Tenant B → 403
    +-- tenant-status/
    |   +-- paused-tenant.spec.ts      Alle Tenant-Routen bei pausiertem Tenant → 403
    +-- helpers/
        +-- api-client.ts              Wiederverwendbare HTTP-Hilfsfunktionen
        +-- fixtures.ts                Auth-Sessions, Seed-Daten
```

### Test-Fixtures / Datenmodell

```
Fixtures pro Test-Run:
- Owner Session           (einmalig gesetzt, wiederverwendet)
- Tenant A: Admin-Session + Member-Session
- Tenant B: Admin-Session (für Cross-Tenant-Tests)
- Paused Tenant: Admin-Session + Tenant im Status "paused"

Seed-Daten: Bestehende /api/test/e2e/seed Route wird wiederverwendet
Sessions:   Playwright requestContext mit gesetztem Cookie/Bearer
```

### Playwright-Konfiguration (Erweiterung)

```
playwright.config.ts erhält ein zweites Projekt:

Projekt "api-tests":
- Kein Browser (request-only)
- Läuft schnell (< 30 Sek für alle Guards)
- testDir: ./tests/api
- Eigener NPM-Script: test:api

Projekt "chromium" (bestehend):
- Unverändert
```

### Abgedeckte Test-Kategorien

| Kategorie | Beispiel |
|---|---|
| Fehlender Tenant-Header | `GET /api/tenant/members` ohne Header → 400/403 |
| Falscher Tenant-Header | Admin Tenant A mit Tenant-B-ID → 403 |
| Rolle zu niedrig | Member ruft Admin-Route auf → 403 |
| Owner gegen Tenant-API | Owner ohne Tenant-Kontext → 403 |
| Inaktive Membership | User mit `status=inactive` → 403 |
| Pausierter Tenant | Alle Tenant-Routen bei `status=paused` → 403 |
| Ungültiger Reset-Token | Falscher Token → 400/401 |

### Neue Dependencies

Keine. Playwright ist bereits installiert (`@playwright/test`).
