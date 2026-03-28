# PROJ-12: AI Visibility Query Engine

## Status: Deployed
**Created:** 2026-03-28
**Last Updated:** 2026-03-28

## Implementation Notes (Frontend — 2026-03-28)
- `src/components/ai-visibility-workspace.tsx` — vollständige Client-Komponente (1554 Zeilen) mit ProjectListView, CreateProjectDialog (4 Steps), ProjectDetailView, AnalysisProgressView (3s-Polling)
- `src/app/tools/ai-visibility/page.tsx` — integriert AiVisibilityWorkspace, behält Zugangssperre für ungebuchte Module

## Implementation Notes (Backend — 2026-03-28)
- DB-Migration: `supabase/migrations/017_ai_visibility.sql`
  - 3 Tabellen: `visibility_projects`, `visibility_analyses`, `visibility_raw_results`
  - RLS auf allen Tabellen (tenant-isoliert via `tenant_members` JOIN)
  - INSERT/UPDATE/DELETE nur via service_role (Admin Client)
  - Indexes auf tenant_id, project_id, analysis_id, status
  - CASCADE DELETE: Projekt -> Analysen -> Raw Results
- API-Routen (vollstaendig implementiert mit Zod-Validierung):
  - `GET/POST /api/tenant/visibility/projects` — Liste mit enriched latest_analysis_status + analysis_count
  - `GET/PUT/DELETE /api/tenant/visibility/projects/[id]` — CRUD mit Tenant-Isolation
  - `GET/POST /api/tenant/visibility/analyses` — Analyse starten mit Concurrent-Limit (max 2), fire-and-forget Worker-Trigger
  - `GET/DELETE /api/tenant/visibility/analyses/[id]` — Abruf inkl. raw_results bei status=done, Cancel fuer laufende Analysen
  - `GET /api/tenant/visibility/analyses/[id]/status` — Polling-Endpoint mit per-model progress
  - `POST /api/tenant/visibility/estimate` — Kostenschaetzung ohne DB-Write
  - `POST /api/tenant/visibility/worker` — Background Worker mit OpenRouter API, exponentielles Backoff bei Rate Limits, Brand-Mention-Analyse, Competitor-Tracking
- Entscheidung: Next.js API Route als Worker statt Supabase Edge Function (Vercel-kompatibel, `maxDuration = 300`)
- Env-Variablen dokumentiert in `.env.local.example`: `OPENROUTER_API_KEY`, `VISIBILITY_WORKER_SECRET`

## Summary
Kernkomponente des AI Visibility Tools. Verwaltet Analyse-Projekte (Brand + Keywords + Wettbewerber), sendet simulierte Nutzeranfragen an verschiedene KI-Modelle über OpenRouter, führt iterative Mehrfachabfragen durch und speichert die Rohantworten tenant-isoliert zur späteren Auswertung.

## Dependencies
- Requires: PROJ-9 (Tenant Dashboard Shell) — Modul im Dashboard
- Requires: PROJ-6 (Role-Based Access Control) — Member/Admin-Zugriff
- Requires: PROJ-15 (Modul-Buchung) — Modul muss gebucht sein

## User Stories
- Als Member möchte ich ein neues Analyse-Projekt anlegen (Brand-Name + Website-URL + bis zu 3 Wettbewerber + Keywords), damit ich die KI-Sichtbarkeit meines Kunden messen kann.
- Als Member möchte ich eine Analyse starten und ihren Fortschritt in Echtzeit sehen, damit ich weiß, wann die Ergebnisse verfügbar sind.
- Als Member möchte ich auswählen, welche KI-Modelle abgefragt werden sollen, damit ich gezielt die für meinen Kunden relevanten Kanäle analysiere.
- Als Admin möchte ich alle Analyse-Projekte meines Tenants einsehen und verwalten.
- Als Member möchte ich eine laufende Analyse abbrechen können.

## Acceptance Criteria
- [ ] Analyse-Projekt anlegen: Brand-Name (Pflicht), Website-URL (optional), bis zu 3 Wettbewerber (Name + URL), 1–10 Keywords/Prompts
- [ ] KI-Modell-Auswahl: mindestens GPT-4o, Claude 3.5 Sonnet, Gemini 1.5 Pro, Perplexity via OpenRouter
- [ ] Iterative Queries: 5–10 identische Abfragen pro Keyword pro Modell (konfigurierbar, Default: 5)
- [ ] Persona-Simulation: Jede Query wird als natürliche Nutzeranfrage formuliert (z.B. "Welche [Kategorie] in [Region] empfiehlst du?")
- [ ] Asynchrone Verarbeitung: Analyse läuft im Hintergrund, Status-Updates in der UI (Pending → Running → Done / Failed)
- [ ] Rohantworten werden vollständig gespeichert: Modell, Prompt, Response-Text, Timestamp, `tenant_id`
- [ ] Fehler-Handling: Einzelne fehlgeschlagene API-Calls werden protokolliert, Analyse läuft trotzdem weiter
- [ ] Analyse-Kosten-Schätzung: Vor dem Start wird die geschätzte Anzahl API-Calls angezeigt
- [ ] Maximale Analyse-Laufzeit: Timeout nach 10 Minuten pro Job
- [ ] Alle Daten sind strikt tenant-isoliert (RLS)

## Edge Cases
- OpenRouter API nicht erreichbar → Fehlermeldung mit Retry-Option, kein Silent Fail
- Brand-Name zu generisch (z.B. "Apple") → Warnung "Name möglicherweise mehrdeutig — füge URL oder Branche hinzu"
- Analyse mit 0 Keywords → Validierungsfehler vor dem Start
- Parallele Analysen: Max. 2 gleichzeitige Analysen pro Tenant (Queue wenn mehr)
- Rate-Limit bei OpenRouter → exponentielles Backoff, Status-Meldung in der UI
- Tenant startet Analyse ohne gebuchtes AI-Visibility-Modul → 403, Redirect zur Modul-Buchung
- Analyse-Job hängt / Timeout → Status auf "Failed" setzen, Error-Details speichern

## Technical Requirements
- OpenRouter als einziger API-Provider (Zugang zu allen Modellen über eine Credentials-Konfiguration)
- Asynchrone Job-Queue (Details in /architecture — z.B. Supabase Edge Functions oder Background Worker)
- DB-Tabellen: `visibility_projects`, `visibility_analyses`, `visibility_raw_results`
- `tenant_id` auf allen Tabellen, RLS-Policies zwingend
- API-Keys für OpenRouter werden als Umgebungsvariablen gespeichert (nicht pro Tenant konfigurierbar in v1)

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

### Komponenten-Struktur

```
/tools/ai-visibility (bereits vorhanden)
+-- ProjectListView
|   +-- ProjectCard (Projektname, letzte Analyse, Status-Badge)
|   +-- CreateProjectButton → CreateProjectDialog
|
+-- CreateProjectDialog
|   +-- BrandForm (Name, URL)
|   +-- CompetitorForm (bis zu 3 × Name + URL)
|   +-- KeywordForm (1–10 Keywords/Prompts)
|   +-- ModelSelector (GPT-4o, Claude 3.5, Gemini 1.5, Perplexity)
|   +-- AnalysisSettings (Anzahl Iterationen: 5–10, Default 5)
|   +-- CostEstimatePreview (berechnet API-Calls vor dem Start)
|   +-- SubmitButton "Analyse starten"
|
+-- ProjectDetailView
|   +-- ProjectHeader (Brand, Wettbewerber, Keywords)
|   +-- AnalysisHistoryList
|       +-- AnalysisRow (Status, Datum, Modelle)
|           → Klick öffnet AnalysisProgressView oder Ergebnisse
|
+-- AnalysisProgressView
    +-- ProgressBar (Gesamtfortschritt %)
    +-- ModelProgressList (je Modell: X/Y Queries abgeschlossen)
    +-- StatusBadge (Pending / Running / Done / Failed)
    +-- CancelButton (nur während Running)
    +-- ErrorLog (fehlgeschlagene Calls, nicht blockierend)
```

### Datenmodell

**`visibility_projects`** — Ein Analyse-Projekt pro Kunde
- Projekt-ID, Tenant-ID (RLS)
- Brand-Name, Website-URL (optional)
- Wettbewerber: Array mit bis zu 3 Einträgen (Name + URL)
- Keywords: Array mit 1–10 Einträgen
- Erstellt von (User-ID), Erstellungsdatum

**`visibility_analyses`** — Eine Analyse-Ausführung (pro Projektlauf)
- Analyse-ID, Projekt-ID, Tenant-ID (RLS)
- Ausgewählte KI-Modelle (Array)
- Iterations-Anzahl (5–10)
- Status: `pending` → `running` → `done` / `failed` / `cancelled`
- Fortschritt: erledigte Queries / Gesamt-Queries
- Gestartet um, Abgeschlossen um
- Fehler-Log (JSON-Array, nicht-blockierend)
- Erstellt von (User-ID)

**`visibility_raw_results`** — Eine einzelne KI-Antwort
- Ergebnis-ID, Analyse-ID, Tenant-ID (RLS)
- Modell-Name (z.B. "gpt-4o")
- Abfrage-Typ: "brand" oder "competitor_X"
- Prompt (die gesendete Nutzeranfrage)
- Antwort-Text (vollständig gespeichert)
- Timestamp
- Fehler-Flag + Fehlertext (wenn Call fehlschlug)

### Backend-Architektur: Asynchrone Verarbeitung

**Supabase Edge Function als Background Worker**

```
Browser
  ↓ POST /api/tenant/visibility/analyses (startet Job)
Next.js API Route
  ↓ Schreibt Analyse-Record mit Status "pending" in DB
  ↓ Ruft Supabase Edge Function async auf (fire-and-forget)
  ↑ Gibt Analyse-ID zurück (sofortige Antwort an Browser)

Supabase Edge Function (läuft im Hintergrund, bis zu 10 Min)
  ↓ Liest Projekt-Daten aus DB
  ↓ Verarbeitet Queries in Batches (Keyword für Keyword)
  ↓ Schreibt jeden raw_result direkt in DB
  ↓ Aktualisiert Fortschritt in visibility_analyses laufend
  ↓ Setzt Status auf "done" oder "failed" am Ende

Browser (Polling alle 3s)
  ↓ GET /api/tenant/visibility/analyses/[id]/status
  ↑ Gibt aktuellen Status + Fortschritt zurück
```

Tenant-Limit (max. 2 gleichzeitige Analysen): DB-Zählung laufender Jobs vor dem Start, Status `queued` wenn Limit erreicht.

### API-Routen (neu)

```
/api/tenant/visibility/projects         GET, POST
/api/tenant/visibility/projects/[id]    GET, DELETE
/api/tenant/visibility/analyses         GET, POST
/api/tenant/visibility/analyses/[id]    GET, DELETE (Abbrechen)
/api/tenant/visibility/analyses/[id]/status  GET (Polling)
/api/tenant/visibility/estimate         POST (Kosten-Schätzung, kein DB-Write)
```

### Tech-Entscheidungen

| Entscheidung | Warum |
|---|---|
| OpenRouter als einziger Provider | Ein API-Key für alle Modelle, einfaches Austauschen |
| Supabase Edge Function als Worker | Läuft lang genug (>10 Min konfigurierbar), direkte DB-Verbindung, kein extra Queue-Service |
| DB-Polling statt WebSockets | Einfacher, ausreichend für 3s-Refresh, kein Verbindungsverlust-Problem |
| Fehler non-blocking | Einzelne fehlgeschlagene Calls stoppen nicht die Analyse |
| RLS auf allen 3 Tabellen | Tenant-Isolation auf DB-Ebene |

### Abhängigkeiten (neue Packages)

- **`openai`** — OpenRouter ist OpenAI-kompatibel (kein eigenes SDK nötig)

## QA Test Results

**Tested:** 2026-03-28
**App URL:** http://localhost:3000
**Tester:** QA Engineer (AI)

### Acceptance Criteria Status

#### AC-1: Analyse-Projekt anlegen (Brand-Name, Website-URL, Wettbewerber, Keywords)
- [x] Brand-Name ist Pflichtfeld (min 1 Zeichen, max 200 im Backend, max 100 im Frontend-Input)
- [x] Website-URL ist optional mit URL-Validierung
- [x] Bis zu 3 Wettbewerber (Name + URL) -- Frontend und Backend limits stimmen ueberein
- [x] 1-10 Keywords -- Frontend und Backend limits stimmen ueberein
- [ ] BUG-1: CRITICAL -- API gibt flaches Objekt/Array zurueck, Frontend erwartet verschachteltes `{ project: ... }` bzw. `{ projects: [...] }`. Projekte werden nie geladen.

#### AC-2: KI-Modell-Auswahl (GPT-4o, Claude 3.5, Gemini 1.5 Pro, Perplexity)
- [x] Alle 4 Modelle sind in AI_MODELS konfiguriert
- [x] Checkbox-Auswahl mit mindestens 1 Modell Pflicht
- [x] Alle vorausgewaehlt als Default

#### AC-3: Iterative Queries (5-10 pro Keyword pro Modell, Default 5)
- [x] UI erlaubt 5-10 Iterationen mit Default 5
- [ ] BUG-2: MEDIUM -- Zod-Schema in analyses/route.ts erlaubt Iterationen von 1-10 statt 5-10 wie in der Spec. Ein direkter API-Call kann somit Werte 1-4 setzen, die die UI nicht anbietet.

#### AC-4: Persona-Simulation (natuerliche Nutzeranfrage)
- [x] buildPrompt() erzeugt deutsche natuerliche Anfrage mit Keyword und Subject
- [ ] BUG-3: MEDIUM -- Prompt enthaelt "Beruecksichtige dabei besonders Anbieter wie [Brand]" -- das beeinflusst das KI-Modell aktiv, den Brand haeufiger zu nennen, was die Objektivitaet der Sichtbarkeitsmessung verfaelscht.

#### AC-5: Asynchrone Verarbeitung (Pending -> Running -> Done/Failed)
- [x] Worker setzt Status korrekt: pending -> running -> done/failed
- [x] Cancelled-Status wird korrekt behandelt
- [x] Polling alle 3 Sekunden in der UI
- [x] Polling stoppt bei done/failed/cancelled

#### AC-6: Rohantworten vollstaendig gespeichert
- [x] visibility_raw_results speichert: model_name, prompt, response, timestamp, tenant_id
- [x] Brand-Mention-Analyse und Competitor-Tracking werden gespeichert
- [x] Tokens und Kosten werden erfasst

#### AC-7: Fehler-Handling (einzelne Calls protokolliert, Analyse laeuft weiter)
- [x] Catch-Block pro Query speichert error_flag und error_text in raw_results
- [x] Error-Log wird laufend in visibility_analyses aktualisiert
- [x] Analyse wird nicht abgebrochen bei einzelnen Fehlern

#### AC-8: Analyse-Kosten-Schaetzung vor Start
- [x] CostEstimate-Berechnung: keywords x models x iterations x subjects
- [x] Review-Step zeigt geschaetzte API-Calls an
- [x] Estimate-Endpoint (POST /estimate) liefert Aufschluesselung

#### AC-9: Maximale Analyse-Laufzeit (Timeout nach 10 Minuten)
- [x] WORKER_TIMEOUT_MS = 10 * 60 * 1000 implementiert
- [x] Bei Timeout wird Status auf "failed" gesetzt mit Error-Message
- [ ] BUG-4: LOW -- maxDuration = 300 (5 Min) auf Vercel, aber interner Timeout ist 10 Min. Auf Vercel wird die Funktion nach 5 Min gekillt, bevor der 10-Min-Timeout greift. Analyse bleibt dann im Status "running" haengen.

#### AC-10: Alle Daten strikt tenant-isoliert (RLS)
- [x] RLS auf allen 3 Tabellen aktiv (SELECT via tenant_members JOIN)
- [x] INSERT/UPDATE/DELETE nur via service_role (Deny-Policies)
- [x] Alle API-Routen filtern nach tenant_id via Header
- [x] Worker-Route hat keinen User-Auth, verwendet aber service_role und prueft tenant_id konsistent

### Edge Cases Status

#### EC-1: OpenRouter API nicht erreichbar
- [x] Fehler werden pro Query protokolliert
- [x] Exponentielles Backoff bei 429 Rate Limits (3 Retries, 2s Base)
- [ ] BUG-5: LOW -- Kein expliziter Retry-Button in der UI fuer fehlgeschlagene Analysen. User muss eine komplett neue Analyse starten.

#### EC-2: Brand-Name zu generisch
- [x] Warnung wird angezeigt wenn Name <= 4 Zeichen und keine URL angegeben

#### EC-3: Analyse mit 0 Keywords
- [x] Frontend: isValid prueft cleanKeywords.length >= 1
- [x] Backend: Zod-Schema min(1) auf keywords Array

#### EC-4: Parallele Analysen (Max. 2 gleichzeitig)
- [x] MAX_CONCURRENT_ANALYSES = 2 implementiert
- [x] Status "queued" wenn Limit erreicht
- [ ] BUG-6: MEDIUM -- Queued-Analysen werden nie automatisch gestartet. Es gibt keinen Mechanismus (Cron, Queue-Worker, Post-Completion-Trigger), der queued-Analysen aufnimmt, wenn ein Running-Job fertig ist.

#### EC-5: Rate-Limit bei OpenRouter
- [x] Exponentielles Backoff implementiert (2s, 4s, 8s)
- [x] Max 3 Retries bevor Fehler protokolliert wird

#### EC-6: Tenant ohne gebuchtes AI-Visibility-Modul
- [x] requireTenantModuleAccess prueft Modul-Buchung
- [x] 403-Antwort bei fehlendem Modul
- [x] UI zeigt Sperrbildschirm mit Link zur Abrechnung (nur fuer Admin)

#### EC-7: Analyse-Job haengt / Timeout
- [x] 10-Min-Timeout implementiert, setzt Status auf "failed"
- [ ] BUG-4 (siehe oben): Vercel maxDuration kollidiert mit internem Timeout

### Security Audit Results

#### Authentication & Authorization
- [x] Alle API-Routen pruefen Auth via requireTenantUser()
- [x] Tenant-ID kommt aus Middleware-Header, nicht vom Client steuerbar
- [x] RLS auf DB-Ebene als zweite Schutzschicht
- [x] Projekt-Delete prueft tenant_id match
- [x] Analyse-Start prueft ob Projekt zum Tenant gehoert

#### Worker-Endpoint Security
- [ ] BUG-7: HIGH -- Worker-Endpoint (/api/tenant/visibility/worker) hat nur optionale Secret-Authentifizierung. Wenn VISIBILITY_WORKER_SECRET nicht gesetzt ist, kann JEDER externe Akteur beliebige analysis_ids verarbeiten lassen. Zwar muss die analysis_id in der DB existieren, aber ein Angreifer koennte durch Brute-Force oder Side-Channel eine gueltige ID finden und den Worker triggern. Die .env.local.example kommentiert den Key als "Optional".
- [ ] BUG-8: MEDIUM -- Worker-Endpoint fuehrt keine Tenant-spezifische Auth durch. Obwohl er die analysis_id aus der DB laedt (was den tenant_id implizit einschraenkt), prueft er nicht, ob der Caller berechtigt ist. Es ist ein interner Endpoint, aber oeffentlich erreichbar.

#### Input Validation
- [x] Alle Endpoints verwenden Zod-Validierung
- [x] brand_name, website_url, keywords, competitors werden validiert
- [x] project_id und analysis_id als UUID validiert
- [x] Kein SQL-Injection-Risiko (Supabase Client abstrahiert Queries)

#### XSS
- [x] React escaped Output standardmaessig
- [x] Keine dangerouslySetInnerHTML-Verwendung
- [x] KI-Antworten werden als Text gespeichert und nicht als HTML gerendert (in der aktuellen UI)

#### Data Exposure
- [x] OpenRouter API Key wird nur serverseitig verwendet
- [x] OPENROUTER_API_KEY hat kein NEXT_PUBLIC_ Prefix
- [x] Raw Results werden nur an authentifizierte Tenant-Members zurueckgegeben

#### Rate Limiting
- [ ] BUG-9: MEDIUM -- Keine Rate-Limits auf den API-Endpunkten. Ein authentifizierter User kann unbegrenzt Projekte und Analysen erstellen, was zu hohen OpenRouter-Kosten fuehren kann (DoS auf Kosten des Plattformbetreibers).

### Cross-Browser & Responsive Testing
- Konnte nicht durchgefuehrt werden, da BUG-1 (Daten-Mismatch) das Feature komplett blockiert. Projekte werden nie geladen, daher ist die gesamte UI nicht testbar.

### Bugs Found

#### BUG-1: API-Response-Format stimmt nicht mit Frontend ueberein
- **Severity:** Critical
- **Steps to Reproduce:**
  1. Navigiere zu /tools/ai-visibility (mit gebuchtem Modul)
  2. Die Projektliste wird geladen
  3. Expected: Projekte werden angezeigt
  4. Actual: Leere Liste, weil API ein flat Array zurueckgibt, Frontend aber `data.projects` erwartet (wird zu `undefined`, Fallback `[]`)
- **Betroffene Stellen:**
  - `GET /projects` -> API: `json(enriched)`, Frontend: `data.projects ?? []`
  - `POST /projects` -> API: `json(data)`, Frontend: `const { project } = await res.json()`
  - `GET /projects/[id]` -> API: `json(data)`, Frontend: `projectData.project`
  - `GET /analyses` -> API: `json(data ?? [])`, Frontend: `analysesData.analyses ?? []`
  - `POST /analyses` -> API: `json(analysis)`, Frontend: `const { analysis } = await res.json()`
- **Priority:** Fix before deployment -- Feature ist komplett nicht funktionsfaehig

#### BUG-2: Iterations-Minimum weicht von Spec ab
- **Severity:** Medium
- **Steps to Reproduce:**
  1. Sende direkten API-Call: POST /api/tenant/visibility/analyses mit iterations: 1
  2. Expected: Validation Error (Spec sagt 5-10)
  3. Actual: Wird akzeptiert (Zod erlaubt 1-10)
- **Priority:** Fix in next sprint

#### BUG-3: Prompt beeinflusst KI-Antwort zugunsten des Brands
- **Severity:** Medium
- **Steps to Reproduce:**
  1. Analyse starten mit Brand "Mustermann GmbH"
  2. Prompt enthaelt: "Beruecksichtige dabei besonders Anbieter wie Mustermann GmbH"
  3. Expected: Neutrale Abfrage, die misst ob KI den Brand organisch kennt
  4. Actual: KI wird aktiv aufgefordert, den Brand zu beruecksichtigen
- **Priority:** Fix in next sprint -- verfaelscht die Kernmetrik des Tools

#### BUG-4: Vercel maxDuration vs. interner Timeout Konflikt
- **Severity:** Low
- **Steps to Reproduce:**
  1. Starte Analyse mit vielen Keywords/Modellen (z.B. 10 Keywords x 4 Modelle x 10 Iterationen x 4 Subjects = 1600 Queries)
  2. Expected: Timeout nach 10 Min mit Status "failed"
  3. Actual: Vercel killt die Funktion nach 5 Min (maxDuration=300s), Analyse bleibt im Status "running" haengen
- **Priority:** Fix in next sprint

#### BUG-5: Kein Retry fuer fehlgeschlagene Analysen
- **Severity:** Low
- **Steps to Reproduce:**
  1. Analyse schlaegt fehl (z.B. durch Timeout)
  2. Expected: Retry-Button um die gleiche Analyse erneut zu starten
  3. Actual: User muss manuell eine neue Analyse erstellen
- **Priority:** Nice to have

#### BUG-6: Queued-Analysen werden nie automatisch gestartet
- **Severity:** Medium
- **Steps to Reproduce:**
  1. Starte 3 Analysen schnell hintereinander
  2. Analyse 3 bekommt Status "queued"
  3. Analyse 1 wird fertig (Status "done")
  4. Expected: Analyse 3 wird automatisch aus der Queue geholt und gestartet
  5. Actual: Analyse 3 bleibt fuer immer im Status "queued"
- **Priority:** Fix before deployment -- Feature ist versprochen aber nicht implementiert

#### BUG-7: Worker-Endpoint ohne verpflichtende Authentifizierung
- **Severity:** High
- **Steps to Reproduce:**
  1. Setze VISIBILITY_WORKER_SECRET nicht (oder leer)
  2. Sende POST an /api/tenant/visibility/worker mit gueltiger analysis_id
  3. Expected: 401 Unauthorized
  4. Actual: Worker verarbeitet die Analyse (beliebiger externer Caller)
- **Priority:** Fix before deployment

#### BUG-8: Worker-Endpoint prueft keinen Tenant-Kontext
- **Severity:** Medium
- **Steps to Reproduce:**
  1. Worker laedt Analyse und Projekt direkt aus DB ohne x-tenant-id Header-Pruefung
  2. Expected: Worker sollte nur von internen Calls erreichbar sein oder Tenant verifizieren
  3. Actual: Jeder mit Worker-Secret (oder ohne, falls nicht gesetzt) kann beliebige Analysen triggern
- **Priority:** Fix in next sprint (wird durch BUG-7 Fix teilweise entschaerft)

#### BUG-9: Keine Rate-Limits auf API-Endpunkten
- **Severity:** Medium
- **Steps to Reproduce:**
  1. Erstelle 100 Projekte und starte je eine Analyse per Script
  2. Expected: Rate-Limit greift nach N Requests
  3. Actual: Alle Requests werden akzeptiert, OpenRouter-Kosten steigen unkontrolliert
- **Priority:** Fix in next sprint

### Summary
- **Acceptance Criteria:** 7/10 passed (BUG-1 blockiert Feature komplett, BUG-2 und BUG-3 sind Abweichungen, BUG-4 betrifft Timeout-Verhalten)
- **Bugs Found:** 9 total (1 critical, 1 high, 4 medium, 3 low)
- **Security:** Issues found (BUG-7: Worker ohne verpflichtende Auth, BUG-9: keine Rate-Limits)
- **Production Ready:** NEIN
- **Recommendation:** BUG-1 (API-Response-Mismatch) und BUG-6 (Queue-Mechanismus) und BUG-7 (Worker-Auth) muessen zwingend vor dem Deployment behoben werden. Ohne BUG-1 ist das Feature komplett nicht nutzbar. BUG-7 ist ein Sicherheitsrisiko.

## Deployment
_To be added by /deploy_
