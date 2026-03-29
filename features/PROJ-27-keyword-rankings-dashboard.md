# PROJ-27: Keyword Rankings Dashboard & History

## Status: Deployed
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

### Zielbild

PROJ-27 erweitert den bestehenden Keyword-Workspace aus PROJ-25 und die GSC-Anbindung aus PROJ-26 um einen read-optimierten Rankings-Bereich. Das Dashboard selbst liest nur gecachte Daten aus Supabase. Alle Google-Abfragen laufen asynchron über einen serverseitigen Tracker.

Wichtig fuer die Architektur:

- Die bestehende UI ist heute eine einzelne Client-Komponente auf `/tools/keywords`.
- Die bestehende Datenbasis kennt bereits `keyword_projects`, `keywords`, `competitor_domains` und `gsc_connections`.
- Die GSC-Integration ist projektbezogen und nutzt genau eine `selected_property` pro Projekt.
- Google Search Console liefert nur Daten fuer Properties, auf die das verbundene Google-Konto Zugriff hat. Wettbewerber-Rankings lassen sich daher nicht aus derselben Kunden-Property ableiten.

Daraus folgt:

- **v1** liefert belastbar die eigenen Keyword-Positionen inklusive Delta, Verlauf, Fehlerstatus und manuellem Refresh.
- **Wettbewerber-Linien** brauchen einen zweiten Datenanbieter (SERP API) oder muessen als spaetere Ausbaustufe geplant werden.

### Architektur-Uebersicht

```text
Tenant Browser
  ↓
/tools/keywords
  ↓
KeywordProjectsWorkspace
  ├─ Projektliste
  └─ Projekt-Detail
      ├─ Keywords
      ├─ Wettbewerber
      ├─ Integrationen
      ├─ Einstellungen
      └─ NEU: Rankings
          ├─ Summary Header
          ├─ Ranking Table
          └─ Keyword History Panel
  ↓
Next.js API Routes
  ├─ /api/tenant/keywords/projects/[id]/rankings
  ├─ /api/tenant/keywords/projects/[id]/rankings/history
  ├─ /api/tenant/keywords/projects/[id]/rankings/refresh
  ├─ /api/internal/keyword-rankings/run
  └─ /api/cron/keyword-rankings
  ↓
Supabase
  ├─ keyword_projects
  ├─ keywords
  ├─ competitor_domains
  ├─ gsc_connections
  ├─ keyword_ranking_runs        (neu)
  └─ keyword_ranking_snapshots   (neu)
```

### UI-Struktur

Der Rankings-Bereich sollte als weiterer Tab in der bestehenden Detailansicht von `KeywordProjectsWorkspace` umgesetzt werden, nicht als neue Seite. Das passt zum aktuellen Informationsmodell im Repo.

```text
Projekt-Detail (bestehend)
+-- Tabs
    +-- Keywords
    +-- Wettbewerber
    +-- Integrationen
    +-- Einstellungen
    +-- NEU: Rankings
        +-- Header
        |   +-- Letzter erfolgreicher Lauf
        |   +-- Status-Badge (bereit / laeuft / Fehler / ausstehend)
        |   +-- [Jetzt aktualisieren] (nur Admin)
        |
        +-- Fallback: GSC nicht verbunden
        |   +-- Hinweis mit Link zum Integrationen-Tab
        |
        +-- Fallback: Noch keine Snapshots
        |   +-- Empty State "Erstes Tracking ausstehend"
        |
        +-- Ranking-Tabelle
        |   +-- Keyword
        |   +-- Aktuelle Position
        |   +-- Delta zum vorherigen Snapshot
        |   +-- Letzte Messung
        |   +-- [Details]
        |
        +-- Keyword-Detail-Sheet
            +-- Zeitraum 30 / 90 Tage
            +-- Liniendiagramm fuer eigene Domain
            +-- Optional spaeter: Wettbewerber-Linien aus externer Quelle
```

### Datenmodell

**1. Bestehende Tabelle erweitern: `keyword_projects`**

Bestehende Felder wie `last_tracking_run` sollten weitergenutzt statt umbenannt werden.

Neue Felder:

| Feld | Bedeutung |
|------|-----------|
| `tracking_interval` | `daily` oder `weekly` |
| `last_tracking_error` | Letzte fachliche Fehlermeldung des Trackers |
| `last_tracking_status` | `idle`, `running`, `failed`, `success` |

**2. Neue Tabelle: `keyword_ranking_runs`**

Eine separate Run-Tabelle ist sinnvoll, weil sie Status, Fehler und manuelle Refresh-Limits sauber modelliert. Nur mit einer Snapshot-Tabelle waeren laufende/fehlgeschlagene Jobs schwer darstellbar.

| Feld | Bedeutung |
|------|-----------|
| `id` | Eindeutige ID des Tracking-Laufs |
| `tenant_id` | Tenant-Isolation |
| `project_id` | Referenz auf das Keyword-Projekt |
| `trigger_type` | `cron` oder `manual` |
| `status` | `queued`, `running`, `success`, `failed`, `skipped` |
| `started_at` | Startzeit des Laufs |
| `completed_at` | Endzeit des Laufs |
| `error_message` | Fehlertext fuer UI und Debugging |
| `keyword_count` | Anzahl verarbeiteter Keywords |

**3. Neue Tabelle: `keyword_ranking_snapshots`**

| Feld | Bedeutung |
|------|-----------|
| `id` | Eindeutige ID |
| `run_id` | Referenz auf `keyword_ranking_runs` |
| `tenant_id` | Tenant-Isolation |
| `project_id` | Schnellere Projekt-Abfragen |
| `keyword_id` | Referenz auf das Keyword |
| `position` | Position 1-100, `NULL` = keine Daten / nicht gefunden |
| `best_url` | URL aus GSC, falls vorhanden |
| `clicks` | Optional fuer spaetere Debug-Ansichten |
| `impressions` | Optional fuer "keine Daten" Einordnung |
| `tracked_at` | Snapshot-Zeitpunkt |
| `source` | `gsc` in v1, spaeter erweiterbar |

**Retention**

- Snapshots fuer 12 Monate behalten
- altere Daten per Cleanup-Cron loeschen
- Run-Historie kann ebenfalls mit auf 12 Monate begrenzt werden

### Datenfluss

**A. Dashboard lesen**

1. UI ruft `GET /api/tenant/keywords/projects/[id]/rankings` auf.
2. Route liest nur aus Supabase:
   - Projekt-Metadaten aus `keyword_projects`
   - neuesten Snapshot je Keyword aus `keyword_ranking_snapshots`
   - vorherigen Snapshot fuer Delta
   - letzten Run-Status aus `keyword_ranking_runs`
3. Antwort ist bereits tabellenfertig, damit die Client-Komponente keine Mehrfachabfragen bauen muss.

**B. Keyword-Historie lesen**

1. UI oeffnet das Detail-Sheet.
2. `GET /api/tenant/keywords/projects/[id]/rankings/history?keyword_id=...&days=30|90`
3. Route liefert eine kleine Zeitreihe fuer genau ein Keyword.

**C. Manueller Refresh**

1. Admin klickt "Jetzt aktualisieren".
2. `POST /api/tenant/keywords/projects/[id]/rankings/refresh`
3. Route prueft:
   - Tenant/Admin-Rechte
   - Modulzugang `seo_analyse`
   - GSC verbunden und `selected_property` gesetzt
   - kein laufender Run fuer das Projekt
   - kein erfolgreicher manueller Run in den letzten 60 Minuten
4. Route legt einen `keyword_ranking_runs`-Datensatz mit `queued` an und triggert den internen Worker.

**D. Geplanter Refresh**

1. Vercel Cron ruft taeglich `/api/cron/keyword-rankings` auf.
2. Die Route sucht alle aktiven Projekte, die faellig sind:
   - `tracking_interval = daily` und letzter Lauf > 24h
   - `tracking_interval = weekly` und letzter Lauf > 7d
3. Pro Projekt wird ein Run angelegt und der Worker gestartet.

### Worker-Ablauf

Der Worker sollte als internes Endpoint-Muster analog zu den bestehenden Worker-Routen umgesetzt werden.

```text
/api/internal/keyword-rankings/run
  ↓
Lade Run + Projekt + Keywords + GSC Connection
  ↓
Refresh Access Token falls noetig
  ↓
Fuer jedes Keyword:
  1. Query gegen die ausgewaehlte GSC-Property
  2. Beste Position fuer das Keyword bestimmen
  3. Snapshot speichern
  ↓
Bei Erfolg:
  - keyword_ranking_runs.status = success
  - keyword_projects.last_tracking_run = now()
  - keyword_projects.last_tracking_status = success
  - keyword_projects.last_tracking_error = null
  ↓
Bei Fehler:
  - keyword_ranking_runs.status = failed
  - keyword_projects.last_tracking_status = failed
  - keyword_projects.last_tracking_error setzen
  - bei Token-Problemen zusaetzlich gsc_connections.status aktualisieren
```

### API-Routen

| Route | Methode | Zweck |
|-------|---------|-------|
| `/api/tenant/keywords/projects/[id]/rankings` | GET | Tabellenansicht: aktueller Stand, Delta, Status, letzter Lauf |
| `/api/tenant/keywords/projects/[id]/rankings/history` | GET | Verlauf eines Keywords fuer 30 oder 90 Tage |
| `/api/tenant/keywords/projects/[id]/rankings/refresh` | POST | Manuellen Lauf anstossen (Admin only, DB-basiert gedrosselt) |
| `/api/internal/keyword-rankings/run` | POST | Interner Worker fuer genau einen Run |
| `/api/cron/keyword-rankings` | GET | Faellige Projekte einsammeln und Runs anlegen |
| `/api/cron/keyword-rankings-cleanup` | GET | Snapshots und alte Runs nach Retention loeschen |

### Wettbewerber-Strategie

Die bisherige Spezifikation nimmt an, dass GSC auch Wettbewerber-Positionen fuer fremde Domains liefern kann. Das ist mit der aktuellen PROJ-26-Integration nicht realistisch, weil eine GSC-Property immer an ein verifiziertes Eigentum gebunden ist.

Deshalb sollte PROJ-27 in zwei Stufen gedacht werden:

**Stufe 1: GSC First-Party Rankings**

- aktuelle Position je Keyword fuer die eigene Domain
- Delta zum letzten Snapshot
- Verlauf 30/90 Tage
- Cron + manueller Refresh
- Fehler-/Freshness-Status

**Stufe 2: Wettbewerber-Rankings**

- externer SERP-Datenanbieter
- eigener `source = serp_api` oder aehnlich in der Snapshot-Tabelle
- Wettbewerber-Linien im Diagramm
- Vergleich in derselben Detailansicht

Wenn die Wettbewerber-Anforderung zwingend im selben Scope bleiben soll, braucht das Projekt vor der Umsetzung eine Produktentscheidung fuer den externen Provider, die Kosten und die Zielregionen.

### Tech-Entscheidungen

| Entscheidung | Warum |
|---|---|
| **Rankings als weiterer Tab im bestehenden Workspace** | Kein neues Navigationsmodell, passt zur aktuellen `KeywordProjectsWorkspace`-Struktur |
| **DB-Read-Model statt Live-GSC-Calls im UI** | Erfuellt das Performance-Ziel und haelt die UI robust bei API-Ausfaellen |
| **Separate Run-Tabelle zusaetzlich zu Snapshots** | Saubere Abbildung von Status, Fehlern, Queueing und 1h-Refresh-Regel |
| **`last_tracking_run` weiterverwenden** | Passt zur bestehenden `keyword_projects`-Migration und vermeidet doppelte Felder |
| **DB-basierte Refresh-Sperre statt In-Memory Rate Limit** | Der aktuelle In-Memory-Limiter ist auf Serverless nicht verlässlich genug fuer "1x pro Stunde pro Projekt" |
| **Interner Worker-Endpoint** | Folgt dem bestehenden Muster im Repo fuer laengere Hintergrundjobs |
| **`recharts` fuer Verlaufschart** | Noch nicht installiert, aber fuer die bestehende React/Next-UI der leichteste Fit |
| **Vercel Cron erst nach `vercel.json`-Eintrag** | Im Repo existiert aktuell noch keine Cron-Konfiguration |

### Offene Entscheidungen

1. Soll PROJ-27 als **v1 ohne Wettbewerber-Linien** ausgeliefert werden?
2. Falls nein: Welcher externe SERP-Provider ist fachlich und kostenmaessig akzeptabel?
3. Soll der Cron nur taeglich laufen und woechentliche Projekte serverseitig herausfiltern, oder werden zwei getrennte Schedules bevorzugt?

### Abhaengigkeiten (neue Packages)

| Package | Zweck |
|---|---|
| `recharts` | Liniendiagramm fuer Positionsverlauf |

### Umsetzungshinweise fuer spaetere Skills

- `/backend` sollte zuerst Migrationen + Read-/Worker-Routen bauen.
- `/frontend` sollte danach nur auf die neuen Read-Model-Responses aufsetzen.
- `/qa` sollte besonders pruefen: leere Historie, Token abgelaufen, manueller Refresh gesperrt, Tenant-Isolation.

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
