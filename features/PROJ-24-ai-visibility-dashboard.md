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
_To be added by /architecture_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
