# PROJ-57: Budget & Ad Spend Tracking

## Overview
Überwachung von Werbebudgets über alle verbundenen Ads-Plattformen (Google Ads, Meta Ads, TikTok Ads) mit Soll/Ist-Vergleich, Verbrauchsfortschritt und Alerts bei Budgetüberschreitung. Direkte Erweiterung der bestehenden Ads-Integrationen (PROJ-51–53).

## User Stories

### Als Agentur-Admin möchte ich
- **STORY-1:** Das geplante Monatsbudget pro Kunde und pro Plattform hinterlegen können, um den Fortschritt zu tracken
- **STORY-2:** Den aktuellen Budgetverbrauch auf einen Blick sehen (wie viel wurde bisher ausgegeben vs. wie viel ist geplant), um Über- oder Unterbuchungen frühzeitig zu erkennen
- **STORY-3:** Einen Alert erhalten, wenn ein Budget >80% und >100% verbraucht wurde, um rechtzeitig reagieren zu können
- **STORY-4:** Den Budgetverlauf (täglicher Spend) als Chart sehen, um Ausreißer zu identifizieren

### Als Agentur-Mitarbeiter möchte ich
- **STORY-5:** Den Budget-Status aller mir zugewiesenen Kunden auf einen Blick sehen, ohne in jede Plattform einzuloggen
- **STORY-6:** Den CPC, CPM und ROAS neben dem Budget-Verbrauch sehen, um die Effizienz zu bewerten

## Acceptance Criteria

### AC-1: Budget hinterlegen
- **GIVEN** ich bin in den Kunden-Einstellungen (oder im Budget-Dashboard)
- **WHEN** ich ein Budget anlege
- **THEN** kann ich eintragen: Plattform (Google/Meta/TikTok), Monat/Jahr, Geplantes Budget (€), Optionaler Name/Kampagnen-Bezeichnung
- **AND** ich kann mehrere Budget-Einträge pro Kunde und Monat haben (z. B. „Google Ads Brand" + „Google Ads Generic")

### AC-2: Budget-Übersicht pro Kunde
- **GIVEN** ich habe einen Kunden ausgewählt und öffne das Budget-Dashboard
- **WHEN** die Seite lädt
- **THEN** sehe ich alle aktiven Budget-Einträge als Karten mit: Plattform-Icon, Name, Geplant vs. Ausgegeben (€), Fortschrittsbalken (0–100%), verbleibende Tage im Monat, projizierter Monats-Verbrauch
- **AND** Karten über 80% Verbrauch werden orange hervorgehoben, über 100% rot

### AC-3: Soll/Ist-Vergleich
- **GIVEN** Ads-Daten aus den Plattform-Integrationen vorhanden sind
- **WHEN** ich die Budget-Übersicht öffne
- **THEN** wird der tatsächliche Spend automatisch aus den verbundenen Ads-APIs befüllt
- **AND** bei fehlender API-Verbindung kann der Spend manuell eingetragen werden

### AC-4: Tagesverlauf-Chart
- **GIVEN** tägliche Spend-Daten vorhanden sind (aus API oder manuell)
- **WHEN** ich einen Budget-Eintrag öffne
- **THEN** sehe ich einen Balken- oder Linienchart: täglicher Spend vs. lineares Tages-Soll (Budget / Monatstage)
- **AND** der Chart zeigt Überschreitungs-Tage rot markiert

### AC-5: Budget-Alert
- **GIVEN** ein Budget hat 80% oder 100% des Monatsbudgets erreicht
- **WHEN** die Daten sich aktualisieren
- **THEN** wird eine In-App-Notification ausgelöst (via PROJ-35): „Kunde X: Google Ads Budget zu 85% verbraucht"
- **AND** das Alert-Limit (80% / 100%) ist konfigurierbar

### AC-6: Plattform-übergreifende Gesamt-Übersicht
- **GIVEN** ich bin auf der Hauptseite des Budget-Dashboards (kein Kunde ausgewählt)
- **WHEN** die Seite lädt
- **THEN** sehe ich alle Kunden mit ihrem kombinierten Budget-Status (Gesamtbudget, Gesamtausgaben, %-Verbrauch)
- **AND** eine Summenzeile zeigt: Gesamter verwalteter Werbebudget des Monats über alle Kunden

## Edge Cases

### EC-1: Keine Ads-Integration verbunden
- **WHEN** kein Ads-Account für einen Kunden verbunden ist
- **THEN** können Budgets trotzdem angelegt werden (für manuelle Spend-Eingabe)
- **AND** ein Banner zeigt: „Verbinde Google/Meta/TikTok für automatische Spend-Daten"

### EC-2: Budget für vergangene Monate
- **WHEN** ich einen vergangenen Monat auswähle
- **THEN** werden historische Budget-Daten angezeigt (read-only, keine Änderungen)
- **AND** kein Alert wird ausgelöst

### EC-3: Budget = 0 oder nicht gesetzt
- **WHEN** kein Budget für einen Kunden eingetragen ist, aber Ads laufen
- **THEN** zeigt das Dashboard einen Hinweis: „Kein Budget hinterlegt — Spend wird ohne Vergleichswert angezeigt"

### EC-4: Spend überschreitet Budget stark (>150%)
- **WHEN** der Spend das Budget um >50% überschreitet
- **THEN** wird die Karte mit einem kritischen Alert-Icon markiert (nicht nur rot)
- **AND** eine Notification wird erneut ausgelöst (auch wenn die 100%-Warnung bereits gesendet wurde)

### EC-5: Monatswechsel
- **WHEN** ein neuer Monat beginnt
- **THEN** werden neue Budget-Einträge benötigt (kein Auto-Rollover)
- **AND** eine Notification erinnert den Admin am 1. des Monats: „Bitte Budgets für [Monat] hinterlegen"

## Technical Requirements

### Database Schema
```sql
CREATE TABLE ad_budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) NOT NULL,
  customer_id UUID REFERENCES customers(id) NOT NULL,
  platform TEXT NOT NULL, -- 'google_ads', 'meta_ads', 'tiktok_ads'
  label TEXT, -- Optionaler Name, z.B. "Brand Keywords"
  budget_month DATE NOT NULL, -- Erster Tag des Monats: 2026-04-01
  planned_amount NUMERIC(12,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'EUR',
  alert_threshold_percent INTEGER DEFAULT 80,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(tenant_id, customer_id, platform, label, budget_month)
);

CREATE TABLE ad_spend_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_id UUID REFERENCES ad_budgets(id) NOT NULL,
  tenant_id UUID REFERENCES tenants(id) NOT NULL,
  spend_date DATE NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual', -- 'manual', 'api_google', 'api_meta', 'api_tiktok'
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(budget_id, spend_date)
);

CREATE INDEX idx_ad_budgets_tenant_month ON ad_budgets(tenant_id, budget_month);
CREATE INDEX idx_ad_spend_budget ON ad_spend_entries(budget_id, spend_date);
```

### API Endpoints
- `GET /api/tenant/budgets?month=2026-04` — Alle Budgets des Monats (mit aggregiertem Spend)
- `POST /api/tenant/budgets` — Budget anlegen
- `PUT /api/tenant/budgets/[id]` — Budget bearbeiten
- `DELETE /api/tenant/budgets/[id]` — Budget löschen
- `GET /api/tenant/budgets/[id]/spend` — Täglicher Spend-Verlauf
- `POST /api/tenant/budgets/[id]/spend` — Manuellen Spend-Eintrag hinzufügen
- `POST /api/tenant/budgets/sync` — Spend aus Ads-APIs synchronisieren (alle Plattformen)

### Module Code
`budget_tracking`

### UI-Komponenten
- Budget-Karte (`BudgetCard`) — Fortschrittsbalken, Plattform-Icon, Soll/Ist, Alert-Farben
- Spend-Chart (`DailySpendChart`) — Recharts BarChart, lineares Tages-Soll als Linie
- Budget-Form — Modal zum Anlegen/Bearbeiten
- Portfolio-Integration — Budget-Status-Indikator auf Kunden-Karten (PROJ-56)

## Dependencies
- **PROJ-51:** Google Ads Integration — Spend-Daten automatisch
- **PROJ-52:** Meta Ads Integration — Spend-Daten automatisch
- **PROJ-53:** TikTok Ads Integration — Spend-Daten automatisch
- **PROJ-35:** Realtime Notifications — Alerts bei Schwellenwert-Überschreitung
- **PROJ-56:** Portfolio-Übersicht — Budget-Status auf Kunden-Karten
- **PROJ-29:** Customer Database — Kundenzuordnung

## Success Metrics
- >70% der aktiven Tenants legen Budgets für mindestens einen Kunden an
- Alert-Reaction-Time: Admins reagieren auf 80%-Alert innerhalb von 24h
- Manueller Spend-Eintrag: <20% der Einträge manuell (Rest via API)

## Non-Goals
- Keine automatische Budgetoptimierung oder Gebotsanpassung in Ads-Plattformen
- Keine Multi-Währungs-Konvertierung (alles in Tenant-Währung, Standard EUR)
- Kein Invoice-/Rechnungs-Feature (kommt separat)
- Keine historischen Daten vor dem ersten manuellen Eintrag

## Tech Design (Solution Architect)

### Neue Seite
- `/[tenant]/budget` — Haupt-Budget-Dashboard (analog zu `/[tenant]/marketing`)

### Komponenten-Struktur
```
/[tenant]/budget
+-- BudgetWorkspace
    +-- MonthSelector              — Monat/Jahr-Auswahl (Dropdown)
    +-- BudgetSummaryBar           — Gesamtbudget + Gesamtausgaben aller Kunden
    +-- BudgetGrid
    |   +-- BudgetCard[]           — Eine Karte pro Budget-Eintrag
    |       +-- PlatformIcon       — Google / Meta / TikTok Logo
    |       +-- SpendProgressBar   — shadcn Progress (orange >80%, rot >100%)
    |       +-- AlertBadge         — Kritisch-Icon bei >150%
    |       +-- SpendMetrics       — CPC, CPM, ROAS (aus Ads-API)
    +-- BudgetDetailSheet          — Slide-out (shadcn Sheet)
    |   +-- DailySpendChart        — Balken-Chart (Recharts, bereits im Projekt)
    |   +-- ManualSpendForm        — Eingabe wenn keine API verbunden
    +-- BudgetFormDialog           — Modal: Budget anlegen / bearbeiten
    +-- NoBudgetBanner             — Hinweis wenn kein Budget hinterlegt
```

### Neue API-Endpunkte
| Endpunkt | Zweck |
|---|---|
| `GET /api/tenant/budgets` | Alle Budgets (gefiltert nach Monat & Kunde) |
| `POST /api/tenant/budgets` | Budget anlegen |
| `PUT /api/tenant/budgets/[id]` | Budget bearbeiten |
| `DELETE /api/tenant/budgets/[id]` | Budget löschen |
| `GET /api/tenant/budgets/[id]/spend` | Täglicher Spend-Verlauf |
| `POST /api/tenant/budgets/[id]/spend` | Manuellen Spend-Eintrag hinzufügen |
| `POST /api/tenant/budgets/sync` | Spend aus allen Ads-APIs synchronisieren |

### Datenmodell
**ad_budgets** — Budget-Einträge (tenant, customer, platform, label, month, planned_amount, currency, alert_threshold_percent, alert_80_sent_at, alert_100_sent_at, alert_150_sent_at)

**ad_spend_entries** — Tägliche Spend-Einträge (budget_id, spend_date, amount, source: manual/api_google/api_meta/api_tiktok), eindeutig pro Budget + Tag

Alert-Deduplizierungsfelder (`alert_X_sent_at`) verhindern, dass dieselbe Warnung mehrfach ausgelöst wird.

### Tech-Entscheidungen
| Entscheidung | Warum |
|---|---|
| Recharts für Charts | Bereits via `trend-area-chart.tsx` im Projekt — kein neues Paket |
| shadcn Sheet für Detail-Ansicht | Gleiche Pattern wie in anderen Workspaces |
| shadcn Progress für Balken | Bereits installiert, Farbe per CSS-Klasse steuerbar |
| Sync-on-Demand (kein Cron) | Spend wird beim Öffnen oder per Button synchronisiert — Cron als spätere Erweiterung |
| Alert via PROJ-35 | Bestehende Notification-Infrastruktur nutzen |

### Alert-Logik (Fluss)
1. Sync-API ruft Ads-APIs auf (analog zu `/api/tenant/dashboard/google-ads/`)
2. Spend wird in `ad_spend_entries` gespeichert (Quelle: `api_google` etc.)
3. Für jedes Budget: `SUM(spend) / planned_amount` prüfen
4. Wenn Schwellenwert erreicht **und** `alert_X_sent_at IS NULL` → Notification erstellen
5. Timestamp setzen um Duplikate zu verhindern

### Abhängigkeiten (keine neuen Pakete)
- Recharts — bereits im Projekt
- shadcn/ui Sheet, Progress, Dialog — bereits installiert
- PROJ-35 Notification-System — bestehende Notification-Funktion
- PROJ-28 Kunden-Selektor — für Kunden-Filterung

### Navigation
- Neuer Sidebar-Eintrag unter "Marketing" in `tenant-shell-navigation.tsx`
- Modul-Code: `budget_tracking`

## Status
- **Status:** In Review
- **Created:** 2026-04-11
- **Implementation Notes:**
  - Frontend: `src/components/budget-workspace.tsx` (vollständig)
  - Page: `src/app/(tenant)/budget/page.tsx`
  - API: `src/app/api/tenant/budgets/` (GET/POST + [id] PUT/DELETE + [id]/spend GET/POST + sync POST + campaigns GET)
  - Migration: `supabase/migrations/044_ad_budgets.sql` + `050_budget_campaign_scope.sql`
  - Navigation: Budget Tracking-Eintrag in `tenant-shell-navigation.tsx`
  - Sync: Wenn `campaign_ids` gesetzt → campaign-level Daily-Spend via neue API-Funktionen; sonst Account-Level-Timeseries
  - Campaign-Scope: `campaign_ids TEXT[]` in `ad_budgets` (NULL = alle Kampagnen)
  - Neue API-Funktionen: `getGoogleAdsCampaignDailySpend`, `getMetaAdsCampaignDailySpend`, `getTikTokCampaignDailySpend`
  - Campaign-List-Endpoint: `GET /api/tenant/budgets/campaigns?customer_id=&platform=`
  - UI: Campaign-Multiselect im Budget-Dialog, Badge auf Budget-Karte zeigt Kampagnenanzahl
  - Tests: `tests/api/budgets.spec.ts` (17 Tests: Auth, CRUD, Validation, Cross-Tenant)
