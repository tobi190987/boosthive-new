# PROJ-23: AI Visibility Analytics & GEO

## Status: Deployed
**Created:** 2026-03-28
**Last Updated:** 2026-03-28

## Summary
Verarbeitungsschicht des AI Visibility Tools. Berechnet aus den gespeicherten Rohantworten die zentralen Metriken: Share of Model (SOM), Sentiment-Einordnung und Source Attribution. Leitet daraus GEO-Empfehlungen (Generative Engine Optimization) ab — Keyword-Gaps und konkrete Content-Optimierungsvorschläge.

## Dependencies
- Requires: PROJ-12 (AI Visibility Query Engine) — benötigt gespeicherte Rohantworten
- Requires: PROJ-6 (Role-Based Access Control)

## User Stories
- Als Member möchte ich nach Abschluss einer Analyse den Share of Model (SOM) pro Keyword und Modell sehen, damit ich weiß, wie häufig mein Kunde von KIs erwähnt wird.
- Als Member möchte ich die Sentiment-Einordnung pro Erwähnung (positiv / neutral / negativ) sehen, damit ich beurteilen kann, wie KIs über meinen Kunden sprechen.
- Als Member möchte ich sehen, welche Quellen/Websites die KI in ihren Antworten zitiert, damit ich Backlink- und Content-Strategien ableiten kann.
- Als Member möchte ich eine Keyword-Gap-Analyse sehen: wo werden Wettbewerber genannt, mein Kunde aber nicht?
- Als Member möchte ich konkrete Content-Optimierungsvorschläge erhalten, damit ich die KI-Sichtbarkeit des Kunden gezielt verbessern kann.

## Acceptance Criteria

### Share of Model (SOM)
- [ ] SOM = Anzahl Antworten mit Erwähnung / Gesamtzahl Antworten × 100 (pro Keyword × Modell)
- [ ] Gesamt-SOM über alle Modelle aggregiert (gewichteter Durchschnitt)
- [ ] SOM separat für Brand und jeden Wettbewerber berechnet

### Sentiment Analysis
- [ ] Pro Erwähnung wird Sentiment klassifiziert: positiv / neutral / negativ
- [ ] Klassifikation erfolgt durch zweiten LLM-Call (OpenRouter) auf die gespeicherte Rohantwort
- [ ] Sentiment-Score als Prozentsatz (z.B. 70% positiv, 20% neutral, 10% negativ)
- [ ] Vergleich Sentiment Brand vs. Wettbewerber

### Source Attribution
- [ ] Aus Rohantworten werden genannte URLs/Domains extrahiert (Regex + LLM-Extraktion)
- [ ] Top-Quellen nach Häufigkeit sortiert
- [ ] Unterscheidung: Quellen die Brand erwähnen vs. Quellen die nur Wettbewerber erwähnen
- [ ] Darstellung als "Source Gap": Quellen bei Wettbewerbern, aber nicht beim Kunden

### GEO-Empfehlungen
- [ ] Keyword-Gap: Liste der Keywords, bei denen Wettbewerber ≥2× häufiger genannt werden als die Brand
- [ ] Content-Optimierungs-Vorschläge (generiert via OpenRouter): mind. 5 konkrete Maßnahmen (z.B. "Füge Schema.org Markup für LocalBusiness hinzu", "Erstelle Inhalte zu Thema X")
- [ ] Jede Empfehlung mit Priorität (Hoch/Mittel/Niedrig) und Begründung
- [ ] GEO-Score: Gesamt-Optimierungspotenzial als Zahl 0–100

## Edge Cases
- Brand in 0% der Antworten erwähnt → SOM = 0, Empfehlung "Marke aufbauen — keine KI-Sichtbarkeit vorhanden"
- Brand in 100% der Antworten → Hinweis "Maximale Sichtbarkeit erreicht", Fokus auf Sentiment
- Keine URLs in Antworten extrahierbar (Modell nennt keine Quellen) → Source Attribution: "Keine Quellen gefunden — Modell gibt keine Referenzen an"
- Wettbewerber nicht in einer einzigen Antwort genannt → Hinweis im Keyword-Gap "Vergleichsdaten für [Wettbewerber] nicht ausreichend"
- Sentiment-Analyse-Call schlägt fehl → Sentiment auf "unbekannt" setzen, keine Blockierung der Gesamt-Analyse
- Brand-Name in Antwort als Teil eines anderen Begriffs erwähnt (False Positive) → Fuzzy-Matching mit Konfidenz-Score

## Technical Requirements
- Sentiment- und Source-Extraktion als Post-Processing-Schritt nach Abschluss der Raw-Query-Phase
- GEO-Empfehlungen: separater LLM-Call mit strukturiertem Output (JSON)
- DB-Tabellen: `visibility_scores` (SOM, Sentiment, GEO-Score), `visibility_sources`, `visibility_recommendations`
- Alle Berechnungen mit `analysis_id` und `tenant_id` verknüpft
- Scores werden nur einmal berechnet und gecacht — kein Re-Processing bei jedem Seitenaufruf

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

### Zielbild

PROJ-23 ist die Analytics-Schicht zwischen der bereits implementierten Query Engine (PROJ-12) und dem geplanten Reporting-Dashboard (PROJ-24).

Der Ablauf ist dreistufig:

1. **Rohdaten erfassen**  
   PROJ-12 speichert jede KI-Antwort in `visibility_raw_results`.
2. **Metriken berechnen**  
   PROJ-23 verarbeitet abgeschlossene Analysen asynchron zu Scores, Quellen und Empfehlungen.
3. **Ergebnisse anzeigen**  
   PROJ-24 liest nur noch die berechneten, gecachten Daten aus den neuen Analytics-Tabellen.

Wichtig: Die Analytics-Berechnung läuft **nicht** bei jedem Seitenaufruf, sondern genau einmal pro Analyse-Lauf und bei explizitem Reprocessing.

### Architektur-Übersicht

```text
Browser
  ↓ Analyse starten / Status pollen
Next.js API Routes
  ↓
visibility_analyses + visibility_raw_results   (bestehend aus PROJ-12)
  ↓ nach Status "done"
Analytics Worker / Post-Processing Job
  ├─ extrahiert Erwähnungen, Quellen und Sentiment
  ├─ berechnet SOM und GEO-Score
  ├─ erzeugt Keyword-Gaps und Empfehlungen
  ↓
visibility_scores
visibility_sources
visibility_recommendations
  ↓
Dashboard / Reports (PROJ-24)
```

### Verarbeitungsschritte

**1. Trigger nach Analyse-Abschluss**

Sobald ein Eintrag in `visibility_analyses` auf `done` wechselt, wird ein zweiter Background-Job gestartet:

- bevorzugt über denselben Next.js/Vercel-Worker-Ansatz wie in PROJ-12
- mit neuer Verarbeitungsphase `analytics_pending` → `analytics_running` → `analytics_done` / `analytics_failed`
- nur für vollständig abgeschlossene Rohdaten

Warum dieser Ansatz:

- passt zur bestehenden Architektur
- kein zusätzlicher Queue-Dienst in v1 nötig
- Reprocessing bleibt möglich, ohne die eigentliche Query-Engine erneut auszuführen

**2. Normalisierung der Rohantworten**

Jede Antwort aus `visibility_raw_results` wird für die Analytics-Schicht vorbereitet:

- Brand-Erwähnung übernehmen und um Fuzzy-Matching-Konfidenz ergänzen
- Wettbewerber-Erwähnungen in vergleichbare Treffer umwandeln
- Quellen aus URLs und Domains extrahieren
- Antworttext für Sentiment- und Recommendation-Prompts bereinigen

**3. Metrikberechnung**

Aus den normalisierten Rohdaten werden pro `analysis_id` berechnet:

- SOM pro Keyword × Modell × Subjekt (Brand + Wettbewerber)
- aggregierter SOM über alle Modelle
- Sentiment-Verteilung
- Source Attribution und Source Gaps
- Keyword Gaps
- GEO-Score

**4. Empfehlungsgenerierung**

Im letzten Schritt erzeugt ein strukturierter LLM-Call die GEO-Empfehlungen:

- Input: aggregierte Kennzahlen, auffällige Keywords, Source Gaps, Sentiment-Muster
- Output: valides JSON mit Titel, Begründung, Priorität, Bezug auf Keyword/Quelle
- Speicherung in separater Tabelle, damit UI und PDF-Export keine LLM-Calls mehr brauchen

### Datenmodell

Die bestehenden Tabellen aus PROJ-12 bleiben unverändert die Rohdatenquelle:

- `visibility_projects`
- `visibility_analyses`
- `visibility_raw_results`

Neu für PROJ-23:

**`visibility_scores`** — zentrale Kennzahlen pro Analyse
- `id`
- `tenant_id`
- `analysis_id`
- `project_id`
- `keyword`
- `model_name` (`all` für aggregierte Sicht)
- `subject_type` (`brand` oder `competitor`)
- `subject_name`
- `mention_count`
- `response_count`
- `share_of_model`
- `sentiment_positive`
- `sentiment_neutral`
- `sentiment_negative`
- `geo_score`
- `computed_at`

Nutzen:
- schnelle Tabellen- und Chart-Abfragen
- direkte Grundlage für Benchmark-Matrix und Trenddiagramme in PROJ-24

**`visibility_sources`** — Quellen und Attributionsdaten
- `id`
- `tenant_id`
- `analysis_id`
- `project_id`
- `keyword`
- `model_name`
- `source_domain`
- `source_url` (optional)
- `mentioned_subjects` (Brand/Wettbewerber als JSON)
- `mention_count`
- `is_source_gap`
- `computed_at`

Nutzen:
- Top-Quellen-Tabelle
- Source-Gap-Auswertung
- spätere Drilldowns im Dashboard

**`visibility_recommendations`** — GEO-Maßnahmen
- `id`
- `tenant_id`
- `analysis_id`
- `project_id`
- `priority` (`high` / `medium` / `low`)
- `title`
- `description`
- `rationale`
- `recommendation_type` (`content`, `schema`, `authority`, `source_gap`, `keyword_gap`)
- `related_keyword` (optional)
- `status` (`open` / `done`)
- `sort_order`
- `computed_at`

Nutzen:
- UI kann Empfehlungen direkt filtern und abhaken
- White-Label-Reports nutzen dieselben Daten ohne Sonderlogik

### Berechnungslogik

**Share of Model (SOM)**

Berechnung pro Keyword × Modell × Subjekt:

`SOM = Antworten mit Erwähnung / Gesamtzahl gültiger Antworten × 100`

Regeln:

- fehlgeschlagene Rohantworten (`error_flag = true`) zählen nicht als gültige Antwort
- Brand und jeder Wettbewerber werden separat ausgewertet
- Aggregation über alle Modelle erfolgt gewichtet nach Anzahl gültiger Antworten, nicht als einfacher Mittelwert

**Sentiment**

Sentiment wird nicht beim ersten Query-Call, sondern im Analytics-Post-Processing berechnet.

Ansatz:

- 1 zusätzlicher LLM-Call pro Rohantwort oder kleiner Batch ähnlicher Antworten
- strukturierter Output: `positive | neutral | negative | unknown`
- bei Fehlern wird `unknown` gespeichert, die Gesamtauswertung bleibt aber verfügbar

Warum getrennt:

- Rohdaten bleiben unverändert
- Sentiment-Modell kann später verbessert oder ersetzt werden
- Reprocessing ist möglich, ohne die ursprünglichen Abfragen erneut zu bezahlen

**Source Attribution**

Extraktion in zwei Stufen:

1. Regex/Parser für offensichtliche URLs und Domains
2. optionaler LLM-Fallback für Antworten mit Quellenhinweisen ohne saubere URL

Quelle wird auf Domain-Ebene normalisiert, damit z. B. Unterseiten von derselben Website zusammengefasst werden.

**Keyword Gap**

Ein Keyword gilt als Gap, wenn:

- ein Wettbewerber bei diesem Keyword mindestens doppelt so hohen SOM wie die Brand hat
- und eine Mindestmenge an gültigen Antworten vorliegt, damit kleine Samples nicht zu falschen Alarmen führen

Empfohlene v1-Regel:

- mindestens 5 gültige Antworten im Keyword/Modell-Aggregat

**GEO-Score**

Der GEO-Score ist ein zusammengesetzter Wert von 0 bis 100 aus:

- Sichtbarkeit (SOM)
- Sentiment
- Quellenqualität / Quellenabdeckung
- Gap-Schwere gegenüber Wettbewerbern

Ziel des Scores:

- eine leicht verständliche Management-Zahl für Dashboard und Report
- keine Blackbox für Detailanalysen, deshalb bleiben alle Teilmetriken sichtbar

### API-Schnittstellen

Zusätzlich zu den bestehenden PROJ-12-Routen werden für PROJ-23 Analytics-Endpunkte ergänzt:

```text
/api/tenant/visibility/analyses/[id]/analytics         GET
/api/tenant/visibility/analyses/[id]/analytics/rebuild POST
/api/tenant/visibility/projects/[id]/scores            GET
/api/tenant/visibility/projects/[id]/sources           GET
/api/tenant/visibility/projects/[id]/recommendations   GET
/api/tenant/visibility/recommendations/[id]            PATCH
```

Verantwortung der Endpunkte:

- `analyses/[id]/analytics`
  liefert den vollständigen, gecachten Analyse-Block für Detailansichten
- `analytics/rebuild`
  stößt Reprocessing an, falls Logik oder Prompting verbessert wurde
- projektbezogene Endpunkte
  liefern gefilterte Daten für Übersicht, Benchmark und Trend
- `recommendations/[id]`
  erlaubt Statuswechsel auf "erledigt" für PROJ-24

### UI- und Produktfluss

Die bestehende AI-Visibility-UI aus PROJ-12 bekommt nach Abschluss einer Analyse einen zweiten Ergebniszustand:

1. Query läuft
2. Query abgeschlossen
3. Analytics werden berechnet
4. Ergebnisse verfügbar

In der Oberfläche sind für v1 drei Ergebnisblöcke sinnvoll:

- **Overview**
  Gesamt-SOM, GEO-Score, Brand-vs-Competitor Snapshot
- **Keyword & Model Breakdown**
  SOM und Sentiment pro Keyword und Modell
- **Sources & Recommendations**
  Top-Quellen, Source Gaps, priorisierte Maßnahmen

So bleibt PROJ-23 eigenständig nutzbar und bildet gleichzeitig die Datengrundlage für PROJ-24.

### Sicherheit und Mandantentrennung

Alle neuen Tabellen tragen verpflichtend:

- `tenant_id`
- `analysis_id`
- `project_id`

RLS folgt demselben Muster wie in PROJ-12:

- Tenant-Mitglieder dürfen nur eigene Analytics lesen
- Schreiben erfolgt ausschließlich über Service-Role im Backend-Worker

Zusätzlich:

- keine OpenRouter- oder Worker-Secrets im Client
- Rebuild-Endpunkte nur für berechtigte Tenant-User mit gebuchtem Modul
- Empfehlungs-Prompts verwenden nur bereits gespeicherte Rohdaten, keine zusätzlichen Fremddaten

### Fehlerbehandlung

Die Analytics-Schicht ist fehlertolerant:

- Sentiment-Fehler blockieren weder SOM noch Source Attribution
- Quellenextraktion darf teilweise leer sein
- Recommendation-Generierung kann separat fehlschlagen, ohne die Score-Berechnung zu verlieren

Daher sollte der Analytics-Status intern getrennt gespeichert werden:

- `analytics_status = pending | running | done | failed | partial`

`partial` ist für v1 besonders nützlich, wenn Scores berechnet wurden, Empfehlungen aber fehlen.

### Performance-Entscheidungen

Für v1 gilt:

- Berechnung direkt nach Analyseabschluss
- Datenbank statt On-the-fly-Berechnung
- Aggregation auf Analyse-Ebene, nicht erst im Dashboard

Warum:

- schnellere Ladezeiten für PROJ-24
- kalkulierbare OpenRouter-Kosten
- saubere Trennung zwischen teurer Berechnung und häufiger Darstellung

Empfohlene spätere Optimierungen:

- Batch-Sentiment statt Einzelcalls
- materialisierte Views für Projekt-Trends über viele Analysen
- Retry-Mechanismus nur für fehlgeschlagene Recommendation-/Sentiment-Schritte

### Tech-Entscheidungen

| Entscheidung | Warum |
|---|---|
| Post-Processing als zweiter Worker | Entkoppelt Rohdatenerfassung und Analytics sauber |
| Gecachte Score-Tabellen statt Live-Berechnung | Dashboard und PDF bleiben schnell und günstig |
| Strukturierte LLM-Outputs für Sentiment/Empfehlungen | Weniger Parsing-Fehler, leichter testbar |
| Domain-Normalisierung für Quellen | Bessere Vergleichbarkeit für Source Gaps |
| Analytics-Rebuild als eigener Endpunkt | Künftige Verbesserungen ohne neue Rohabfragen |

### Abhängigkeiten

- **OpenRouter** bleibt der einzige LLM-Provider in v1
- kein zusätzlicher externer Queue-Service nötig
- optional später: dedizierte JSON-Schema-Validierung für Recommendation-Outputs

### Offene Produktentscheidungen

Vor Umsetzung sollten wir noch zwei Dinge festziehen:

1. Ob Sentiment pro einzelner Rohantwort oder pro zusammengefasstem Brand/Keyword-Block bewertet werden soll  
   Empfehlung: pro Rohantwort, weil Benchmark und Drilldown dadurch konsistent bleiben.
2. Ob der GEO-Score im UI vollständig transparent aufgeschlüsselt wird  
   Empfehlung: Ja, mindestens mit 3-4 Teilfaktoren, damit die Zahl vertrauenswürdig bleibt.

## QA Test Results

**Tested:** 2026-03-28
**Tester:** QA Engineer (AI)
**Scope:** Erneuter Review der PROJ-23-Backend-Implementierung nach Bugfixes, statische Verifikation via `npx eslint` und `npx tsc --noEmit`

### Acceptance Criteria Status

#### AC: Share of Model (SOM)
- [x] SOM-Berechnung pro Keyword × Modell × Subjekt ist implementiert
- [x] Aggregation über alle Modelle (`model_name = all`) ist implementiert
- [x] Brand und Wettbewerber werden separat als eigene Score-Zeilen gespeichert
- [x] Scores-Endpunkte liefern nun auch `partial`-Analysen aus, wenn bereits gecachte Ergebnisse vorhanden sind

#### AC: Sentiment Analysis
- [x] Sentiment wird nur noch auf tatsächliche Erwähnungen eines Subjekts angerechnet
- [x] Fehlgeschlagene oder nicht verfügbare Sentiment-Calls werden als `unknown` behandelt
- [x] Sentiment wird pro erwähntem Subjekt separat klassifiziert, auch wenn mehrere Subjekte in derselben Rohantwort vorkommen

#### AC: Source Attribution
- [x] URLs mit `http/https` werden per Regex extrahiert
- [x] Top-Quellen und Source-Gap-Flag werden gespeichert
- [x] Quellenextraktion nutzt jetzt Regex/Bare-Domain-Erkennung plus LLM-Fallback

#### AC: GEO-Empfehlungen
- [x] Empfehlungen werden separat gespeichert und mit Priorität/Begründung versehen
- [x] Rebuild-Endpoint für erneute Berechnung ist vorhanden
- [x] Keyword-Gap-Heuristik für Empfehlungen folgt jetzt der ≥2x-Regel mit Mindest-Sample

### Weitere Findings

- [x] Mention-Erkennung arbeitet jetzt konservativer mit Konfidenzschwelle statt einfachem `includes()`

### Verifikation

- `npx eslint 'src/lib/visibility-analytics.ts' 'src/app/api/tenant/visibility/projects/[id]/scores/route.ts'`
- `npx tsc --noEmit`

### Gesamtfazit

Die dokumentierten QA-Findings sind im Backend behoben und der Code ist statisch sauber. Der aktuelle Stand ist aus Implementierungs- und Compile-Sicht **abnahmefähig**, mit dem verbleibenden Restrisiko, dass kein Live-End-to-End-Lauf gegen reale OpenRouter-Antworten oder produktive Supabase-Daten durchgeführt wurde.

## Deployment
_To be added by /deploy_
