# PROJ-32: GSC Alle Rankings (Discovery View)

## Status: In Review
**Created:** 2026-04-02
**Last Updated:** 2026-04-02

## Implementation Notes
- API-Route: `GET /api/tenant/keywords/projects/[id]/gsc/all-rankings?days=7|28|90`
  - Auth: requireTenantUser + requireTenantModuleAccess('seo_analyse')
  - Rate Limit: GSC_DISCOVERY (10 req/h per tenant+IP)
  - Token-Refresh analog zu keyword-rankings.ts (ensureAccessToken pattern)
  - Returns rows with isTracked flag by cross-referencing keywords table
- UI: Neuer Tab "Alle Rankings" in ProjectDetail (keyword-projects-workspace.tsx)
  - Tab ist immer sichtbar, zeigt intern GSC-not-connected/revoked States
  - Sortierbare Tabelle (Keyword, Position, Klicks, Impressionen, CTR)
  - Clientseitige Freitextsuche
  - "Tracken"-Button pro Zeile, deaktiviert wenn bereits getrackt
  - Pagination: 50 Zeilen initial, "Weitere laden"-Button
  - Zeitraum-Select: 7/28/90 Tage (Default: 28)
  - Abweichung von Spec: Tab ist immer sichtbar (nicht nur bei GSC-Verbindung), aber zeigt intern den entsprechenden Leer-/Fehler-State

## Dependencies
- Requires: PROJ-26 (Google Search Console Integration) — OAuth-Verbindung, Token-Refresh
- Requires: PROJ-27 (Keyword Rankings Dashboard) — bestehender Workspace, GSC-Connection-Infrastruktur
- Requires: PROJ-25 (Keyword Project Management) — "Zum Tracking hinzufügen"-Ziel

## User Stories
- Als Member möchte ich alle Keywords sehen, zu denen meine Domain in Google rankt, damit ich Keyword-Chancen entdecke, die ich noch nicht tracke.
- Als Member möchte ich die Ergebnisse nach Klicks, Impressionen, Position und CTR sortieren, damit ich die wichtigsten Keywords priorisieren kann.
- Als Member möchte ich den Zeitraum der Auswertung frei wählen (7 / 28 / 90 Tage), damit ich aktuelle Trends vs. langfristige Entwicklungen vergleichen kann.
- Als Member möchte ich Keywords direkt aus der Ergebnisliste zum Tracking hinzufügen, damit ich keine Keywords manuell abtippen muss.
- Als Member möchte ich sehen, welche Keywords ich bereits tracke, damit ich keine Duplikate anlege.
- Als Member möchte ich nach einem Keyword-Text suchen/filtern, damit ich schnell spezifische Begriffe finden kann.

## Acceptance Criteria
- [ ] Neue Tab "Alle Rankings" im bestehenden Keyword-Projekt-Workspace (neben Rankings, Keywords, etc.)
- [ ] Tab ist nur sichtbar wenn GSC für das Projekt verbunden und eine Property ausgewählt ist
- [ ] Daten kommen live aus der GSC Search Analytics API (`dimensions: ['query']`, kein Snapshot/Cron)
- [ ] Angezeigt werden: Keyword, Position (Ø), Klicks, Impressionen, CTR
- [ ] Zeitraum-Filter: 7 Tage / 28 Tage / 90 Tage (Standard: 28 Tage)
- [ ] Tabelle ist sortierbar nach allen Spalten (Standard: Klicks absteigend)
- [ ] Freitextsuche filtert die geladenen Ergebnisse clientseitig
- [ ] Bereits getrackte Keywords sind in der Liste markiert (z.B. Badge "Wird getrackt")
- [ ] "Zum Tracking hinzufügen"-Button pro Zeile — deaktiviert wenn bereits getrackt
- [ ] Klick auf "Zum Tracking hinzufügen" fügt das Keyword direkt zur Keyword-Liste des Projekts hinzu (POST auf bestehende Route)
- [ ] Max. 1.000 Keywords werden geladen (GSC rowLimit), mit Hinweis wenn Limit erreicht
- [ ] Rate Limit: max. 10 Loads pro Stunde pro Tenant+IP
- [ ] Ladezeit-Indikator während GSC-Abfrage läuft
- [ ] Fehlerzustände: GSC nicht verbunden, Token abgelaufen, API-Fehler

## Edge Cases
- GSC-Property hat weniger Keywords als rowLimit → normale Anzeige, kein Fehler
- Keyword enthält Sonderzeichen oder sehr langen Text → wird korrekt angezeigt, kein Layout-Overflow
- GSC gibt keine Daten für den gewählten Zeitraum zurück → leerer State mit Hinweis "Keine Daten für diesen Zeitraum"
- Token abgelaufen während Abfrage → Token-Refresh wird automatisch versucht (wie in bestehenden GSC-Routes)
- Nutzer klickt mehrfach schnell auf "Zum Tracking hinzufügen" → Button zeigt Loading-State, doppelter Request wird verhindert
- Keyword existiert bereits in der Projekt-Keyword-Liste → Button ist disabled, Badge "Wird getrackt" sichtbar
- Sehr viele Keywords (1.000) → Tabelle virtualisiert oder paginiert (ab 200 Zeilen), kein UI-Freeze
- GSC-Connection wird im Hintergrund widerrufen → 403-Antwort, Hinweis mit Link zu Integrationen-Tab

## Technical Requirements
- **Datenabruf:** Live-Call auf `querySearchAnalytics` mit `dimensions: ['query']`, `rowLimit: 1000`
- **Kein Caching in DB** — die Daten sind bereits bei GSC gecacht; kein neues Datenmodell nötig
- **Neue API-Route:** `GET /api/tenant/keywords/projects/[id]/gsc/all-rankings?days=7|28|90`
  - Auth: Tenant-User + Modul `seo_analyse`
  - Lädt GSC-Connection für das Projekt, refresht Token falls nötig
  - Ruft GSC Search Analytics ab, gibt strukturierte Rows zurück
  - Gibt zurück welche Keywords bereits in `keywords`-Tabelle des Projekts vorhanden sind
- **Keyword hinzufügen:** Bestehende Route `POST /api/tenant/keywords/projects/[id]/keywords` wiederverwenden
- **UI:** Neuer Tab in bestehendem `KeywordProjectsWorkspace` bzw. dem Projekt-Detail-Panel
- **Performance:** rowLimit 1000, Sortierung und Suche clientseitig nach dem ersten Load
- **Rate Limit:** eigenes Preset analog zu `GSC_READ`

## Out of Scope
- Historische Verläufe für Discovery-Keywords (nur für getrackte Keywords in Rankings-Tab)
- Seiten-Dimension (`dimensions: ['page']`) — das ist eine andere Ansicht
- Export als CSV (kann als spätere Erweiterung kommen)
- Zeitreihen-Chart für einzelne Discovery-Keywords

---

## QA Test Results

**Tested:** 2026-04-02
**App URL:** http://localhost:3000
**Tester:** QA Engineer (AI)
**Method:** Static code analysis + build verification (npm run build: PASS)

### Acceptance Criteria Status

#### AC-1: Neuer Tab "Alle Rankings" im bestehenden Keyword-Projekt-Workspace
- [x] PASS — Tab existiert in keyword-projects-workspace.tsx (Zeile 944) mit Globe-Icon und Label "Alle Rankings"

#### AC-2: Tab ist nur sichtbar wenn GSC verbunden und Property ausgewaehlt
- [ ] BUG — Tab ist IMMER sichtbar, unabhaengig vom GSC-Verbindungsstatus. Die Implementation Notes dokumentieren diese Abweichung bewusst ("Tab ist immer sichtbar, zeigt intern den entsprechenden Leer-/Fehler-State"), aber die Acceptance Criteria fordern explizit bedingte Sichtbarkeit. Siehe BUG-1.

#### AC-3: Daten kommen live aus der GSC Search Analytics API
- [x] PASS — API-Route ruft `querySearchAnalytics` mit `dimensions: ['query']` auf (Zeile 157-164 der Route). Kein DB-Caching.

#### AC-4: Angezeigt werden: Keyword, Position, Klicks, Impressionen, CTR
- [x] PASS — Alle 5 Spalten in der Tabelle vorhanden (Zeilen 3081-3125 der Workspace-Datei). Position wird mit 1 Dezimalstelle angezeigt, CTR als Prozentwert.

#### AC-5: Zeitraum-Filter 7/28/90 Tage (Standard: 28)
- [x] PASS — Select-Dropdown mit 3 Optionen, Default-State `useState<'7' | '28' | '90'>('28')`. Server-seitig validiert mit Zod `z.enum(['7', '28', '90']).default('28')`.

#### AC-6: Tabelle sortierbar nach allen Spalten (Standard: Klicks absteigend)
- [x] PASS — Alle 5 Spalten haben Sort-Buttons. Default: `sortKey='clicks'`, `sortDir='desc'`. Toggle-Logik korrekt implementiert.

#### AC-7: Freitextsuche filtert clientseitig
- [x] PASS — Input-Feld mit `searchQuery` State, Filterung via `r.keyword.toLowerCase().includes(searchQuery.toLowerCase())`.

#### AC-8: Bereits getrackte Keywords markiert (Badge "Wird getrackt")
- [x] PASS — Badge mit Check-Icon und Text "Wird getrackt" in Emerald-Farben bei `row.isTracked === true`.

#### AC-9: "Zum Tracking hinzufuegen"-Button deaktiviert wenn getrackt
- [x] PASS — Button wird durch Badge ersetzt wenn `isTracked`, nicht nur disabled. Noch besser als die Spec fordert.

#### AC-10: Klick fuegt Keyword via POST auf bestehende Route hinzu
- [x] PASS — `handleAddKeyword` ruft `POST /api/tenant/keywords/projects/[id]/keywords` mit `{ keyword }` auf. Route akzeptiert dieses Format. 409 Conflict wird graceful behandelt.

#### AC-11: Max 1.000 Keywords (GSC rowLimit), Hinweis wenn Limit erreicht
- [x] PASS — `rowLimit: 1000` im API-Call. `limitReached` Flag in Response. Amber-farbener Hinweis im UI: "Das Limit von 1.000 Keywords wurde erreicht."

#### AC-12: Rate Limit max 10 Loads/Stunde/Tenant+IP
- [x] PASS — `GSC_DISCOVERY: { limit: 10, windowMs: 60 * 60 * 1000 }`. Key: `gsc-discovery:${tenantId}:${getClientIp(request)}`.

#### AC-13: Ladezeit-Indikator waehrend GSC-Abfrage
- [x] PASS — Loader2-Spinner + Skeleton-Elemente waehrend `loading === true`.

#### AC-14: Fehlerzustaende (GSC nicht verbunden, Token abgelaufen, API-Fehler)
- [x] PASS — Drei separate States: `gscNotReady` (422), `gscRevoked` (403), `error` (sonstige). Alle mit passendem UI inkl. "Zu den Integrationen"-Button bei GSC-Problemen.

### Edge Cases Status

#### EC-1: Weniger Keywords als rowLimit
- [x] PASS — `limitReached` ist `gscRows.length >= 1000`, kein Fehler bei weniger Daten.

#### EC-2: Sonderzeichen / langer Keyword-Text
- [x] PASS — `max-w-[300px] truncate` verhindert Layout-Overflow. Keywords werden als Plain-Text gerendert (kein XSS-Risiko).

#### EC-3: Keine Daten fuer gewaehlten Zeitraum
- [x] PASS — Leerer State mit Hinweis "Keine Daten fuer diesen Zeitraum" und Button "90 Tage anzeigen" wenn nicht bereits 90 Tage ausgewaehlt.

#### EC-4: Token abgelaufen waehrend Abfrage
- [x] PASS — Token-Refresh mit `GSC_REFRESH_BUFFER_MS = 2 * 60 * 1000` Puffer. Bei `TokenRevokedError` wird Connection-Status auf 'revoked' gesetzt und 403 zurueckgegeben.

#### EC-5: Mehrfach-Klick auf "Zum Tracking hinzufuegen"
- [ ] BUG — Double-Click-Schutz nur teilweise wirksam. `addingKeyword` ist ein einzelner String, kein Set. Wenn Nutzer auf Keyword A klickt und waehrenddessen auf Keyword B, wird B nicht blockiert (nur A hat den `disabled`-State). Zudem: der Guard `if (addingKeyword) return` verhindert nur den zweiten Klick wenn bereits EIN Keyword geladen wird, aber nicht parallele Klicks auf verschiedene Keywords. Siehe BUG-2.

#### EC-6: Keyword existiert bereits
- [x] PASS — Server gibt 409, Client faengt das ab und setzt `isTracked: true` + zeigt Toast "Bereits vorhanden".

#### EC-7: Sehr viele Keywords (1.000) — Virtualisierung/Paginierung
- [ ] BUG — Keine Virtualisierung vorhanden. Pagination via "Weitere laden" (50er-Schritte) existiert, aber alle geladenen Rows werden als DOM-Elemente gerendert. Bei 1000 Keywords und mehrfachem "Weitere laden" koennen bis zu 1000 `<tr>` Elemente im DOM sein. Kein Freeze, aber potenziell langsam auf schwachen Geraeten. Siehe BUG-3.

#### EC-8: GSC-Connection im Hintergrund widerrufen
- [x] PASS — 403-Antwort wird erkannt, `gscRevoked` State zeigt Unlink-Icon und "Zu den Integrationen"-Button.

### Security Audit Results

#### Authentication
- [x] PASS — `requireTenantUser(tenantId)` prueft Supabase Auth Session und Tenant-Membership
- [x] PASS — x-tenant-id Header wird vom Proxy gesetzt und kann nicht vom Client gespooft werden (sanitizedHeaders entfernt eingehende Tenant-Header)

#### Authorization
- [x] PASS — Projekt-Zugehoerigkeit wird geprueft: `keyword_projects.tenant_id = tenantId`
- [x] PASS — GSC-Connection wird tenant-isoliert abgefragt: `.eq('tenant_id', tenantId)`
- [x] PASS — Tracked Keywords werden tenant-isoliert abgefragt: `.eq('tenant_id', tenantId)`
- [ ] WARNUNG — `requireTenantModuleAccess` ist im DEV-Modus deaktiviert (`return { granted: true }` vor dem eigentlichen Check). Dies ist ein projektweites Problem (betrifft alle Module), nicht PROJ-32-spezifisch. Siehe BUG-4.

#### Input Validation
- [x] PASS — `projectId` wird mit `z.string().uuid()` validiert
- [x] PASS — `days` Query-Parameter wird mit `z.enum(['7', '28', '90'])` validiert
- [x] PASS — Keyword-Input beim Tracken wird mit `z.string().min(1).max(200)` validiert (in der Keywords-Route)

#### Rate Limiting
- [x] PASS — GSC Discovery hat eigenes Preset: 10 req/h/tenant+IP
- [ ] WARNUNG — In-Memory Rate Limiter funktioniert nicht zuverlaessig auf Vercel Serverless (jede Instanz hat eigenen Speicher). Projektweites bekanntes Problem.

#### Data Exposure
- [x] PASS — Keine sensiblen Daten in der API-Response (keine Tokens, keine Tenant-IDs anderer Tenants)
- [x] PASS — Encrypted Tokens werden nur serverseitig entschluesselt, nie an den Client gesendet

#### XSS
- [x] PASS — Keywords werden als Text-Content in React gerendert (kein `dangerouslySetInnerHTML`), automatisch escaped

#### IDOR (Insecure Direct Object Reference)
- [x] PASS — Projekt-ID wird gegen Tenant-Zugehoerigkeit geprueft. Ein Angreifer kann keine fremden Projekte abfragen.

### Bugs Found

#### BUG-1: Tab "Alle Rankings" ist immer sichtbar (Abweichung von AC-2)
- **Severity:** Low
- **Steps to Reproduce:**
  1. Oeffne ein Keyword-Projekt ohne GSC-Verbindung
  2. Erwartung: Tab "Alle Rankings" ist nicht sichtbar
  3. Tatsaechlich: Tab ist sichtbar, zeigt aber "Search Console nicht verbunden"-State
- **Hinweis:** Die Implementation Notes dokumentieren diese Abweichung bewusst. Der gewaehlte Ansatz (Tab immer sichtbar, interner Fehler-State) ist UX-maessig vertretbar, da er den Nutzer auf die fehlende Verbindung hinweist statt den Tab unsichtbar zu machen. **Entscheidung liegt beim Product Owner ob AC-2 angepasst wird oder die Implementierung.**
- **Priority:** Nice to have / Product-Entscheidung

#### BUG-2: Unvollstaendiger Double-Click-Schutz bei "Tracken"-Button
- **Severity:** Low
- **Steps to Reproduce:**
  1. Lade die "Alle Rankings"-Tabelle mit mehreren ungetrackten Keywords
  2. Klicke schnell nacheinander auf "Tracken" bei Keyword A und dann Keyword B
  3. Erwartung: Nur ein Request gleichzeitig, zweiter Klick wird blockiert
  4. Tatsaechlich: `addingKeyword` ist ein String (nicht Set), daher wird nur das zuletzt angeklickte Keyword mit Loading-State angezeigt. Der Guard `if (addingKeyword) return` verhindert zwar parallele Calls, aber nur weil ein String truthy ist. Funktioniert also korrekt fuer den Hauptfall, aber bei extrem schnellen Klicks (Microsekunden) koennte ein Race Condition auftreten bevor der State gesetzt ist.
- **Priority:** Nice to have (React State Batching macht dieses Szenario in der Praxis unwahrscheinlich)

#### BUG-3: Keine Tabellen-Virtualisierung bei 1.000 Keywords
- **Severity:** Low
- **Steps to Reproduce:**
  1. Lade ein Projekt mit 1.000+ GSC-Keywords
  2. Klicke mehrfach auf "Weitere laden" bis alle 1.000 Zeilen sichtbar sind
  3. Erwartung: Virtualisierung oder Performance-Optimierung ab 200 Zeilen
  4. Tatsaechlich: Alle Zeilen werden als echte DOM-Elemente gerendert
- **Hinweis:** Die Pagination (50er-Schritte) mildert das Problem erheblich. Nutzer muessen aktiv 19x "Weitere laden" klicken um alle 1.000 Zeilen zu sehen. In der Praxis kein ernstes Problem.
- **Priority:** Nice to have (Virtualisierung z.B. mit react-virtual fuer spaetere Iteration)

#### BUG-4: Module Access Check deaktiviert (DEV-Modus) — Projektweit
- **Severity:** High (Security)
- **Steps to Reproduce:**
  1. Oeffne `src/lib/module-access.ts`
  2. Zeile 22: `return { granted: true }` vor dem eigentlichen Check
  3. Jeder Tenant hat Zugriff auf alle Module, unabhaengig von Buchungen
- **Hinweis:** Dies ist ein bekanntes, projektweites Problem (nicht PROJ-32-spezifisch). Alle API-Routes die `requireTenantModuleAccess` verwenden sind betroffen.
- **Priority:** Fix before production deployment (muss vor Go-Live entfernt werden)

### Cross-Browser & Responsive (Code-Review)
- Tab-Leiste verwendet `overflow-x-auto` — funktioniert auf allen Viewports
- Tabelle verwendet `overflow-x-auto` — horizontales Scrollen auf Mobile verfuegbar
- `max-w-[300px] truncate` auf Keyword-Spalte verhindert Layout-Break
- Dark Mode Styles sind durchgaengig implementiert (`dark:bg-[#151c28]`, `dark:text-slate-50`, etc.)
- Responsive Layout: `flex-col gap-4 sm:flex-row sm:items-center` fuer Header-Bereich

**Anmerkung:** Fuer eine vollstaendige Cross-Browser/Responsive-Validierung ist ein manueller Browser-Test erforderlich. Die Code-Analyse zeigt keine offensichtlichen Probleme.

### Summary
- **Acceptance Criteria:** 13/14 passed (1 bewusste Abweichung bei AC-2)
- **Edge Cases:** 6/8 passed (2 Low-Severity Findings)
- **Bugs Found:** 4 total (1 High projektweit, 3 Low)
- **Security:** PASS fuer PROJ-32-spezifische Implementierung. 1 projektweite Warnung (Module Access DEV-Modus).
- **Build:** PASS (npm run build erfolgreich)
- **Production Ready:** BEDINGT JA — PROJ-32 selbst ist production-ready. Der High-Severity Bug (BUG-4: Module Access DEV-Modus) ist projektweit und muss vor dem Go-Live aller Module behoben werden, ist aber keine Regression durch PROJ-32.
