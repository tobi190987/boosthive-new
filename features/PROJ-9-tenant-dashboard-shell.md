# PROJ-9: Tenant Dashboard Shell

## Status: Planned
**Created:** 2026-03-26
**Last Updated:** 2026-03-26

## Dependencies
- Requires: PROJ-3 (User Authentication) — Nur eingeloggte User sehen das Dashboard
- Requires: PROJ-6 (Role-Based Access Control) — Navigation abhängig von Rolle

## User Stories
- Als eingeloggter Member möchte ich nach dem Login ein strukturiertes Dashboard sehen, das mir die verfügbaren Tools meines Tenants zeigt.
- Als Admin möchte ich im Dashboard zusätzliche Verwaltungsbereiche (User-Management, Einstellungen) sehen.
- Als Member möchte ich die Navigation meines Tenants klar strukturiert und intuitiv bedienbar finden.
- Als User möchte ich im Dashboard meinen Namen, meine Rolle und den Tenant-Namen sehen.
- Als User möchte ich mich direkt aus dem Dashboard ausloggen können.

## Acceptance Criteria
- [ ] Layout: Sidebar-Navigation + Hauptbereich + Header mit User-Info
- [ ] Header zeigt: Tenant-Name, eingeloggter Username, Rolle, Logout-Button
- [ ] Sidebar-Navigation für Member: Dashboard-Übersicht, Tool-Bereich (Platzhalter für PROJ-10+)
- [ ] Sidebar-Navigation für Admin: + User-Management, Einstellungen
- [ ] Dashboard-Übersicht: Willkommensseite mit Tenant-Name und verfügbaren Modulen
- [ ] Responsive: Sidebar kollapsiert auf mobilen Geräten zu einem Hamburger-Menu
- [ ] Aktive Navigation-Item ist visuell hervorgehoben
- [ ] Leere Tool-Bereiche zeigen "Demnächst verfügbar"-Platzhalter

## Edge Cases
- Nicht-eingeloggter User ruft Dashboard auf → Redirect auf Login
- Admin-Menüpunkt für Member direkt via URL → 403-Response
- Tenant deaktiviert während User eingeloggt → Nächste Anfrage logout + Info-Meldung

## Technical Requirements
- Accessibility: Keyboard-navigierbare Sidebar
- Performance: Layout lädt ohne Flash of Unauthenticated Content (FOUC)

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)
_To be added by /architecture_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
