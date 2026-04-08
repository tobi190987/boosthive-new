# PROJ-49: Marketing Performance Dashboard

## Status: In Progress
**Created:** 2026-04-08
**Last Updated:** 2026-04-08

### Implementation Notes (Frontend)
- Dashboard page replaced: `/dashboard` now uses `MarketingDashboardWorkspace` instead of `TenantDashboardOverview`
- 5 stub API routes created under `/api/tenant/dashboard/` (ga4, gsc, google-ads, meta-ads, tiktok) -- all return `connected: false`
- All components in single `marketing-dashboard-workspace.tsx`: KPICard, TrendBadge, PlatformBadge, NotConnectedCard, PlatformErrorState, PlatformSkeleton, MetricItem, GA4Section, GSCSection, GoogleAdsSection, MetaAdsSection, TikTokSection
- Uses existing: `CustomerSelectorDropdown`, `NoCustomerSelected`, `TrendAreaChart`, `useActiveCustomer`
- URL state: `?range=30d` (customer selection via ActiveCustomerContext/localStorage)
- PDF export via `window.print()` with print-specific CSS classes
- Loading skeleton updated to match 6-card KPI grid + 5 accordion sections
- All platform sections show "Nicht verbunden" with link to Kundenverwaltung until real integrations (PROJ-50..53) are built

## Dependencies
- PROJ-28: Globaler Kunden-Selektor — für Kunden-Auswahl
- PROJ-29: Customer Database (CRM & Vault) — für Kunden-Stammdaten
- PROJ-50: GA4 Integration — für Besucher-Metriken
- PROJ-51: Google Ads Integration — für Kampagnen-Metriken
- PROJ-52: Meta Ads Integration — für Social-Ads-Metriken
- PROJ-53: TikTok Ads Integration — für TikTok-Metriken
- PROJ-26: Google Search Console Integration — für SEO-Metriken

## Overview
Das Marketing Performance Dashboard ist die Startseite nach dem Login und zeigt aggregierte KPIs eines ausgewählten Kunden über alle verbundenen Plattformen (GA4, GSC, Google Ads, Meta Ads, TikTok). Oben globale KPI-Karten, darunter aufklappbare Plattform-Sektionen mit detaillierten Metriken. PDF-Export für Berichte. Einziger Einstiegspunkt für Agentur-Mitarbeiter nach dem Login.

## User Stories

### Als Agentur-Mitarbeiter möchte ich
- **STORY-1:** Nach dem Login sofort einen Überblick über alle KPIs meines ausgewählten Kunden sehen, um schnell den Status zu beurteilen
- **STORY-2:** Den Zeitraum (Heute / 7 Tage / 30 Tage / 90 Tage) wechseln können, um Trends zu erkennen
- **STORY-3:** Zwischen Kunden wechseln können ohne die Seite zu verlassen, um effizient zu arbeiten
- **STORY-4:** Einen PDF-Bericht mit allen KPIs exportieren können, um ihn dem Kunden zu schicken
- **STORY-5:** Sehen, welche Plattformen verbunden sind und welche nicht, um fehlende Integrationen zu erkennen

### Als Agentur-Admin möchte ich
- **STORY-6:** Das Dashboard als Startseite konfigurieren können, damit Mitarbeiter direkt in die Arbeit starten
- **STORY-7:** KPI-Trends im Vergleich zum Vorperiode sehen (z. B. +8%), um Fortschritt zu messen

## Acceptance Criteria

### AC-1: Dashboard als Startseite
- **GIVEN** ein eingeloggter User besucht `/`
- **THEN** wird er direkt zum Marketing Performance Dashboard weitergeleitet
- **AND** es gibt einen festen Menüpunkt "Dashboard" in der Navigation

### AC-2: Kunden-Selektor
- **GIVEN** das Dashboard ist geladen
- **WHEN** kein Kunde ausgewählt ist
- **THEN** sehe ich einen prominenten Kunden-Selektor mit Aufforderung zur Auswahl
- **WHEN** ein Kunde ausgewählt ist
- **THEN** wird er in der Session gespeichert und beim nächsten Besuch vorausgewählt

### AC-3: Zeitraum-Filter
- **GIVEN** ein Kunde ist ausgewählt
- **WHEN** ich einen Zeitraum wähle (Heute / Letzte 7 Tage / Letzte 30 Tage / Letzte 90 Tage)
- **THEN** werden alle KPI-Karten und Plattform-Sektionen mit dem gewählten Zeitraum neu geladen
- **AND** der gewählte Zeitraum wird in der URL gespeichert (Query-Parameter)

### AC-4: Globale KPI-Karten (oberer Bereich)
- **GIVEN** ein Kunde mit mindestens einer verbundenen Integration ist ausgewählt
- **THEN** sehe ich folgende KPI-Karten oben:
  - **Besucher** (aus GA4): Gesamtzahl + Trend vs. Vorperiode
  - **Aktive Kampagnen** (aus Google Ads + Meta + TikTok): Summe aller aktiven Kampagnen
  - **Ø CPC** (aus Google Ads): Kosten pro Klick
  - **Ø CPM** (aus Meta / TikTok): Kosten pro 1000 Impressions
  - **Conversions** (aus Google Ads + GA4): Gesamt-Conversions
  - **Gesamtausgaben** (aus allen Ads-Plattformen): Summe in €
- **AND** jede KPI-Karte zeigt den Trend (Pfeil + % vs. Vorperiode) in Grün/Rot

### AC-5: Plattform-Sektionen (unterer Bereich, aufklappbar)
- **GIVEN** ein Kunde ist ausgewählt
- **THEN** sehe ich für jede Plattform eine aufklappbare Sektion:
  - **GA4:** Sessions, Nutzer, Seitenaufrufe, Absprungrate, Ø Verweildauer — inkl. Linien-Chart (Besucher über Zeit)
  - **GSC:** Impressions, Klicks, Ø CTR, Ø Position — inkl. Top-10 Keywords
  - **Google Ads:** Aktive Kampagnen-Liste (Name, Status, Budget, Klicks, Kosten, Conversions)
  - **Meta Ads:** Kampagnen-Liste (Name, Reichweite, Impressions, CPM, Conversions)
  - **TikTok Ads:** Kampagnen-Liste (Name, Views, Klicks, CPC, Kosten)
- **AND** nicht verbundene Plattformen werden als "Nicht verbunden" mit Link zur Kundenverwaltung angezeigt

### AC-6: Verbindungs-Status-Anzeige
- **GIVEN** eine Plattform ist nicht mit dem Kunden verbunden
- **WHEN** ich die entsprechende Sektion aufklappe
- **THEN** sehe ich einen "Verbinden" Button der direkt zur Integration in der Kundenverwaltung führt
- **AND** der Status wird als Badge neben dem Plattform-Namen angezeigt (●Verbunden / ○Nicht verbunden)

### AC-7: PDF-Export
- **GIVEN** ein Kunde und Zeitraum sind ausgewählt
- **WHEN** ich auf "Bericht exportieren" klicke
- **THEN** wird ein PDF generiert mit:
  - Kunden-Logo + Name + Zeitraum als Header
  - Alle globalen KPI-Karten
  - Alle verbundenen Plattform-Sektionen mit Metriken
  - Datum der Erstellung und Agentur-Branding
- **AND** der Download startet automatisch

### AC-8: Lade-Zustände
- **GIVEN** Daten werden von APIs abgerufen
- **THEN** sehen ich Skeleton-Loader für jede KPI-Karte und Sektion
- **AND** einzelne Plattformen können unabhängig laden (kein globaler Spinner)
- **AND** bei API-Fehler einer Plattform sehe ich eine Fehlermeldung nur für diese Sektion

## Edge Cases

### EC-1: Kein Kunde vorhanden
- **WHEN** die Agentur noch keine Kunden angelegt hat
- **THEN** sehe ich eine leere State-Seite mit CTA "Ersten Kunden anlegen"

### EC-2: Kein Kunde ausgewählt
- **WHEN** ich das Dashboard öffne ohne vorherige Auswahl
- **THEN** sehe ich den Kunden-Selektor prominent in der Mitte
- **AND** alle KPI-Bereiche sind ausgegraut / nicht sichtbar

### EC-3: Alle Integrationen fehlen
- **WHEN** ein Kunde ausgewählt ist aber keine Plattform verbunden ist
- **THEN** sehe ich eine Hinweis-Box "Keine Integrationen verbunden" mit Link zur Kundenverwaltung
- **AND** alle Plattform-Sektionen zeigen "Nicht verbunden"

### EC-4: Teilweise Integrationen
- **WHEN** nur manche Plattformen verbunden sind (z. B. nur GA4 + GSC)
- **THEN** werden die verbundenen Plattformen mit Daten angezeigt
- **AND** nicht verbundene Plattformen werden am Ende der Liste mit "Nicht verbunden" Badge gezeigt

### EC-5: API-Fehler einer Plattform
- **WHEN** eine Plattform-API einen Fehler zurückgibt (Rate Limit, Auth-Fehler)
- **THEN** zeigt nur diese Sektion einen Fehler-State mit Retry-Button
- **AND** alle anderen Sektionen funktionieren weiterhin normal

### EC-6: Zeitzone
- **WHEN** Zeitraum "Heute" ausgewählt ist
- **THEN** wird die Zeitzone des Tenants / Browsers verwendet
- **AND** "Heute" = 00:00–23:59 Uhr lokaler Zeit

### EC-7: PDF-Export bei teilweisen Daten
- **WHEN** der PDF-Export gestartet wird aber einige Plattformen nicht verbunden sind
- **THEN** enthält das PDF nur die verbundenen Plattformen
- **AND** es gibt einen Hinweis "X Integrationen nicht verbunden" im PDF-Footer

## Technical Requirements

### Performance
- Initiales Laden des Dashboards: < 1 Sekunde (ohne API-Calls)
- Plattform-Daten: < 3 Sekunden pro Plattform (parallel geladen)
- PDF-Generierung: < 5 Sekunden
- Daten-Caching: 15 Minuten pro Plattform/Kunde/Zeitraum-Kombination

### Security
- Alle API-Calls laufen über serverseitige Next.js API-Routes (kein direkter Frontend-Zugriff auf OAuth Tokens)
- Kein Caching sensibler Daten im Browser (kein localStorage für Metriken)
- RLS: User kann nur Kunden seines Tenants sehen

### UI/UX Anforderungen
- Responsive: Desktop (primär), Tablet, Mobile
- Dark/Light Mode kompatibel
- Animierte KPI-Karten beim Laden (count-up Animation)
- Plattform-Farben: GA4 (orange), GSC (blau), Google Ads (grün), Meta (blau/lila), TikTok (schwarz/pink)
- Skeleton Loader für alle Lade-Zustände

### Routing
- Dashboard-URL: `/dashboard` (Startseite leitet um)
- URL-Parameter: `?customer=<id>&range=7d` (für direkte Links und Browser-Zurück)

---

## Tech Design (Solution Architect)

### Strategische Entscheidung: Dashboard-Ersatz

Das aktuelle `/dashboard` zeigt Module, Aktivitäten und Schnellzugriff. PROJ-49 ersetzt dieses durch das Marketing-Performance-Dashboard als neuen primären Einstiegspunkt. Die bisherigen Workspace-Inhalte entfallen oder wandern in eine sekundäre Seite.

### Komponenten-Struktur

```
/dashboard (page.tsx — Server Component)
+-- MarketingDashboardWorkspace (Client Component)
    |
    +-- DashboardHeader
    |   +-- CustomerSelectorDropdown (bestehend wiederverwenden)
    |   +-- DateRangeTabs (Heute / 7T / 30T / 90T) — URL-Query-Parameter
    |   +-- ExportButton ("Bericht exportieren")
    |
    +-- EmptyState: Keine Kunden → CTA "Ersten Kunden anlegen"
    +-- EmptyState: Kein Kunde gewählt → NoCustomerSelectedState (bestehend)
    +-- [Wenn Kunde gewählt]:
        |
        +-- GlobalKPIGrid (6 Karten)
        |   +-- KPICard: Besucher (GA4) — Zahl + Trend-Pfeil %
        |   +-- KPICard: Aktive Kampagnen (Ads gesamt) — Summe
        |   +-- KPICard: Ø CPC (Google Ads) — Euro
        |   +-- KPICard: Ø CPM (Meta / TikTok) — Euro
        |   +-- KPICard: Conversions (Google Ads + GA4) — Summe
        |   +-- KPICard: Gesamtausgaben (alle Ads) — Euro
        |   (jede Karte: Skeleton beim Laden + Trend-Badge grün/rot)
        |
        +-- PlatformSectionsAccordion (shadcn Accordion)
            +-- PlatformSection: GA4 (orange)
            |   +-- StatusBadge (● Verbunden / ○ Nicht verbunden)
            |   +-- MetricsRow + VisitorsLineChart (recharts)
            |   -- ODER NotConnectedCard + "Verbinden" Link
            +-- PlatformSection: GSC (blau)
            |   +-- MetricsRow + TopKeywordsTable
            +-- PlatformSection: Google Ads (grün)
            |   +-- CampaignsTable
            +-- PlatformSection: Meta Ads (blau/lila)
            |   +-- CampaignsTable
            +-- PlatformSection: TikTok Ads (schwarz/pink)
                +-- CampaignsTable

+-- PrintLayout (versteckt, nur beim PDF-Export sichtbar)
    +-- PDFHeader (Kunden-Logo, Name, Zeitraum, Agentur-Branding)
    +-- Alle KPI-Karten + verbundene Plattform-Sektionen
    +-- PDFFooter (Datum, nicht verbundene Plattformen Hinweis)
```

### Datenmodell

**URL-Zustand:** `?customer=<uuid>&range=30d`

**Pro Plattform (React State):**
- `connected: boolean` — Verbindungsstatus aus Kunden-Integrations-Daten
- `loading: boolean`
- `error: string | null`
- `data: PlatformMetrics | null`

**GA4:** Sessions, Nutzer, Seitenaufrufe, Absprungrate, Ø Verweildauer + Zeitreihe [{Datum, Sessions}]
**GSC:** Impressions, Klicks, Ø CTR, Ø Position + Top-10 Keywords
**Ads-Plattformen:** Kampagnenlisten mit plattformspezifischen Feldern

### Neue API Routes (Daten-Verträge)

| Route | Gebaut in |
|-------|-----------|
| `/api/tenant/dashboard/ga4?customerId=&range=` | PROJ-50 (Stub in PROJ-49) |
| `/api/tenant/dashboard/gsc?customerId=&range=` | PROJ-26 existiert bereits |
| `/api/tenant/dashboard/google-ads?customerId=&range=` | PROJ-51 (Stub in PROJ-49) |
| `/api/tenant/dashboard/meta-ads?customerId=&range=` | PROJ-52 (Stub in PROJ-49) |
| `/api/tenant/dashboard/tiktok?customerId=&range=` | PROJ-53 (Stub in PROJ-49) |

PROJ-49 baut nur die UI-Shell — Stubs geben `{ connected: false, data: null }` zurück.

### PDF Export: Browser-Print-Strategie

Kein neues Paket. `window.print()` mit print-optimiertem CSS + versteckter PrintLayout-Komponente.

### Wiederverwendete Komponenten

- `customer-selector-dropdown.tsx` — direkt wiederverwendbar
- `no-customer-selected.tsx` — für leeren Zustand
- `recharts` — bereits installiert, für GA4-Linien-Chart
- shadcn/ui: `Accordion`, `Skeleton`, `Badge`, `Card`, `Tabs`

### Neue Abhängigkeiten

Keine — alle benötigten Pakete bereits installiert.

### Tech-Entscheidungen

| Entscheidung | Begründung |
|---|---|
| Parallele Plattform-Fetches | Eine langsame API blockiert nicht die anderen |
| URL-Zustand für Kunde + Zeitraum | Direkte Links + kein localStorage für Metriken (Security) |
| Accordion für Plattform-Sektionen | Übersichtlicher bei 5 Plattformen |
| Stub-API-Routes in PROJ-49 | Dashboard vollständig testbar ohne echte Integrationen |
| Browser-Print für PDF | Kein neues Paket, wartungsarm |

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
