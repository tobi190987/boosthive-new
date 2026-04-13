# PROJ-68: Social Media Trend Radar

## Status: Planned
**Created:** 2026-04-13
**Last Updated:** 2026-04-13

## Dependencies
- PROJ-29 (Customer Database) — Kunden als Kontext
- PROJ-66 (Google Trends Integration) — Brand-Keywords werden wiederverwendet
- PROJ-28 (Globaler Kunden-Selektor) — Kundenauswahl

## User Stories
- Als Agentur-Mitarbeiter möchte ich aktuelle Trending-Hashtags und Themen rund um die Branche/Marke eines Kunden sehen, damit ich Content-Ideen für Social-Media-Kampagnen ableiten kann.
- Als Agentur-Mitarbeiter möchte ich Trends nach Plattform (TikTok, Instagram, YouTube) filtern, damit ich plattformspezifische Strategien entwickeln kann.
- Als Agentur-Mitarbeiter möchte ich sehen, welche Trend-Inhalte (Videos, Posts) zu einer Marke oder Branche viral gehen, damit ich Content-Formate erkennen kann, die gut performen.
- Als Agentur-Mitarbeiter möchte ich Trends für eine bestimmte Branche/Kategorie definieren (z. B. „Fitness", „Beauty", „Food"), damit die Ergebnisse relevant für den jeweiligen Kunden sind.
- Als Agentur-Mitarbeiter möchte ich Trend-Snapshots als Verlauf sehen (wann wurde ein Hashtag trending), damit ich Muster und Seasonalitäten erkennen kann.

## Acceptance Criteria
- [ ] Neuer Tab „Social Trends" im Brand-Trends-Bereich (ergänzt PROJ-66 und PROJ-67)
- [ ] Pro Kunde kann eine Branche/Kategorie gepflegt werden (Freitext + Dropdown gängiger Kategorien)
- [ ] Plattform-Tabs: TikTok / Instagram / YouTube (je nach API-Verfügbarkeit)
- [ ] Trending-Hashtag-Liste: Hashtag, Plattform, geschätztes Volumen, Trend-Richtung (steigend / stabil / fallend)
- [ ] Trending-Content-Beispiele: Top 3–5 virale Posts/Videos pro Hashtag mit Link und Thumbnail-Preview
- [ ] Zeitraum-Filter: Heute / Diese Woche / Dieser Monat
- [ ] Daten werden täglich aktualisiert und gecacht (24h TTL)
- [ ] Trend-Verlaufshistorie: Sparkline-Chart pro Hashtag (letzte 14 Tage)
- [ ] Kein Ergebnis für Branche/Keyword → leere State mit Vorschlägen für breitere Kategorien
- [ ] Export-Möglichkeit: Trending-Hashtags als CSV-Download

## Edge Cases
- Plattform-API nicht verfügbar (Instagram Graph API gesperrt etc.) → Tab deaktiviert mit Hinweis „API momentan nicht verfügbar"
- Hashtag enthält anstößige Inhalte → Content-Filter greift, solche Hashtags werden ausgeblendet
- Branche ist zu spezifisch → keine Trends gefunden → Hinweis + Empfehlung, breitere Kategorie zu wählen
- API-Limit für den Tag erreicht → gecachte Daten anzeigen mit Zeitstempel
- Sehr allgemeine Branchen-Keywords (z. B. „Marketing") → Ergebnisse einschränken auf Top 20 relevanteste

## Technical Requirements
- API: TikTok Research API (für TikTok-Trends), RapidAPI Social Trends Endpoints für Instagram/YouTube
- Alternativ: Apify-Scraper für TikTok Trending als Fallback wenn Research API nicht verfügbar
- Cache: Supabase-Tabelle `social_trend_cache` (customer_id, platform, category, data JSONB, cached_at)
- Branche/Kategorie: Neue Spalte `industry_category` in `customers`-Tabelle (oder separate Tabelle)
- Diagramm: Recharts Sparklines für Verlauf
- Export: CSV-Download via API-Route `/api/social-trends/export`

---

## Tech Design (Solution Architect)
_To be added by /architecture_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
