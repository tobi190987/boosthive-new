# PROJ-50: GA4 Integration (Google Analytics 4)

## Status: Planned
**Created:** 2026-04-08
**Last Updated:** 2026-04-08

## Dependencies
- PROJ-29: Customer Database (CRM & Vault) — Integration wird in Kundenverwaltung gespeichert
- PROJ-49: Marketing Performance Dashboard — konsumiert GA4-Daten

## Overview
OAuth 2.0 Anbindung von Google Analytics 4 pro Kunde. Der Admin verbindet GA4 in der Kundenverwaltung unter "Integrationen" via OAuth-Flow. GA4 Property ID wird gespeichert. API-Route liefert Sessions, Users, Pageviews, Bounce Rate, Avg. Session Duration für den gewählten Zeitraum.

## User Stories

### Als Agentur-Admin möchte ich
- **STORY-1:** GA4 für einen Kunden über OAuth verbinden, ohne manuell API-Keys eingeben zu müssen
- **STORY-2:** Die GA4 Property auswählen, die mit dem Kunden verknüpft ist (ein GA4 Account kann mehrere Properties haben)
- **STORY-3:** Die Verbindung trennen können, wenn der Auftrag endet

### Als Agentur-Mitarbeiter möchte ich
- **STORY-4:** GA4-Metriken im Dashboard sehen (Sessions, Nutzer, Pageviews, Absprungrate, Verweildauer)
- **STORY-5:** Einen Zeitreihen-Chart der Besucher über den gewählten Zeitraum sehen

## Acceptance Criteria

### AC-1: OAuth-Flow in Kundenverwaltung
- **GIVEN** ich bin Admin und öffne einen Kunden → Tab "Integrationen"
- **WHEN** ich auf "GA4 verbinden" klicke
- **THEN** öffnet sich der Google OAuth-Flow (Popup oder Redirect)
- **AND** nach Autorisierung wird der Token verschlüsselt gespeichert
- **AND** der Status wechselt zu "Verbunden" mit Anzeige des verknüpften Google-Accounts

### AC-2: Property-Auswahl
- **GIVEN** der OAuth-Flow ist abgeschlossen
- **WHEN** der User mehrere GA4 Properties hat
- **THEN** kann er die passende Property für diesen Kunden auswählen
- **AND** die Property ID wird gespeichert

### AC-3: Daten-Abruf
- **GIVEN** GA4 ist für einen Kunden verbunden
- **WHEN** das Dashboard GA4-Daten anfordert
- **THEN** liefert die API-Route folgende Metriken für den gewählten Zeitraum:
  - Sessions (gesamt)
  - Active Users (gesamt)
  - Pageviews (gesamt)
  - Bounce Rate (%)
  - Avg. Session Duration (Sekunden)
  - Zeitreihe: Sessions pro Tag (für Chart)
- **AND** Vergleichswerte für die Vorperiode (für Trend-Berechnung)

### AC-4: Token-Refresh
- **GIVEN** ein GA4 Token ist abgelaufen
- **WHEN** Daten angefordert werden
- **THEN** wird der Token automatisch über Refresh Token erneuert
- **AND** bei ungültigem Refresh Token wird der Admin benachrichtigt ("GA4 Verbindung abgelaufen")

### AC-5: Verbindung trennen
- **GIVEN** GA4 ist verbunden
- **WHEN** Admin auf "Verbindung trennen" klickt und bestätigt
- **THEN** werden Token und Property ID gelöscht
- **AND** Status wechselt zu "Nicht verbunden"

## Edge Cases

### EC-1: User verweigert OAuth
- **WHEN** User bricht den OAuth-Flow ab
- **THEN** bleibt der Status "Nicht verbunden" und eine Info-Meldung erscheint

### EC-2: GA4 API Rate Limit
- **WHEN** die Google Analytics API ein Rate Limit zurückgibt
- **THEN** werden gecachte Daten (max. 15 Min. alt) angezeigt
- **AND** ein Hinweis "Daten aus Cache" wird angezeigt

### EC-3: Keine Daten für Zeitraum
- **WHEN** der Zeitraum "Heute" ausgewählt ist und noch keine Daten für heute vorliegen
- **THEN** werden 0-Werte angezeigt (kein Fehler)

### EC-4: Property ohne Daten
- **WHEN** eine neue Property verbunden wird, die noch keine Daten hat
- **THEN** sehe ich "Keine Daten verfügbar" für diesen Kunden

## Technical Requirements

### API-Route
- `GET /api/tenant/integrations/ga4/[customerId]?range=7d` — Daten abrufen
- `GET /api/tenant/integrations/ga4/oauth/callback` — OAuth Callback
- `DELETE /api/tenant/integrations/ga4/[customerId]` — Verbindung trennen

### Sicherheit
- OAuth Tokens AES-256 verschlüsselt in `customer_integrations` Tabelle
- Scopes: `analytics.readonly` (read-only, minimale Berechtigung)
- Tokens nie im Frontend exponiert

### Google API
- Google Analytics Data API v1 (GA4)
- Service: `@google-analytics/data`
- OAuth 2.0 Client ID in Umgebungsvariablen

---

## Tech Design (Solution Architect)

### Bestehende Infrastruktur (wird wiederverwendet)
- `customer_integrations` Tabelle — `credentials_encrypted`, `integration_type`, `status` kompatibel
- `encryptCredentials` / `decryptCredentials` — aus `@/lib/customer-credentials-encryption`
- `customer-detail-workspace.tsx` — bestehender "Integrationen"-Tab wird erweitert
- GSC OAuth (`src/app/api/gsc/callback/route.ts`) — als Vorlage für den OAuth-Flow

### Komponentenstruktur

```
customer-detail-workspace (bestehend)
└── Tab: "Integrationen" (bestehend)
    └── GA4IntegrationCard (NEU)
        ├── Status Badge: "Verbunden" / "Nicht verbunden"
        ├── [Nicht verbunden] → Button "Mit Google verbinden"
        ├── [OAuth fertig, keine Property] → PropertySelector Dropdown
        └── [Verbunden] → Account-E-Mail + Property + "Trennen"-Button

marketing-dashboard-workspace (PROJ-49)
└── GA4Section (NEU)
    ├── KPI Cards: Sessions / Active Users / Pageviews / Bounce Rate / Avg. Duration
    ├── Trend-Vergleich zur Vorperiode (+/- %)
    ├── Zeitreihen-Chart: Sessions pro Tag (Recharts LineChart)
    └── [Nicht verbunden] → Hinweis-Banner mit Link zur Kundenverwaltung
```

### Datenmodell
Kein neues DB-Schema — bestehende `customer_integrations` Tabelle (integration_type = "ga4"):
- `access_token`, `refresh_token`, `token_expiry` — OAuth-Tokens (verschlüsselt)
- `google_email` — Angezeigter Google-Account
- `ga4_property_id`, `ga4_property_name` — Ausgewählte Property
- `cached_data`, `cached_at` — 15-Min-Cache für Rate-Limit-Schutz

Alles AES-256-verschlüsselt über bestehenden `encryptCredentials`-Mechanismus.

### API-Routen (neu)

| Route | Zweck |
|---|---|
| `GET /api/tenant/integrations/ga4/oauth/start` | OAuth-URL generieren (mit State/CSRF) |
| `GET /api/tenant/integrations/ga4/oauth/callback` | Code → Token tauschen, in DB speichern |
| `GET /api/tenant/integrations/ga4/[customerId]/properties` | GA4 Properties des verbundenen Accounts listen |
| `POST /api/tenant/integrations/ga4/[customerId]/select-property` | Property-Auswahl speichern |
| `GET /api/tenant/integrations/ga4/[customerId]/data?range=7d` | Metriken abrufen (mit Cache) |
| `DELETE /api/tenant/integrations/ga4/[customerId]` | Verbindung trennen |

### OAuth-Flow
1. Admin klickt "Mit Google verbinden" → `/oauth/start` → Redirect zu Google
2. Google Callback → State validieren (CSRF) → Tokens speichern → Redirect zu Kundenverwaltung
3. PropertySelector → Admin wählt Property → `/select-property` → Status "connected"

### Token-Refresh-Strategie
- Vor jedem GA4-API-Aufruf: `token_expiry` prüfen, ggf. per Refresh Token erneuern
- Bei ungültigem Refresh Token: Status → `token_expired`, Admin-Benachrichtigung
- Tokens verlassen nie den Browser (rein serverseitig)

### Caching (Rate Limit Schutz)
- `cached_at` < 15 Min → `cached_data` zurückgeben + "Daten aus Cache"-Flag
- Leerer Cache + Rate Limit → Fehlermeldung ohne Crash

### Tech-Entscheidungen

| Entscheidung | Warum |
|---|---|
| Bestehende `customer_integrations` Tabelle | Kein Migrations-Aufwand |
| GSC OAuth als Vorlage | Gleicher Mechanismus, bewährt |
| Server-side Token Refresh | Tokens verlassen nie den Browser |
| State-Parameter mit Signatur | CSRF-Schutz beim Callback |
| DB-Cache statt Redis | Keine neue Infrastruktur |

### Neue Pakete
- `@google-analytics/data` — Google Analytics Data API v1
- `googleapis` — OAuth 2.0 Client für Google APIs

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
