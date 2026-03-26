# PROJ-10: SEO Analyse Tool

## Status: Planned
**Created:** 2026-03-26
**Last Updated:** 2026-03-26

## Dependencies
- Requires: PROJ-9 (Tenant Dashboard Shell) — Tool wird als Modul im Dashboard eingebettet
- Requires: PROJ-6 (Role-Based Access Control) — Tool-Zugriff je nach Rolle

## User Stories
- Als Member möchte ich eine URL eingeben und eine SEO-Analyse für diese Seite erhalten.
- Als Member möchte ich die wichtigsten SEO-Faktoren (Title, Meta Description, Headings, Links) auf einen Blick sehen.
- Als Admin möchte ich vergangene Analysen meines Tenants in einer Liste einsehen können.
- Als Member möchte ich eine Analyse als PDF oder CSV exportieren können.
- Als Member möchte ich Verbesserungsvorschläge zu meinen SEO-Schwachstellen erhalten.

## Acceptance Criteria
- [ ] URL-Eingabeformular mit Validierung (gültige HTTP/HTTPS-URL)
- [ ] Analyse-Ergebnis zeigt: Title-Tag, Meta-Description, H1-H6-Struktur, Alt-Texte, interne/externe Links
- [ ] Scoring: Gesamtpunktzahl (0–100) mit farbkodierter Bewertung (Rot/Gelb/Grün)
- [ ] Jeder gefundene Punkt hat Status: ✅ OK / ⚠️ Verbesserungswürdig / ❌ Kritisch
- [ ] Analyse-Ergebnisse werden gespeichert und sind unter "Analysen-Verlauf" abrufbar
- [ ] Analysen sind Tenant-isoliert (andere Tenants sehen keine fremden Analysen)
- [ ] Export: PDF-Download der Analyse

## Edge Cases
- URL nicht erreichbar → Fehlermeldung "Seite konnte nicht analysiert werden"
- Analyse dauert lang (> 10s) → Loading-Indicator, kein Timeout-Fehler für User
- Paywall/Login-geschützte Seite → Hinweis "Seite nicht öffentlich zugänglich"

## Technical Requirements
- Tool läuft als separates API-Modul, nicht im Frontend
- Ergebnisse werden in DB mit `tenant_id` gespeichert
- _Details zu API-Integration folgen in /architecture_

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)
_To be added by /architecture_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
