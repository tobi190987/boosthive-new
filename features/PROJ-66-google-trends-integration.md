# PROJ-66: Google Trends Integration (Brand Intelligence – Phase 1)

## Status: Planned
**Created:** 2026-04-13
**Last Updated:** 2026-04-13

## Dependencies
- PROJ-29 (Customer Database) — Kunden sind die Basis für die Trends-Ansicht
- PROJ-28 (Globaler Kunden-Selektor) — Kundenauswahl für den Trend-Kontext

## User Stories
- Als Agentur-Mitarbeiter möchte ich für einen bestimmten Kunden den Google-Trends-Verlauf seines Markennamens sehen, damit ich Trendveränderungen frühzeitig erkennen kann.
- Als Agentur-Mitarbeiter möchte ich den Zeitraum (7 / 30 / 90 Tage) frei wählen, damit ich kurzfristige Ausschläge und mittelfristige Trends vergleichen kann.
- Als Agentur-Mitarbeiter möchte ich verwandte Suchanfragen und Themen sehen, damit ich neue Content-Ideen oder Risiken identifizieren kann.
- Als Agentur-Mitarbeiter möchte ich mehrere Keywords/Markennamen pro Kunde pflegen können, damit ich Haupt- und Neben-Brands getrennt tracken kann.
- Als Agentur-Admin möchte ich festlegen, welche Keywords für welchen Kunden getrackt werden, damit irrelevante Daten nicht angezeigt werden.

## Acceptance Criteria
- [ ] Es gibt eine neue Seite „Brand Trends" im Tenant-Bereich, erreichbar über die Sidebar-Navigation
- [ ] Pro Kunde aus der Customer Database kann ein Set von Brand-Keywords gepflegt werden (min. 1, max. 5)
- [ ] Die Seite zeigt ein Liniendiagramm des Google-Trends-Index (0–100) für das primäre Keyword
- [ ] Zeitraum-Auswahl: 7 Tage / 30 Tage / 90 Tage (Default: 30 Tage)
- [ ] Kein Kunden-Filter aktiv → Hinweis „Bitte Kunden auswählen" statt leere Ansicht
- [ ] Abschnitt „Verwandte Suchanfragen" listet Top-5 Related Queries mit Trending-Badge (Rising / Top)
- [ ] Abschnitt „Verwandte Themen" listet Top-5 Related Topics
- [ ] Daten werden im Backend gecacht (24h TTL) um API-Limits zu schonen
- [ ] Ladezustand mit Skeleton-UI während des Abrufs
- [ ] Fehler (API-Limit, kein Ergebnis) werden mit einem verständlichen Hinweistext angezeigt

## Edge Cases
- Keyword hat kein Google-Trends-Ergebnis (zu unbekannte Marke) → Hinweis „Zu wenig Suchvolumen für diesen Zeitraum"
- Google Trends API gibt 429 (Rate Limit) zurück → Cached-Daten anzeigen mit Zeitstempel, wann zuletzt aktualisiert
- Kunde hat noch keine Keywords hinterlegt → leere State mit CTA „Keywords hinzufügen"
- Netzwerkfehler beim Laden → Error-Boundary mit „Erneut versuchen"-Button
- Keyword enthält Sonderzeichen / ist sehr kurz (< 2 Zeichen) → Validierungsfehler beim Speichern

## Technical Requirements
- API: SerpAPI Google Trends Endpoint oder direkte pytrends-Anbindung via eigene API-Route
- Cache: Supabase-Tabelle `brand_trend_cache` mit `customer_id`, `keyword`, `period`, `data` (JSONB), `cached_at`
- Keyword-Verwaltung: Neue Tabelle `brand_keywords` (customer_id, keyword, is_primary, created_at)
- Diagramm: Recharts (bereits im Projekt via PROJ-40 vorhanden)
- Authentifizierung: Tenant-Auth required, RLS auf customer_id

---

## Tech Design (Solution Architect)

### Übersicht
Das Feature integriert sich als neues Tool „Brand Trends" in die bestehende Tenant-Tool-Struktur. Daten werden über die SerpAPI (Google Trends Endpoint) abgerufen, im Backend 24h gecacht und über eine eigene API-Route an den Client geliefert.

---

### A) Seitenstruktur (visuell)

```
/tools/brand-trends/               ← Neue Next.js-Seite (Server Component)
│
├── Module-Gate (brand_intelligence)
│   └── Falls kein Zugriff → ModuleLockedCard
│
└── BrandTrendsWorkspace            ← Client Component (State + Interaktion)
    │
    ├── Header-Bereich
    │   ├── Titel „Brand Trends"
    │   └── Kunden-Selektor (bestehende CustomerSelectorDropdown-Komponente)
    │
    ├── [Kein Kunde gewählt] → EmptyState „Bitte Kunden auswählen"
    │
    └── [Kunde gewählt]
        │
        ├── KeywordsManager           ← Brand-Keywords verwalten (Inline-Edit)
        │   ├── Keyword-Liste (max. 5) mit Primär-Badge
        │   ├── „Keyword hinzufügen"-Button (Inline-Input)
        │   └── Löschen-Button pro Keyword (mit InlineConfirm)
        │
        ├── Zeitraum-Tabs             ← 7 Tage / 30 Tage / 90 Tage
        │
        ├── TrendChart                ← Recharts LineChart
        │   ├── X-Achse: Datum
        │   ├── Y-Achse: Trend-Index (0–100)
        │   └── Tooltip mit Datum + Wert
        │
        ├── RelatedQueriesPanel       ← Top-5 verwandte Suchanfragen
        │   └── Je Query: Label + Badge (Rising / Top)
        │
        └── RelatedTopicsPanel        ← Top-5 verwandte Themen
            └── Je Topic: Label + Badge (Rising / Top)
```

---

### B) Datenmodell (plain language)

**Tabelle `brand_keywords`**
Speichert die Brand-Keywords, die pro Kunde konfiguriert wurden:
- Eindeutige ID
- Tenant-ID (welche Agentur)
- Kunden-ID (aus der Customer Database)
- Keyword-Text (z. B. „Nike", „BoostHive")
- Ist-Primär-Flag (nur ein Keyword je Kunde ist primär)
- Erstellungsdatum

**Tabelle `brand_trend_cache`**
Speichert die abgerufenen Google-Trends-Daten, um API-Calls zu sparen:
- Eindeutige ID
- Tenant-ID
- Kunden-ID
- Keyword-Text
- Zeitraum (7d / 30d / 90d)
- Rohdaten als JSON (Timeline-Datenpunkte, Related Queries, Related Topics)
- Zeitstempel der letzten Aktualisierung

**Datenabruf-Logik (Cache-First):**
1. Client fragt API-Route an (Kunde + Keyword + Zeitraum)
2. API prüft: Gibt es einen gültigen Cache-Eintrag (< 24h alt)?
   - Ja → Cache-Daten zurückgeben
   - Nein → SerpAPI anfragen → Ergebnis in Cache speichern → zurückgeben

---

### C) API-Routen (neue Endpunkte)

| Route | Methode | Zweck |
|-------|---------|-------|
| `/api/tenant/brand-trends` | GET | Trend-Daten abrufen (mit Cache-Logik), Parameter: `customer_id`, `keyword`, `period` |
| `/api/tenant/brand-keywords` | GET | Keywords eines Kunden auflisten |
| `/api/tenant/brand-keywords` | POST | Neues Keyword anlegen |
| `/api/tenant/brand-keywords/[id]` | DELETE | Keyword löschen |
| `/api/tenant/brand-keywords/[id]/primary` | PATCH | Keyword als primär setzen |

---

### D) Navigation & Modul-Anbindung

- Neuer Eintrag in `src/lib/tool-groups.ts` unter der Gruppe **„Analyse & SEO"**
- Icon: `TrendingUp` (Lucide)
- Farbe: `teal` (neue ColorKey wird ergänzt)
- `moduleCode: 'brand_intelligence'`
- Neuer Modul-Code `brand_intelligence` muss in der Modul-Verwaltung (PROJ-15) eingetragen werden

---

### E) Tech-Entscheidungen

| Entscheidung | Wahl | Begründung |
|---|---|---|
| Google Trends API | SerpAPI | Offizielle REST-API, einfache Integration, zuverlässig |
| Caching-Strategie | Supabase-Tabelle (24h TTL) | Kein Redis nötig, bereits vorhandene Infra, kostenlos |
| Diagramm-Bibliothek | Recharts | Bereits im Projekt (PROJ-40), kein neues Package |
| Keyword-Verwaltung | Inline-Edit (kein Modal) | Schnellere UX, weniger Klicks |
| Modul-Gate | `brand_intelligence` (neu) | Separate Buchbarkeit, passt zur bestehenden Modul-Architektur |

---

### F) Neue Abhängigkeiten (npm)

Keine neuen npm-Pakete erforderlich. SerpAPI wird direkt über `fetch` angesprochen (REST).

---

### G) Umgebungsvariablen (neu)

- `SERPAPI_KEY` — SerpAPI-Schlüssel für den Google-Trends-Endpoint

---

### H) RLS-Sicherheit (Row Level Security)

Beide neuen Tabellen (`brand_keywords`, `brand_trend_cache`) erhalten RLS-Policies nach dem bestehenden Muster: Zugriff nur auf Zeilen, bei denen `tenant_id` mit dem authentifizierten Tenant übereinstimmt. Customers werden zusätzlich per `customer_id`-Join gegen die bestehende `customers`-Tabelle geprüft.

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
