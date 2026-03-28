# PROJ-22: API Authorization Tests

## Status: Planned
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
