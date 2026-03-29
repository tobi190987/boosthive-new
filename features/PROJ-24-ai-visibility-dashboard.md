# PROJ-24: AI Visibility Dashboard & Reports

## Status: Planned
**Created:** 2026-03-28
**Last Updated:** 2026-03-28

## Summary
Präsentationsschicht des AI Visibility Tools. Visualisiert die berechneten Metriken in einem Agentur-Dashboard mit Benchmark-Matrix (Brand vs. Wettbewerber), Timeline-Tracking über 30 Tage und ermöglicht den White-Label-PDF-Export für die Endkunden der Agentur.

## Dependencies
- Requires: PROJ-23 (AI Visibility Analytics & GEO) — benötigt berechnete Scores und Empfehlungen
- Requires: PROJ-12 (AI Visibility Query Engine) — Analyse-Projekt-Verwaltung
- Requires: PROJ-9 (Tenant Dashboard Shell) — Navigation und Layout
- Requires: PROJ-13 (Tenant Detail Management) — für White-Label-Branding (Logo, Farben der Agentur)

## User Stories
- Als Member möchte ich eine Übersichtsseite aller Analyse-Projekte mit aktuellem SOM-Score sehen, damit ich schnell den Status aller Kunden überblicke.
- Als Member möchte ich in der Benchmark-Matrix meinen Kunden mit bis zu 3 Wettbewerbern vergleichen, damit ich die relative KI-Sichtbarkeit einschätzen kann.
- Als Member möchte ich den Verlauf der KI-Sichtbarkeit über die letzten 30 Tage sehen, damit ich den Effekt von Website-Updates messen kann.
- Als Member möchte ich einen PDF-Report mit dem Branding der Agentur exportieren, damit ich diesen direkt an Endkunden weitergeben kann.
- Als Member möchte ich die GEO-Empfehlungen nach Priorität gefiltert einsehen.

## Acceptance Criteria

### Analyse-Übersicht
- [ ] Liste aller Analyse-Projekte des Tenants mit: Brand-Name, letzter Analyse-Datum, Gesamt-SOM, Trend-Indikator (↑↓→)
- [ ] Status-Anzeige laufender Analysen mit Progress-Bar
- [ ] Quick-Action: neue Analyse starten, bestehende Analyse erneut ausführen

### Benchmark-Matrix
- [ ] Tabelle: Zeilen = Keywords, Spalten = Brand + bis zu 3 Wettbewerber
- [ ] Zellinhalt: SOM-Wert (%) + Sentiment-Farbcodierung (grün/grau/rot)
- [ ] Filterbar nach: KI-Modell (alle / einzelne Modelle), Zeitraum
- [ ] Highlight: Zellen wo Brand < Wettbewerber (Keyword-Gap visuell hervorgehoben)
- [ ] Hover-Detail: Rohantwort-Vorschau (ein Beispiel-Zitat)

### Timeline-Tracking (30 Tage)
- [ ] Liniendiagramm: SOM-Verlauf pro Analyse über Zeit (max. 30 Tage)
- [ ] Mehrere Linien: Brand + Wettbewerber im selben Chart
- [ ] Annotation: Analyse-Datum als vertikale Markierung
- [ ] Vergleich: Delta zum vorherigen Analyse-Zeitpunkt (z.B. "+5,2% SOM in 14 Tagen")

### GEO-Empfehlungen
- [ ] Aufgelistet nach Priorität (Hoch zuerst)
- [ ] Jede Empfehlung: Titel, Beschreibung, Begründung, Prioritäts-Badge
- [ ] Markierbar als "erledigt" (Status-Toggle pro Empfehlung)
- [ ] Keyword-Gap-Liste: sortiert nach größtem Gap (Wettbewerber-SOM minus Brand-SOM)

### Source Attribution Ansicht
- [ ] Top-10-Quellen-Tabelle: Domain, Häufigkeit, ob Brand erwähnt (ja/nein)
- [ ] "Source Gap"-Sektion: Domains die Wettbewerber nennen, Brand aber nicht

### White-Label PDF Export
- [ ] PDF enthält: Agentur-Logo (aus Tenant-Branding), Agentur-Name, Erstellungsdatum
- [ ] Inhalte: Executive Summary, Benchmark-Matrix, Timeline-Chart, Top-Empfehlungen (top 5)
- [ ] Layout: professionell, druckfreundlich (A4)
- [ ] Download-Button auf der Analyse-Detail-Seite
- [ ] Dateiname: `[Brand-Name]-AI-Visibility-Report-[Datum].pdf`

## Edge Cases
- Keine abgeschlossenen Analysen vorhanden → Empty State mit CTA "Erste Analyse starten"
- Nur eine Analyse (kein Timeline-Trend möglich) → Timeline zeigt Einzelpunkt, Hinweis "Für Trend-Analyse weitere Analysen durchführen"
- Weniger als 3 Wettbewerber definiert → Benchmark-Matrix zeigt nur vorhandene Spalten
- Tenant-Branding ohne Logo → PDF verwendet Tenant-Namen als Text-Header
- PDF-Generierung schlägt fehl → Fehlermeldung mit Retry, kein Silent Fail
- Analyse älter als 30 Tage → aus Timeline ausgeblendet, aber weiterhin in der Detailansicht zugänglich

## Technical Requirements
- Charts: React-kompatible Chart-Library (Details in /architecture — z.B. Recharts oder Chart.js)
- PDF-Generierung: serverseitig (keine clientseitige PDF-Erzeugung), z.B. via Puppeteer oder React-PDF
- Alle Ansichten laden Daten aus den gecachten Score-Tabellen (kein Re-Processing)
- Responsive Design: Desktop-First, aber grundlegende Mobile-Lesbarkeit
- Performance: Dashboard-Ansicht lädt in < 2 Sekunden (gecachte Daten)

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

### Zielbild

PROJ-24 ist die Präsentations- und Export-Schicht für das bereits angelegte AI-Visibility-System.

Die Verantwortung ist bewusst getrennt:

1. PROJ-12 verwaltet Projekte, Analyseläufe und Rohantworten.
2. PROJ-23 berechnet daraus gecachte Scores, Quellen und Empfehlungen.
3. PROJ-24 liest diese bereits berechneten Daten, visualisiert sie tenant-sicher im Workspace und erzeugt daraus einen White-Label-Report.

Wichtig für v1: Das Dashboard stößt keine neue Analytics-Berechnung an. Es konsumiert ausschließlich vorhandene Daten aus den Cache-Tabellen und dem Analyse-Status.

### Architektur-Übersicht

```text
Tenant Browser
  ↓
/tools/ai-visibility
  ↓
AiVisibilityWorkspace
  ├─ Projektübersicht
  ├─ Analyse-Detailansicht
  ├─ Reporting-Widgets
  └─ PDF-Export-Action
  ↓
Next.js API Routes (tenant scoped)
  ├─ /api/tenant/visibility/projects
  ├─ /api/tenant/visibility/projects/[id]/scores
  ├─ /api/tenant/visibility/projects/[id]/sources
  ├─ /api/tenant/visibility/projects/[id]/recommendations
  ├─ /api/tenant/visibility/analyses/[id]/analytics
  └─ /api/tenant/visibility/analyses/[id]/status
  ↓
Supabase
  ├─ visibility_projects
  ├─ visibility_analyses
  ├─ visibility_scores
  ├─ visibility_sources
  ├─ visibility_recommendations
  └─ tenants (Branding: Name / Logo)
```

### UI-Struktur

PROJ-24 sollte auf der bestehenden Seite `/tools/ai-visibility` aufbauen und die heutige Workspace-Komponente erweitern, statt ein separates Tool einzuführen.

Empfohlene Informationsarchitektur:

- **Projektübersicht**
  zeigt alle `visibility_projects` eines Tenants mit letztem Analyse-Zeitpunkt, letztem Analytics-Status, Gesamt-SOM und Trendindikator.
- **Analyse-Detailseite**
  wird der zentrale Reporting-Screen für genau einen Analyselauf mit Benchmark-Matrix, Timeline, Quellen und Empfehlungen.
- **Export-Action**
  sitzt in der Detailansicht und erzeugt denselben Datenstand als White-Label-PDF.

Damit bleibt der Flow konsistent mit der bereits vorhandenen Navigation:

- Liste aller Projekte
- Projekt öffnen
- laufende Analyse beobachten
- nach Abschluss direkt in die Ergebnisansicht wechseln

### Datenquellen pro Bereich

**1. Analyse-Übersicht**

Quelle:

- `GET /api/tenant/visibility/projects`
- optional ergänzt um die letzte auswertbare Analyse über `visibility_analyses.analytics_status`

Anzeige:

- Brand-Name
- letztes Analyse-Datum
- letzter Status (`pending`, `running`, `done`, `partial`, `failed`)
- Gesamt-SOM aus der neuesten Analytics-fähigen Analyse
- Trend vs. vorherigem abgeschlossenen Lauf

Empfehlung:
Die Übersichts-API sollte in PROJ-24 serverseitig um zwei Read-Model-Felder ergänzt werden:

- `latest_share_of_model`
- `trend_delta`

So muss die Listenansicht nicht für jede Karte mehrere Folgeabfragen auslösen.

**2. Benchmark-Matrix**

Quelle:

- `GET /api/tenant/visibility/projects/[id]/scores?analysis_id=...`

Datenbasis:

- `visibility_scores`
- bevorzugt nur aggregierte Zeilen mit `model_name = 'all'` für die Default-Ansicht
- optional Drilldown nach Einzelmodell über denselben Datensatz

Darstellung:

- Zeilen = Keywords
- Spalten = Brand + definierte Wettbewerber
- Zelle = `share_of_model` plus Farbcodierung aus dem relativen Vergleich

Highlight-Regel:

- Wenn Brand-SOM unter mindestens einem Wettbewerber liegt, wird die Zelle bzw. Zeile als Gap markiert.

Hover-Details:

- Für v1 sollte die Rohantwort-Vorschau aus `GET /api/tenant/visibility/analyses/[id]/analytics` kommen, weil dort Analyse-Kontext und Aggregatdaten gemeinsam geladen werden können.
- Kein eigener Query gegen Rohdaten aus der UI.

**3. Timeline-Tracking**

Quelle:

- mehrere abgeschlossene Analysen eines Projekts aus `visibility_analyses`
- dazu je Lauf die aggregierten Werte aus `visibility_scores`

Empfehlung:
Für die Timeline ist ein dedizierter Read-Endpoint sinnvoll, z. B.:

- `GET /api/tenant/visibility/projects/[id]/timeline`

Warum eigener Endpoint:

- Die UI braucht nicht alle Score-Zeilen aller Analysen, sondern nur Zeitpunkte, Subjektname und aggregierte SOM-Werte.
- Die Datenmenge bleibt klein und chart-freundlich.
- Die 30-Tage-Filterung passiert serverseitig statt im Browser.

Output für v1:

- `analysis_id`
- `completed_at`
- `subject_name`
- `subject_type`
- `share_of_model`
- `delta_previous`

**4. GEO-Empfehlungen**

Quelle:

- `GET /api/tenant/visibility/projects/[id]/recommendations?analysis_id=...`

Datenbasis:

- `visibility_recommendations`

Für das Abhaken als "erledigt" fehlt aktuell noch ein Schreib-Endpoint. PROJ-24 sollte deshalb zusätzlich vorsehen:

- `PATCH /api/tenant/visibility/recommendations/[id]`

Erlaubte Änderung in v1:

- ausschließlich `status` von `open` auf `done` und zurück

So bleibt die Analytics-Berechnung unverändert, während die UI den Arbeitsstatus der Agentur speichern kann.

**5. Source Attribution**

Quelle:

- `GET /api/tenant/visibility/projects/[id]/sources?analysis_id=...`

Datenbasis:

- `visibility_sources`

Anzeige:

- Top-Quellen nach `mention_count`
- Kennzeichnung, welche Domains Brand und/oder Wettbewerber erwähnen
- zusätzliche "Source Gap"-Liste über `is_source_gap = true`

### PDF-Export-Architektur

Der PDF-Export soll serverseitig erfolgen, damit Layout, Branding und Datenstand reproduzierbar bleiben.

Empfohlener v1-Ansatz:

1. Next.js Route Handler lädt dieselben Daten wie die Detailansicht.
2. Tenant-Branding wird aus `tenants.logo_url` und Tenant-Name ergänzt.
3. Ein dediziertes Report-Template rendert Executive Summary, Matrix, Trend und Top-Empfehlungen.
4. Das PDF wird als Download-Response zurückgegeben.

Empfohlene technische Richtung:

- bevorzugt HTML-to-PDF über serverseitiges Rendering und Headless-Browser
- Alternative: React-PDF, wenn Chart-Darstellung ohne Screenshot-Workaround ausreichend gut ist

Architekturentscheidung für v1:

- Dashboard-Charts und PDF-Charts sollten nicht zwei getrennte Implementierungen bekommen.
- Deshalb sollten die PDF-Grafiken aus denselben aufbereiteten Datenmodellen erzeugt werden wie die UI, mit einer klaren Report-Transformation dazwischen.

Empfohlener zusätzlicher Endpoint:

- `GET /api/tenant/visibility/analyses/[id]/report`

Verantwortung dieses Endpoints:

- tenant-sichere Datenaggregation
- Branding einlesen
- PDF erzeugen
- Dateiname im Format `[Brand-Name]-AI-Visibility-Report-[Datum].pdf`

### Performance-Ansatz

Damit die Dashboard-Ansicht unter 2 Sekunden bleibt, sollte PROJ-24 nur Read-Model-Daten laden:

- keine erneuten LLM-Calls
- kein Re-Processing von Rohantworten
- keine clientseitige Aggregation über große historische Datensätze

Konkret:

- Projektübersicht erhält ein kompaktes Summary-Payload
- Detailansicht lädt Scores, Quellen und Empfehlungen parallel
- Timeline nutzt ein separates, stark reduziertes Dataset
- PDF-Export verwendet denselben gecachten Analysezustand

### Berechtigungen und Tenant-Sicherheit

PROJ-24 bleibt vollständig innerhalb des bestehenden Tenant-Shell- und API-Guard-Modells:

- Zugriff nur für authentifizierte Tenant-User
- Modul-Gate über `ai_visibility`
- alle Reads tenant-scoped über `tenant_id`
- Supabase-RLS schützt die Analytics-Tabellen zusätzlich auf Datenbankebene

Für den PDF-Export und den Recommendation-Status gilt dieselbe Regel:

- kein Cross-Tenant-Zugriff
- keine owner-spezifische Sonderroute
- alle Aktionen innerhalb der vorhandenen Tenant-API-Struktur

### Zustände und Edge-Case-Verhalten

Die UI sollte drei technische Zustände klar trennen:

1. **Keine Analyse vorhanden**
   Empty State mit CTA zum ersten Lauf
2. **Analyse läuft oder Analytics laufen noch**
   Progress-/Statusansicht auf Basis von `status` plus `analytics_status`
3. **Analyse abgeschlossen und Analytics vorhanden**
   vollständige Reporting-Ansicht

Spezialfall:

- `status = done`, aber `analytics_status = pending|running`
  Dann zeigt die UI noch keinen Report, sondern einen Zwischenstatus "Ergebnisse werden aufbereitet".

Spezialfall:

- `analytics_status = partial`
  Report wird angezeigt, aber mit Hinweis, dass einzelne Empfehlungen oder Teilmetriken unvollständig sein können.

### Empfohlene Umsetzung in Arbeitspaketen

**1. Read Models für die Übersicht**

- Projektliste um letzten SOM und Trend ergänzen
- Ergebnis-Weiterleitung nach Analyseabschluss in die Reporting-Ansicht

**2. Detailansicht für einen Analyselauf**

- Benchmark-Matrix
- Empfehlungen
- Quellen
- Status-/Fehlerzustände

**3. Timeline-Endpoint und Chart**

- historisierte SOM-Werte der letzten 30 Tage
- Delta zum vorherigen Lauf

**4. Recommendation-Status speichern**

- PATCH-Route
- Status-Toggle in der UI

**5. White-Label-PDF**

- serverseitiger Report-Endpoint
- Branding-Fallback ohne Logo
- Fehlerhandling mit Retry

### Ergebnis

PROJ-24 ergänzt keine neue Rechenlogik, sondern macht die vorhandene AI-Visibility-Pipeline nutzbar:

- PROJ-12 erzeugt den Analyse-Lauf
- PROJ-23 erzeugt den gecachten Erkenntnisstand
- PROJ-24 liefert die operative Arbeitsoberfläche und den kundenfähigen Report

Damit bleibt die Architektur klar getrennt, performant und für spätere Erweiterungen wie Keyword-Rankings oder zusätzliche Exportformate offen.

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
