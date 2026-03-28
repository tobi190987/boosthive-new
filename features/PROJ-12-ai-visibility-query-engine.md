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
- [x] API und Frontend verwenden konsistente Response-Formate (`{ project }`, `{ projects }`), Projekte laden korrekt.

#### AC-2: KI-Modell-Auswahl (GPT-4o, Claude 3.5, Gemini 1.5 Pro, Perplexity)
- [x] Alle 4 Modelle sind in AI_MODELS konfiguriert
- [x] Checkbox-Auswahl mit mindestens 1 Modell Pflicht
- [x] Alle vorausgewaehlt als Default

#### AC-3: Iterative Queries (5-10 pro Keyword pro Modell, Default 5)
- [x] UI erlaubt 5-10 Iterationen mit Default 5
- [x] Backend validiert Iterationen jetzt ebenfalls auf 5-10 und entspricht damit der UI und Spec.

#### AC-4: Persona-Simulation (natuerliche Nutzeranfrage)
- [x] buildPrompt() erzeugt deutsche natuerliche Anfrage mit Keyword und Subject
- [x] Prompt ist auf eine neutrale Formulierung umgestellt, um die Sichtbarkeitsmessung nicht aktiv zu verzerren.

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
- [x] Interner Worker-Timeout liegt jetzt unter der Vercel-Laufzeitgrenze, damit Jobs nicht als `running` haengen bleiben.

#### AC-10: Alle Daten strikt tenant-isoliert (RLS)
- [x] RLS auf allen 3 Tabellen aktiv (SELECT via tenant_members JOIN)
- [x] INSERT/UPDATE/DELETE nur via service_role (Deny-Policies)
- [x] Alle API-Routen filtern nach tenant_id via Header
- [x] Worker-Route hat keinen User-Auth, verwendet aber service_role und prueft tenant_id konsistent

### Edge Cases Status

#### EC-1: OpenRouter API nicht erreichbar
- [x] Fehler werden pro Query protokolliert
- [x] Exponentielles Backoff bei 429 Rate Limits (3 Retries, 2s Base)
- [x] Fehlgeschlagene Analysen koennen direkt aus der Progress-Ansicht mit denselben Einstellungen erneut gestartet werden.

#### EC-2: Brand-Name zu generisch
- [x] Warnung wird angezeigt wenn Name <= 4 Zeichen und keine URL angegeben

#### EC-3: Analyse mit 0 Keywords
- [x] Frontend: isValid prueft cleanKeywords.length >= 1
- [x] Backend: Zod-Schema min(1) auf keywords Array

#### EC-4: Parallele Analysen (Max. 2 gleichzeitig)
- [x] MAX_CONCURRENT_ANALYSES = 2 implementiert
- [x] Status "queued" wenn Limit erreicht
- [x] Queued-Analysen werden nach Abschluss eines Jobs automatisch ueber `triggerNextQueued()` aufgenommen.

#### EC-5: Rate-Limit bei OpenRouter
- [x] Exponentielles Backoff implementiert (2s, 4s, 8s)
- [x] Max 3 Retries bevor Fehler protokolliert wird

#### EC-6: Tenant ohne gebuchtes AI-Visibility-Modul
- [x] requireTenantModuleAccess prueft Modul-Buchung
- [x] 403-Antwort bei fehlendem Modul
- [x] UI zeigt Sperrbildschirm mit Link zur Abrechnung (nur fuer Admin)

#### EC-7: Analyse-Job haengt / Timeout
- [x] 10-Min-Timeout implementiert, setzt Status auf "failed"
- [x] Interner Worker-Timeout liegt unter der Vercel-Laufzeitgrenze und verhindert haengende `running`-Jobs.

### Security Audit Results

#### Authentication & Authorization
- [x] Alle API-Routen pruefen Auth via requireTenantUser()
- [x] Tenant-ID kommt aus Middleware-Header, nicht vom Client steuerbar
- [x] RLS auf DB-Ebene als zweite Schutzschicht
- [x] Projekt-Delete prueft tenant_id match
- [x] Analyse-Start prueft ob Projekt zum Tenant gehoert

#### Worker-Endpoint Security
- [x] Worker-Endpoint fail-closed: ohne `VISIBILITY_WORKER_SECRET` startet der Worker nicht.
- [x] Worker-Aufrufe sind ueber verpflichtenden Secret-Header abgesichert; direkte User-Authentifizierung ist fuer den internen Trigger-Flow nicht erforderlich.

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
- [x] Visibility-API-Endpunkte sind ueber tenant- und IP-basierte Rate-Limits abgesichert (Reads, Projekt-Mutationen, Analyse-Starts, Kostenschaetzung).

### Cross-Browser & Responsive Testing
- Die urspruengliche UI-Blockade durch das API-Daten-Mismatch ist behoben. Eine erneute manuelle Cross-Browser-Abnahme steht separat noch aus.

### Bugs Found

Zum aktuellen Stand sind die urspruenglich dokumentierten Bugs 1-9 behoben.

Offene Restpunkte fuer Folgeprojekte:
- Ergebnis-/Reporting-Ansicht fuer abgeschlossene Analysen ist noch nicht Teil von PROJ-12 und wird spaeter in PROJ-24 abgedeckt.
- Eine erneute manuelle Cross-Browser- und Responsive-Abnahme ist sinnvoll, wurde nach den letzten Fixes aber noch nicht neu dokumentiert.

### Summary
- **Acceptance Criteria:** Kernanforderungen fuer Query Engine, Background Processing, Retry, Queueing und Tenant-Isolation sind erfuellt.
- **Bugs Found:** Die urspruenglich dokumentierten Bugs 1-9 sind behoben; aktuell keine offenen Blocker innerhalb des PROJ-12-Scope dokumentiert.
- **Security:** Kein offener kritischer Befund in der aktuellen Implementierung dokumentiert.
- **Production Ready:** JA fuer den Query-Engine-Scope, mit separatem Ausbau der Ergebnis-/Reporting-Oberflaechen in Folgeprojekten.
- **Recommendation:** PROJ-12 kann als deployed gefuehrt werden. Als naechster sinnvoller Schritt folgen Analytics/Reporting in PROJ-23 und PROJ-24.

## Deployment
_To be added by /deploy_
