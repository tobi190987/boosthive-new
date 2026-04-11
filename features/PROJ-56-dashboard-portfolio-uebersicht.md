# PROJ-56: Dashboard Portfolio-Übersicht

## Overview
Eine Agentur-Übersichtsseite, die alle Kunden auf einen Blick zeigt — mit aggregierten Key-Metriken, Anomalie-Alerts und einer Prioritätsliste. Ersetzt die aktuelle "1 Kunde = 1 View"-Logik durch eine echte Multi-Client-Perspektive für Agentur-Admins.

## User Stories

### Als Agentur-Admin möchte ich
- **STORY-1:** Alle meine Kunden in einer Übersicht sehen mit den wichtigsten Metriken pro Kunde (Traffic, Ads-Spend, Ranking-Position), um schnell den Gesamtstatus zu erfassen
- **STORY-2:** Anomalien automatisch hervorgehoben sehen (z. B. „Kunde X: -35% Traffic diese Woche"), damit ich sofort reagieren kann ohne jeden Kunden manuell prüfen zu müssen
- **STORY-3:** Sehen, bei welchen Kunden heute Handlungsbedarf besteht (überfällige Follow-ups, ausstehende Freigaben, Fehler in Integrationen)
- **STORY-4:** Kunden nach Metriken sortieren und filtern können (z. B. stärkster Traffic-Rückgang zuerst)

### Als Agentur-Mitarbeiter möchte ich
- **STORY-5:** Meine zugewiesenen Kunden gefiltert sehen können, um meinen Arbeitsbereich zu fokussieren

## Acceptance Criteria

### AC-1: Portfolio-Grid
- **GIVEN** ich bin als Admin eingeloggt und öffne die Portfolio-Übersicht
- **WHEN** die Seite lädt
- **THEN** sehe ich alle Kunden als Karten-Grid (oder Tabelle, umschaltbar)
- **AND** jede Karte zeigt: Kunden-Logo, Name, Status-Badge (aus CRM), letzte 7 Tage Traffic (wenn GA4 verbunden), aktive Ads-Plattformen als Icons
- **AND** die Seite ist erreichbar unter `/dashboard/portfolio`

### AC-2: Anomalie-Alerts
- **GIVEN** GA4 oder Ads-Daten für einen Kunden vorhanden sind
- **WHEN** eine Metrik um >20% im Vergleich zur Vorwoche abweicht
- **THEN** erscheint ein orange/rotes Warn-Icon auf der Kunden-Karte
- **AND** beim Hover zeigt sich: „Traffic -32% vs. Vorwoche (1.240 → 843 Besucher)"
- **AND** ein Filter „Nur mit Alerts" blendet alle unauffälligen Kunden aus

### AC-3: Handlungsbedarf-Leiste
- **GIVEN** es gibt offene Aktionen im System
- **WHEN** ich die Portfolio-Seite öffne
- **THEN** sehe ich oben eine kompakte Leiste mit Zählern: „3 Freigaben ausstehend · 2 Follow-ups fällig · 1 Integration fehlerhaft"
- **AND** jeder Zähler ist klickbar und führt zur gefilterten Ansicht

### AC-4: Sortierung & Filter
- **GIVEN** ich bin im Portfolio-Grid
- **WHEN** ich sortieren oder filtern möchte
- **THEN** kann ich sortieren nach: Name (A–Z), Traffic-Änderung (Einbruch zuerst), CRM-Status, Zuletzt aktualisiert
- **AND** filtern nach: CRM-Status (Active/Lead/etc.), Plattform-Integration (hat GA4 / hat Google Ads / etc.), nur Alerts

### AC-5: Kunden-Karte Quick-Actions
- **GIVEN** ich hover über eine Kunden-Karte
- **WHEN** ich die Quick-Actions sehe
- **THEN** gibt es Direktlinks: „Dashboard öffnen", „Aktivität loggen", „Report erstellen"
- **AND** ein Klick auf die Karte navigiert zum Kunden-Dashboard (mit vorausgewähltem Kunden im Selektor)

### AC-6: Leerer Zustand (keine Kunden)
- **GIVEN** noch keine Kunden angelegt sind
- **WHEN** ich die Portfolio-Seite öffne
- **THEN** sehe ich einen leeren Zustand mit CTA: „Ersten Kunden anlegen"

## Edge Cases

### EC-1: Kein GA4 verbunden
- **WHEN** ein Kunde keine GA4-Verbindung hat
- **THEN** zeigt die Karte Traffic-Feld als grau: „Keine Daten — GA4 verbinden"
- **AND** kein Anomalie-Alert möglich (kein falscher Alarm)

### EC-2: Viele Kunden (>50)
- **WHEN** mehr als 50 Kunden vorhanden sind
- **THEN** wird der Grid paginiert (20 pro Seite) oder via virtualisiertem Scroll geladen
- **AND** eine globale Suchleiste oben filtert sofort nach Kundenname

### EC-3: Nur Member-Rolle
- **WHEN** ein Member (nicht Admin) die Portfolio-Seite aufruft
- **THEN** sieht er nur Kunden, zu denen er Zugriff hat (aktuell: alle Kunden des Tenants)
- **AND** die Handlungsbedarf-Leiste zeigt nur seine zugewiesenen Follow-ups

### EC-4: Alle Metriken veraltet
- **WHEN** letzte Daten-Synchronisierung >48h zurückliegt
- **THEN** zeigt jede Karte einen grauen „Daten veraltet"-Hinweis mit Timestamp
- **AND** ein „Alle aktualisieren"-Button triggert Refresh für alle verbundenen Integrationen

## Technical Requirements

### Neue Route
- `src/app/(tenant)/dashboard/portfolio/page.tsx`

### Datenquellen (bestehende APIs aggregieren)
- Kunden-Liste: `GET /api/tenant/customers` (bestehend, PROJ-29)
- GA4-Metriken: `GET /api/tenant/integrations/ga4/metrics?customer_id=X` (PROJ-50)
- Follow-ups fällig: `GET /api/tenant/customers/follow-ups` (PROJ-61)
- Ausstehende Freigaben: `GET /api/tenant/approvals?status=pending` (PROJ-34)
- Fehlerhafte Integrationen: aus `customer_integrations.status`

### Neuer API Endpoint
- `GET /api/tenant/portfolio/summary` — Aggregiert alle Kunden mit letzten Metriken, Anomalie-Flags und Handlungsbedarf in einem Call (Performance-optimiert, gecacht 15 Min.)

### UI-Komponenten
- `PortfolioGrid` — Responsive Grid mit Kunden-Karten
- `CustomerCard` — Karte mit Logo, Metriken, Alert-Indikator, Quick-Actions
- `ActionBar` — Handlungsbedarf-Leiste oben
- `AnomalyBadge` — Orange/Rotes Warn-Icon mit Hover-Tooltip

## Dependencies
- **PROJ-29:** Customer Database — Kunden-Stammdaten
- **PROJ-50:** GA4 Integration — Traffic-Metriken
- **PROJ-61:** CRM-Upgrade — CRM-Status, Follow-ups
- **PROJ-34:** Client Approval Hub — ausstehende Freigaben
- **PROJ-28:** Globaler Kunden-Selektor — Karten-Klick setzt aktiven Kunden

## Success Metrics
- Portfolio-Seite wird von >80% der Admin-User als Einstiegsseite genutzt
- Anomalie-Alert führt zu Kunden-Action innerhalb von 24h in >60% der Fälle
- Reduzierung der Zeit „Admin öffnet App → erkennt Problem" von Ø 8 Min. auf <2 Min.

## Non-Goals
- Kein aggregiertes Reporting über alle Kunden (kommt mit PROJ-55 Report Center)
- Keine Push-Notifications (PROJ-35 Realtime Notifications)
- Kein Drag & Drop zum Umsortieren der Kunden

## Status
- **Status:** Planned
- **Created:** 2026-04-11
