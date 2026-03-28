# PROJ-26: Google Search Console OAuth Integration

## Status: Planned
**Created:** 2026-03-28
**Last Updated:** 2026-03-28

## Dependencies
- Requires: PROJ-3 (User Authentication)
- Requires: PROJ-6 (Role-Based Access Control) — nur Admin kann GSC verbinden
- Requires: PROJ-25 (Keyword Project Management) — Projekte müssen existieren
- External: Google Search Console API (OAuth 2.0)

## User Stories
- Als Admin möchte ich mein Google-Konto (Search Console) mit einem Tenant verbinden, damit Ranking-Daten automatisch abgerufen werden können.
- Als Admin möchte ich sehen, ob die GSC-Verbindung aktiv ist und für welche Properties (Domains) Zugriff besteht, damit ich Fehler früh erkennen kann.
- Als Admin möchte ich die GSC-Verbindung trennen können, wenn ein Kunde wechselt oder die Berechtigung entzogen wird.
- Als Member möchte ich klare Fehlermeldungen sehen, wenn das GSC-Token abgelaufen ist, damit ich meinen Admin informieren kann.

## Acceptance Criteria
- [ ] Admin kann OAuth-Flow mit Google starten (Button "Google Search Console verbinden")
- [ ] Nach erfolgreichem OAuth wird Access Token + Refresh Token verschlüsselt in der Datenbank gespeichert (pro Tenant)
- [ ] System zeigt Liste der verfügbaren GSC-Properties (verifizierte Domains) aus dem Google-Konto
- [ ] Admin kann eine Property aus der Liste als Standard für den Tenant auswählen
- [ ] Verbindungsstatus ist im Tenant-Settings sichtbar: verbunden / nicht verbunden / Token abgelaufen
- [ ] Bei abgelaufenem Refresh Token: Fehler-State im UI, kein Tracking-Lauf
- [ ] Admin kann die Verbindung trennen (Tokens werden aus DB gelöscht)
- [ ] Nur ein GSC-Account pro Tenant (kein Multi-Account-Support in MVP)

## Edge Cases
- OAuth-Flow wird vom User abgebrochen → keine Tokens gespeichert, kein Fehler-State
- Google verweigert Zugriff (falscher Account, keine GSC-Property) → verständliche Fehlermeldung
- Refresh Token wird von Google widerrufen → System erkennt 401-Fehler beim nächsten Tracking-Lauf und setzt Status auf "Token abgelaufen"
- Tenant wird gelöscht → Tokens werden mitgelöscht (Cascade, DSGVO)
- GSC-Property wurde nach dem Verbinden in Google gelöscht → Tracking-Lauf schlägt fehl, Fehlermeldung im Dashboard

## Technical Requirements
- Security: Tokens AES-256 verschlüsselt in der DB (nie im Klartext)
- Security: OAuth State-Parameter gegen CSRF absichern
- Compliance: Minimale OAuth-Scopes (`https://www.googleapis.com/auth/webmasters.readonly`)
- Performance: Token-Refresh erfolgt serverseitig vor jedem API-Call, nicht im Client

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)
_To be added by /architecture_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
