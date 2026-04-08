# PROJ-51: Google Ads Integration

## Status: Planned
**Created:** 2026-04-08
**Last Updated:** 2026-04-08

## Dependencies
- PROJ-29: Customer Database (CRM & Vault) — Integration wird in Kundenverwaltung gespeichert
- PROJ-49: Marketing Performance Dashboard — konsumiert Google Ads-Daten

## Overview
OAuth 2.0 Anbindung von Google Ads pro Kunde. Der Admin verbindet den Google Ads Account in der Kundenverwaltung. Die Customer ID wird gespeichert. API-Route liefert aktive Kampagnen, Impressions, Klicks, CPC, Conversions und Gesamtausgaben für den gewählten Zeitraum.

## User Stories

### Als Agentur-Admin möchte ich
- **STORY-1:** Google Ads für einen Kunden via OAuth verbinden
- **STORY-2:** Den richtigen Google Ads Account (Customer ID) für den Kunden auswählen (ein Google-Account kann mehrere Ads-Accounts haben)
- **STORY-3:** Die Verbindung bei Bedarf trennen

### Als Agentur-Mitarbeiter möchte ich
- **STORY-4:** Eine Übersicht aller aktiven Kampagnen des Kunden sehen (Name, Status, Budget, Klicks, Kosten, Conversions)
- **STORY-5:** Den Ø CPC und Gesamt-Ausgaben im Dashboard-Header sehen

## Acceptance Criteria

### AC-1: OAuth-Flow in Kundenverwaltung
- **GIVEN** ich bin Admin und öffne einen Kunden → Tab "Integrationen"
- **WHEN** ich auf "Google Ads verbinden" klicke
- **THEN** startet der Google OAuth-Flow
- **AND** nach Autorisierung werde ich nach der Customer ID gefragt (wenn mehrere Accounts vorhanden)
- **AND** Token und Customer ID werden verschlüsselt gespeichert

### AC-2: Kampagnen-Daten
- **GIVEN** Google Ads ist verbunden
- **WHEN** das Dashboard Daten anfordert
- **THEN** liefert die API für den gewählten Zeitraum:
  - Liste aller Kampagnen: Name, Status (Aktiv/Pausiert), Tagesbudget, Impressions, Klicks, Kosten (€), Conversions
  - Aggregiert: Gesamt-Klicks, Gesamt-Kosten, Ø CPC, Gesamt-Conversions

### AC-3: Token-Refresh
- Wie PROJ-50 AC-4: automatisches Token-Refresh, Admin-Benachrichtigung bei Fehler

### AC-4: Verbindung trennen
- Wie PROJ-50 AC-5: Token und Customer ID löschen, Status zurücksetzen

## Edge Cases

### EC-1: Manager-Account (MCC)
- **WHEN** der Google-Account ein Manager-Account (MCC) mit mehreren Sub-Accounts ist
- **THEN** kann der Admin den Sub-Account für den Kunden auswählen

### EC-2: Kein aktives Budget
- **WHEN** alle Kampagnen pausiert sind
- **THEN** zeigt die Dashboard-Sektion "0 aktive Kampagnen" ohne Fehler

### EC-3: Währung
- **WHEN** der Google Ads Account in einer anderen Währung als € abrechnet
- **THEN** wird die Originalwährung angezeigt (keine automatische Konvertierung)

## Technical Requirements

### API-Route
- `GET /api/tenant/integrations/google-ads/[customerId]?range=7d`
- `GET /api/tenant/integrations/google-ads/oauth/callback`
- `DELETE /api/tenant/integrations/google-ads/[customerId]`

### Google API
- Google Ads API v17+
- OAuth Scopes: `https://www.googleapis.com/auth/adwords`
- Developer Token erforderlich (in Umgebungsvariablen)

---

## Tech Design (Solution Architect)

### Bestehende Infrastruktur (wird wiederverwendet)
- `customer_integrations` Tabelle aus PROJ-29 mit `integration_type = 'google_ads'`
- `customer-detail-workspace.tsx` mit bestehendem Tab "Integrationen" als Admin-Einstiegspunkt
- `customer-credentials-encryption.ts` fuer AES-256-GCM-Verschluesselung der Credentials
- `requireTenantUser` / `requireTenantAdmin` aus `@/lib/auth-guards` fuer Tenant- und Rollenpruefung
- Dashboard-Stub `src/app/api/tenant/dashboard/google-ads/route.ts` als bestehender Konsum-Punkt fuer PROJ-49
- Google OAuth Helper-Muster aus `gsc-oauth.ts` und `ga4-oauth.ts` als Vorlage fuer State, Callback und Token-Refresh

### Komponentenstruktur

```
customer-detail-workspace (bestehend)
└── Tab: "Integrationen" (bestehend)
    └── GoogleAdsIntegrationCard (NEU)
        ├── Status Badge: "Verbunden" / "Nicht verbunden" / "Erneut verbinden"
        ├── [Nicht verbunden] → Button "Mit Google Ads verbinden"
        ├── [OAuth fertig, keine Customer ID] → CustomerSelector fuer Google Ads Accounts
        ├── [MCC erkannt] → Auswahl eines Sub-Accounts
        └── [Verbunden] → Google-Konto + Customer ID + Waehrung + "Trennen"-Button

marketing-dashboard-workspace (PROJ-49)
└── GoogleAdsSection (bestehend, derzeit Stub)
    ├── KPI-Zeile: aktive Kampagnen / Klicks / Kosten / Conversions / Ø CPC
    ├── CampaignsTable: Name, Status, Tagesbudget, Impressions, Klicks, Kosten, Conversions
    ├── Trend-Vergleich zur Vorperiode fuer Header-KPIs
    └── [Nicht verbunden] → NotConnectedCard mit Link zur Kundenverwaltung
```

### Datenmodell
Primärspeicher bleibt `customer_integrations`; fuer Google Ads wird `credentials_encrypted` als verschluesseltes JSON genutzt.

Empfohlene Struktur in `credentials_encrypted`:
- `access_token`
- `refresh_token`
- `token_expiry`
- `google_email`
- `developer_token_ref` oder rein ENV-basiert ohne Persistenz
- `google_ads_customer_id`
- `google_ads_customer_name`
- `google_ads_manager_customer_id` optional fuer MCC
- `currency_code`
- `cached_summary` optional
- `cached_at` optional

Statusmodell:
- `disconnected` fuer nie verbunden oder bewusst getrennt
- `connected` fuer OAuth erfolgreich, Customer ID ausgewaehlt
- `token_expired` fuer widerrufene oder ungueltige Refresh Tokens

Hinweis zur Datenbank:
- `integration_type = 'google_ads'` ist bereits im Check-Constraint vorhanden
- Das bestehende `status`-Constraint in `customer_integrations` erlaubt aktuell nur `connected | active | disconnected`
- Fuer PROJ-51 sollte dieselbe Status-Erweiterung wie bei PROJ-50 sauber migriert werden, damit `token_expired` konsistent gespeichert werden kann

### Neue Server-Module
- `src/lib/google-ads-oauth.ts`
  Zweck: Authorization URL, State-Signatur, Code-Exchange, User-Info, Token-Refresh
- `src/lib/google-ads-api.ts`
  Zweck: Customer-Liste laden, MCC/Sub-Accounts aufloesen, Campaign-Metriken per Google Ads API abrufen, Cache/Refresh handhaben

Beide Module sollten wie GSC/GA4 direkte `fetch()`-Aufrufe verwenden statt ein weiteres SDK einzufuehren. Das passt besser zum vorhandenen Repo-Stil und reduziert Paketlast.

### API-Routen

| Route | Zweck |
|---|---|
| `GET /api/tenant/integrations/google-ads/oauth/start?customerId=` | OAuth-URL fuer Admin erzeugen |
| `GET /api/tenant/integrations/google-ads/oauth/callback` | Code gegen Tokens tauschen, Konto speichern, Redirect zur Kundenverwaltung |
| `GET /api/tenant/integrations/google-ads/[customerId]/accounts` | Verfuegbare Google Ads Accounts bzw. MCC-Sub-Accounts listen |
| `POST /api/tenant/integrations/google-ads/[customerId]/select-account` | Ausgewaehlte Customer ID speichern |
| `GET /api/tenant/dashboard/google-ads?customerId=&range=` | Dashboard-Daten fuer PROJ-49 liefern |
| `DELETE /api/tenant/integrations/google-ads/[customerId]` | Verbindung trennen und Credentials loeschen |

### OAuth- und Verbindungs-Flow
1. Admin klickt in der Kundenverwaltung auf "Mit Google Ads verbinden".
2. `/oauth/start` validiert Tenant + Admin-Rolle, erstellt signierten `state` mit `customerId`, `tenantId`, `userId`, `nonce`, danach Redirect zu Google.
3. Callback validiert `state`, tauscht `code` gegen Access- und Refresh-Token und liest die Google-E-Mail.
4. Server speichert verschluesselte Tokens in `customer_integrations` mit Status `connected`, auch wenn noch keine Customer ID gewaehlt wurde.
5. UI laedt ueber `/accounts` alle verfuegbaren Ads Accounts.
6. Bei MCC-Accounts wird zuerst die Manager-Struktur geladen; der Admin waehlt den konkreten Client-Account des Kunden.
7. `/select-account` speichert Customer ID, Anzeigename und Waehrung; danach ist die Verbindung fuer das Dashboard vollstaendig.

### Dashboard-Datenfluss
1. `marketing-dashboard-workspace.tsx` ruft bestehend `/api/tenant/dashboard/google-ads?customerId=&range=` auf.
2. Route validiert `x-tenant-id` und Benutzer-Mitgliedschaft mit `requireTenantUser`.
3. Server liest die Google-Ads-Integration des gewaehlten Kunden aus `customer_integrations`.
4. Falls nicht verbunden: Rueckgabe `{ connected: false, data: null, trend: null }` wie heute.
5. Falls verbunden: Access-Token pruefen, bei Bedarf serverseitig refreshen, dann Kampagnendaten fuer aktuellen Zeitraum und Vorperiode laden.
6. Route mappt Google Ads Rohdaten auf das Dashboard-Contract:
   - `campaigns[]`: `name`, `status`, `dailyBudget`, `impressions`, `clicks`, `cost`, `conversions`
   - `summary`: `activeCampaigns`, `clicks`, `cost`, `averageCpc`, `conversions`, `currencyCode`
   - `trend`: Vergleichswerte zur Vorperiode fuer KPI-Karten

### Google Ads API Mapping
Empfohlene Abfrage ueber Google Ads Query Language (GAQL):
- Ressource `campaign`
- Metriken: `metrics.impressions`, `metrics.clicks`, `metrics.cost_micros`, `metrics.conversions`, optional `metrics.average_cpc`
- Attribute: `campaign.name`, `campaign.status`, `campaign.id`, `campaign_budget.amount_micros`

Normalisierung im App-Layer:
- `cost_micros / 1_000_000` → Kosten in Originalwaehrung
- `campaign_budget.amount_micros / 1_000_000` → Tagesbudget
- aktive Kampagnen = Status `ENABLED`
- Ø CPC bevorzugt aus `cost / clicks`, damit die Berechnung mit anderen Plattformen konsistent bleibt

### Token-Refresh und Fehlerbehandlung
- Vor jedem API-Aufruf: `token_expiry` pruefen; bei weniger als 5 Minuten Restlaufzeit Refresh starten
- Erfolgreicher Refresh aktualisiert `credentials_encrypted` atomar
- Bei `invalid_grant` oder 401 wird Status auf `token_expired` gesetzt und das Dashboard liefert `connected: false` plus sprechenden Fehlerhinweis
- UI in Kundenverwaltung zeigt dann "Erneut verbinden"

### Caching
- Optionaler DB-Cache in `credentials_encrypted.cached_summary` mit `cached_at`
- TTL: 15 Minuten fuer Dashboard-Abfragen, analog zu GA4
- Bei 429 / temporaeren Google-Fehlern darf der letzte gueltige Cache zurueckgegeben werden
- Antwort kennzeichnet Cache-Nutzung mit Flag, damit PROJ-49 spaeter "Daten aus Cache" anzeigen kann

### Sicherheit
- Tokens niemals ans Frontend ausliefern
- Nur Admins duerfen OAuth starten, Account waehlen oder trennen
- Dashboard-Endpunkt bleibt fuer Tenant-Mitglieder lesbar, aber nur fuer den aktiven Kunden im Tenant-Kontext
- `state` muss HMAC-signiert und zeitlich begrenzt sein
- Google Developer Token kommt aus ENV und wird nicht in der DB gespeichert, ausser es gibt spaeter mehrere Tokens pro Deployment

### Umgebungsvariablen
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_ADS_STATE_SECRET`
- `GOOGLE_ADS_DEVELOPER_TOKEN`
- `CUSTOMER_CREDENTIALS_ENCRYPTION_KEY`
- `NEXT_PUBLIC_APP_URL`

### Tech-Entscheidungen

| Entscheidung | Warum |
|---|---|
| `customer_integrations` weiterverwenden | Customer-scoped Vault ist bereits vorhanden und Google Ads ist dort schon als Typ vorgesehen |
| Direkte `fetch()`-Integration statt schweres SDK | Konsistent mit bestehendem GSC/GA4-Stil, kleinere Runtime |
| Auswahl der Customer ID nach OAuth | Ein Google-Login kann mehrere Ads-Accounts bzw. MCC-Sub-Accounts haben |
| Dashboard-Route getrennt von Integrations-Route | Admin-Setup und Mitarbeiter-Lesezugriff bleiben sauber getrennt |
| Serverseitiger Token-Refresh | Tokens bleiben vollstaendig im Backend |

### Offene Implementierungsdetails
- Ob fuer Google Ads ein eigenes Cache-Feld in `credentials_encrypted` reicht oder ein separates Reporting-Cache-Table spaeter sinnvoller ist
- Ob die bestehende Integrationen-UI in `customer-detail-workspace.tsx` um eine dedizierte Google-Ads-Karte erweitert und der alte Freitext-Input fuer `google_ads` entfernt werden soll
- Ob Status `connected` und `active` vereinheitlicht werden sollten, damit alle Integrationen dasselbe Lebenszyklusmodell nutzen

## Frontend (Implementation)

### Zielbild
PROJ-51 erweitert zwei bestehende Frontend-Bereiche:
- die Kundenverwaltung unter `customer-detail-workspace.tsx` fuer das Admin-Setup
- das Marketing-Dashboard in `marketing-dashboard-workspace.tsx` fuer die Kampagnenansicht

Das Frontend soll sich bewusst an der bereits vorhandenen GA4-Integration orientieren, damit Google Ads visuell und im Interaktionsmuster wie eine native Erweiterung wirkt statt wie ein Sonderfall.

### Kundenverwaltung: Integrationskarte
Im Tab "Integrationen" wird eine neue `GoogleAdsIntegrationCard` oberhalb oder direkt neben den generischen Integrationseintraegen eingefuegt, analog zur vorhandenen `renderGa4IntegrationCard()`.

Inhalt der Karte:
- Icon/Branding in Gruen mit kurzer Einordnung "Kampagnen, Kosten und Conversions per Google OAuth anbinden"
- Status-Badge mit `Verbunden`, `Nicht verbunden` oder `Erneut verbinden`
- Infoblock fuer das verbundene Google-Konto
- Selektor fuer Ads-Account bzw. MCC-Sub-Account
- Anzeige der ausgewaehlten Customer ID und Waehrung
- Primary CTA: `Mit Google Ads verbinden` oder `Google-Konto wechseln`
- Secondary CTA: `Verbindung trennen`

### Kundenverwaltung: Zustandslogik
Die Karte braucht vier sichtbare UI-Zustaende:

1. `Nicht verbunden`
   - kurzer Hilfetext
   - CTA zum Start des OAuth-Flows
   - fuer Nicht-Admins ein Hinweis, dass nur Admins verbinden duerfen

2. `Verbunden, aber Account noch nicht ausgewaehlt`
   - Success-Badge bleibt sichtbar
   - Info-Panel mit Google-E-Mail
   - Select oder Combobox mit allen verfuegbaren Ads-Accounts
   - Zusatzhinweis, falls es sich um ein MCC handelt

3. `Vollstaendig verbunden`
   - ausgewaehlter Ads-Account als Read/Select-Ansicht
   - Customer ID, optional Account-Name und Waehrung
   - CTA zum Wechseln des Kontos

4. `Token abgelaufen`
   - amberfarbener Warning-Block
   - Badge `Erneut verbinden`
   - prominenter CTA fuer Reconnect

### Kundenverwaltung: UI-Details
- Das bestehende rohe Eingabefeld fuer `google_ads` im generischen `integrationTypes`-Array sollte fuer PROJ-51 entfallen oder verborgen werden, sobald die dedizierte Karte aktiv ist
- Fuer die Account-Auswahl reicht zunaechst `Select`; nur bei sehr langen MCC-Listen waere spaeter eine suchbare Combobox sinnvoll
- Das Trennen sollte ueber bestaetigenden Dialog laufen, analog zum GA4-Muster
- Ladezustaende mit `Loader2` und `Skeleton` wie bereits in der GA4-Karte

### Dashboard: Google Ads Section
Die bestehende `GoogleAdsSection` in `marketing-dashboard-workspace.tsx` bleibt der Render-Ort, wird aber von einer Stub-Tabelle zu einer vollstaendigen Kampagnensektion ausgebaut.

Empfohlener Aufbau innerhalb der Section:
- obere MetricsRow mit
  - `Aktive Kampagnen`
  - `Klicks`
  - `Kosten`
  - `Ø CPC`
  - `Conversions`
- darunter Kampagnentabelle
- optional kleine Meta-Zeile mit `Account`, `Customer ID`, `Waehrung`

### Dashboard: Kampagnentabelle
Die vorhandene Tabellenstruktur ist bereits nah am Ziel, sollte aber auf den finalen Vertrag erweitert werden:
- `Kampagne`
- `Status`
- `Tagesbudget`
- `Impressions`
- `Klicks`
- `Kosten`
- `Conversions`

Darstellungsregeln:
- Zahlen rechtsbuendig mit tabellarischen Ziffern
- aktive Kampagnen als gruener Badge
- pausierte Kampagnen als Outline-/Muted-Badge
- Kosten und Budget in der Originalwaehrung des Accounts
- bei `0`-Werten keine Warnfarbe, sondern neutrale Darstellung

### Dashboard: Empty-, Error- und Loading-States
Die bestehenden generischen States koennen wiederverwendet werden, sollten fuer Google Ads aber fachlich sauber befuellt werden:
- `NotConnectedCard`, wenn keine Integration vorhanden ist
- `PlatformErrorState`, wenn API oder Token-Refresh fehlschlaegt
- `PlatformSkeleton`, solange Daten geladen werden
- leerer Erfolgszustand mit Text wie `Keine aktiven Kampagnen im gewaehlten Zeitraum`, wenn verbunden aber keine aktiven Kampagnen vorhanden sind

### Dashboard: KPI-Anbindung
PROJ-49 erwartet, dass Google Ads die globalen KPI-Karten mitversorgt. Das Frontend fuer PROJ-51 sollte deshalb dieselben Felder liefern und lokal konsistent nutzen:
- `activeCampaigns` fuer die globale Karte "Aktive Kampagnen"
- `averageCpc` fuer die globale Karte "Ø CPC"
- `cost` fuer "Gesamtausgaben"
- `conversions` fuer "Conversions"

Wichtig:
- Trends muessen auf derselben Prozentbasis wie in `TrendBadge` berechnet und dargestellt werden
- wenn Google Ads verbunden ist, aber andere Ads-Plattformen nicht, darf die globale KPI weiterhin nur Google-Ads-Werte zeigen

### Mobile-Verhalten
- Integrationskarte in der Kundenverwaltung stapelt Inhalt und Aktionen vertikal
- Dashboard-Tabelle bleibt horizontal scrollbar statt Zeilen unlesbar zu umbrechen
- MetricsRow in der Google-Ads-Section faellt auf 2 Spalten mobil und 4-5 Spalten ab `md`

### Copy und Tonalitaet
Die UI-Texte sollen kurz, handlungsorientiert und deutsch bleiben:
- `Mit Google Ads verbinden`
- `Google-Konto wechseln`
- `Ads-Account auswaehlen`
- `Verbindung trennen`
- `Keine aktiven Kampagnen im gewaehlten Zeitraum`
- `Das gespeicherte Token ist nicht mehr gueltig. Bitte verbinde das Konto erneut.`

### Frontend-Abfolge fuer die Implementierung
1. Dedizierte Google-Ads-Karte in `customer-detail-workspace.tsx` einfuegen
2. generisches `google_ads`-Credential-Feld aus dem manuellen Formularpfad entfernen oder deaktivieren
3. lokale Client-States fuer Account-Liste, Selection, Connect, Disconnect und Reconnect ergaenzen
4. `GoogleAdsSection` im Dashboard um MetricsRow und finale Tabellenfelder erweitern
5. globale KPI-Berechnung in `marketing-dashboard-workspace.tsx` gegen den finalen Response-Shape validieren

## Backend (Implementation)

### Leitlinie
Das Backend fuer PROJ-51 sollte dieselbe Struktur wie die bestehende GA4-Integration verwenden:
- Admin-geschuetzte Setup-Routen unter `/api/tenant/integrations/google-ads/*`
- serverseitiger OAuth-Callback ohne Frontend-Tokenhandling
- verschluesselte Persistenz in `customer_integrations`
- lesender Dashboard-Endpunkt fuer Tenant-Mitglieder

Dadurch bleibt Google Ads konsistent zu GA4 und nutzt die vorhandenen Sicherheits- und Tenant-Muster des Repos.

### Geplante Routenstruktur

| Route | Methode | Zweck | Zugriff |
|---|---|---|---|
| `/api/tenant/integrations/google-ads/oauth/start` | `GET` | OAuth-URL fuer einen Kunden erzeugen | Admin |
| `/api/tenant/integrations/google-ads/oauth/callback` | `GET` | Google Callback verarbeiten und Tokens speichern | Server/Provider |
| `/api/tenant/integrations/google-ads/[customerId]/accounts` | `GET` | verfuegbare Ads-Accounts bzw. MCC-Sub-Accounts listen | Admin |
| `/api/tenant/integrations/google-ads/[customerId]/select-account` | `POST` | Customer ID und Metadaten speichern | Admin |
| `/api/tenant/integrations/google-ads/[customerId]` | `DELETE` | Verbindung trennen | Admin |
| `/api/tenant/dashboard/google-ads` | `GET` | Dashboard-Daten fuer einen Kunden liefern | Tenant-User |

### Route: `oauth/start`
Verhalten analog zu `ga4/oauth/start`:
- `x-tenant-id` muss gesetzt sein
- Rate-Limit ueber bestehenden Mechanismus
- Auth via `requireTenantAdmin(tenantId)`
- Query-Validierung mit Zod: `customerId` als UUID
- Pruefen, dass der Kunde zum Tenant gehoert und nicht soft-geloescht ist
- signierten `state` mit `customerId`, `tenantId`, `userId`, `nonce`, `issuedAt` erzeugen
- JSON-Antwort `{ url }` fuer Redirect im Frontend

### Route: `oauth/callback`
Verhalten analog zu `ga4/oauth/callback`:
- `code`, `state` und optionale Provider-Fehler auslesen
- `state` verifizieren, Ablaufzeit pruefen, Tenant-/Customer-Kontext rekonstruieren
- Tenant-Slug laden, damit sauber zur Kundenverwaltung zurueckredirectet werden kann
- bei `access_denied` oder fehlendem `code` auf sichere Fehler-URL redirecten
- Authorization Code gegen Access-/Refresh-Token tauschen
- Google-Konto-E-Mail lesen
- verschluesselte Integration in `customer_integrations` upserten
- Redirect nach `/tools/customers?customer=<id>&tab=integrations&google_ads=connected`

Empfohlene Fehlerbehandlung:
- Fehlercodes fuer Redirect auf ein sicheres, kuerzes Format reduzieren
- Provider-Fehler, fehlender Refresh-Token und unbekannte Exceptions trennscharf behandeln

### Route: `GET [customerId]/accounts`
Zweck:
- nach erfolgreichem OAuth alle verfuegbaren Google Ads Accounts fuer die UI bereitstellen

Ablauf:
- `requireTenantAdmin`
- `customerId` mit Zod validieren
- Kundenzugehoerigkeit zum Tenant pruefen
- bestehende Google-Ads-Integration laden
- `credentials_encrypted` entschluesseln
- bei Bedarf Access-Token automatisch refreshen
- ueber Google Ads API alle zugaenglichen Accounts laden
- wenn ein MCC erkannt wird, Child-Accounts mit zurueckgeben

Antwortform:
```json
{
  "accounts": [
    {
      "customerId": "1234567890",
      "name": "Boosthive Demo",
      "currencyCode": "EUR",
      "isManager": false,
      "managerCustomerId": null
    }
  ]
}
```

### Route: `POST [customerId]/select-account`
Zweck:
- die vom Admin ausgewaehlte Google Ads Customer ID dauerhaft speichern

Validierung:
- `customerId` aus Params als UUID
- Body via Zod, z. B.
  - `googleAdsCustomerId: string`
  - `googleAdsCustomerName?: string`
  - `currencyCode?: string`
  - `managerCustomerId?: string | null`

Ablauf:
- `requireTenantAdmin`
- Kunde und vorhandene Integration pruefen
- Access-Token ggf. refreshen
- optional serverseitig validieren, dass die ausgewaehlte Customer ID wirklich in der Account-Liste des Tokens enthalten ist
- `credentials_encrypted` aktualisieren
- Status auf `connected` lassen bzw. setzen

### Route: `DELETE [customerId]`
Zweck:
- Verbindung sauber zuruecksetzen

Ablauf:
- `requireTenantAdmin`
- Kunde und Integration pruefen
- Credentials leeren oder Integration auf `disconnected` setzen
- Customer-ID-bezogene Felder entfernen
- `last_activity` und `updated_at` pflegen

Empfohlene Rueckgabe:
- `{ success: true }`
- alternativ aktualisierten Integrationsstatus zur direkten UI-Aktualisierung

### Route: `GET /api/tenant/dashboard/google-ads`
Die bestehende Stub-Route wird zur produktiven Read-Route fuer das Dashboard ausgebaut.

Verhalten:
- `x-tenant-id` ist Pflicht
- `requireTenantUser(tenantId)` statt Admin-Guard
- Query-Validierung:
  - `customerId` als UUID
  - `range` als `today | 7d | 30d | 90d`
- Kunde auf Tenant-Zugehoerigkeit und `deleted_at IS NULL` pruefen
- Google-Ads-Integration laden
- wenn nicht verbunden: `{ connected: false, data: null, trend: null }`
- wenn `token_expired`: `403` mit klarer Handlungsanweisung
- sonst Snapshot fuer aktuellen Zeitraum plus Vorperiode erzeugen

Antwortform:
```json
{
  "connected": true,
  "data": {
    "campaigns": [],
    "summary": {
      "activeCampaigns": 0,
      "clicks": 0,
      "cost": 0,
      "averageCpc": 0,
      "conversions": 0,
      "currencyCode": "EUR"
    },
    "trend": {
      "activeCampaigns": 0,
      "clicks": 0,
      "cost": 0,
      "averageCpc": 0,
      "conversions": 0
    }
  },
  "trend": {
    "activeCampaigns": 0,
    "clicks": 0,
    "cost": 0,
    "averageCpc": 0,
    "conversions": 0
  }
}
```

### Neue Backend-Module

`src/lib/google-ads-oauth.ts`
- `createGoogleAdsOAuthState`
- `verifyGoogleAdsOAuthState`
- `buildGoogleAdsAuthorizationUrl`
- `exchangeGoogleAdsCodeForTokens`
- `refreshGoogleAdsAccessToken`
- `getGoogleAdsGoogleEmail`
- eigener `GoogleAdsTokenRevokedError`

`src/lib/google-ads-api.ts`
- `getGoogleAdsIntegration`
- `upsertGoogleAdsConnection`
- `parseGoogleAdsCredentials`
- `getValidGoogleAdsToken`
- `listGoogleAdsAccounts`
- `validateSelectedGoogleAdsAccount`
- `getGoogleAdsDashboardSnapshot`
- Hilfen fuer Zeitraum, Vorperiode, Cache und GAQL-Mapping

### Persistenz in `customer_integrations`
Google Ads sollte keine neue Tabelle bekommen. Stattdessen:
- ein Datensatz pro Kunde mit `integration_type = 'google_ads'`
- Tokens und Account-Metadaten verschluesselt in `credentials_encrypted`
- `status` als Lebenszyklus-Indikator

Empfohlene verschluesselte Felder:
- `access_token`
- `refresh_token`
- `token_expiry`
- `google_email`
- `google_ads_customer_id`
- `google_ads_customer_name`
- `google_ads_manager_customer_id`
- `currency_code`
- `cached_summary`
- `cached_at`

### Datenbank- und Constraint-Anpassungen
Fuer PROJ-51 sollten dieselben strukturellen Punkte wie bei GA4 saubergezogen werden:
- `customer_integrations.integration_type` muss `google_ads` weiterhin enthalten
- `status` sollte `token_expired` erlauben
- bestehende Service-Role-Upserts muessen mit dem finalen Statusmodell kompatibel bleiben

Falls gewuenscht, kann zusaetzlich ein Migrationsschritt vorgesehen werden, der:
- `status`-Constraint erweitert
- optional `ga4` ebenfalls in den `integration_type`-Constraint aufnimmt, falls dieser Repo-Stand noch nicht nachgezogen wurde

### Auth, Sicherheit und Tenant-Grenzen
- Setup- und Mutationsrouten immer nur mit `requireTenantAdmin`
- Dashboard-Read mit `requireTenantUser`
- Kundenzuordnung immer serverseitig gegen `tenant_id` verifizieren
- niemals rohe Tokens ans Frontend senden
- Redirect-URLs nur aus vertrauenswuerdigen Tenant-Daten aufbauen
- Soft-deleted Kunden duerfen nicht gelesen oder beschrieben werden

### Validierung und Fehlercodes
Alle neuen Routen sollten konsistent zu GA4 arbeiten:
- `400` bei fehlendem Tenant-Kontext oder ungueltigen Parametern
- `401` bei fehlender Session
- `403` bei fehlender Berechtigung oder widerrufener Verbindung
- `404` wenn Kunde oder Integration nicht existiert
- `409` bei nicht lesbaren Credentials nach Key-Mismatch
- `500` bei unerwarteten Google- oder DB-Fehlern

Zusatz:
- `isCredentialsDecryptError` aus `customer-credentials-encryption.ts` wiederverwenden
- Token-Revocation als eigene Error-Klasse behandeln, damit UI und Dashboard sprechende Meldungen erhalten

### Rate Limiting
Die neuen Routen sollten an bestehende Rate-Limit-Kategorien angeschlossen werden:
- OAuth-Start: bestehende Connect-Kategorie
- Accounts lesen: Read-Kategorie
- Account speichern / Disconnect: Write-Kategorie
- Dashboard lesen: Read-Kategorie

Wichtig:
- Rate-Limit-Key immer tenant-spezifisch und mit Client-IP kombinieren

### Caching und Snapshot-Erzeugung
Backend-seitig sollte `getGoogleAdsDashboardSnapshot()` folgendes leisten:
- Zeitraum und Vorperiode berechnen
- Kampagnenbericht laden
- aggregierte Summary berechnen
- Trends als Prozentwerte oder `null` bei fehlender Vergleichsbasis berechnen
- Ergebnis optional in verschluesseltem Cache speichern
- bei Google-Rate-Limit alten Cache bevorzugen

### Reihenfolge der Backend-Umsetzung
1. `google-ads-oauth.ts` und `google-ads-api.ts` anlegen
2. Migration fuer Status-/Constraint-Anpassungen vorbereiten
3. `oauth/start` und `oauth/callback` implementieren
4. `accounts`- und `select-account`-Routen implementieren
5. `DELETE`-Route zum Trennen ergaenzen
6. bestehende Dashboard-Stub-Route auf produktive Logik umstellen
7. Fehlerpfade fuer `token_expired`, Key-Mismatch und Rate-Limit validieren

## QA Test Results

### Testumfang
PROJ-51 beruehrt drei sensible Bereiche gleichzeitig:
- OAuth- und Credential-Handling
- kundenbezogene Integrationsverwaltung
- Dashboard-Daten fuer Tenant-Mitglieder

QA sollte deshalb nicht nur Happy Paths pruefen, sondern gezielt auf Tenant-Isolation, Token-Lebenszyklus, MCC-Account-Auswahl und Dashboard-Fallbacks achten.

### Happy-Path Tests

#### QA-1: Google Ads verbinden
- Als Admin Kundenverwaltung oeffnen
- Im Tab `Integrationen` auf `Mit Google Ads verbinden` klicken
- OAuth-Flow erfolgreich abschliessen
- Erwartung:
  - Redirect zurueck in die Kundenverwaltung
  - Google-Ads-Karte zeigt `Verbunden`
  - Google-Konto wird angezeigt
  - noch nicht ausgewaehlter Ads-Account wird als ausstehender Schritt erkennbar

#### QA-2: Ads-Account auswaehlen
- Nach erfolgreichem OAuth einen verfuegbaren Ads-Account auswaehlen
- Erwartung:
  - Auswahl wird gespeichert
  - Customer ID und ggf. Account-Name/Waehrung werden angezeigt
  - Neuladen der Seite behaelt die Auswahl

#### QA-3: Dashboard-Daten laden
- Mit verbundenem Kunden das Dashboard oeffnen
- Zeitraum auf `Heute`, `7d`, `30d`, `90d` umschalten
- Erwartung:
  - Google-Ads-Sektion laedt ohne Fehler
  - Kampagnentabelle zeigt Name, Status, Budget, Impressions, Klicks, Kosten, Conversions
  - globale KPI-Karten aktualisieren sich konsistent
  - Trendwerte aendern sich mit dem Zeitraum

#### QA-4: Verbindung trennen
- In der Kundenverwaltung `Verbindung trennen` ausfuehren und bestaetigen
- Erwartung:
  - Status wechselt auf `Nicht verbunden`
  - Customer-ID- und Kontoanzeige verschwinden
  - Dashboard zeigt wieder den `Nicht verbunden`-Zustand

### Rollen- und Sicherheitspruefungen

#### QA-5: Nur Admin darf verbinden
- Als Tenant-Mitglied ohne Admin-Rechte versuchen, den OAuth-Start auszufuehren
- Erwartung:
  - Start-Route liefert `403`
  - UI bietet keinen funktionierenden Connect-Pfad

#### QA-6: Nur Admin darf Account waehlen oder trennen
- Als Nicht-Admin `select-account` und `DELETE` direkt gegen die API aufrufen
- Erwartung:
  - `403`
  - keine Aenderung an `customer_integrations`

#### QA-7: Tenant-Isolation
- Mit User aus Tenant A versuchen, eine Google-Ads-Integration von Kunde aus Tenant B zu lesen oder zu veraendern
- Erwartung:
  - `404` oder `403` je nach Route
  - keine Datenleckage
  - kein Zugriff auf fremde Customer IDs, Kontonamen oder Kampagnendaten

#### QA-8: Soft-deleted Kunde
- Einen soft-geloeschten Kunden als Ziel fuer Start-, Select-, Delete- oder Dashboard-Route verwenden
- Erwartung:
  - Kunde wird nicht mehr lesbar/verarbeitbar
  - keine neuen Tokens oder Daten werden gespeichert

### OAuth- und Token-Tests

#### QA-9: OAuth abgebrochen
- Im Google-Flow abbrechen oder `access_denied` ausloesen
- Erwartung:
  - Redirect zur Kundenverwaltung mit sauberem Fehlerzustand
  - Status bleibt `Nicht verbunden`
  - keine unvollstaendige Integration wird angelegt

#### QA-10: Fehlender oder ungueltiger State
- Callback mit manipuliertem oder abgelaufenem `state` aufrufen
- Erwartung:
  - Request wird abgewiesen
  - keine Tokens werden gespeichert

#### QA-11: Fehlender Refresh Token
- OAuth-Callback ohne `refresh_token` simulieren
- Erwartung:
  - kein erfolgreicher Verbindungsstatus
  - sprechender Fehlerpfad fuer die UI

#### QA-12: Access-Token Refresh
- Ein ablaufendes Token in den gespeicherten Credentials hinterlegen
- Dashboard-Daten abrufen
- Erwartung:
  - Token wird serverseitig aktualisiert
  - Request bleibt fuer den Benutzer transparent erfolgreich
  - `credentials_encrypted` wird aktualisiert

#### QA-13: Widerrufener Refresh Token
- `invalid_grant` oder 401 beim Refresh simulieren
- Erwartung:
  - Status wechselt auf `token_expired`
  - Kundenverwaltung zeigt `Erneut verbinden`
  - Dashboard liefert `403` mit klarer Handlungsanweisung

### Google-Ads-spezifische Datenfaelle

#### QA-14: MCC / Manager-Account
- Ein Google-Konto mit mehreren untergeordneten Ads-Accounts verwenden
- Erwartung:
  - UI listet mehrere waehlbare Accounts
  - ausgewaehlter Sub-Account wird korrekt gespeichert
  - Dashboard liest Daten des Sub-Accounts, nicht des MCC-Containers

#### QA-15: Keine aktiven Kampagnen
- Kundenkonto mit nur pausierten Kampagnen oder ohne laufende Kampagnen verwenden
- Erwartung:
  - kein Fehler
  - leerer Erfolgszustand `Keine aktiven Kampagnen im gewaehlten Zeitraum`
  - Summary-Werte fallen auf `0`

#### QA-16: Fremdwaehrung
- Konto mit anderer Waehrung als EUR verwenden
- Erwartung:
  - Kosten/Budget werden in Originalwaehrung angezeigt
  - keine stillschweigende EUR-Konvertierung

#### QA-17: Sehr viele Kampagnen
- Konto mit grosser Kampagnenliste testen
- Erwartung:
  - Tabelle bleibt scrollbar und performant
  - keine abgeschnittenen oder falsch sortierten Werte

### Fehler- und Fallback-Tests

#### QA-18: Google API Rate Limit
- 429 von Google Ads simulieren
- Erwartung:
  - vorhandener Cache wird genutzt, falls gueltig
  - UI zeigt keinen Hard-Crash
  - ohne Cache kommt ein kontrollierter Fehlerzustand

#### QA-19: Key-Mismatch bei Entschluesselung
- `CUSTOMER_CREDENTIALS_ENCRYPTION_KEY` wechseln oder unlesbare Credentials simulieren
- Erwartung:
  - API liefert `409`
  - UI zeigt handlungsorientierten Fehler
  - keine stillen Null-Daten

#### QA-20: Dashboard ohne Verbindung
- Kunde ohne Google-Ads-Integration im Dashboard laden
- Erwartung:
  - Antwort `{ connected: false, data: null, trend: null }`
  - `NotConnectedCard` erscheint

### API-Vertragspruefungen

#### QA-21: Request-Validierung
- ungueltige `customerId`
- ungueltiger `range`
- fehlender `x-tenant-id`
- Erwartung:
  - konsistente `400`-Antworten
  - keine unerwarteten 500er

#### QA-22: Response-Shape
- Erfolgreiche Dashboard-Antwort gegen den erwarteten Contract pruefen
- Erwartung:
  - `connected`
  - `data.campaigns[]`
  - `data.summary`
  - `trend`
  - numerische Werte sind korrekt serialisiert

### Empfohlene Automatisierung
- API-Route-Tests fuer:
  - OAuth Start Validation
  - Account-Auswahl
  - Disconnect
  - Dashboard `connected: false`
  - Dashboard `403 token_expired`
  - Dashboard mit erfolgreichem Snapshot
- Integrationstests fuer:
  - Admin vs. Member Berechtigungen
  - Tenant-Isolation
  - MCC-Account-Auswahl
- UI-/E2E-Tests fuer:
  - Connect-Flow bis Account-Auswahl
  - Disconnect-Flow
  - Dashboard mit leerem und befuelltem Kampagnenzustand

### Regressionsrisiken
- Konflikt zwischen neuer dedizierter Google-Ads-Karte und altem generischem `google_ads`-Freitextfeld
- Inkonsistenzen im `status`-Constraint von `customer_integrations`
- Dashboard-KPI-Aggregation zeigt doppelte oder fehlende Werte, wenn nur Google Ads verbunden ist
- MCC-Auswahl speichert Manager-ID statt Client-ID

## Deployment
_To be added by /deploy_
