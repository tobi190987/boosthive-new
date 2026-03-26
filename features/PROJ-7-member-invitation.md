# PROJ-7: Member Invitation (Admin)

## Status: Planned
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
_To be added by /architecture_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
