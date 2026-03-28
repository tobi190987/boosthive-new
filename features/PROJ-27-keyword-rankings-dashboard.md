# PROJ-27: Keyword Rankings Dashboard & History

## Status: Planned
**Created:** 2026-03-28
**Last Updated:** 2026-03-28

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
_To be added by /architecture_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
