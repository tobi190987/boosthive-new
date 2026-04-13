# PROJ-67: Brand Mention Monitoring & Sentiment Analyse

## Status: Planned
**Created:** 2026-04-13
**Last Updated:** 2026-04-13

## Dependencies
- PROJ-29 (Customer Database) — Kunden als Kontext für Mentions
- PROJ-66 (Google Trends Integration) — gleiche Brand-Keywords werden wiederverwendet
- PROJ-28 (Globaler Kunden-Selektor) — Kundenauswahl

## User Stories
- Als Agentur-Mitarbeiter möchte ich sehen, wo und wie oft der Markenname eines Kunden im Netz erwähnt wird, damit ich die Sichtbarkeit und Reichweite beurteilen kann.
- Als Agentur-Mitarbeiter möchte ich wissen, ob Erwähnungen positiv, neutral oder negativ sind, damit ich Reputationsrisiken frühzeitig erkennen kann.
- Als Agentur-Mitarbeiter möchte ich Mentions nach Quelle (News, Blog, Forum, Social) filtern, damit ich relevante Kanäle gezielt beobachten kann.
- Als Agentur-Mitarbeiter möchte ich einen Sentiment-Score (0–100) als Übersichtskennzahl sehen, damit ich schnell einschätzen kann, wie die Marke wahrgenommen wird.
- Als Agentur-Admin möchte ich Alerts setzen können, wenn der Sentiment-Score unter einen Schwellwert fällt, damit kritische Reputationsprobleme nicht unbemerkt bleiben.

## Acceptance Criteria
- [ ] Neuer Tab „Mentions & Sentiment" im Brand-Trends-Bereich (ergänzt PROJ-66)
- [ ] Mentions-Liste zeigt: Titel, Quelle, Datum, Snippet, Sentiment-Label (Positiv / Neutral / Negativ)
- [ ] Quellen-Filter: All / News / Blogs / Foren / Social Media
- [ ] Zeitraum-Filter: Letzte 7 / 30 / 90 Tage
- [ ] Sentiment-Donut-Chart zeigt Verteilung (% positiv / neutral / negativ)
- [ ] Gesamt-Sentiment-Score (0–100) prominent als KPI-Kachel angezeigt
- [ ] Mentions werden paginiert (20 pro Seite)
- [ ] Mentions werden täglich gecacht (24h TTL per Kunde + Keyword)
- [ ] Alert-Schwellwert: Admin kann einen Minimum-Sentiment-Score konfigurieren; bei Unterschreitung erscheint Notification (PROJ-35)
- [ ] Keine Mentions gefunden → leere State mit Zeitstempel letzter Aktualisierung

## Edge Cases
- API hat keine Ergebnisse für das Keyword → „Keine Erwähnungen gefunden in diesem Zeitraum" statt Fehler
- Sentiment-Analyse liefert kein eindeutiges Ergebnis → Label „Neutral" als Fallback
- Mehr als 500 Mentions pro Tag (sehr bekannte Marke) → Limit auf 200 + Hinweis „Ergebnisse gefiltert"
- Alert-Schwellwert wird unterschritten, aber Notification-System nicht erreichbar → Fehler loggen, nicht crashen
- Quelle ist auf englisch, Marke aber deutsch → Sentiment-Analyse muss mehrsprachig funktionieren

## Technical Requirements
- API: Exa.ai Search API (semantische Web-Suche + Snippets) oder Brave Search API als Mention-Source
- Sentiment: OpenAI / Claude API zur Sentiment-Klassifikation der Snippets (batch-weise)
- Cache: Supabase-Tabelle `brand_mention_cache` (customer_id, keyword, period, mentions JSONB, sentiment_score, cached_at)
- Alert-Config: Spalte `sentiment_alert_threshold` in `brand_keywords`-Tabelle
- Notification-Integration: PROJ-35 Realtime Notifications

---

## Tech Design (Solution Architect)
_To be added by /architecture_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
