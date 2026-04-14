# PROJ-68: Social Media Trend Radar

## Status: In Progress
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

### Ausgangslage & Einbettung

PROJ-68 erweitert den bestehenden Brand-Trends-Bereich um einen dritten Tab. Das `brand-trends-workspace.tsx` hat aktuell zwei Tabs (`Trend-Verlauf` und `Mentions & Sentiment`). Neu kommt ein dritter Tab **„Social Trends"** dazu — als eigenständiges Panel, das denselben Kunden-Kontext und denselben Keyword-Manager oben nutzt.

### Komponenten-Struktur

```
BrandTrendsWorkspace (bestehend — brand-trends-workspace.tsx)
+-- KeywordsManager (bestehend)
+-- Tabs (bestehend)
|   +-- "Trend-Verlauf" Tab (bestehend, PROJ-66)
|   +-- "Mentions & Sentiment" Tab (bestehend, PROJ-67)
|   +-- "Social Trends" Tab (NEU)
|       +-- SocialTrendsPanel (NEU — social-trends-panel.tsx)
|           +-- IndustryCategoryEditor
|           |   +-- Freitext-Input für eigene Kategorie
|           |   +-- Dropdown mit gängigen Kategorien
|           |   +-- Speichern-Button
|           +-- PlatformTabs (TikTok / Instagram / YouTube)
|           |   +-- Tab deaktiviert wenn API nicht verfügbar
|           +-- PeriodFilter (Heute / Diese Woche / Dieser Monat)
|           +-- HashtagTrendList
|           |   +-- pro Hashtag: Name, Volumen-Badge, Richtungs-Indikator
|           |   +-- SparklineChart (Recharts, letzte 14 Tage)
|           |   +-- CSV-Export-Button
|           +-- TrendingContentExamples
|           |   +-- Top 3–5 Posts/Videos pro Hashtag
|           |   +-- Thumbnail-Preview + Link
|           +-- EmptyState (mit Kategorie-Vorschlägen)
|           +-- ApiUnavailableState (Tab deaktiviert mit Hinweistext)
```

### Datenmodell

**Neue Spalte in `customers`-Tabelle:**
- `industry_category TEXT` (nullable, z. B. „Fitness", „Beauty", „Food")
- Einfachste Lösung, kein separates Tabellen-Overhead

**Neue Tabelle `social_trend_cache`:**
- id UUID (PK)
- tenant_id → Tenant-Isolierung (RLS)
- customer_id → Kunden-Bezug
- platform: 'tiktok' | 'instagram' | 'youtube'
- category: Suchbegriff / Branche
- period: 'today' | 'week' | 'month'
- data JSONB (Hashtag-Liste, Sparkline-Punkte, Content-Beispiele)
- cached_at TIMESTAMPTZ (24h TTL)
- Unique-Constraint auf (customer_id, platform, category, period)
- Gleiche Pattern wie `brand_trend_cache` aus PROJ-66

### API-Routen (neu)

| Route | Methode | Zweck |
|-------|---------|-------|
| `/api/tenant/social-trends` | GET | Trending-Daten laden (Cache oder frisch) |
| `/api/tenant/social-trends/export` | GET | CSV-Download der Hashtags |
| `/api/tenant/customers/[id]/industry-category` | PATCH | Branche für Kunden speichern |

### Externe Dienste

| Dienst | Zweck | Verfügbarkeit |
|--------|-------|---------------|
| TikTok Research API | TikTok-Trends primär | Benötigt approved Developer Access |
| RapidAPI Social Trends | Instagram + YouTube | Sofort verfügbar (API-Key) |
| Apify TikTok Scraper | Fallback wenn TikTok API gesperrt | Pay-per-use |

Server-seitiger Handler prüft Verfügbarkeit und fällt auf nächsten Fallback zurück. Bei vollständigem Ausfall zeigt das UI den Tab als deaktiviert an.

### Tech-Entscheidungen

| Entscheidung | Begründung |
|--------------|------------|
| Recharts Sparklines | Bereits im Projekt installiert (PROJ-66) — keine neue Abhängigkeit |
| Supabase-Cache (24h TTL) | Gleiche Architektur wie `brand_trend_cache` — API-Limits schonen |
| Dritter Tab in bestehendem Workspace | Kein neues Routing nötig, passt zur Brand-Intelligence-Navigation |
| JSONB für Cache-Daten | Flexible Datenstruktur je nach Plattform |
| `industry_category` direkt in `customers` | Einfacher als separate Tabelle — ein Feld, weniger Joins |

### Neue Pakete

Keine neuen Pakete erforderlich — Recharts und shadcn/ui sind bereits vorhanden.

### Migrationsplan

1. Migration `053_social_trends.sql`: Tabelle `social_trend_cache` + Spalte `industry_category` in `customers` + RLS-Policies
2. Neues Panel `social-trends-panel.tsx`
3. Dritter Tab in `brand-trends-workspace.tsx` eintragen
4. 3 neue API-Routen

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
