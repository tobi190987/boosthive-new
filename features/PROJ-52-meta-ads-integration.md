# PROJ-52: Meta Ads Integration (Facebook & Instagram)

## Status: Planned
**Created:** 2026-04-08
**Last Updated:** 2026-04-08

## Dependencies
- PROJ-29: Customer Database (CRM & Vault) — Integration wird in Kundenverwaltung gespeichert
- PROJ-49: Marketing Performance Dashboard — konsumiert Meta Ads-Daten

## Overview
OAuth 2.0 Anbindung von Meta Ads (Facebook/Instagram) pro Kunde über die Meta Marketing API. Der Admin verbindet den Meta Ads Account in der Kundenverwaltung. Liefert Kampagnen, Reichweite, Impressions, CPM und Conversions.

## User Stories

### Als Agentur-Admin möchte ich
- **STORY-1:** Meta Ads für einen Kunden via Facebook OAuth verbinden
- **STORY-2:** Das richtige Ad Account auswählen (ein Meta-Account kann mehrere Business Ad Accounts haben)
- **STORY-3:** Die Verbindung bei Bedarf trennen

### Als Agentur-Mitarbeiter möchte ich
- **STORY-4:** Kampagnen-Übersicht mit Reichweite, Impressions, CPM und Conversions sehen
- **STORY-5:** Den aggregierten CPM im Dashboard-Header sehen

## Acceptance Criteria

### AC-1: OAuth-Flow in Kundenverwaltung
- **GIVEN** ich bin Admin und öffne einen Kunden → Tab "Integrationen"
- **WHEN** ich auf "Meta Ads verbinden" klicke
- **THEN** startet der Facebook Login OAuth-Flow
- **AND** nach Autorisierung kann ich das Ad Account auswählen
- **AND** Token und Ad Account ID werden verschlüsselt gespeichert

### AC-2: Kampagnen-Daten
- **GIVEN** Meta Ads ist verbunden
- **WHEN** das Dashboard Daten anfordert
- **THEN** liefert die API für den gewählten Zeitraum:
  - Kampagnen-Liste: Name, Status, Reichweite, Impressions, Klicks, Kosten (€), CPM, Conversions
  - Aggregiert: Gesamt-Reichweite, Gesamt-Impressions, Ø CPM, Gesamt-Kosten

### AC-3: Token-Refresh
- Meta Long-lived Tokens (60 Tage) werden automatisch erneuert
- Bei abgelaufenem Token: Admin-Benachrichtigung "Meta Ads Verbindung abgelaufen"

### AC-4: Verbindung trennen
- Token und Ad Account ID löschen, Status zurücksetzen

## Edge Cases

### EC-1: Business Manager vs. persönlicher Account
- **WHEN** ein User über einen persönlichen Account anstatt Business Manager verbindet
- **THEN** erscheint ein Hinweis, dass ein Business Manager empfohlen wird

### EC-2: Mehrere Ad Accounts im Business Manager
- **WHEN** mehrere Ad Accounts vorhanden sind
- **THEN** kann der Admin den richtigen Account für den Kunden auswählen

### EC-3: Meta API Downtime
- **WHEN** die Meta API nicht erreichbar ist
- **THEN** werden gecachte Daten angezeigt mit Zeitstempel des letzten erfolgreichen Abrufs

## Technical Requirements

### API-Route
- `GET /api/tenant/integrations/meta-ads/[customerId]?range=7d`
- `GET /api/tenant/integrations/meta-ads/oauth/callback`
- `DELETE /api/tenant/integrations/meta-ads/[customerId]`

### Meta API
- Meta Marketing API v19+
- OAuth Scopes: `ads_read`, `business_management`
- App ID + App Secret in Umgebungsvariablen

---

## Tech Design (Solution Architect)

### Bestehende Infrastruktur (wird wiederverwendet)
- `customer_integrations` aus PROJ-29 als zentraler Credentials-Vault pro Kunde
- `customer-detail-workspace.tsx` mit bestehendem Tab "Integrationen" als Admin-Einstiegspunkt
- `customer-credentials-encryption.ts` fuer AES-256-GCM-Verschluesselung
- `requireTenantUser` / `requireTenantAdmin` aus `@/lib/auth-guards` fuer Tenant- und Rollenpruefung
- Stub-Route `src/app/api/tenant/dashboard/meta-ads/route.ts` als bestehender Konsum-Punkt fuer PROJ-49
- OAuth-Pattern aus `ga4-oauth.ts` / `gsc-oauth.ts` als Vorlage fuer signierten `state`, Callback und Token-Refresh

### Wichtige Vorarbeit im Datenmodell
Meta Ads passt noch nicht vollstaendig in das aktuelle Schema. Vor dem eigentlichen Feature ist eine kleine Migration noetig:

- `customer_integrations.integration_type` um `meta_ads` erweitern
- `customer_integrations.status` um `token_expired` erweitern
- optional `connected_by`, `connected_at` konsistent mit GA4/kuenftigen Integrationen nutzen, falls noch nicht in allen Umgebungen vorhanden

`meta_pixel` bleibt bestehen, weil es ein anderes Produkt ist als die hier benoetigte Ads-Reporting-Integration.

### Komponentenstruktur

```
customer-detail-workspace (bestehend)
└── Tab: "Integrationen" (bestehend)
    └── MetaAdsIntegrationCard (NEU)
        ├── Status Badge: "Verbunden" / "Nicht verbunden" / "Erneut verbinden"
        ├── [Nicht verbunden] → Button "Mit Meta Ads verbinden"
        ├── [OAuth fertig, kein Ad Account] → AdAccountSelector
        ├── [Mehrere Business Ad Accounts] → Auswahl fuer den passenden Kunden-Account
        └── [Verbunden] → Meta Business Name + Ad Account Name/ID + "Trennen"-Button

marketing-dashboard-workspace (PROJ-49)
└── MetaAdsSection (bestehend, derzeit Stub)
    ├── Kampagnen-Tabelle: Name, Reichweite, Impressions, CPM, Conversions
    ├── Summary fuer Header-KPI "Ø CPM" und Gesamtausgaben
    ├── Trend-Vergleich zur Vorperiode fuer globale KPI-Karten
    └── [Nicht verbunden] → NotConnectedCard mit Link zur Kundenverwaltung
```

### Datenmodell
Primaerspeicher bleibt `customer_integrations`; fuer Meta Ads wird `credentials_encrypted` als verschluesseltes JSON genutzt.

Empfohlene Struktur in `credentials_encrypted`:
- `access_token`
- `token_expiry`
- `meta_user_id`
- `meta_user_name`
- `selected_ad_account_id`
- `selected_ad_account_name`
- `business_id` optional
- `business_name` optional
- `currency`
- `last_refresh_attempt_at` optional
- `cached_summary` optional
- `cached_campaigns` optional
- `cached_trend` optional
- `cached_at` optional

Statusmodell:
- `disconnected` fuer nie verbunden oder bewusst getrennt
- `connected` fuer OAuth erfolgreich und Ad Account ausgewaehlt
- `token_expired` fuer abgelaufene 60-Tage-Gueltigkeit oder widerrufene Verbindung

### Neue Server-Module
- `src/lib/meta-ads-oauth.ts`
  Zweck: OAuth-Start-URL, signierter `state`, Code-Exchange gegen Short-lived User Token, Umtausch in Long-lived User Token, Token-Metadaten
- `src/lib/meta-ads-api.ts`
  Zweck: Business-/Ad-Account-Liste laden, Kampagnen- und Insights-Daten abrufen, Cache nutzen, Fehler normalisieren

Wie bei GSC und GA4 sollte die Integration ueber direkte `fetch()`-Aufrufe laufen statt ueber ein schweres SDK. Das passt zum vorhandenen Repo-Stil und haelt die Runtime klein.

### API-Routen

| Route | Zweck |
|---|---|
| `GET /api/tenant/integrations/meta-ads/oauth/start?customerId=` | OAuth-URL fuer Admin erzeugen |
| `GET /api/tenant/integrations/meta-ads/oauth/callback` | Code gegen Token tauschen, vorlaeufige Verbindung speichern, Redirect zur Kundenverwaltung |
| `GET /api/tenant/integrations/meta-ads/[customerId]/accounts` | Verfuegbare Meta Ad Accounts des Users/Business Managers listen |
| `POST /api/tenant/integrations/meta-ads/[customerId]/select-account` | Ausgewaehlten Ad Account speichern |
| `GET /api/tenant/dashboard/meta-ads?customerId=&range=` | Dashboard-Daten fuer PROJ-49 liefern |
| `DELETE /api/tenant/integrations/meta-ads/[customerId]` | Verbindung trennen und Credentials loeschen |

### OAuth- und Verbindungs-Flow
1. Admin klickt in der Kundenverwaltung auf "Mit Meta Ads verbinden".
2. `/oauth/start` validiert Tenant + Admin-Rolle und erzeugt einen signierten `state` mit `customerId`, `tenantId`, `userId`, `nonce`, `issuedAt`.
3. Redirect zu Meta OAuth mit minimalen Scopes fuer Lesezugriff auf Ads-Daten.
4. Callback validiert `state`, tauscht `code` gegen ein User Access Token und erweitert dieses serverseitig auf ein Long-lived Token.
5. Server speichert die verschluesselten Credentials in `customer_integrations` mit Status `connected`, auch wenn noch kein konkreter Ad Account ausgewaehlt wurde.
6. UI laedt ueber `/accounts` die verfuegbaren Werbekonten. Wenn mehrere Business Manager oder Accounts existieren, waehlt der Admin den kundenrelevanten Account aus.
7. `/select-account` speichert `selected_ad_account_id`, Anzeigename und Waehrung. Erst dann ist die Verbindung fuer das Dashboard vollstaendig.

### Meta API Mapping
Empfohlene Datenquellen:
- Account-Auswahl: Meta Graph API fuer `me/adaccounts` bzw. Business-gebundene Ad Accounts
- Reporting: Meta Marketing API Insights auf Kampagnen-Ebene

Empfohlene Felder fuer Insights:
- `campaign_name`
- `campaign_id`
- `reach`
- `impressions`
- `clicks`
- `spend`
- `actions`
- `cpm`
- `date_start`, `date_stop`

Normalisierung im App-Layer:
- Kampagnenliste fuer PROJ-49:
  - `name`
  - `reach`
  - `impressions`
  - `cpm`
  - `conversions`
- Summary:
  - `totalReach`
  - `totalImpressions`
  - `totalCost`
  - `avgCpm`
  - `totalConversions`
  - `currency`
- Trend:
  - Vergleichswerte fuer `avgCpm`, `totalCost`, `activeCampaigns` gegen die Vorperiode

Conversions sollten aus `actions` ueber ein klar definiertes Mapping aggregiert werden. Fuer die erste Version reicht ein konservatives Set aus kaufnahen Action-Typen; das Mapping bleibt zentral in `meta-ads-api.ts`, damit es spaeter justierbar ist.

### Dashboard-Datenfluss
1. `marketing-dashboard-workspace.tsx` ruft bereits `/api/tenant/dashboard/meta-ads?customerId=&range=` auf.
2. Route validiert `x-tenant-id` und Benutzer-Mitgliedschaft mit `requireTenantUser`.
3. Server liest die Meta-Ads-Integration des gewaehlten Kunden aus `customer_integrations`.
4. Falls kein gueltiger Ad Account hinterlegt ist: Rueckgabe `{ connected: false, data: null, trend: null }`.
5. Falls verbunden: Token-Gueltigkeit pruefen, bei Bedarf Long-lived Token erneuern bzw. Ablauf erkennen, dann Kampagnen-Insights fuer aktuellen Zeitraum und Vorperiode laden.
6. Route mappt Meta-Rohdaten auf das bestehende Dashboard-Contract:
   - `campaigns[]`: `name`, `reach`, `impressions`, `cpm`, `conversions`
   - `data.totalCost`
   - `data.avgCpm`
   - `trend`

Wichtig: Die aktuelle `MetaAdsSection` zeigt keinen Kosten- oder Status-Tabellenwert pro Kampagne. Die Route sollte sich deshalb exakt am bereits vorhandenen `MetaAdsData`-Interface orientieren, damit PROJ-49 ohne UI-Umbau weiter funktioniert.

### Token-Lifecycle und Ablaufbehandlung
Meta nutzt hier keine klassische Refresh-Token-Strategie wie Google. Stattdessen:

- nach OAuth den Short-lived User Token sofort in einen Long-lived User Token umwandeln
- `token_expiry` serverseitig speichern und bei jedem Abruf pruefen
- ab z. B. < 7 Tagen Restlaufzeit eine Admin-Warnung vorbereiten
- bei abgelaufenem oder ungueltigem Token Status auf `token_expired` setzen
- Dashboard gibt dann `connected: false` plus sprechenden Hinweis zur erneuten Verbindung zurueck

Falls Meta fuer den gewaehlten App-Typ keine verlaessliche serverseitige Verlaengerung mehr erlaubt, wird "erneut verbinden" als offizieller Recovery-Pfad behandelt. Das ist fuer PM und Support wichtig einzuplanen.

### Caching und Resilienz
- TTL: 15 Minuten pro Kunde/Zeitraum, analog zu PROJ-49/50/51
- Cache in `credentials_encrypted` reicht fuer V1 aus:
  - `cached_summary`
  - `cached_campaigns`
  - `cached_trend`
  - `cached_at`
- Bei temporaeren Meta-Fehlern oder Rate Limits: letzten gueltigen Cache zurueckgeben
- Antwort sollte ein Flag wie `isCached` und optional `cacheAgeMinutes` mitliefern, damit spaeter im Dashboard ein Hinweis moeglich ist

### Sicherheit
- Tokens verlassen nie das Backend
- OAuth-Start, Account-Auswahl und Trennen sind strikt Admin-only
- Dashboard-Endpunkt bleibt fuer Tenant-Mitglieder lesbar, aber nur im aktiven Tenant-/Kundenkontext
- `state` muss HMAC-signiert und zeitlich begrenzt sein
- Ad Account IDs gelten als sensible Kundenkonfiguration und werden nur fuer Admins in der Kundenverwaltung angezeigt
- Fehler-Responses duerfen keine rohen Meta API Payloads mit Tokens oder Debug-IDs ans Frontend durchreichen

### Umgebungsvariablen
- `META_APP_ID`
- `META_APP_SECRET`
- `META_ADS_STATE_SECRET`
- `CUSTOMER_CREDENTIALS_ENCRYPTION_KEY`
- `NEXT_PUBLIC_APP_URL`

### Benachrichtigungen
Bei Statuswechsel auf `token_expired` sollte dieselbe Benachrichtigungsrichtung wie bei GA4/Google Ads genutzt werden:
- visuell in der Kundenverwaltung: Badge "Erneut verbinden"
- optional Eintrag in bestehende Notifications-Historie fuer Admins

Die Benachrichtigung selbst muss nicht Teil von PROJ-52 V1 sein, aber der Statuswechsel soll so implementiert werden, dass eine spaetere Notification-Hook einfach anschliessbar ist.

### Tech-Entscheidungen

| Entscheidung | Warum |
|---|---|
| `customer_integrations` weiterverwenden | Kundenspezifischer Vault ist bereits vorhanden und passt fachlich exakt |
| Neuer Typ `meta_ads` statt `meta_pixel` wiederzuverwenden | Pixel-Tracking und Ads-Reporting sind unterschiedliche Integrationen mit anderem Datenmodell |
| Direkte `fetch()`-Integration statt SDK | Konsistent mit GSC/GA4, weniger Paketlast und bessere Kontrolle ueber Mapping |
| Ad-Account-Auswahl nach OAuth | Ein Meta-Login kann mehrere Businesses und Ad Accounts enthalten |
| Dashboard-Contract an bestehende `MetaAdsSection` anpassen | Verhindert Folgeregressionen in PROJ-49 |
| 15-Minuten-DB-Cache fuer V1 | Keine neue Infrastruktur, ausreichend fuer Reporting-Daten |

### Offene Implementierungsdetails
- Welche Meta Scopes im App-Review final erforderlich und praktisch zulaessig sind
- Welches Conversion-Mapping fuer `actions` in V1 als "Conversions" gilt
- Ob Warnungen vor Token-Ablauf direkt in PROJ-52 umgesetzt oder an ein spaeteres Notification-Feature delegiert werden

## QA Test Results
### Verifiziert am 2026-04-08

#### Automatisiert bestanden
- `npm run build`
- `npx playwright test tests/api/meta-ads.spec.ts --project=api-tests`

#### Abgedeckte Checks
- Dashboard-Fallback: `GET /api/tenant/dashboard/meta-ads` liefert bei unvollstaendiger Verbindung sauber `connected: false`
- Rollenrechte: Member koennen die Admin-Detailroute `GET /api/tenant/integrations/meta-ads/[customerId]` nicht aufrufen (`403`)
- Disconnect-Flow: Admin kann eine bestehende Meta-Ads-Verbindung trennen; Status, Credentials und `last_activity` werden korrekt zurueckgesetzt

#### Manuell/offen
- Echter OAuth-Flow gegen Meta wurde lokal nicht verifiziert
- Laden realer Ad-Accounts ueber `me/adaccounts` wurde ohne produktive Meta-Credentials nicht getestet
- Insights-Mapping (Reach, Impressions, CPM, Conversions) gegen echte Meta-Daten steht noch aus
- Migration `040_meta_ads_customer_integrations.sql` muss in der Zielumgebung angewendet sein, bevor die neue Integration produktiv funktioniert

#### QA-Fazit
- Die lokal verifizierbaren Serverpfade fuer Berechtigung, Fallback und Trennen sind stabil.
- Das groesste Restrisiko liegt aktuell nicht im App-Flow, sondern in der externen Meta-API-Anbindung und im produktiven Env-/Migrations-Setup.

## Deployment
_To be added by /deploy_
