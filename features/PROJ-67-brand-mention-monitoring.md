# PROJ-67: Brand Mention Monitoring & Sentiment Analyse

## Status: Deployed
**Created:** 2026-04-13
**Last Updated:** 2026-04-14

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

## Implementation Notes (Frontend)

**Frontend-Implementierung abgeschlossen (2026-04-13):**

- Neue Komponente `src/components/brand-mentions-panel.tsx` kapselt den gesamten Mentions-Tab (KPIs, Donut-Chart, Filter, Liste, Alert-Config).
- `src/components/brand-trends-workspace.tsx` ergänzt um shadcn-Tabs (`Trend-Verlauf` / `Mentions & Sentiment`). Der bestehende Keywords-Manager bleibt über beiden Tabs sichtbar (gemeinsamer Kontext).
- Workspace bekommt jetzt einen `isAdmin`-Prop; die Seite `/(tenant)/tools/brand-trends/page.tsx` reicht den Admin-Flag aus `requireTenantShellContext()` durch (nötig für das Alert-Config-Panel).
- Der Mentions-Tab nutzt das primäre Brand-Keyword (gleiche Logik wie Trend-Verlauf). Fehlt das primäre Keyword, zeigt das Panel einen sprechenden Empty-State.
- KPI-Karten:
  - `SentimentScoreCard` (0–100, farb-codiert: ≥70 positiv, ≥40 neutral, sonst kritisch).
  - `SentimentDonutCard` (Recharts PieChart, innerRadius/outerRadius 30/48, Prozent-Legende rechts).
  - `MetaInfoCard` (Anzahl Mentions, Gefiltert-Hinweis bei >200, Cache-Zeitstempel, Refresh-Button).
- Filter-Leiste: shadcn-Tabs für Zeitraum (7/30/90) und Quelle (All/News/Blogs/Foren/Social). Quellen-Filter ist client-seitig (Daten kommen komplett aus dem 24h-Cache).
- Mentions-Liste: 20 Einträge pro Seite, einfache Prev/Next-Pagination. Titel als externer Link mit `target=_blank rel=noopener noreferrer`. Sentiment-Badge pro Eintrag.
- Empty-State mit Cache-Zeitstempel, Error-State mit Retry-Button, Loading-Skeletons an allen relevanten Stellen.
- Alert-Config-Panel (nur Admin): Toggle + Input `type="number"` (0–100), PATCH an `/api/tenant/brand-keywords/{id}` mit `{ sentiment_alert_threshold }`.
- Alle Komponenten responsiv (375 / 768 / 1440), semantische Labels (`aria-label`, `aria-invalid`, `<nav>` für Pagination), dark-mode-kompatibel.

**Noch offen (Backend-Phase / `/backend`):**
- ~~Route `GET /api/tenant/brand-mentions`~~ — implementiert.
- ~~Route `PATCH /api/tenant/brand-keywords/[id]`~~ — implementiert.
- ~~Migration `052_brand_mentions.sql`~~ — vorhanden.

## Implementation Notes (Backend)

**Status:** Backend implementiert (bereit für `/qa`).

**Neue Dateien:**
- `supabase/migrations/052_brand_mentions.sql` — Spalte `brand_keywords.sentiment_alert_threshold` (0–100, nullable, CHECK-Constraint); neue Tabelle `brand_mention_cache` (unique auf `customer_id+keyword+period`, JSONB `mentions`, aggregierte Counts + Score). RLS: nur `SELECT` für aktive Tenant-Members; Schreibzugriff ausschließlich Service-Role. `notifications_type_check` erweitert um `sentiment_alert` (+ Bestandstypen `approval_approved`, `approval_changes_requested`, `budget_alert`).
- `src/lib/brand-mentions.ts` — Exa.ai-Integration (`POST /search`, Query `"<keyword>"`, `startPublishedDate` aus Period-Range, `numResults=200`). Quellen-Klassifikation (News / Blog / Forum / Social) aus Hostname-Heuristik. Sentiment-Batch (Batch 20) via OpenRouter (`anthropic/claude-3.5-haiku`, `temperature=0`, 15s-Timeout); JSON-Array-Parsing mit Fallback `neutral`. Cache-First (24h TTL) + Stale-Cache-Fallback bei API-Fehlern. Helfer `maybeTriggerSentimentAlert` schreibt Notifications für Tenant-Admins (deduped 24h, best-effort).
- `src/app/api/tenant/brand-mentions/route.ts` — `GET` mit Zod-Validierung (UUID, Keyword 2–60, Period-Enum), Cross-Tenant-Prüfung auf `customers` + `brand_keywords`, Cache-First via `getBrandMentions`, Alert-Trigger, Response inkl. `keywordId` + `alertThreshold`. Rate-Limit: `30 req/min/tenant+IP` (eigenes `BRAND_MENTIONS_READ`, wegen teurer Outbound-Calls).
- `src/app/api/tenant/brand-keywords/[id]/route.ts` — neuer `PATCH`-Handler (Admin-only via `requireTenantAdmin`) für `sentiment_alert_threshold` (0–100 oder `null`). Tenant-Scoped Lookup + `CUSTOMERS_WRITE`-Rate-Limit.

**Sicherheit:**
- Auth: `requireTenantUser` (GET Mentions) / `requireTenantAdmin` (PATCH Alert-Schwellwert).
- Cross-Tenant-Schutz: Customer wird gegen `customers.tenant_id` validiert; Keyword wird gegen `brand_keywords (tenant_id, customer_id)` geprüft.
- Zod auf allen Inputs; `x-tenant-id`-Header Pflicht.
- RLS-Policies auf `brand_mention_cache` analog zu `brand_trend_cache` (nur Read für Members, Schreibzugriff via Service-Role).
- Rate-Limits: `BRAND_MENTIONS_READ` (30/min) für teure Endpoints, `CUSTOMERS_WRITE` (30/min) für PATCH.
- Secrets: `EXA_API_KEY` + bestehender `OPENROUTER_API_KEY` — nie an den Client. Fehlt OpenRouter-Key → Sentiment-Fallback „neutral".

**Geänderte Dateien:**
- `.env.local.example` — neue Variable `EXA_API_KEY` dokumentiert, Hinweis auf wiederverwendeten `OPENROUTER_API_KEY` für Sentiment.

**Abhängigkeiten zu Frontend:**
- Response-Shape von `GET /brand-mentions` matcht exakt die im Panel erwartete `MentionsResponse`-Struktur (Felder `mentions`, `total`, `truncated`, `sentimentScore`, `distribution`, `cachedAt`, `alertThreshold`, `keywordId`).
- PATCH-Body akzeptiert `{ sentiment_alert_threshold: number | null }` wie vom `AlertConfigPanel` gesendet.

**Manuelle Schritte vor Deploy:**
1. Migration `052_brand_mentions.sql` im Supabase SQL-Editor ausführen.
2. `EXA_API_KEY` in Vercel-Env-Variables setzen (https://exa.ai — Paid-Plan für `numResults=200`).
3. `OPENROUTER_API_KEY` muss bereits gesetzt sein (aus PROJ-12).

**Abweichungen vom Tech-Design:**
- Sentiment-Klassifikator läuft über OpenRouter (`anthropic/claude-3.5-haiku`) statt direkt Claude API — konsistent mit PROJ-12 / PROJ-31 (bestehende AI-Infrastruktur). Preis + Mehrsprachigkeit unverändert.
- Alert-Deduplizierung (24h / Tenant / Keyword) zusätzlich eingebaut, um Notification-Spam bei Cache-Refresh zu vermeiden (nicht im Tech-Design vorgesehen, aber UX-kritisch).
- `notifications_type_check`-Constraint wurde im Zuge dessen um die bereits im Code benutzten Typen `budget_alert`, `approval_*` erweitert (stand bisher nur `approval_*` drin) — verhindert Insert-Fehler.

**Abweichungen vom Tech-Design:**
- Statt eines separaten Kachel-Paares (`SentimentScoreCard` + `SentimentDonutChart`) liefert die KPI-Zeile drei Karten (Score / Donut / Meta-Info), um Cache-Zeitstempel und Refresh-Button prominent anzubieten — das Notification-System (PROJ-35) liefert keine Live-Info darüber.
- Kein shadcn-`Slider` installiert — Schwellwert-Input nutzt `Input type="number"`. Spart Pakete und bleibt konsistent mit bestehenden Config-Formularen.

## QA Test Results

**Tested:** 2026-04-13
**App URL:** http://localhost:3000
**Tester:** QA Engineer (AI)
**Test-Methodik:** Statischer Code-Review + Contract-Analyse (Backend-Route, Lib, Migration, Frontend-Panel). Kein Live-Browser-Test — Dev-Server wurde im Harness nicht gebootet; alle Befunde basieren auf Datei-/Logik-Inspektion.

### Acceptance Criteria Status

#### AC-1: Neuer Tab „Mentions & Sentiment" im Brand-Trends-Bereich
- [x] `BrandTrendsWorkspace` rendert shadcn-Tabs (`Trend-Verlauf` / `Mentions & Sentiment`), Tab-Inhalt via `BrandMentionsPanel` — `src/components/brand-trends-workspace.tsx:309-359`.
- [x] Ergänzt PROJ-66 non-destruktiv; Keywords-Manager bleibt über beiden Tabs sichtbar.

#### AC-2: Mentions-Liste zeigt Titel, Quelle, Datum, Snippet, Sentiment-Label
- [x] `MentionRow` rendert alle fünf Felder inkl. Quellen-Badge + Sentiment-Badge — `brand-mentions-panel.tsx:661-705`.
- [x] Titel mit External-Link (`target=_blank`, `rel=noopener noreferrer`).

#### AC-3: Quellen-Filter: All / News / Blogs / Foren / Social
- [x] `SourceTabs` mit fünf Optionen; Filter läuft client-seitig aus dem Cache — Zeile 172-176.

#### AC-4: Zeitraum-Filter 7 / 30 / 90 Tage
- [x] `PeriodTabs` mit `7d/30d/90d`; Backend-Zod-Enum deckt exakt `MENTION_PERIODS` ab.

#### AC-5: Sentiment-Donut-Chart (Verteilung % positiv/neutral/negativ)
- [x] Recharts `PieChart` mit innerRadius 30 / outerRadius 48, Legende mit Prozent-Werten.

#### AC-6: Gesamt-Sentiment-Score (0–100) prominent
- [x] `SentimentScoreCard` zeigt Score groß, farb-codiert (≥70 positiv, ≥40 neutral, sonst kritisch) + `aria-label`.

#### AC-7: Paginierte Mentions (20/Seite)
- [x] `PAGE_SIZE = 20`, `SimplePagination` mit Prev/Next + Seitenzähler — Zeile 707-742.

#### AC-8: 24h-Cache pro Kunde + Keyword
- [x] `CACHE_TTL_MS = 24h`; Cache-Lookup via `(customer_id, keyword, period)` — `brand-mentions.ts:385-412`.
- [x] Migration hat `UNIQUE (customer_id, keyword, period)` + Upsert `onConflict: 'customer_id,keyword,period'`.

#### AC-9: Alert-Schwellwert (Admin) + Notification bei Unterschreitung
- [x] `AlertConfigPanel` nur für `isAdmin`; PATCH-Route ist `requireTenantAdmin`-gated.
- [x] `maybeTriggerSentimentAlert` prüft `score < threshold`, dedupliziert 24h (über Keyword im `body`), fügt Notifications für alle aktiven Admins ein.

#### AC-10: Keine Mentions → leere State mit Zeitstempel letzter Aktualisierung
- [x] Empty-State mit `Newspaper`-Icon + `cachedAt`-Fallback — Zeile 628-639.

### Edge Cases Status

#### EC-1: API liefert keine Ergebnisse
- [x] Exa-Antwort mit leerem `results`-Array führt zu `distribution={0,0,0}`, `sentimentScore=null`, UI zeigt „Keine Erwähnungen gefunden".

#### EC-2: Sentiment-Analyse liefert keinen eindeutigen Wert
- [x] `parseSentimentArray` fällt auf `neutral` zurück; `normalizeLabel` akzeptiert nur `pos*`/`neg*`, alles andere → `neutral`.

#### EC-3: Mehr als 500 Mentions pro Tag
- [x] Hard-Limit `MAX_MENTIONS = 200`, `truncated`-Flag + Badge „gefiltert" + UI-Hinweis.

#### EC-4: Alert-Delivery schlägt fehl
- [x] `maybeTriggerSentimentAlert` hat äußeren try/catch, Fehler wird nur geloggt, Haupt-Request bleibt erfolgreich.

#### EC-5: Mehrsprachigkeit (EN-Snippets, DE-Marke)
- [x] Haiku-Prompt generisch, keine Sprach-Beschränkung. System-Prompt expliziert "mehrsprachig".

### Security Audit Results
- [x] **Auth (GET):** `requireTenantUser` + `x-tenant-id`-Header erforderlich.
- [x] **Auth (PATCH):** `requireTenantAdmin` — Member können keinen Schwellwert setzen.
- [x] **Cross-Tenant (GET):** Customer + Keyword werden beide mit `eq('tenant_id', tenantId)` validiert; unbekannte Keywords werden mit 404 abgelehnt → verhindert beliebige Exa-Aufrufe.
- [x] **Cross-Tenant (PATCH):** `brand_keywords`-Lookup mit `tenant_id` + Update-Statement zusätzlich mit `eq('tenant_id')` — Defense-in-depth.
- [x] **Zod-Validierung:** UUID für `customer_id`, Keyword 2–60 Zeichen, Period-Enum. PATCH-Body: Integer 0–100 oder `null`.
- [x] **RLS:** `brand_mention_cache` hat nur SELECT-Policy für aktive Tenant-Members; Schreibzugriff ausschließlich Service-Role.
- [x] **Rate-Limit:** `BRAND_MENTIONS_READ` (30/min) auf teurem Outbound-Endpoint; `CUSTOMERS_WRITE` (30/min) auf PATCH.
- [x] **Secrets:** `EXA_API_KEY` + `OPENROUTER_API_KEY` nur server-seitig, nie im Client-Code referenziert.
- [x] **External-Link-Safety:** Mention-URLs mit `rel="noopener noreferrer"` + `target="_blank"`.
- [x] **XSS:** React escaped `title`/`snippet` per Default; keine `dangerouslySetInnerHTML`; Titel auf 240 Zeichen, Snippet auf 500 gekappt in `fetchMentionsFromExa`.
- [x] **SQL-Injection:** Alle Queries parametrisiert (Supabase Builder).
- [x] **Sentiment-Alert-Link:** `link: '/tools/brand-trends'` — statisch, keine user-kontrollierten URLs in Notifications.

### Bugs Found

#### BUG-1: Alert-Dedup-Filter kann falsch-positiv matchen (`ilike` auf Keyword im Body)
- **Severity:** Medium
- **Datei:** `src/lib/brand-mentions.ts:507` — `.ilike('body', \`%${keyword}%\`)`
- **Steps to Reproduce:**
  1. Kunde A hat Keyword `"Apple"` mit Alert-Threshold 80.
  2. Ein Admin erhält Sentiment-Alert für `"Apple"` im Tenant (Body enthält "Apple").
  3. Kunde B im gleichen Tenant hat Keyword `"Pineapple"` mit Alert-Threshold 80.
  4. Sentiment-Score von `"Pineapple"` fällt unter den Schwellwert.
  - **Expected:** Notification für `"Pineapple"` wird ausgelöst.
  - **Actual:** `ilike('%Pineapple%')` matcht den Body `"... "Apple" ..."` nicht — hier ok. ABER: Kunde B hat Keyword `"Apple Store"` → Dedup-Check findet den bestehenden `"Apple"`-Alert und unterdrückt die Notification fälschlich.
- **Root cause:** LIKE auf Keyword im Body ist nicht präzise; zudem ist der Filter nicht `customer_id`-/`keyword`-gescoped, sondern rein über Body-String-Match + `tenant_id`. Sollte über dedizierte Spalten (z.B. `meta jsonb` oder separate Dedup-Tabelle) laufen.
- **Priority:** Fix vor Deploy (low risk, aber UX-kritisch bei Overlapping Keywords).

#### BUG-2: Notification-Spam bei mehreren primären Keywords über Zeit möglich
- **Severity:** Low
- **Steps to Reproduce:**
  1. Keyword `"A"` → Alert ausgelöst (Notification erstellt).
  2. Cache läuft nach 24h ab; User wechselt primäres Keyword zu `"B"`.
  3. Alert für `"B"` wird erstellt — Dedup greift nicht (anderer Keyword-String).
  - Erwartet: ok (unterschiedliche Keywords).
  - Aktuell: ok. Aber: Wenn ein Admin den Threshold nacheinander ändert (z.B. 30 → 50 → 70) und der Score jeweils knapp darunter liegt, wird bei jedem GET erneut geprüft; Dedup schützt 24h. OK.
- **Priority:** Nice to have — akzeptables Verhalten, aber Dokumentation fehlt.

#### BUG-3: PATCH akzeptiert leeren Body (ohne Feld) mit 400, aber gibt unpräzise Fehlermeldung
- **Severity:** Low
- **Datei:** `src/app/api/tenant/brand-keywords/[id]/route.ts:63`
- **Steps to Reproduce:**
  1. `PATCH /api/tenant/brand-keywords/{id}` mit Body `{}`.
  - **Expected:** 400 mit klarer Fehlermeldung.
  - **Actual:** 400 mit `"Kein Feld zum Aktualisieren angegeben."` — ok, aber Zod lässt `{}` durch (`sentiment_alert_threshold` ist `.optional()`). Funktioniert, aber inkonsistent mit anderen Endpoints, die required-Felder erzwingen.
- **Priority:** Nice to have.

#### BUG-4: `classifyBatch` bei nicht-429-Fehlern fällt stumm auf `neutral` zurück
- **Severity:** Medium
- **Datei:** `src/lib/brand-mentions.ts:266-268`
- **Steps to Reproduce:**
  1. OpenRouter liefert 500 / 502 / Netzwerkfehler.
  - **Expected:** User sollte sehen, dass Sentiment nicht verfügbar ist (z.B. `sentimentScore=null` oder stale-Flag).
  - **Actual:** Alle Mentions bekommen `neutral`, Score wird mit 50er-Gewichtung berechnet → User sieht „Score 50 / Neutral" ohne Hinweis auf Klassifikator-Ausfall. Irreführend: Der berechnete Score wird in `brand_mention_cache` persistiert und für 24h ausgeliefert.
- **Priority:** Fix vor Deploy (Dateninkonsistenz über 24h).

#### BUG-5: Cache-Upsert speichert Sentiment-Ergebnis auch wenn Klassifikation fehlgeschlagen ist
- **Severity:** Medium (Folgebug von BUG-4)
- **Steps to Reproduce:**
  1. OpenRouter-Fehler → alle Mentions `neutral`.
  2. Upsert speichert `sentiment_score=50` für 24h.
  3. Selbst nach OpenRouter-Recovery zeigt Cache falschen Score bis TTL-Ablauf.
  - **Expected:** Bei Klassifikator-Fehler Cache nur mit Mentions füllen, aber `sentiment_score=null` oder eigenen Flag setzen / Cache komplett überspringen.
  - **Actual:** Siehe oben.
- **Priority:** Fix vor Deploy.

#### BUG-6: `notifications_type_check`-Drop löscht potentiell produktive Typen
- **Severity:** High (Migrations-Risiko)
- **Datei:** `supabase/migrations/052_brand_mentions.sql:74-84`
- **Steps to Reproduce:**
  1. Production-DB hat aktuell Typ-Enum `('approval_approved', 'approval_changes_requested')` (Migration 030).
  2. In der Codebase werden bereits Notifications mit `type='budget_alert'` eingefügt (`src/app/api/cron/budget-sync/route.ts:195`, `src/app/api/tenant/budgets/sync/route.ts:242`) — das MUSS in der aktuellen Production bereits fehlschlagen, es sei denn eine frühere Migration hat den Constraint erweitert.
  3. Migration 052 droppt Constraint und ersetzt ihn durch `(approval_approved, approval_changes_requested, budget_alert, sentiment_alert)`.
  - **Risiko:** Falls in Production zwischenzeitlich weitere Typen hinzugefügt wurden (z.B. via Hotfix), gehen die im neuen Constraint verloren → INSERT schlägt ab Deploy fehl.
- **Expected:** Migrations-Plan sollte geprüft haben, ob es aktuell nur die zwei Original-Typen gibt; ein `INFORMATION_SCHEMA.CHECK_CONSTRAINTS`-Snapshot wäre sinnvoll.
- **Actual:** Blindes DROP + neu. Die Implementation Notes erwähnen, dass `budget_alert` bisher NICHT im Constraint stand — das bedeutet, die bisherigen Budget-Alert-Inserts schlagen in Production bereits fehl (oder der Constraint wurde bereits anderswo ohne Migration gepatcht).
- **Priority:** Fix / Verify vor Deploy. Vor Migration: `SELECT con.conbin FROM pg_constraint ...` in Prod-DB prüfen, welche Typen aktuell stehen.

#### BUG-7: Frontend-Error-Handling unterschlägt `stale`-Flag aus Response
- **Severity:** Low
- **Datei:** `src/components/brand-mentions-panel.tsx`
- **Steps to Reproduce:**
  1. Exa/OpenRouter-Fehler; Lib liefert `stale=true` + alter Cache.
  2. Frontend erhält 200 OK mit `stale=true` im Payload.
  - **Expected:** UI zeigt Hinweis „Cache-Daten — Live-Fetch fehlgeschlagen" (wie `TrendChartCard` es in PROJ-66 tut — siehe `brand-trends-workspace.tsx:606-611`).
  - **Actual:** `MentionsResponse`-Interface enthält kein `stale`-Feld; UI zeigt nichts. User sieht alten Score ohne Warnung.
- **Priority:** Fix vor Deploy (Konsistenz mit PROJ-66).

#### BUG-8: Keyword wird case-sensitiv gegen DB abgeglichen
- **Severity:** Medium
- **Datei:** `src/app/api/tenant/brand-mentions/route.ts:89`
- **Steps to Reproduce:**
  1. User legt Keyword `"BoostHive"` an (gespeichert in DB so wie getippt).
  2. Frontend sendet `keyword=boosthive` (z.B. via manuellem URL-Edit).
  - **Expected:** Match oder konsistentes Normalisieren (PROJ-66 normalisiert in `brand-keywords/route.ts` vermutlich via `lower()`).
  - **Actual:** `.eq('keyword', normalizedKeyword)` ist case-sensitiv → 404 „Keyword ist für diesen Kunden nicht registriert." Gleichzeitig wird in `fetchMentionsFromExa` der Keyword-Match in Exa case-insensitiv durchgeführt — inkonsistent.
- **Priority:** Fix vor Deploy — besonders wenn PROJ-66-Add-Flow Keywords in Originalschreibweise speichert, aber das primäre Keyword automatisch ausgewählt wird.

#### BUG-9: Exa-API-500 (kein API-Key) wird als 500 an Client weitergereicht
- **Severity:** Medium
- **Datei:** `src/lib/brand-mentions.ts:109` + `route.ts:129-131`
- **Steps to Reproduce:**
  1. `EXA_API_KEY` fehlt.
  2. GET-Request → `MentionsApiError` mit `status=500` und Text `"EXA_API_KEY ist nicht konfiguriert."`.
  - **Expected:** Intern loggen, User-freundliche Fehlermeldung ohne Secret-Namensleakage.
  - **Actual:** Interne Config-Details werden als API-Response geleakt (`error: "EXA_API_KEY ist nicht konfiguriert."`). Ist kein kritisches Secret-Leak, aber OPSEC-Info-Disclosure.
- **Priority:** Fix vor Deploy (minimaler Fix: generische Meldung).

#### BUG-10: Quellen-Filter "Blog" erzeugt false-positives über Pfad-Heuristik
- **Severity:** Low
- **Datei:** `src/lib/brand-mentions.ts:192-197`
- **Steps to Reproduce:**
  1. URL ist `https://news.example.com/blog/2025/update` (Firmen-Blog bei News-Domain).
  - **Expected:** `news` (Host-signal dominant).
  - **Actual:** `u.includes('/blog')` trifft → `blog`. Pfad-Heuristik priorisiert Pfad vor Host.
  - Gleicher Bug für `/forum/`.
- **Priority:** Nice to have.

#### BUG-11: Sentiment-Batch verarbeitet bis zu 200 Snippets sequenziell (bis zu 10 OpenRouter-Calls)
- **Severity:** Medium (Performance / Timeout)
- **Datei:** `src/lib/brand-mentions.ts:311-322`
- **Steps to Reproduce:**
  1. GET mit 200 Mentions (Cache-Miss).
  2. `classifyMentions` ruft OpenRouter 10× seriell à 15s-Timeout → worst-case 150s.
  - **Expected:** Vercel-Serverless-Default-Timeout 10s (Hobby) / 60s (Pro) — Request wird abgebrochen.
  - **Actual:** Bei schlechter Latenz blockt Request, keine Parallelisierung (`Promise.all`).
- **Priority:** Fix vor Deploy — entweder `Promise.all` für Batches oder explizite `export const maxDuration`.

#### BUG-12: `setPage`-Reset fehlt bei Daten-Reload (z.B. via Refresh)
- **Severity:** Low
- **Datei:** `brand-mentions-panel.tsx:168-170`
- **Steps to Reproduce:**
  1. User ist auf Seite 3.
  2. Klick auf "Neu laden" → `loadMentions()`.
  3. Neue Daten enthalten nur 2 Seiten.
  - **Expected:** Page-Reset auf 1.
  - **Actual:** `page=3` bleibt; `currentPage = Math.min(page, pageCount) = 2` — UI-seitig ok (Clamping), aber `page` im State bleibt 3. Beim nächsten Source-Change zurück zu "all" (wenn wieder mehr Seiten) landet User unerwartet auf Seite 3.
- **Priority:** Nice to have.

#### BUG-13: `MentionsRateLimitError` wird in `classifyBatch` rethrow'd → Stale-Cache-Fallback funktioniert, aber verliert `truncated`-Info
- **Severity:** Low
- **Datei:** `brand-mentions.ts:275-277`
- Fallback auf Stale-Cache funktioniert — kein kritisches Issue.

### Regression-Check (Verwandte Features)

#### PROJ-66 (Google Trends Integration) — Deployed/In Progress
- [x] `BrandTrendsWorkspace` unverändert bei aktivem Tab `trends`; Trend-Chart, Related-Panels, Keyword-Manager bleiben identisch.
- [ ] BUG: Wenn `keywords.length === 0`, werden Tabs NICHT gerendert (Empty-State zeigt `EmptyKeywordsState`), aber der ursprüngliche PROJ-66-Flow zeigte direkt die Trend-Chart-Empty-State. Das ist nun verschoben — Regression für UX-Kontinuität minimal; verify gewünscht.

#### PROJ-35 (Realtime Notifications) — Deployed
- [x] Neuer Typ `sentiment_alert` im Constraint. `notification-bell.tsx` rendert aber nur `approval_approved` explizit — neue Typen bekommen Default-Icon. Nicht-blockierend, aber UX-Inkonsistenz.

#### PROJ-29 (Customer Database) — Deployed
- [x] Cross-Tenant-Validierung verwendet `customers.deleted_at IS NULL`-Filter (soft-delete-aware).

### Summary

- **Acceptance Criteria:** 10/10 grundsätzlich erfüllt (Code-Review-Basis).
- **Bugs Found:** 13 (0 Critical / 1 High / 6 Medium / 6 Low).
  - High: BUG-6 (Migrations-Risiko notifications_type_check)
  - Medium: BUG-1, BUG-4, BUG-5, BUG-8, BUG-9, BUG-11
  - Low: BUG-2, BUG-3, BUG-7, BUG-10, BUG-12, BUG-13
- **Security:** Strong. Auth/Cross-Tenant/RLS/Rate-Limit/Zod alle vorhanden. Nur Info-Disclosure bei Missing-API-Key (BUG-9).
- **Production-Ready:** NO — BUG-6 (Migrations-Constraint-Reset) muss in Prod-DB verifiziert werden; BUG-4/5/7/8/11 sollten vor Deploy adressiert werden.
- **Empfehlung:** Bugs BUG-4, BUG-5, BUG-6, BUG-7, BUG-8, BUG-9, BUG-11 vor Deploy fixen. BUG-1 und BUG-10 in Folge-Sprint. Live-Browser-/Responsive-Test (375 / 768 / 1440 px) nach Fix nachholen.

## Deployment
_To be added by /deploy_
