# PROJ-56: Dashboard Portfolio-Übersicht

## Overview
Eine Agentur-Übersichtsseite, die alle Kunden auf einen Blick zeigt — mit aggregierten Key-Metriken, Anomalie-Alerts und einer Prioritätsliste. Ersetzt die aktuelle "1 Kunde = 1 View"-Logik durch eine echte Multi-Client-Perspektive für Agentur-Admins.

## User Stories

### Als Agentur-Admin möchte ich
- **STORY-1:** Alle meine Kunden in einer Übersicht sehen mit den wichtigsten Metriken pro Kunde (Traffic, Ads-Spend, Ranking-Position), um schnell den Gesamtstatus zu erfassen
- **STORY-2:** Anomalien automatisch hervorgehoben sehen (z. B. „Kunde X: -35% Traffic diese Woche"), damit ich sofort reagieren kann ohne jeden Kunden manuell prüfen zu müssen
- **STORY-3:** Sehen, bei welchen Kunden heute Handlungsbedarf besteht (überfällige Follow-ups, ausstehende Freigaben, Fehler in Integrationen)
- **STORY-4:** Kunden nach Metriken sortieren und filtern können (z. B. stärkster Traffic-Rückgang zuerst)

### Als Agentur-Mitarbeiter möchte ich
- **STORY-5:** Meine zugewiesenen Kunden gefiltert sehen können, um meinen Arbeitsbereich zu fokussieren

## Acceptance Criteria

### AC-1: Portfolio-Grid
- **GIVEN** ich bin als Admin eingeloggt und öffne die Portfolio-Übersicht
- **WHEN** die Seite lädt
- **THEN** sehe ich alle Kunden als Karten-Grid (oder Tabelle, umschaltbar)
- **AND** jede Karte zeigt: Kunden-Logo, Name, Status-Badge (aus CRM), letzte 7 Tage Traffic (wenn GA4 verbunden), aktive Ads-Plattformen als Icons
- **AND** die Seite ist erreichbar unter `/dashboard/portfolio`

### AC-2: Anomalie-Alerts
- **GIVEN** GA4 oder Ads-Daten für einen Kunden vorhanden sind
- **WHEN** eine Metrik um >20% im Vergleich zur Vorwoche abweicht
- **THEN** erscheint ein orange/rotes Warn-Icon auf der Kunden-Karte
- **AND** beim Hover zeigt sich: „Traffic -32% vs. Vorwoche (1.240 → 843 Besucher)"
- **AND** ein Filter „Nur mit Alerts" blendet alle unauffälligen Kunden aus

### AC-3: Handlungsbedarf-Leiste
- **GIVEN** es gibt offene Aktionen im System
- **WHEN** ich die Portfolio-Seite öffne
- **THEN** sehe ich oben eine kompakte Leiste mit Zählern: „3 Freigaben ausstehend · 2 Follow-ups fällig · 1 Integration fehlerhaft"
- **AND** jeder Zähler ist klickbar und führt zur gefilterten Ansicht

### AC-4: Sortierung & Filter
- **GIVEN** ich bin im Portfolio-Grid
- **WHEN** ich sortieren oder filtern möchte
- **THEN** kann ich sortieren nach: Name (A–Z), Traffic-Änderung (Einbruch zuerst), CRM-Status, Zuletzt aktualisiert
- **AND** filtern nach: CRM-Status (Active/Lead/etc.), Plattform-Integration (hat GA4 / hat Google Ads / etc.), nur Alerts

### AC-5: Kunden-Karte Quick-Actions
- **GIVEN** ich hover über eine Kunden-Karte
- **WHEN** ich die Quick-Actions sehe
- **THEN** gibt es Direktlinks: „Dashboard öffnen", „Aktivität loggen", „Report erstellen"
- **AND** ein Klick auf die Karte navigiert zum Kunden-Dashboard (mit vorausgewähltem Kunden im Selektor)

### AC-6: Leerer Zustand (keine Kunden)
- **GIVEN** noch keine Kunden angelegt sind
- **WHEN** ich die Portfolio-Seite öffne
- **THEN** sehe ich einen leeren Zustand mit CTA: „Ersten Kunden anlegen"

## Edge Cases

### EC-1: Kein GA4 verbunden
- **WHEN** ein Kunde keine GA4-Verbindung hat
- **THEN** zeigt die Karte Traffic-Feld als grau: „Keine Daten — GA4 verbinden"
- **AND** kein Anomalie-Alert möglich (kein falscher Alarm)

### EC-2: Viele Kunden (>50)
- **WHEN** mehr als 50 Kunden vorhanden sind
- **THEN** wird der Grid paginiert (20 pro Seite) oder via virtualisiertem Scroll geladen
- **AND** eine globale Suchleiste oben filtert sofort nach Kundenname

### EC-3: Nur Member-Rolle
- **WHEN** ein Member (nicht Admin) die Portfolio-Seite aufruft
- **THEN** sieht er nur Kunden, zu denen er Zugriff hat (aktuell: alle Kunden des Tenants)
- **AND** die Handlungsbedarf-Leiste zeigt nur seine zugewiesenen Follow-ups

### EC-4: Alle Metriken veraltet
- **WHEN** letzte Daten-Synchronisierung >48h zurückliegt
- **THEN** zeigt jede Karte einen grauen „Daten veraltet"-Hinweis mit Timestamp
- **AND** ein „Alle aktualisieren"-Button triggert Refresh für alle verbundenen Integrationen

## Technical Requirements

### Neue Route
- `src/app/(tenant)/dashboard/portfolio/page.tsx`

### Datenquellen (bestehende APIs aggregieren)
- Kunden-Liste: `GET /api/tenant/customers` (bestehend, PROJ-29)
- GA4-Metriken: `GET /api/tenant/integrations/ga4/metrics?customer_id=X` (PROJ-50)
- Follow-ups fällig: `GET /api/tenant/customers/follow-ups` (PROJ-61)
- Ausstehende Freigaben: `GET /api/tenant/approvals?status=pending` (PROJ-34)
- Fehlerhafte Integrationen: aus `customer_integrations.status`

### Neuer API Endpoint
- `GET /api/tenant/portfolio/summary` — Aggregiert alle Kunden mit letzten Metriken, Anomalie-Flags und Handlungsbedarf in einem Call (Performance-optimiert, gecacht 15 Min.)

### UI-Komponenten
- `PortfolioGrid` — Responsive Grid mit Kunden-Karten
- `CustomerCard` — Karte mit Logo, Metriken, Alert-Indikator, Quick-Actions
- `ActionBar` — Handlungsbedarf-Leiste oben
- `AnomalyBadge` — Orange/Rotes Warn-Icon mit Hover-Tooltip

## Dependencies
- **PROJ-29:** Customer Database — Kunden-Stammdaten
- **PROJ-50:** GA4 Integration — Traffic-Metriken
- **PROJ-61:** CRM-Upgrade — CRM-Status, Follow-ups
- **PROJ-34:** Client Approval Hub — ausstehende Freigaben
- **PROJ-28:** Globaler Kunden-Selektor — Karten-Klick setzt aktiven Kunden

## Success Metrics
- Portfolio-Seite wird von >80% der Admin-User als Einstiegsseite genutzt
- Anomalie-Alert führt zu Kunden-Action innerhalb von 24h in >60% der Fälle
- Reduzierung der Zeit „Admin öffnet App → erkennt Problem" von Ø 8 Min. auf <2 Min.

## Non-Goals
- Kein aggregiertes Reporting über alle Kunden (kommt mit PROJ-55 Report Center)
- Keine Push-Notifications (PROJ-35 Realtime Notifications)
- Kein Drag & Drop zum Umsortieren der Kunden

## Implementation Notes
- Frontend vollstaendig implementiert in `src/components/portfolio-workspace.tsx` (~1139 Zeilen)
- Page mit Suspense + Skeleton unter `src/app/(tenant)/dashboard/portfolio/page.tsx`
- API Endpoint `GET /api/tenant/portfolio/summary` aggregiert Kunden, Integrationen und Approvals
- Grid/Tabelle umschaltbar, Pagination (20/Seite), Suche, Sort, Filter
- Anomalie-Badges mit 20%-Schwelle, Stale-Data-Warnung bei >48h
- ActionBar mit klickbaren Countern (Freigaben, Follow-ups, Integrationen)
- Quick-Actions auf Hover (Dashboard, Aktivitaet, Report)
- Navigation-Link im Sidebar vorhanden

## Status
- **Status:** In Review
- **Created:** 2026-04-11

## QA Test Results

**Tester:** QA/Red-Team (Claude Opus 4.6)
**Datum:** 2026-04-11
**Build-Status:** Projekt-Build schlaegt im unabhaengigen Feature PROJ-59 (content-briefs page) fehl — PROJ-56 Code kompiliert sauber, hat keine eigenen TS-Errors. Build-Fehler blockiert jedoch Deployment.

### Acceptance Criteria — Ergebnis

| AC | Kriterium | Status | Notiz |
|----|-----------|--------|-------|
| AC-1 | Portfolio-Grid unter `/dashboard/portfolio` mit Logo, Name, Status, 7T-Traffic, Ads-Icons | PARTIAL | Route + Grid + Logo + Name + Traffic + Integrations-Icons vorhanden. Status-Badge ist nur `active`/`paused` aus `customers.status` — Spec verlangt "Status-Badge (aus CRM)" (Lead/Active/etc. aus PROJ-61). Siehe BUG-1. |
| AC-2 | Anomalie-Alerts >20% Delta, Hover-Tooltip, Filter "Nur mit Alerts" | PASS | AnomalyBadge korrekt, Tooltip zeigt absolute Zahlen und Delta, `alertsOnly`-Filter umfasst Traffic-Anomalien, Integration-Errors und stale Data. |
| AC-3 | Handlungsbedarf-Leiste: Freigaben, Follow-ups, Integrationen — klickbar | PARTIAL | `pendingApprovals` + `brokenIntegrations` werden korrekt aus DB aggregiert und sind klickbar. `overdueFollowups` ist in der API **hart auf 0** gesetzt (route.ts:172). Dep PROJ-61 ist noch `Planned`, aber die Spec listet dies als AC. Siehe BUG-2. |
| AC-4 | Sortierung (Name, Traffic-Drop, CRM-Status, Zuletzt aktualisiert) & Filter | PARTIAL | Alle Sort-Optionen vorhanden. Filter CRM-Status nur `active/paused` statt volle CRM-Werte (siehe AC-1/BUG-1). Plattform-Filter und "Nur Alerts" funktionieren. |
| AC-5 | Quick-Actions auf Hover: Dashboard, Aktivitaet, Report; Karten-Klick setzt aktiven Kunden | PASS | 3 Hover-Actions implementiert, Karten-Klick setzt `activeCustomer` und navigiert zu `/dashboard`. Opacity-Transition 0 → 100 auf group-hover. |
| AC-6 | Leerer Zustand mit CTA "Ersten Kunden anlegen" | PASS | CTA korrekt (nur fuer Admin sichtbar), navigiert zu `/tools/customers`. |

### Edge Cases — Ergebnis

| EC | Fall | Status | Notiz |
|----|------|--------|-------|
| EC-1 | Kein GA4 verbunden — grau "Keine Daten — GA4 verbinden", kein Alert | PASS | `TrafficRow` zeigt genau diesen Hinweis; AnomalyBadge nur wenn `deltaPercent != null`. |
| EC-2 | >50 Kunden paginiert (20/Seite) + globale Suche | PASS | PAGE_SIZE=20, Prev/Next-Buttons, Suche filtert ueber Name/Domain/Branche. Query-Limit 500 — siehe Anmerkung im Security-Audit. |
| EC-3 | Member sieht nur zugewiesene Kunden; Handlungsbedarf nur eigene Follow-ups | FAIL | Keine Member-Scoping-Logik im API-Endpoint. Member sieht ALLE Tenant-Kunden und ALLE Approvals/Integrationen-Fehler. Siehe BUG-3. |
| EC-4 | >48h stale Daten: grauer "Daten veraltet"-Hinweis + "Alle aktualisieren"-Button | PARTIAL | Stale-Hinweis pro Karte vorhanden (`isStale`). "Alle aktualisieren"-Button fehlt — Spec verlangt Refresh fuer alle Integrationen; nur generischer "Aktualisieren"-Button laedt lediglich das Summary neu, triggert keinen Integrations-Sync. Siehe BUG-4. |

### Bugs

#### BUG-1 — CRM-Status-Badge fehlt (Medium)
- **Severity:** Medium
- **Bereich:** AC-1, AC-4
- **Beschreibung:** Spec fordert Status-Badge "aus CRM" (z. B. Lead/Active/Prospect). Implementierung nutzt nur `customers.status` mit den Werten `active`/`paused`. CRM-Status (PROJ-61) wird ignoriert.
- **Repro:** Portfolio oeffnen → alle Karten zeigen entweder "Aktiv" oder "Pausiert"; kein CRM-Lifecycle sichtbar.
- **Fix-Pfad:** Abwarten bis PROJ-61 (CRM-Upgrade) deployed; dann Join auf CRM-Status und Filter-Select erweitern.

#### BUG-2 — overdueFollowups hartcodiert auf 0 (Medium)
- **Severity:** Medium
- **Bereich:** AC-3
- **Beschreibung:** `src/app/api/tenant/portfolio/summary/route.ts:172` setzt `overdueFollowups: 0`. Der Counter in der ActionBar kann dadurch nie erscheinen, AC-3 Kriterium "2 Follow-ups faellig" funktionsunfaehig.
- **Repro:** Selbst mit ueberfaelligen Tasks zeigt die ActionBar keinen Follow-up-Counter.
- **Fix-Pfad:** Spec sagt dass Endpoint aus PROJ-61 stammt. Entweder temporaer als TODO markieren mit Kommentar oder den Button komplett ausblenden, solange PROJ-61 nicht deployed ist. Aktuell sauber ausgeblendet (`followups > 0`), aber Semantik fehlerhaft.

#### BUG-3 — Member-Scoping fehlt (High / Security)
- **Severity:** High
- **Bereich:** EC-3, Sicherheit
- **Beschreibung:** `requireTenantUser` prueft nur Tenant-Zugehoerigkeit, nicht die Rolle. Spec EC-3: "Member sieht nur Kunden zu denen er Zugriff hat". Heute sehen Member alle Kunden, alle Approvals und alle Integration-Fehler. Das ist zwar nach aktueller RBAC erlaubt ("aktuell: alle Kunden des Tenants" in der Spec explizit genannt), jedoch sagt der zweite Teil "Handlungsbedarf-Leiste zeigt nur seine zugewiesenen Follow-ups" — diese Filterung fehlt komplett.
- **Repro:** Als Member einloggen → `/dashboard/portfolio` → sieht alle Approvals/Integrationen des Tenants als Handlungsbedarf.
- **Fix-Pfad:** API-Endpoint muss Rolle pruefen und bei Member die Counters nach Zuweisung filtern.

#### BUG-4 — "Alle aktualisieren" Button fehlt (Low)
- **Severity:** Low
- **Bereich:** EC-4
- **Beschreibung:** Spec verlangt bei veralteten Daten einen "Alle aktualisieren"-Button der alle Integrationen neu synct. Implementierung hat nur generischen "Aktualisieren"-Button, der lediglich `GET /summary` neu aufruft — das triggert keinen GA4/Ads-Re-Sync.
- **Repro:** Karte mit stale-Banner oeffnen → kein dedizierter Force-Refresh-Button.
- **Fix-Pfad:** Separater Button, der pro betroffenem Customer `POST /api/tenant/integrations/ga4/{id}/refresh` u. a. aufruft.

#### BUG-5 — N+1 GA4-Calls (Medium / Performance)
- **Severity:** Medium
- **Bereich:** Performance, EC-2
- **Beschreibung:** Fuer jeden Kunden mit GA4 wird ein eigener Fetch (`/api/tenant/integrations/ga4/{id}/data`) parallel gefeuert. Bei 50+ Kunden koennen dies 50+ gleichzeitige API-Requests gegen Google Analytics sein — Rate-Limit-Risiko, hohe TTFB, unnoetige Last. Spec fordert explizit "Aggregiert alle Kunden mit letzten Metriken ... in einem Call (Performance-optimiert, gecacht 15 Min.)".
- **Repro:** Dev-Tools → Network bei 20+ Kunden → 20 parallele `/ga4/.../data` Requests.
- **Fix-Pfad:** Traffic-Daten im `/summary` Endpoint aggregieren (Batch-Abfrage oder gecachte Tabelle); Frontend verarbeitet nur das Ergebnis.

#### BUG-6 — Kein 15-Minuten-Cache am Summary-Endpoint (Low)
- **Severity:** Low
- **Bereich:** Technical Requirements
- **Beschreibung:** Spec fordert "gecacht 15 Min." — Endpoint sendet jedoch `Cache-Control: private, max-age=0, must-revalidate` und nutzt kein `unstable_cache`. Bei vielen Seitenaufrufen wird die gleiche Aggregation staendig neu berechnet.
- **Fix-Pfad:** `unstable_cache` mit Tag `portfolio-summary:{tenantId}`; Revalidate 900s + manuelles Invalidate bei Customer-/Approval-Mutation.

#### BUG-7 — Customers-Limit 500 ohne Warnung (Low)
- **Severity:** Low
- **Bereich:** EC-2
- **Beschreibung:** `customers`-Query ist auf 500 limitiert. Tenants mit >500 Kunden sehen silent nur 500. Keine User-Info, keine Pagination serverseitig.
- **Fix-Pfad:** Entweder realistisch fuer MVP ausreichend → Info-Banner ab 500; oder Pagination/Cursor.

#### BUG-8 — `status` Default bei Null (Low)
- **Severity:** Low
- **Bereich:** Datenkonsistenz
- **Beschreibung:** `route.ts:150` castet `customer.status ?? 'active'` als `'active' | 'paused'`, akzeptiert aber beliebige DB-Werte (z. B. wenn CRM-Lifecycle "lead" einfuehrt) unreflektiert ohne Validierung.
- **Fix-Pfad:** Whitelist mit Fallback auf `'active'`.

#### BUG-9 — Logo-URL ohne Domain-Whitelist (Medium / Security)
- **Severity:** Medium
- **Bereich:** Security
- **Beschreibung:** `CustomerAvatar` rendert `customer.logo_url` direkt in `<img src={...}>`. Falls ein Admin (oder via API-Exploit) eine `javascript:`-URL oder HTTP-Tracking-Pixel einschleust, wird das auf jeder Portfolio-View geladen. Nicht-HTTPS-Bilder brechen Mixed-Content-Security.
- **Repro:** Logo eines Kunden via CRM-API auf externe URL setzen → Portfolio laedt das Drittanbieter-Asset; Browser-Log sichtbar.
- **Fix-Pfad:** `next/image` mit `remotePatterns` in `next.config.ts`, oder Prefix-Check auf erlaubte Supabase-Storage-Domain.

#### BUG-10 — Tabellen-Ansicht: Header nennt "CRM-Status" nicht (Low / UX)
- **Severity:** Low
- **Beschreibung:** Konsistenzpunkt zu BUG-1; in Table-View ebenfalls nur `active/paused`.

#### BUG-11 — Doppelte Badge-Klicks navigieren zweimal (Low)
- **Severity:** Low
- **Beschreibung:** Kartenhuelle ist `<button>`, innerhalb der Quick-Actions sind weitere `<button>`-Elemente. Klicks auf Child-Buttons nutzen `e.stopPropagation()`, aber der Tooltip `<TooltipTrigger asChild>` verschachtelt Buttons-in-Buttons (HTML-ungueltig: `<button>` in `<button>`). Verursacht a11y-Warnings und potenziell inkonsistente Click-Events.
- **Repro:** HTML-Inspektor auf Karte → `<button>` (Karte) enthaelt Quick-Action `<button>`-Elemente.
- **Fix-Pfad:** Karte als `<div role="listitem">` mit Click-Handler und individuellen `<button>`-Elements, nicht die gesamte Karte als `<button>` rendern.

#### BUG-12 — Fehlender `no-store`-Flag beim Traffic-Fetch (Low)
- **Severity:** Low
- **Beschreibung:** `fetch('/api/tenant/integrations/ga4/{id}/data?range=7d')` ohne `cache: 'no-store'`. In Next 16 kann das via RSC-Fetch gecached werden — bei Traffic-Daten unerwuenscht. (Weniger relevant, da Client-Side.)

### Security Audit (Red Team)

| Test | Ergebnis |
|------|----------|
| Unauthenticated access zu `/api/tenant/portfolio/summary` | PASS — `requireTenantUser` lehnt ohne Session mit 401 ab |
| Missing `x-tenant-id` Header | PASS — 400 "Kein Tenant-Kontext." |
| Cross-Tenant Datenleck via manuelles Setzen von `x-tenant-id` | PASS — `requireTenantUser` verifiziert Membership; `createAdminClient` filtert explizit `eq('tenant_id', tenantId)` |
| Rate Limiting | PASS — `CUSTOMERS_READ` (60 req/min/tenant+IP) aktiv |
| Role-Based: Member sieht anderes als Admin | FAIL — siehe BUG-3 |
| XSS via Kundenname/Domain | PASS — React escaped by default; kein `dangerouslySetInnerHTML` |
| XSS / Open Redirect via Logo-URL | FAIL — siehe BUG-9 |
| SQL-Injection via Query-Params | PASS — keine raw-SQL, Supabase-Client parametrisiert |
| Sensitive Data in Response | PASS — keine Secrets, nur ID/Name/Domain/Status |
| CSRF | PASS — Supabase-Cookies, `credentials: 'include'`, GET-only Endpoint |

### Regression (verwandte Deployed Features)
- **PROJ-29 Customer Database:** `customers`-Query nutzt gleiche Felder und Soft-Delete-Filter (`deleted_at is null`) — kompatibel.
- **PROJ-28 Global Customer Selector:** `handleOpenCustomer` nutzt `setActiveCustomer` aus `useActiveCustomer`-Context — korrekt integriert.
- **PROJ-34 Client Approval Hub:** Status-Werte `pending_approval`/`changes_requested` stimmen mit `src/lib/approvals.ts` ueberein.
- **PROJ-50 GA4 Integration:** GA4-Endpoint-Pfad `/api/tenant/integrations/ga4/{id}/data?range=7d` muss existieren — nicht verifiziert, aber Endpoint-Naming weicht nicht ab von PROJ-50-Doku.
- **Sidebar Navigation:** `tenant-shell-navigation.tsx` Link korrekt gesetzt inkl. active-state + prefetch.

### Responsive / Cross-Browser (statische Analyse)
- Grid-Layout: `sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4` → 375/768/1440px decken ab.
- Filter-Bar: `flex-col lg:flex-row` — auf Mobile stapelt sauber.
- Table-View auf Mobile: Scroll-Container in `<Table>` NICHT umschlossen, koennte ueber 375px horizontal scrollen — hinnehmbar.
- Keine Browser-spezifischen APIs gesehen.

### Zusammenfassung
- **Acceptance Criteria:** 2 PASS, 3 PARTIAL, 1 PASS — 0 FAIL (6 gesamt)
- **Edge Cases:** 2 PASS, 1 PARTIAL, 1 FAIL
- **Bugs:** 12 (High: 1, Medium: 4, Low: 7)
- **Security:** 2 Findings (Member-Scoping, Logo-URL-Whitelist)

### Production-Ready: **NOT READY**
Grund: BUG-3 (High / Security — Member-Scoping), BUG-5 (Performance N+1), BUG-9 (Medium / Security — Logo-URL). Zusaetzlich fehlt Cache-Layer laut Spec.

**Vorschlag Priorisierung:**
1. BUG-3 (Member-Scoping)
2. BUG-9 (Logo-URL-Whitelist)
3. BUG-5 (N+1 GA4-Calls) + BUG-6 (15min Cache) — zusammen loesbar
4. BUG-2 / BUG-4 (Follow-ups, Alle-Aktualisieren) — abhaengig von PROJ-61
5. BUG-1 (CRM-Status) — blockiert durch PROJ-61
6. Rest (Low)
