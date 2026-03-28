# PROJ-17: Owner Audit Log

## Status: Deployed
**Created:** 2026-03-28
**Last Updated:** 2026-03-28

## Dependencies
- Requires: PROJ-8 (Owner Super-Admin Dashboard)
- Requires: PROJ-13 (Tenant Detail Management)

## Overview
Owner-Aktionen sollen revisionssicher in der Datenbank gespeichert werden. Dazu gehören Tenant-Erstellung, Statuswechsel, Admin-Neuzuweisung, User-Löschung und spätere Billing-Eingriffe. Die Logs sollen sowohl für Debugging als auch für Support und Nachvollziehbarkeit nutzbar sein.

## User Stories
- Als Owner möchte ich sehen, wer wann welchen Tenant geändert hat.
- Als Support möchte ich einen Tenant-Fall nachvollziehen können, ohne Logfiles durchsuchen zu müssen.
- Als Entwickler möchte ich kritische Owner-Aktionen strukturiert speichern, statt nur `console`-Logs zu haben.

## Acceptance Criteria
- [x] Es gibt eine Tabelle `owner_audit_logs` für Owner-Ereignisse.
- [x] Folgende Events werden gespeichert: Tenant erstellt, pausiert, fortgesetzt, gelöscht, Admin gewechselt, User gelöscht.
- [x] Jeder Eintrag enthält mindestens: `actor_user_id`, `tenant_id` optional, `event_type`, `context`, `created_at`.
- [ ] Fehler- und Sicherheitsereignisse aus Owner-Aktionen können zusätzlich als Audit-Typ gespeichert werden.
- [x] Im Owner-Tenant-Detail gibt es eine erste Audit-Historie.
- [x] Die History ist nur für Owner sichtbar.

## QA Notes
- Ticketbezogene QA-Checkliste: `docs/qa/proj-17-owner-audit-log.md`
- Backend und Frontend sind umgesetzt, die Abnahme fokussiert jetzt auf Event-Vollständigkeit, Lesbarkeit der Historie und Schutz sensibler Felder im Audit-`context`.

## Edge Cases
- Tenant-bezogene Events ohne vorhandenen Tenant nach Hard-/Soft-Delete müssen weiter lesbar bleiben.
- Mehrere Owner-Aktionen kurz hintereinander müssen korrekt sortiert und idempotent speicherbar sein.
- Sensible Felder wie Passwörter oder Tokens dürfen nie im `context` landen.

## Technical Requirements
- Neue DB-Tabelle `owner_audit_logs`
- Zentrale Helper-Funktion zum Schreiben von Audit-Events
- Integration in Owner-API-Routen
- Erste Read-API oder Einbindung in bestehende Owner-Detailroute

## Implementation Notes
- Start mit minimalem Event-Schema und JSON-`context`
- Bestehende `src/lib/observability.ts` soll nicht ersetzt, sondern ergänzt werden
- Später erweiterbar für Tenant-Audit und Billing-Audit
