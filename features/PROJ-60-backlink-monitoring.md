# PROJ-60: Backlink Monitoring

## Overview
Überwachung und Analyse von Backlinks für Kunden-Domains über eine 3rd-Party-API (Ahrefs oder SEMrush). Agenturen können für jeden Kunden das Backlink-Profil einsehen, neue und verlorene Links tracken und toxische Links identifizieren.

## User Stories

### Als SEO-Spezialist möchte ich
- **STORY-1:** Das Backlink-Profil einer Kunden-Domain auf einen Blick sehen können, um den Linkaufbau-Stand zu verstehen
- **STORY-2:** Neue Backlinks seit dem letzten Check sehen können, um den Erfolg von Linkbuilding-Kampagnen zu messen
- **STORY-3:** Verlorene Backlinks erkennen können, um schnell reagieren zu können
- **STORY-4:** Toxische oder Spam-Links identifizieren können, um das Disavow-File vorzubereiten

### Als Agentur-Admin möchte ich
- **STORY-5:** Die Domain Authority (DA) / Domain Rating (DR) aller Kunden-Domains in einer Übersicht sehen, um die Entwicklung zu verfolgen
- **STORY-6:** Historische Entwicklung des Backlink-Profils als Chart sehen können

## Acceptance Criteria

### AC-1: Backlink-Übersicht pro Kunde
- **GIVEN** ich habe einen Kunden ausgewählt und eine Domain hinterlegt
- **WHEN** ich die Backlink-Seite öffne
- **THEN** sehe ich eine Tabelle mit allen Backlinks: Quell-Domain, Quell-URL, Ziel-URL, Anchor Text, DA/DR, Follow/Nofollow, Zuletzt gesehen
- **AND** eine Kennzahl-Leiste oben: Gesamt-Backlinks, verweisende Domains, DA/DR, neue Links (letzte 30 Tage), verlorene Links (letzte 30 Tage)

### AC-2: Neue & Verlorene Links
- **GIVEN** ich bin auf der Backlink-Übersicht
- **WHEN** ich den Tab „Neu" oder „Verloren" öffne
- **THEN** sehe ich Links die seit dem letzten Crawl hinzugekommen oder weggefallen sind
- **AND** jeder Link zeigt das Datum des Ereignisses

### AC-3: Toxische Links
- **GIVEN** ich bin auf dem Tab „Toxisch"
- **WHEN** Spam-Links erkannt wurden
- **THEN** sehe ich Links mit einem Spam-Score über dem Schwellenwert (konfigurierbar)
- **AND** ich kann Links als „geprüft" markieren oder einen CSV-Export für Disavow erstellen

### AC-4: Domain Authority Chart
- **GIVEN** historische DA/DR-Daten sind vorhanden (nach mehreren Crawls)
- **WHEN** ich den Chart-Bereich öffne
- **THEN** sehe ich einen Linienchart: DA/DR-Entwicklung über Zeit + Balken für Backlink-Anzahl
- **AND** der Chart ist filterbar nach Zeitraum (30 Tage, 90 Tage, 1 Jahr)

### AC-5: Suche & Filter
- **GIVEN** ich bin in der Backlink-Tabelle
- **WHEN** ich filtere
- **THEN** kann ich nach Quell-Domain, Anchor Text, Follow/Nofollow, DA-Mindest-Score filtern
- **AND** ich kann die Tabelle nach jeder Spalte sortieren

### AC-6: Manueller Refresh
- **GIVEN** ich möchte aktuelle Daten
- **WHEN** ich auf „Daten aktualisieren" klicke
- **THEN** wird ein neuer API-Call zur Ahrefs/SEMrush-API ausgelöst
- **AND** die Ergebnisse werden gecacht (TTL: 24h, um API-Limits zu schonen)
- **AND** ein Timestamp „Zuletzt aktualisiert" wird angezeigt

## Edge Cases

### EC-1: Domain nicht konfiguriert
- **WHEN** kein Kunde oder keine Domain im Selektor ausgewählt
- **THEN** zeigt die Seite einen Hinweis: „Bitte Kunden auswählen und Domain in den Kundenstammdaten hinterlegen"

### EC-2: API-Limit erreicht
- **WHEN** das API-Kontingent für den Monat aufgebraucht ist
- **THEN** werden gecachte Daten angezeigt mit Hinweis „API-Limit erreicht — Daten vom [Datum]"
- **AND** kein Fehler-Crash der Seite

### EC-3: Neue Domain ohne Historie
- **WHEN** eine Domain zum ersten Mal gecrawlt wird
- **THEN** zeigt die Übersicht den ersten Daten-Snapshot
- **AND** „Neue Links" und „Verlorene Links" zeigen 0 (kein Vergleichspunkt)

### EC-4: Modul nicht gebucht
- **WHEN** das Modul `backlink_monitoring` nicht im Plan enthalten ist
- **THEN** Upgrade-CTA mit Hinweis auf Modul-Buchung

### EC-5: API-Fehler (Ahrefs/SEMrush down)
- **WHEN** die externe API nicht antwortet
- **THEN** werden gecachte Daten angezeigt mit Fehlerhinweis
- **AND** Retry-Button vorhanden

## Technical Requirements

### Database Schema
```sql
-- Backlink-Snapshots speichern (gecachte API-Antworten)
CREATE TABLE backlink_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) NOT NULL,
  customer_id UUID REFERENCES customers(id) NOT NULL,
  domain TEXT NOT NULL,
  snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
  total_backlinks INTEGER,
  referring_domains INTEGER,
  domain_rating NUMERIC(5,2),
  raw_data JSONB, -- vollständige API-Antwort gecacht
  created_at TIMESTAMP DEFAULT NOW()
);

-- Einzelne Backlinks (für Diff/Tracking)
CREATE TABLE backlinks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id UUID REFERENCES backlink_snapshots(id) NOT NULL,
  tenant_id UUID REFERENCES tenants(id) NOT NULL,
  customer_id UUID REFERENCES customers(id) NOT NULL,
  source_domain TEXT NOT NULL,
  source_url TEXT NOT NULL,
  target_url TEXT NOT NULL,
  anchor_text TEXT,
  domain_rating NUMERIC(5,2),
  is_follow BOOLEAN DEFAULT true,
  spam_score NUMERIC(5,2),
  first_seen DATE,
  last_seen DATE,
  status TEXT DEFAULT 'active', -- 'active', 'lost', 'new'
  is_reviewed BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_backlinks_tenant_customer ON backlinks(tenant_id, customer_id);
CREATE INDEX idx_backlinks_status ON backlinks(status);
```

### API Integration
- **Primär:** Ahrefs API v3 (Backlinks, Domain Rating, Referring Domains)
- **Alternativ:** SEMrush API (gleiche Daten, anderes Pricing-Modell)
- API-Key wird in `tenant_settings` oder `customer_integrations` gespeichert (verschlüsselt)
- Caching: 24h TTL, gespeichert als `raw_data` JSONB im Snapshot

### API Endpoints
- `GET /api/tenant/backlinks?customer_id=X` — Aktuelle Backlink-Daten (aus Cache)
- `POST /api/tenant/backlinks/refresh?customer_id=X` — Neuen Crawl triggern
- `GET /api/tenant/backlinks/new?customer_id=X` — Neue Links (diff zur Vorgänger-Snapshot)
- `GET /api/tenant/backlinks/lost?customer_id=X` — Verlorene Links
- `GET /api/tenant/backlinks/toxic?customer_id=X` — Links über Spam-Score-Schwellenwert
- `POST /api/tenant/backlinks/[id]/review` — Link als geprüft markieren
- `GET /api/tenant/backlinks/disavow?customer_id=X` — CSV-Export für Disavow

### Module Code
`backlink_monitoring`

## Dependencies
- **PROJ-28:** Globaler Kunden-Selektor
- **PROJ-29:** Customer Database (Domain-Feld der Kunden)
- **PROJ-10:** SEO Analyse (gleiche Domain-Logik)
- Externe API: Ahrefs API v3 oder SEMrush API (kostenpflichtig, vom Tenant konfiguriert)

## Success Metrics
- Durchschnittliche Nutzungshäufigkeit: >2 Checks/Woche pro aktivem Tenant
- DA/DR-Tracking-Adoption: >80% der SEO-fokussierten Tenants
- Toxische-Link-Export verwendet: >30% der Nutzer mit Toxic-Links

## Non-Goals
- Kein eigener Web-Crawler (immer über externe API)
- Keine automatischen Benachrichtigungen bei neuen Links (separates Notification-Feature)
- Kein Disavow-File automatisch an Google senden (nur CSV-Export)
- Keine Konkurrenz-Backlink-Analyse (kommt mit PROJ-64 Competitor Intelligence)

## Status
- **Status:** Planned
- **Created:** 2026-04-11
