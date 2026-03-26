# PROJ-12: AI Visibility Tool

## Status: Planned
**Created:** 2026-03-26
**Last Updated:** 2026-03-26

## Dependencies
- Requires: PROJ-9 (Tenant Dashboard Shell) — Modul im Dashboard
- Requires: PROJ-6 (Role-Based Access Control)

## User Stories
- Als Member möchte ich prüfen, wie sichtbar eine Marke oder Website in KI-Antworten (ChatGPT, Perplexity, Gemini etc.) ist.
- Als Member möchte ich sehen, bei welchen Fragen oder Themen eine Marke von KI-Systemen genannt wird.
- Als Admin möchte ich die Sichtbarkeitsanalysen meines Tenants im Verlauf einsehen.
- Als Member möchte ich Empfehlungen erhalten, wie ich die KI-Sichtbarkeit einer Marke verbessern kann.

## Acceptance Criteria
- [ ] Eingabe: Markenname oder URL
- [ ] System prüft KI-Sichtbarkeit für vordefinierte Kategorien/Fragen
- [ ] Ergebnis: Sichtbarkeits-Score, Liste der Erwähnungen, fehlende Bereiche
- [ ] Handlungsempfehlungen zur Verbesserung der KI-Sichtbarkeit
- [ ] Analyse wird gespeichert (Tenant-isoliert)
- [ ] Verlauf zeigt Sichtbarkeitsveränderungen über Zeit (Trend)

## Edge Cases
- Unbekannte Marke → Score = 0, Empfehlung "Marke aufbauen"
- KI-Abfrage schlägt fehl → Fehlermeldung, kein Silent Fail
- Markenname zu generisch → Hinweis "Name zu allgemein, bitte präzisieren"

## Technical Requirements
- KI-Abfragen über API-Provider (Details in /architecture)
- Ergebnisse mit `tenant_id` in DB, Zeitstempel für Trend-Analyse
- _Genaue KI-Abfrage-Strategie wird in /architecture definiert_

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)
_To be added by /architecture_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
