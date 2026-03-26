# PROJ-5: Password Reset Flow

## Status: Planned
**Created:** 2026-03-26
**Last Updated:** 2026-03-26

## Dependencies
- Requires: PROJ-3 (User Authentication) — User-Kontext und Session-Handling
- Requires: PROJ-4 (Transactional Email) — Reset-E-Mail versenden

## User Stories
- Als User möchte ich auf der Login-Seite "Passwort vergessen" klicken und meine E-Mail eingeben können.
- Als User möchte ich eine E-Mail mit einem sicheren Reset-Link erhalten, über den ich mein Passwort neu setzen kann.
- Als User möchte ich nach dem erfolgreichen Passwort-Reset automatisch eingeloggt und auf mein Dashboard weitergeleitet werden.
- Als System möchte ich sicherstellen, dass ein Reset-Token nur einmal verwendet werden kann.
- Als System möchte ich abgelaufene oder bereits verwendete Reset-Tokens ablehnen.

## Acceptance Criteria
- [ ] "Passwort vergessen"-Link auf der Login-Seite sichtbar
- [ ] Formular: Eingabe der E-Mail-Adresse, Submit-Button
- [ ] Bei Submit: E-Mail wird gesendet WENN User im aktuellen Tenant existiert
- [ ] Bei Submit: Immer gleiche Success-Message (auch wenn E-Mail nicht existiert — kein User-Enumeration)
- [ ] Reset-Token: kryptografisch zufällig, einmalig, 1 Stunde gültig
- [ ] Reset-Link enthält Token und Tenant-Subdomain: `agentur-x.boost-hive.de/reset-password?token=...`
- [ ] Reset-Seite: Formular für neues Passwort + Bestätigung
- [ ] Passwort-Validierung: min. 8 Zeichen, Bestätigungsfeld muss übereinstimmen
- [ ] Nach erfolgreichem Reset: Token invalidiert, User eingeloggt, Redirect auf Dashboard
- [ ] Abgelaufener/ungültiger Token → Fehlermeldung mit Link zurück zu "Passwort vergessen"

## Edge Cases
- User fordert mehrfach Reset an → Letzter Token invalidiert alle vorherigen
- Reset-Link wird in neuem Browser-Tab geöffnet → Funktioniert unabhängig von vorheriger Session
- User ist schon eingeloggt und ruft Reset-Link auf → Token trotzdem verarbeiten, Session erneuern
- Reset-Link nach 1 Stunde → "Link abgelaufen" mit Möglichkeit, neuen anzufordern
- Falscher Tenant im Reset-Link (Token für Tenant A, aber Aufruf auf Tenant B) → Ablehnen

## Technical Requirements
- Security: Token wird gehasht in DB gespeichert (nicht Plaintext)
- Security: Kein Hinweis ob E-Mail existiert (Anti-Enumeration)
- Security: HTTPS-only für Reset-Links in Produktion

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)
_To be added by /architecture_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
