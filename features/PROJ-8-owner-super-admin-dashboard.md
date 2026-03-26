# PROJ-8: Owner Super-Admin Dashboard

## Status: Planned
**Created:** 2026-03-26
**Last Updated:** 2026-03-26

## Dependencies
- Requires: PROJ-2 (Tenant Provisioning) — Tenant-Liste anzeigen
- Requires: PROJ-6 (Role-Based Access Control) — Owner-only Zugriff

## User Stories
- Als Owner möchte ich eine Übersicht aller Tenants mit Name, Subdomain, Status und Mitgliederzahl sehen.
- Als Owner möchte ich direkt aus dem Dashboard einen neuen Tenant anlegen können.
- Als Owner möchte ich einen Tenant deaktivieren oder reaktivieren können.
- Als Owner möchte ich in einen beliebigen Tenant "hineinschauen" können (Read-only-Ansicht).
- Als Owner möchte ich systemweite Metriken sehen: Anzahl Tenants, aktive User, E-Mails versandt.

## Acceptance Criteria
- [ ] Dashboard erreichbar unter `boost-hive.de/owner/dashboard` (Root-Domain, kein Tenant)
- [ ] Tabelle aller Tenants: Name, Subdomain, Status (aktiv/inaktiv), Member-Count, Erstellt-Datum
- [ ] Filter: Aktiv / Inaktiv / Alle
- [ ] Suche nach Tenant-Name oder Subdomain
- [ ] "Neuer Tenant"-Button öffnet Provisioning-Flow (PROJ-2)
- [ ] "Deaktivieren/Aktivieren"-Toggle pro Tenant mit Bestätigungsdialog
- [ ] Metriken-Karten: Gesamt-Tenants, Aktive Tenants, Gesamt-User
- [ ] Alle Owner-Routen erfordern Owner-Role (403 für alle anderen)

## Edge Cases
- Keine Tenants vorhanden → Empty State mit "Ersten Tenant anlegen"-CTA
- Tenant-Deaktivierung mit aktiven Sessions → Bestehende Sessions werden invalidiert
- Owner versucht eigenen Account zu löschen → Nicht erlaubt

## Technical Requirements
- Security: Owner-Dashboard niemals über eine Tenant-Subdomain erreichbar
- Performance: Tenant-Liste paginiert (max. 50 pro Seite)

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)
_To be added by /architecture_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
