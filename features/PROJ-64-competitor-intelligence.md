# PROJ-64: Competitor Intelligence Automation

## Overview
Automatisiertes, kontinuierliches Monitoring von Wettbewerbern für Kunden-Domains. Ergänzt die bestehende manuelle SEO Competitor Analyse (PROJ-30) um automatische Crawls, Ranking-Änderungs-Alerts und Anzeigen-Monitoring. Agenturen müssen nicht mehr manuell prüfen — Änderungen kommen proaktiv.

## User Stories

### Als SEO-Spezialist möchte ich
- **STORY-1:** Konkurrenten für einen Kunden einmalig konfigurieren und danach automatisch über Ranking-Veränderungen informiert werden, ohne täglich manuell zu prüfen
- **STORY-2:** Sehen, wenn ein Wettbewerber in meinen Ziel-Keywords aufgestiegen oder abgestiegen ist, um die eigene Strategie anzupassen
- **STORY-3:** Neue Keywords identifizieren, für die Wettbewerber ranken, ich aber nicht — als Lücken-Analyse

### Als Performance-Marketing-Spezialist möchte ich
- **STORY-4:** Sehen, welche Anzeigen-Texte meine Wettbewerber aktuell schalten (Google Ads Transparent), um Inspiration und Benchmark zu haben
- **STORY-5:** Informiert werden, wenn ein neuer Konkurrent in meinen Ziel-Keywords auftaucht

### Als Agentur-Admin möchte ich
- **STORY-6:** Die Wettbewerber-Konfiguration pro Kunde verwalten und den Monitoring-Zeitplan steuern (täglich / wöchentlich)

## Acceptance Criteria

### AC-1: Wettbewerber konfigurieren
- **GIVEN** ich bin auf der Competitor Intelligence-Seite für einen Kunden
- **WHEN** ich Wettbewerber hinzufüge
- **THEN** kann ich bis zu 10 Wettbewerber-Domains eintragen
- **AND** ich wähle den Crawl-Rhythmus: täglich oder wöchentlich
- **AND** ich wähle die zu überwachenden Keywords (aus meinen Keyword-Projekten oder manuell)

### AC-2: Automatischer Ranking-Vergleich
- **GIVEN** ein automatischer Crawl wurde ausgeführt
- **WHEN** sich Rankings von Wettbewerbern ändern
- **THEN** wird eine In-App-Notification ausgelöst: „Wettbewerber X ist für [Keyword] von Pos. 5 auf Pos. 2 gestiegen"
- **AND** die Änderung ist in der Verlaufs-Tabelle sichtbar

### AC-3: Ranking-Übersicht (Vergleichstabelle)
- **GIVEN** ich öffne die Competitor Intelligence-Seite
- **WHEN** Daten vorhanden sind
- **THEN** sehe ich eine Tabelle: Keyword | Meine Position | Wettbewerber 1 | Wettbewerber 2 | … mit Trend-Pfeilen (↑↓) für Änderungen seit letztem Crawl

### AC-4: Keyword-Gap-Analyse
- **GIVEN** Crawl-Daten für Wettbewerber vorhanden sind
- **WHEN** ich den Tab „Keyword-Lücken" öffne
- **THEN** sehe ich Keywords, für die Wettbewerber in Top 10 ranken, ich aber nicht
- **AND** sortiert nach Suchvolumen (falls via API verfügbar) oder Anzahl rankender Wettbewerber

### AC-5: Ads-Monitoring
- **GIVEN** das Ads-Monitoring ist für einen Wettbewerber aktiviert
- **WHEN** neue Anzeigen-Texte erkannt werden (via Google Ads Transparency Center API oder Scraping)
- **THEN** erscheinen die Anzeigen-Texte im Tab „Wettbewerber-Ads" mit Datum und Plattform
- **AND** ich kann Anzeigen als „gesehen" markieren

### AC-6: Änderungs-History
- **GIVEN** mehrere Crawls wurden durchgeführt
- **WHEN** ich einen Wettbewerber auswähle
- **THEN** sehe ich einen Linienchart: Ranking-Entwicklung über Zeit für ausgewählte Keywords

## Edge Cases

### EC-1: Wettbewerber-Domain nicht crawlbar
- **WHEN** eine Wettbewerber-Domain robots.txt-gesperrt ist oder einen Crawl-Schutz hat
- **THEN** wird der Eintrag mit „Nicht crawlbar" markiert
- **AND** kein wiederholter Fehler-Crawl (exponentielles Backoff)

### EC-2: API-Limits (Ahrefs/SEMrush)
- **WHEN** das API-Kontingent aufgebraucht ist
- **THEN** werden gecachte Daten angezeigt mit Timestamp und Warn-Hinweis
- **AND** der nächste Crawl wird in die Queue gestellt (für nächsten Tag)

### EC-3: Wettbewerber entfernen
- **WHEN** ein Wettbewerber aus der Liste entfernt wird
- **THEN** bleiben historische Daten erhalten (für Verlaufs-Analyse)
- **AND** keine neuen Crawls mehr für diese Domain

### EC-4: Kein Keyword-Projekt vorhanden
- **WHEN** für einen Kunden noch keine Keywords konfiguriert sind
- **THEN** Hinweis: „Bitte zuerst Keywords in Keyword-Projekten anlegen (PROJ-25)"
- **AND** manuelle Keyword-Eingabe als Fallback möglich

### EC-5: Gleichzeitige Crawls für viele Kunden
- **WHEN** ein Tenant viele Kunden mit täglichem Crawl hat
- **THEN** werden Crawls in eine Queue gestellt und nacheinander verarbeitet (kein paralleler Burst)

## Technical Requirements

### Database Schema
```sql
CREATE TABLE competitor_monitors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) NOT NULL,
  customer_id UUID REFERENCES customers(id) NOT NULL,
  competitor_domain TEXT NOT NULL,
  crawl_schedule TEXT NOT NULL DEFAULT 'weekly', -- 'daily', 'weekly'
  is_active BOOLEAN DEFAULT true,
  last_crawled_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(customer_id, competitor_domain)
);

CREATE TABLE competitor_rankings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  monitor_id UUID REFERENCES competitor_monitors(id) NOT NULL,
  keyword TEXT NOT NULL,
  position INTEGER,
  crawl_date DATE NOT NULL DEFAULT CURRENT_DATE,
  change_from_previous INTEGER, -- positive = gesunken, negativ = gestiegen
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE competitor_ads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  monitor_id UUID REFERENCES competitor_monitors(id) NOT NULL,
  platform TEXT NOT NULL DEFAULT 'google', -- 'google', 'meta'
  headline TEXT,
  description TEXT,
  display_url TEXT,
  first_seen DATE NOT NULL DEFAULT CURRENT_DATE,
  last_seen DATE,
  is_reviewed BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_comp_rankings_monitor_date ON competitor_rankings(monitor_id, crawl_date);
CREATE INDEX idx_comp_monitors_tenant ON competitor_monitors(tenant_id, customer_id);
```

### Crawl-Architektur
- Crawl-Jobs als Supabase Edge Function oder Cron-Job (täglich / wöchentlich)
- Datenquelle: Ahrefs API (Rankings) + Google Ads Transparency API (Anzeigen)
- Queue-System: `pgmq` Extension oder einfache `crawler_queue` Tabelle mit `status`-Feld

### API Endpoints
- `GET /api/tenant/competitor-intelligence?customer_id=X` — Übersicht (Rankings + Gaps)
- `GET /api/tenant/competitor-intelligence/monitors` — Konfigurierte Wettbewerber
- `POST /api/tenant/competitor-intelligence/monitors` — Wettbewerber hinzufügen
- `DELETE /api/tenant/competitor-intelligence/monitors/[id]` — Wettbewerber entfernen
- `GET /api/tenant/competitor-intelligence/gaps?customer_id=X` — Keyword-Gap-Analyse
- `GET /api/tenant/competitor-intelligence/ads?customer_id=X` — Wettbewerber-Ads
- `POST /api/tenant/competitor-intelligence/crawl` — Manuellen Crawl triggern

### Module Code
`competitor_intelligence`

## Dependencies
- **PROJ-25:** Keyword Project Management — Keywords als Monitoring-Basis
- **PROJ-30:** SEO Competitor Analyse — Vorgänger-Feature (manuelle Analyse), Daten-Pattern übernehmen
- **PROJ-35:** Realtime Notifications — Alerts bei Ranking-Änderungen
- **PROJ-60:** Backlink Monitoring — gleiche externe API (Ahrefs/SEMrush), API-Key teilen

## Success Metrics
- >70% der SEO-fokussierten Tenants konfigurieren mindestens einen Wettbewerber
- Alert-Reaction-Rate: >50% der Alerts führen zu einer Aktion im System
- Keyword-Gap-Nutzung: Neue Keywords aus Gap-Analyse landen in Keyword-Projekten

## Non-Goals
- Kein eigenständiger Web-Crawler (immer über externe APIs)
- Kein Social-Media-Monitoring von Wettbewerbern
- Keine automatische Strategie-Anpassung (nur Informieren, nicht Handeln)
- Kein Wettbewerber-Vergleich über Tenant-Grenzen hinweg

## Status
- **Status:** Planned
- **Created:** 2026-04-11
