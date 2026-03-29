# PROJ-27: Keyword Rankings Dashboard & History

## Status: In Progress
**Created:** 2026-03-28
**Last Updated:** 2026-03-29

## Dependencies
- Requires: PROJ-25 (Keyword Project Management) — Projekte, Keywords, Wettbewerber
- Requires: PROJ-26 (GSC OAuth Integration) — Datenquelle
- External: Google Search Console API (Search Analytics)

## User Stories
- Als Member möchte ich für jedes Keyword die aktuelle Google-Position meines Kunden sehen, damit ich die SEO-Situation auf einen Blick einschätze.
- Als Member möchte ich die Positionsveränderung gegenüber der letzten Messung sehen (z. B. +3 / -1), damit ich Trends sofort erkenne.
- Als Member möchte ich den Positionsverlauf eines Keywords als Liniendiagramm über Zeit sehen, damit ich langfristige Entwicklungen verstehe.
- Als Member möchte ich die Positionen der hinterlegten Wettbewerber für dasselbe Keyword sehen, damit ich die Wettbewerbssituation einschätze.
- Als Admin möchte ich das Tracking-Intervall pro Projekt konfigurieren (täglich / wöchentlich), damit ich Kosten und Granularität abwägen kann.
- Als Member möchte ich den letzten Tracking-Zeitpunkt sehen, damit ich weiß wie aktuell die Daten sind.

## Acceptance Criteria
- [ ] Dashboard zeigt alle Keywords eines Projekts mit aktueller Position (1–100), oder "nicht gefunden" (>100 / kein Ergebnis)
- [ ] Positionsänderung gegenüber letztem Tracking-Lauf wird angezeigt (Delta, farblich: grün=besser, rot=schlechter, grau=gleich)
- [ ] Klick auf ein Keyword öffnet Detailansicht mit Verlaufsdiagramm (Liniendiagramm, letzte 30/90 Tage)
- [ ] Wettbewerber-Positionen werden in derselben Detailansicht angezeigt (Vergleichslinien im Chart)
- [ ] Cron-Job läuft täglich oder wöchentlich (konfigurierbar pro Projekt) und speichert Snapshot in DB
- [ ] Letzter Tracking-Zeitpunkt ist im Dashboard sichtbar
- [ ] Manueller "Jetzt aktualisieren"-Button für Admin (Rate-Limit: max. 1x pro Stunde)
- [ ] Bei nicht verbundener GSC → Hinweis im Dashboard mit Link zu Settings

## Edge Cases
- GSC hat keine Daten für ein Keyword (zu wenig Impressionen) → "Keine Daten" anzeigen, kein Fehler
- Keyword wurde nach einem Tracking-Lauf gelöscht → historische Daten bleiben erhalten bis Projekt gelöscht wird
- Tracking-Lauf schlägt fehl (API-Fehler, Token abgelaufen) → letzter erfolgreicher Lauf bleibt angezeigt, Fehlerstatus sichtbar
- Erstes Tracking noch nicht ausgeführt → leerer State mit Hinweis "Erstes Tracking ausstehend"
- Sehr viele Keywords (50) × Wettbewerber (5) → Batch-Abfragen, kein einzelner API-Call pro Keyword
- Cron-Job läuft für Tenant ohne gültige GSC-Verbindung → Job wird übersprungen, kein Fehler-Log

## Technical Requirements
- Performance: Dashboard-Ladezeit < 1s (gecachte Ranking-Daten aus DB, kein Live-API-Call)
- Cron: Serverside-Job (z. B. Vercel Cron oder Supabase Edge Function)
- Storage: Ranking-Snapshots in eigener Tabelle (`keyword_ranking_snapshots`) mit Timestamp
- Data Retention: Snapshots werden 12 Monate aufbewahrt, danach gelöscht
- GSC API: Search Analytics Query API, gefiltert nach Keyword + Domain + Land

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

### Überblick

Das Feature baut auf PROJ-25 (Keyword-Projekte) und PROJ-26 (GSC OAuth) auf. Ranking-Snapshots werden regelmäßig im Hintergrund gesammelt und blitzschnell aus der Datenbank geladen — keine Live-API-Calls beim Öffnen des Dashboards.

### Komponenten-Struktur

```
Keyword Projects Workspace (/tools/keywords)
+-- Projekt-Card
    +-- GSC Status Badge (von PROJ-26)
    +-- Letzter Tracking-Zeitpunkt (neu)

Projekt-Detail View (/tools/keywords/[id])
+-- Tabs (bestehend: Keywords, Wettbewerber, Integrationen, Einstellungen)
    +-- NEU: Rankings-Tab
        +-- [Fallback: GSC nicht verbunden]
        |   +-- Alert mit Link zum Integrationen-Tab
        |
        +-- [Fallback: Noch kein Tracking]
        |   +-- Empty State "Erstes Tracking ausstehend"
        |   +-- [Jetzt tracken] Button (nur Admin)
        |
        +-- [Normalzustand]
            +-- Rankings-Header
            |   +-- "Zuletzt aktualisiert: vor 3h"
            |   +-- [Jetzt aktualisieren] Button (Admin, max. 1x/Stunde)
            |
            +-- Rankings-Tabelle
                +-- Zeile pro Keyword
                    +-- Keyword-Text
                    +-- Aktuelle Position (z. B. "7" oder "nicht gefunden")
                    +-- Delta-Badge (↑+3 grün / ↓-1 rot / = grau)
                    +-- [Details] Button
                        +-- Keyword-Detail Sheet/Panel
                            +-- Zeitraum-Selector (30 / 90 Tage)
                            +-- Liniendiagramm
                                +-- Linie: eigene Domain
                                +-- Linien: je Wettbewerber (Farben)
```

### Datenmodell

**Neue Tabelle: `keyword_ranking_snapshots`**

| Feld | Bedeutung |
|------|-----------|
| `id` | Eindeutige ID |
| `keyword_id` | Welches Keyword wurde getracked |
| `project_id` | Welches Projekt (für schnelle Abfragen) |
| `tenant_id` | Für Datenisolation (RLS) |
| `domain` | Die Domain, für die dieser Snapshot gilt |
| `is_competitor` | `false` = eigene Domain, `true` = Wettbewerber |
| `competitor_id` | Verweis auf Wettbewerber (wenn `is_competitor = true`) |
| `position` | Google-Position 1–100, `NULL` = nicht gefunden |
| `tracked_at` | Wann wurde dieser Snapshot erstellt |

**Erweiterung `keyword_projects`-Tabelle:**

| Feld | Bedeutung |
|------|-----------|
| `tracking_interval` | `daily` oder `weekly` |
| `last_tracked_at` | Letzter erfolgreicher Tracking-Lauf |
| `last_tracking_error` | Fehlermeldung des letzten fehlgeschlagenen Laufs (oder leer) |

**Retention:** Snapshots älter als 12 Monate werden automatisch gelöscht (zweiter Vercel Cron Cleanup-Job).

### API-Routen (neue)

```
GET  /api/tenant/keywords/projects/[id]/rankings
     → Neuester Snapshot pro Keyword (aktuelle Positionen + Delta)

GET  /api/tenant/keywords/projects/[id]/rankings/history
     → Verlauf eines Keywords über Zeit (Query-Params: keyword_id, days=30|90)

POST /api/tenant/keywords/projects/[id]/rankings/refresh
     → Manueller Tracking-Run (nur Admin, Rate-Limit: 1x/Stunde per Projekt)

GET  /api/cron/keyword-rankings
     → Vercel Cron Endpoint — läuft täglich, verarbeitet alle fälligen Projekte
```

### Cron-Job-Ablauf

```
Vercel Cron: täglich 02:00 UTC
      ↓
/api/cron/keyword-rankings
      ↓
Lade alle Projekte: GSC verbunden + tracking_interval fällig
      ↓
Für jedes Projekt:
  1. GSC Access Token erneuern (serverseitig)
  2. Search Analytics Batch-Query: alle Keywords + Wettbewerber auf einmal
  3. Positionen in keyword_ranking_snapshots speichern
  4. last_tracked_at aktualisieren
      ↓
Bei Fehler (Token abgelaufen, GSC 4xx):
  - gsc_connections.status = 'expired'
  - keyword_projects.last_tracking_error setzen
  - Kein Absturz für andere Projekte
```

### Tech-Entscheidungen

| Entscheidung | Warum |
|---|---|
| **Rankings-Tab im bestehenden Projekt-Detail** | Konsistentes Tab-Muster aus PROJ-25/26 — kein neues UI-Konzept |
| **Snapshots in DB, kein Live-API-Call** | Dashboard-Ladezeit < 1s — GSC wird nur im Cron abgefragt |
| **Vercel Cron** (`vercel.json`) | Serverless, kein eigener Server, nativ in der bestehenden Infrastruktur |
| **Batch-Query an GSC** | 50 Keywords × 5 Wettbewerber = bis zu 250 einzelne Calls → stattdessen eine Batch-Anfrage pro Domain |
| **Rate-Limit 1x/Stunde für manuelle Aktualisierung** | GSC API hat Tageskontingente — verhindert versehentliche Überlastung |
| **Delta berechnet zur Ladezeit** | Kein eigenes Delta-Feld — letzten und vorletzten Snapshot vergleichen (einfacher, kein Sync-Problem) |
| **`recharts` für Liniendiagramm** | React-nativ, leichtgewichtig, bestens für Next.js — kein D3 nötig |
| **Cleanup-Job für 12-Monats-Retention** | Zweiter Vercel Cron löscht Snapshots älter als 12 Monate |

### Abhängigkeiten (neue Packages)

| Package | Zweck |
|---|---|
| `recharts` | Liniendiagramm für Positions-Verlauf |
| `googleapis` | Bereits aus PROJ-26 vorhanden — wird wiederverwendet |

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
