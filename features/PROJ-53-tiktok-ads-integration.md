# PROJ-53: TikTok Ads Integration

## Status: In Progress
**Created:** 2026-04-08
**Last Updated:** 2026-04-08

## Dependencies
- PROJ-29: Customer Database (CRM & Vault) — Integration wird in Kundenverwaltung gespeichert
- PROJ-49: Marketing Performance Dashboard — konsumiert TikTok Ads-Daten

## Overview
OAuth 2.0 Anbindung von TikTok for Business pro Kunde über die TikTok Marketing API. Liefert Kampagnen, Views, Klicks, CPC und Kosten für den gewählten Zeitraum.

## User Stories

### Als Agentur-Admin möchte ich
- **STORY-1:** TikTok Ads für einen Kunden via TikTok OAuth verbinden
- **STORY-2:** Das Advertiser-Konto auswählen
- **STORY-3:** Die Verbindung bei Bedarf trennen

### Als Agentur-Mitarbeiter möchte ich
- **STORY-4:** Kampagnen-Übersicht mit Views, Klicks, CPC und Kosten sehen
- **STORY-5:** Aktive TikTok-Kampagnen in der Gesamtübersicht mitzählen

## Acceptance Criteria

### AC-1: OAuth-Flow in Kundenverwaltung
- **GIVEN** ich bin Admin und öffne einen Kunden → Tab "Integrationen"
- **WHEN** ich auf "TikTok Ads verbinden" klicke
- **THEN** startet der TikTok OAuth-Flow
- **AND** nach Autorisierung kann ich das Advertiser-Konto auswählen
- **AND** Token und Advertiser ID werden verschlüsselt gespeichert

### AC-2: Kampagnen-Daten
- **GIVEN** TikTok Ads ist verbunden
- **WHEN** das Dashboard Daten anfordert
- **THEN** liefert die API für den gewählten Zeitraum:
  - Kampagnen-Liste: Name, Status, Video Views, Klicks, Kosten (€), CPC
  - Aggregiert: Gesamt-Views, Gesamt-Klicks, Ø CPC, Gesamt-Kosten

### AC-3: Token-Refresh
- TikTok Access Tokens (24h) via Refresh Token erneuern
- Bei Fehler: Admin-Benachrichtigung "TikTok Verbindung abgelaufen"

### AC-4: Verbindung trennen
- Token und Advertiser ID löschen, Status zurücksetzen

## Edge Cases

### EC-1: Mehrere Advertiser-Konten
- **WHEN** ein User mehrere TikTok Advertiser-Konten hat
- **THEN** kann der Admin das passende für den Kunden auswählen

### EC-2: TikTok API Geo-Restriktionen
- **WHEN** die TikTok API für bestimmte Regionen nicht verfügbar ist
- **THEN** erscheint eine entsprechende Fehlermeldung (kein stiller Fehler)

### EC-3: Fehlende Video Views
- **WHEN** Kampagnen keine Video Views haben (z. B. nur Click-Kampagnen)
- **THEN** wird 0 angezeigt, kein Fehler

## Technical Requirements

### API-Route
- `GET /api/tenant/integrations/tiktok-ads/[customerId]?range=7d`
- `GET /api/tenant/integrations/tiktok-ads/oauth/callback`
- `DELETE /api/tenant/integrations/tiktok-ads/[customerId]`

### TikTok API
- TikTok Marketing API v1.3+
- OAuth 2.0 mit App ID + App Secret
- Scopes: `ad.read`

---

## Tech Design (Solution Architect)

### Architektur-Zielbild: TikTok Ads und GSC nebeneinander, nicht vermischen

`GSC` und `TikTok Ads` bedienen im Produkt zwei unterschiedliche Daten-Domänen:
- `GSC` bleibt projektbezogen im SEO-/Keyword-Workspace (`keyword_projects`, `gsc_connections`)
- `TikTok Ads` wird kundenbezogen im Marketing-/CRM-Kontext aufgebaut (`customers`, `customer_integrations`)

Beide Integrationen sollen sich aber technisch gleich anfuehlen:
- OAuth nur serverseitig
- signierter `state` fuer CSRF-Schutz
- verschluesselte Tokens in der DB
- serverseitiger Token-Refresh
- Dashboard konsumiert nur normalisierte Read-Modelle, nie rohe Provider-Credentials

Damit entsteht eine konsistente Integrationsarchitektur:
- **SEO-Integrationen** haengen am Keyword-/Domain-Kontext eines Projekts
- **Marketing-Integrationen** haengen am Kunden-/Advertiser-Kontext eines Customers

TikTok Ads soll deshalb **nicht** in die bestehende `gsc_connections`-Logik oder in projektbezogene Tabellen gepresst werden. Die Gemeinsamkeit mit GSC liegt im Sicherheits- und OAuth-Muster, nicht im Datenmodell.

### Bestehende Infrastruktur (wird wiederverwendet)
- `customer_integrations` aus PROJ-29 als zentraler Vault fuer kundenbezogene Integrationen
- `customer-detail-workspace.tsx` mit Tab `Integrationen` als Admin-Einstiegspunkt
- `customer-credentials-encryption.ts` fuer AES-256-GCM-Verschluesselung
- `requireTenantUser` / `requireTenantAdmin` aus `@/lib/auth-guards`
- Stub-Route `src/app/api/tenant/dashboard/tiktok/route.ts` als bestehender Konsum-Punkt fuer PROJ-49
- GSC-/GA4-OAuth-Muster (`gsc-oauth.ts`, `ga4-oauth.ts`) als Vorlage fuer State-Signatur, Callback und Token-Lifecycle

### Strategische Abgrenzung zu GSC

| Thema | GSC | TikTok Ads |
|---|---|---|
| Fachlicher Scope | SEO / organische Sichtbarkeit | Paid Social / Kampagnen-Performance |
| Primarer Kontext | `keyword_project` | `customer` |
| Persistenz | `gsc_connections` | `customer_integrations` |
| Auswahlobjekt | Search Console Property | TikTok Advertiser Account |
| Haupt-Konsument | Keyword-/SEO-Workspace | Marketing Dashboard |
| KPI-Typ | Klicks, Impressions, CTR, Position | Views, Klicks, Kosten, CPC |

Diese Trennung ist wichtig, damit das Dashboard spaeter mehrere Quellen parallel laden kann, ohne dass ein Customer zwingend an ein einzelnes Keyword-Projekt gebunden ist.

### Datenmodell
Primaerspeicher bleibt `customer_integrations`; fuer TikTok Ads wird `credentials_encrypted` als verschluesseltes JSON genutzt.

Voraussetzung:
- `customer_integrations.integration_type` muss `tiktok_ads` erlauben
- `customer_integrations.status` sollte konsistent mit den anderen neuen Integrationen mindestens `connected`, `disconnected`, `token_expired` unterstuetzen

Empfohlene Struktur in `credentials_encrypted`:
- `access_token`
- `refresh_token`
- `token_expiry`
- `tiktok_open_id`
- `tiktok_display_name`
- `selected_advertiser_id`
- `selected_advertiser_name`
- `currency`
- `cached_summary` optional
- `cached_campaigns` optional
- `cached_trend` optional
- `cached_at` optional

Statusmodell:
- `disconnected` fuer nie verbunden oder bewusst getrennt
- `connected` fuer OAuth erfolgreich und Advertiser ausgewaehlt
- `token_expired` fuer widerrufene oder ungueltige Tokens

### Komponentenstruktur

```
customer-detail-workspace (bestehend)
└── Tab: "Integrationen" (bestehend)
    └── TikTokAdsIntegrationCard (NEU)
        ├── Status Badge: "Verbunden" / "Nicht verbunden" / "Erneut verbinden"
        ├── [Nicht verbunden] → Button "Mit TikTok verbinden"
        ├── [OAuth fertig, kein Advertiser] → AdvertiserSelector
        ├── [Mehrere Advertiser] → Auswahl des passenden Kunden-Accounts
        └── [Verbunden] → TikTok Account + Advertiser + "Trennen"-Button

marketing-dashboard-workspace (PROJ-49)
└── TikTokSection (bestehend, derzeit Stub)
    ├── KPI-Zeile: aktive Kampagnen / Views / Klicks / Kosten / Ø CPC
    ├── CampaignsTable: Name, Status, Video Views, Klicks, Kosten, CPC
    ├── Trend-Vergleich zur Vorperiode fuer globale KPI-Karten
    └── [Nicht verbunden] → NotConnectedCard mit Link zur Kundenverwaltung
```

### Neue Server-Module
- `src/lib/tiktok-ads-oauth.ts`
  Zweck: OAuth-Start-URL, signierter `state`, Code-Exchange, Token-Refresh, User-Metadaten
- `src/lib/tiktok-ads-api.ts`
  Zweck: Advertiser-Liste laden, Kampagnen- und Reporting-Daten abrufen, Fehler normalisieren, Cache nutzen

Wie bei GSC/GA4/Meta/Google Ads sollten direkte `fetch()`-Aufrufe bevorzugt werden statt eines schweren SDKs. Das passt besser zum aktuellen Repo-Stil.

### API-Routen

| Route | Zweck |
|---|---|
| `GET /api/tenant/integrations/tiktok-ads/oauth/start?customerId=` | OAuth-URL fuer Admin erzeugen |
| `GET /api/tenant/integrations/tiktok-ads/oauth/callback` | Code gegen Tokens tauschen, vorlaeufige Verbindung speichern, Redirect zur Kundenverwaltung |
| `GET /api/tenant/integrations/tiktok-ads/[customerId]/advertisers` | Verfuegbare TikTok Advertiser Accounts listen |
| `POST /api/tenant/integrations/tiktok-ads/[customerId]/select-advertiser` | Ausgewaehlten Advertiser speichern |
| `GET /api/tenant/dashboard/tiktok?customerId=&range=` | Dashboard-Daten fuer PROJ-49 liefern |
| `DELETE /api/tenant/integrations/tiktok-ads/[customerId]` | Verbindung trennen und Credentials loeschen |

Die Route-Namen werden bewusst an PROJ-50/51/52 angeglichen. Das macht die Customer-Integrationen konsistent und unterscheidet sie klar von den projektbezogenen GSC-Routen unter `/api/tenant/keywords/projects/...`.

### OAuth- und Verbindungs-Flow
1. Admin klickt in der Kundenverwaltung auf `Mit TikTok verbinden`.
2. `/oauth/start` validiert Tenant + Admin-Rolle und erzeugt einen signierten `state` mit `customerId`, `tenantId`, `userId`, `nonce`, `issuedAt`.
3. Redirect zu TikTok OAuth mit minimalem Read-Scope.
4. Callback validiert `state`, tauscht `code` gegen Access- und Refresh-Token und speichert die verschluesselten Credentials in `customer_integrations`.
5. UI laedt ueber `/advertisers` die verknuepfbaren Advertiser Accounts.
6. Admin waehlt den passenden Advertiser fuer den Kunden.
7. `/select-advertiser` speichert `selected_advertiser_id`, Anzeigename und Waehrung. Erst dann gilt die Verbindung als fachlich vollstaendig.

### Dashboard-Datenfluss
1. `marketing-dashboard-workspace.tsx` ruft `/api/tenant/dashboard/tiktok?customerId=&range=` auf.
2. Route validiert `x-tenant-id` und Benutzer-Mitgliedschaft mit `requireTenantUser`.
3. Server liest die TikTok-Integration des gewaehlten Kunden aus `customer_integrations`.
4. Falls kein gueltiger Advertiser hinterlegt ist: Rueckgabe `{ connected: false, data: null, trend: null }`.
5. Falls verbunden: Token pruefen, bei Bedarf serverseitig refreshen, dann Kampagnen- und Summary-Daten fuer aktuellen Zeitraum und Vorperiode laden.
6. Route mappt die TikTok-Rohdaten auf den bestehenden Dashboard-Contract:
   - `campaigns[]`: `name`, `status`, `videoViews`, `clicks`, `cost`, `cpc`
   - `data.summary`: `activeCampaigns`, `videoViews`, `clicks`, `cost`, `averageCpc`, `currency`
   - `trend`: Vergleichswerte zur Vorperiode fuer KPI-Karten

### Zusammenspiel mit GSC im Dashboard
Im Marketing Dashboard sollen `GSC` und `TikTok Ads` als **parallele Sektionen** auftreten, nicht als gemeinsame Datenquelle.

Empfohlene Regel:
- `GSC` liefert organische Nachfrage-/SEO-Signale: `impressions`, `clicks`, `ctr`, `position`, `topKeywords`
- `TikTok Ads` liefert Paid-Social-Signale: `videoViews`, `clicks`, `cost`, `cpc`, `campaigns`

Gemeinsame Nutzung nur auf der Aggregationsschicht:
- globale KPI-Karten duerfen Werte aus mehreren Plattformen zusammenziehen
- Plattform-Sektionen bleiben fachlich getrennt
- kein gemeinsames "Google/TikTok"-Modell und keine gemeinsame Connection-Tabelle

So bleibt spaeter moeglich:
- organische vs. bezahlte Klicks nebeneinander zu lesen
- Trends je Kanal sauber zu erklaeren
- Customer ohne SEO-Projekt trotzdem mit TikTok-Dashboard zu unterstuetzen

### TikTok API Mapping
Empfohlene fachliche Zielwerte fuer V1:
- Kampagnenliste:
  - `name`
  - `status`
  - `videoViews`
  - `clicks`
  - `cost`
  - `cpc`
- Summary:
  - `activeCampaigns`
  - `totalVideoViews`
  - `totalClicks`
  - `totalCost`
  - `averageCpc`
  - `currency`

Normalisierung im App-Layer:
- fehlende `videoViews` werden als `0` behandelt
- `cpc` bevorzugt aus `cost / clicks` berechnen, damit die Logik konsistent zu Google Ads bleibt
- aktive Kampagnen = provider-spezifische Status auf internes `active`/`paused` Mapping reduzieren

### Token-Lifecycle und Fehlerbehandlung
- Vor jedem API-Aufruf: `token_expiry` pruefen; bei kurzer Restlaufzeit Refresh versuchen
- Erfolgreicher Refresh aktualisiert `credentials_encrypted` atomar
- Bei ungueltigem Refresh Token oder Provider-401: Status auf `token_expired`
- Dashboard liefert dann `connected: false` plus sprechenden Fehlerhinweis
- Kundenverwaltung zeigt `Erneut verbinden`

Damit folgt TikTok demselben Recovery-Muster wie GSC und GA4: keine stillen Fehler, sondern expliziter Statuswechsel.

### Caching und Resilienz
- TTL: 15 Minuten pro Kunde/Zeitraum, analog zu PROJ-49/50/51/52
- Cache fuer V1 in `credentials_encrypted` ausreichend:
  - `cached_summary`
  - `cached_campaigns`
  - `cached_trend`
  - `cached_at`
- Bei temporaeren TikTok-Fehlern oder Geo-Restriktionen darf der letzte gueltige Cache geliefert werden
- Antwort sollte ein Flag wie `isCached` und optional `cacheAgeMinutes` enthalten

### Sicherheit
- Tokens verlassen nie das Backend
- OAuth-Start, Advertiser-Auswahl und Trennen sind strikt Admin-only
- Dashboard-Endpunkt bleibt fuer Tenant-Mitglieder lesbar, aber nur im aktiven Tenant-/Kundenkontext
- `state` muss HMAC-signiert und zeitlich begrenzt sein
- Advertiser IDs und Account-Namen gelten als Kundenkonfiguration und werden nur im legitimen Tenant-Kontext gezeigt
- Fehler-Responses duerfen keine rohen TikTok-Payloads mit sensitiven Feldern ans Frontend durchreichen

### Umgebungsvariablen
- `TIKTOK_APP_ID` oder `TIKTOK_CLIENT_KEY` je nach TikTok-App-Konfiguration
- `TIKTOK_APP_SECRET` oder passendes Secret gemaess TikTok OAuth-Setup
- `TIKTOK_ADS_STATE_SECRET`
- `CUSTOMER_CREDENTIALS_ENCRYPTION_KEY`
- `NEXT_PUBLIC_APP_URL`

### Tech-Entscheidungen

| Entscheidung | Warum |
|---|---|
| `customer_integrations` statt neuer Tabelle | TikTok Ads ist kundenbezogen wie GA4/Meta/Google Ads, nicht projektbezogen wie GSC |
| OAuth-/Security-Muster von GSC wiederverwenden | Bereits bewaehrt, reduziert Sicherheits- und Implementierungsrisiko |
| Dashboard-Route getrennt von Setup-Routen | Admin-Konfiguration und Mitarbeiter-Lesezugriff bleiben sauber getrennt |
| Plattformen im Dashboard fachlich getrennt halten | Organische und Paid-Daten bleiben erklaerbar und austauschbar |
| DB-Cache fuer V1 | Keine neue Infrastruktur, ausreichend fuer Rate-Limit- und Ausfall-Puffer |

### Offene Punkte vor /backend
- Exakte TikTok-Endpunkte und Feldnamen fuer Advertiser-Liste und Kampagnen-Reporting gegen die genutzte API-Version verifizieren
- Pruefen, ob `customer_integrations` in allen Umgebungen `tiktok_ads` und `token_expired` bereits erlaubt
- Entscheiden, ob Dashboard bei Geo-Restriktionen hart auf Fehler geht oder bevorzugt stale Cache mit Hinweis zeigt
- Validieren, welche TikTok-Metrik im UI als `Views` angezeigt werden soll (`video_views` vs. allgemeine impressions-nahe Kennzahl)

## QA Test Results

### 2026-04-08

- Code-Review auf Backend-Risiken fuer OAuth-Refresh und Reporting-Mapping durchgefuehrt
- `src/lib/tiktok-ads-oauth.ts`
  - Refresh nutzt jetzt primaer `/oauth2/refresh_token/`
  - Fallback auf `/oauth2/access_token/` mit `grant_type=refresh_token`, falls die genutzte TikTok-App nur das aeltere Muster akzeptiert
  - klarere Fehlerklassifikation fuer widerrufene/ungueltige Tokens
- `src/lib/tiktok-ads-api.ts`
  - defensivere Listen-Extraktion fuer Advertiser-, Campaign- und Report-Responses
  - Report-Responses werden auf erkennbare Kampagnen-/Metrikfelder validiert
  - bei unerwartetem TikTok-Schema wird jetzt ein gezielter Contract-Fehler statt eines stillen Leerlaufs erzeugt
- API-Routen liefern fuer Contract-Abweichungen gezielte `502`-Responses mit sprechender Fehlermeldung
- OAuth-Callback speichert als Default-Anzeigename jetzt `TikTok Business` statt eines technischen `open_id`-Strings
- Verifiziert:
  - `npm run -s build` erfolgreich
- Rest-Risiko:
  - Live-Validierung gegen echte TikTok-for-Business-Credentials steht weiterhin aus
  - das konkrete Reporting-Schema der genutzten TikTok-App-Version muss in Sandbox/Prod bestaetigt werden

## Deployment
_To be added by /deploy_

## Implementation Notes (Frontend)

- Kundenverwaltung erweitert: `src/components/customer-detail-workspace.tsx`
  - Neue `TikTokAdsIntegrationCard` im Tab `Integrationen`
  - UI-Zustaende fuer `nicht verbunden`, `verbunden`, `erneut verbinden`
  - vorbereitete CTA-Handler fuer OAuth-Start, Advertiser-Auswahl und Disconnect
  - Advertiser-Selector mit graceful Fallback solange `/api/tenant/integrations/tiktok-ads/...` noch nicht implementiert ist
  - bestaetigender Disconnect-Dialog analog zu GA4/Meta Ads
- Kundenverwaltung Routing erweitert: `src/components/customers-management-workspace.tsx`
  - Query-Parameter `tiktok=connected` und `tiktok_error=...` werden verarbeitet
  - Kundendialog kann damit nach dem OAuth-Callback direkt wieder im Integrationen-Tab landen
- Dashboard erweitert: `src/components/marketing-dashboard-workspace.tsx`
  - TikTok-Sektion zeigt KPI-Zeile fuer aktive Kampagnen, Video Views, Klicks und Avg. CPC
  - Kampagnen-Tabelle um Status erweitert
  - unterstuetzt Cache-/Hinweis-Banner und robustere TikTok-Datenfelder (`videoViews`, `averageCpc`, `activeCampaigns`, `currency`)

### Frontend-Status
- UI fuer PROJ-53 ist vorbereitet und in die bestehenden Workflows eingebettet
- Die eigentliche Datenversorgung haengt noch von `/backend` ab
- Solange die TikTok-API-Routen fehlen, zeigen Auswahl- und Connect-Flows bewusst sprechende Fallbacks statt still zu brechen

## Implementation Notes (Backend)

- Neue Libraries:
  - `src/lib/tiktok-ads-oauth.ts`
    - signierter OAuth-`state`
    - Authorization-URL
    - Code-Exchange
    - Token-Refresh
    - optionaler Revoke-Call beim Disconnect
  - `src/lib/tiktok-ads-api.ts`
    - `customer_integrations`-Zugriff fuer `tiktok_ads`
    - AES-verschluesselte Credentials via bestehendem Vault
    - Advertiser-Liste
    - Kampagnen- und Report-Normalisierung fuer Dashboard und Customer-Route
    - 15-Minuten-Cache pro Zeitraum
- Neue API-Routen:
  - `GET /api/tenant/integrations/tiktok-ads/oauth/start`
  - `GET /api/tenant/integrations/tiktok-ads/oauth/callback`
  - `GET /api/tenant/integrations/tiktok-ads/[customerId]/advertisers`
  - `POST /api/tenant/integrations/tiktok-ads/[customerId]/select-advertiser`
  - `GET|DELETE /api/tenant/integrations/tiktok-ads/[customerId]`
  - `GET /api/tenant/dashboard/tiktok`
- Neue Migration:
  - `supabase/migrations/040_tiktok_ads_customer_integrations.sql`
  - erweitert `customer_integrations.integration_type` um `tiktok_ads`

### Backend-Status
- Backend ist strukturell implementiert und compilet erfolgreich
- Dashboard und Kundenverwaltung koennen jetzt dieselben TikTok-Routen ansprechen
- End-to-End gegen echte TikTok-Credentials wurde noch nicht validiert
- Die exakten TikTok-Endpunkte/Feldnamen muessen in `/qa` bzw. mit realen Sandbox-/Prod-Credentials bestaetigt werden
