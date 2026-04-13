# PROJ-67: Brand Mention Monitoring & Sentiment Analyse

## Status: In Progress
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

### Übersicht

PROJ-67 erweitert die bestehende Brand-Trends-Seite (PROJ-66) um einen zweiten Tab „Mentions & Sentiment". Die Kern-Infrastruktur (brand_keywords-Tabelle, Kunden-Selektor, Module-Gate) ist bereits vorhanden. Mentions werden über **Exa.ai Search API** abgerufen, Sentiment-Klassifikation erfolgt via **Claude API (batch)**. Ergebnisse werden 24h in einer neuen Supabase-Tabelle gecacht. Alerts laufen über das bestehende Notification-System (PROJ-35).

---

### A) Seitenstruktur (visuell)

```
/tools/brand-trends/               ← bestehende Next.js-Seite (PROJ-66)
│
├── Module-Gate (brand_intelligence) [bestehend]
│
└── BrandTrendsWorkspace            ← bestehender Client-Container
    │
    ├── Header [bestehend]
    │   ├── Titel „Brand Intelligence"
    │   └── Kunden-Selektor [bestehend]
    │
    ├── Tab-Navigation              ← NEU: Tabs ergänzen bestehende Seite
    │   ├── Tab „Trend-Verlauf"     ← bestehender Inhalt (PROJ-66) wird Tab
    │   └── Tab „Mentions & Sentiment" ← NEU
    │
    └── [Tab: Mentions & Sentiment]
        │
        ├── KPI-Bereich (oben)
        │   ├── SentimentScoreCard   ← Score 0–100 als große Kachel
        │   └── SentimentDonutChart  ← Verteilung Positiv / Neutral / Negativ
        │
        ├── Filter-Leiste
        │   ├── QuellenFilter        ← Tabs/Chips: All / News / Blogs / Foren / Social
        │   └── ZeitraumFilter       ← Letzte 7 / 30 / 90 Tage
        │
        ├── MentionsTable            ← Paginierte Liste (20 pro Seite)
        │   └── MentionRow: Titel, Quelle-Badge, Datum, Snippet, Sentiment-Label
        │
        ├── AlertConfigPanel         ← Admin-only: Schwellwert-Konfiguration
        │   └── Slider / Input: Min-Sentiment-Score (0–100) + Speichern-Button
        │
        └── EmptyState               ← Falls keine Mentions gefunden
            └── Zeitstempel letzter Aktualisierung
```

---

### B) Datenmodell (neue Elemente)

**Neue Tabelle: `brand_mention_cache`**
Speichert gecachte Mentions pro Kunde + Keyword + Zeitraum:
- Kunden-ID, Keyword, Zeitraum (7 / 30 / 90)
- Mentions (JSONB-Array mit Titel, URL, Quelle-Typ, Datum, Snippet, Sentiment-Label)
- Gesamt-Sentiment-Score (0–100, berechnet aus Einzel-Labels)
- Erstell-Zeitstempel (für 24h-TTL-Prüfung)
- Gespeichert: Supabase (RLS auf tenant_id)

**Erweiterung: `brand_keywords`-Tabelle** (neue Spalte)
- `sentiment_alert_threshold` (Integer 0–100, nullable) — konfiguriert per Admin

**Bestehende Tabellen wiederverwendet:**
- `brand_keywords` — bereits aus PROJ-66 vorhanden
- `notifications` — bereits aus PROJ-35 vorhanden

---

### C) API-Routen

| Route | Methode | Zweck |
|-------|---------|-------|
| `/api/tenant/brand-mentions` | GET | Mentions + Sentiment laden (mit Cache-Check) |
| `/api/tenant/brand-keywords/[id]` | PATCH | `sentiment_alert_threshold` speichern (bestehend, erweitern) |

**Ablauf beim GET `/api/tenant/brand-mentions`:**

```
1. Cache prüfen: brand_mention_cache (customer_id + keyword + period)
   → Cache-Hit (< 24h alt): Daten direkt zurückgeben
   → Cache-Miss: weiter →

2. Exa.ai API aufrufen
   → Suche nach Markennamen + Zeitraum-Filter
   → Ergebnisse: max. 200 Mentions

3. Claude API (Batch-Sentiment)
   → Snippets in Batches à 20 an Claude senden
   → Antwort: "positive" / "neutral" / "negative" pro Snippet
   → Gesamt-Score berechnen: (positive * 100 + neutral * 50 + negative * 0) / total

4. Ergebnis in brand_mention_cache speichern

5. Alert-Check
   → sentiment_alert_threshold aus brand_keywords lesen
   → Falls Score < Schwellwert: Notification über /api/tenant/notifications erstellen

6. Daten an Frontend zurückgeben
```

---

### D) Tech-Entscheidungen

| Entscheidung | Gewählt | Warum |
|---|---|---|
| Mention-Quelle | Exa.ai Search API | Strukturierte Ergebnisse mit Snippets und Quellen-Klassifikation; Brave Search als Fallback |
| Sentiment-Analyse | Claude API (Haiku-Modell) | Mehrsprachig (DE/EN), kostengünstig im Batch, bereits in der Plattform integriert |
| Cache-Strategie | Supabase-Tabelle (24h TTL) | Konsistent mit PROJ-66-Muster; kein Redis nötig |
| Alert-Delivery | PROJ-35 Notifications | Bestehende Infrastruktur, kein neues System erforderlich |
| Diagramm | Recharts DonutChart | Bereits via PROJ-40 installiert |
| Filter-UI | Client-seitig (aus Cache) | Mentions sind gecacht; Filterung ohne erneuten API-Call möglich |

---

### E) Abhängigkeiten & neue Pakete

Keine neuen npm-Pakete nötig — alle Abhängigkeiten (Recharts, Supabase, Claude SDK) sind bereits vorhanden. Exa.ai API wird via `fetch` direkt angesprochen.

---

### F) Modul-Gate

Dieses Feature liegt hinter dem bestehenden `brand_intelligence`-Modul-Gate (PROJ-15). Kein neues Gate erforderlich.

---

### G) Migrations-Übersicht

Eine neue Migration wird benötigt:
1. Tabelle `brand_mention_cache` anlegen (inkl. RLS)
2. Spalte `sentiment_alert_threshold` zu `brand_keywords` hinzufügen

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
