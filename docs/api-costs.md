# API-Kosten Übersicht

> Letzte Aktualisierung: 2026-04-10

## Kostenlose APIs

| Modul | API | Anmerkung |
|-------|-----|-----------|
| PROJ-26 Google Search Console | Google Search Console API | Kostenlos, OAuth 2.0 |
| PROJ-27 Keyword Rankings | Google Search Console API | Kostenlos, wird gecacht |
| PROJ-50 GA4 Integration | Google Analytics Data API v1 | Kostenlos, OAuth 2.0 |
| PROJ-51 Google Ads Integration | Google Ads API v17+ | Kostenlos (API-Zugriff), Developer Token erforderlich |
| PROJ-52 Meta Ads Integration | Meta Marketing API v19+ | Kostenlos (API-Zugriff), App Review erforderlich |
| PROJ-53 TikTok Ads Integration | TikTok Marketing API v1.3+ | Kostenlos (API-Zugriff) |
| PROJ-10 SEO Analyse (Crawling) | — | Kein externer Dienst, serverseitiges Crawlen |
| PROJ-10 SEO Analyse (Handlungsempfehlungen) | — | Regelbasiert, kein API-Call |
| PROJ-10 SEO Analyse (Lighthouse) | Google PageSpeed Insights API | Optional, kostenlos bis 25.000 Req/Tag (`GOOGLE_PAGESPEED_API_KEY`) |

---

## Kostenpflichtige APIs — OpenRouter

Alle KI-Features laufen über **einen einzigen API-Key**: `OPENROUTER_API_KEY`

### Verwendete Module

| Modul | Feature | Calls pro Aufruf | Standard-Modell |
|-------|---------|-----------------|-----------------|
| PROJ-10 | SEO "Mit KI verbessern" | 1 | `anthropic/claude-haiku-4-5` |
| PROJ-12 | AI Visibility Query Engine | Keywords × Modelle × Iterationen × Subjekte | Konfigurierbar (GPT-4o, Claude, Gemini, Perplexity) |
| PROJ-23 | AI Visibility Analytics (Sentiment) | 1 pro Rohantwort | `anthropic/claude-haiku-4-5` |
| PROJ-23 | AI Visibility GEO-Empfehlungen | 1 pro Analyse | `anthropic/claude-haiku-4-5` |
| PROJ-25 | Keyword-Vorschläge | 1 | `anthropic/claude-haiku-4-5` |
| PROJ-31 | Content Brief Generator | 1 | `anthropic/claude-sonnet-4-5` |
| PROJ-33 | Ad Text Generator | 1 pro Anzeigentyp × 3 Varianten | `anthropic/claude-haiku-4-5` |

### Modellpreise (ca.)

| Modell | Input ($/1M Token) | Output ($/1M Token) | ~Kosten/Call |
|--------|--------------------|---------------------|-------------|
| `anthropic/claude-haiku-4-5` | $0,80 | $4,00 | ~$0,001 |
| `anthropic/claude-sonnet-4-5` | $3,00 | $15,00 | ~$0,008 |
| `openai/gpt-4o` | $2,50 | $10,00 | ~$0,005 |
| `google/gemini-1.5-pro` | $1,25 | $5,00 | ~$0,003 |
| `perplexity/sonar` | $1,00 | $1,00 | ~$0,001 |

*Annahme: ~300 Input-Token + ~500 Output-Token pro durchschnittlichem Call*

---

## Kostenschätzung pro Feature-Aufruf

### PROJ-10: SEO "Mit KI verbessern"
- **1 Call** mit Seiten-Metadaten (Title, Meta, H1, Issues)
- ~$0,001 pro Klick (Haiku)

### PROJ-12: AI Visibility Query Engine

Formel: `Keywords × Modelle × Iterationen × Subjekte`

| Szenario | Berechnung | Calls | Kosten |
|----------|-----------|-------|--------|
| Minimal | 3 Keywords × 1 Modell × 5 Iter. × 1 Subj. | 15 | ~$0,015 |
| Typisch | 5 Keywords × 2 Modelle × 5 Iter. × 2 Subj. | 100 | ~$0,40 |
| Maximum | 10 Keywords × 4 Modelle × 10 Iter. × 4 Subj. | 1.600 | ~$6,00 |

### PROJ-23: AI Visibility Analytics (Post-Processing)
- **Sentiment:** 1 Call pro Rohantwort (= gleiche Anzahl wie PROJ-12 Query-Calls)
- **GEO-Empfehlungen:** 1 strukturierter Call ~$0,05

**Gesamtkosten typische Analyse (PROJ-12 + PROJ-23):** ~$0,55

### PROJ-25: Keyword-Vorschläge
- **1 Call** mit gecrawltem Seiteninhalt (Title, Meta, Headlines, Textauszug bis 4.000 Zeichen)
- ~$0,001 pro Klick (Haiku)
- Kostenloser Fallback: Wenn `OPENROUTER_API_KEY` fehlt, regex-basierte Extraktion ohne API

### PROJ-31: Content Brief Generator
- **1 Call** pro Generierung (Sonnet als Default)
- ~$0,008 pro Brief

### PROJ-33: Ad Text Generator
- **3 Calls** pro Anzeigentyp (3 Varianten), ggf. +1 Nachgenerierung bei Zeichenlimit-Überschreitung
- ~$0,003–$0,004 pro Anzeigentyp

---

## Monatliche Hochrechnung (OpenRouter gesamt)

| Tenants | Nutzung | Kosten/Monat |
|---------|---------|--------------|
| 5 Tenants | je 10 SEO-Verbesserungen + 4 AI-Visibility-Analysen | ~$11 |
| 20 Tenants | je 10 SEO-Verbesserungen + 4 Analysen | ~$45 |
| 50 Tenants | je 10 SEO-Verbesserungen + 4 Analysen | ~$112 |
| Worst Case | 50 Tenants, max. AI-Visibility-Konfiguration | ~$500+ |

---

## Env-Variablen

| Variable | Zweck | Pflicht |
|----------|-------|---------|
| `OPENROUTER_API_KEY` | Alle KI-Features (PROJ-10, 12, 23, 25, 31, 33) | Ja (für KI-Features) |
| `VISIBILITY_WORKER_SECRET` | Interner Worker-Auth für AI Visibility | Ja |
| `GOOGLE_PAGESPEED_API_KEY` | Lighthouse-Scores in SEO-Analyse | Nein (optional) |

> `ANTHROPIC_API_KEY` wird im Projekt nicht mehr benötigt — alle Anthropic-Modelle laufen über OpenRouter.

---

## Empfehlungen

- **Spend-Limit in OpenRouter setzen** (Dashboard → Billing), besonders wenn viele Tenants AI Visibility mit maximaler Konfiguration nutzen können.
- **`ANTHROPIC_SEO_MODEL` Env-Variable** kann genutzt werden, um das Standard-Modell für SEO-Features projektübergreifend zu überschreiben (OpenRouter-Modellname, z.B. `openai/gpt-4o-mini`).
- Caching ist bereits auf allen nicht-KI-Endpunkten implementiert (15 min für GA4, GSC, Ads-APIs).
