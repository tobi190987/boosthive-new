# PROJ-25: Keyword Project Management

## Status: In Review
**Created:** 2026-03-28
**Last Updated:** 2026-03-28

## Implementation Notes (Backend)
- Migration: `supabase/migrations/018_keyword_projects.sql` — Tables: `keyword_projects`, `keywords`, `competitor_domains` mit RLS (service_role only writes), CASCADE DELETE
- Modul-Code: `keyword_tracking` (in modules-Tabelle via Migration geseedet)
- API Routes (6 Dateien):
  - `GET/POST /api/tenant/keywords/projects`
  - `GET/PATCH/DELETE /api/tenant/keywords/projects/[id]`
  - `GET/POST /api/tenant/keywords/projects/[id]/keywords` (Bulk-Import via `{ keywords: string[] }` oder `{ keyword: string }`)
  - `DELETE /api/tenant/keywords/projects/[id]/keywords/[kwId]`
  - `GET/POST /api/tenant/keywords/projects/[id]/competitors`
  - `DELETE /api/tenant/keywords/projects/[id]/competitors/[cId]`
- Limits serverseitig enforced: 5 Projekte, 50 Keywords, 5 Wettbewerber
- Alle Routes: `requireTenantUser` + `requireTenantModuleAccess('keyword_tracking')` + admin-client (keine RLS-Writes)

## Dependencies
- Requires: PROJ-3 (User Authentication) — eingeloggter Nutzer
- Requires: PROJ-6 (Role-Based Access Control) — nur Admin/Member des Tenants
- Requires: PROJ-9 (Tenant Dashboard Shell) — UI-Rahmen

## User Stories
- Als Admin möchte ich ein Keyword-Projekt für einen Kunden anlegen (mit Domain, Zielsprache, Zielregion), damit ich das Tracking gezielt konfigurieren kann.
- Als Member möchte ich Keywords zu einem Projekt hinzufügen, damit sie beim nächsten Tracking-Lauf abgefragt werden.
- Als Member möchte ich Wettbewerber-Domains zu einem Projekt hinterlegen, damit deren Rankings für dieselben Keywords verglichen werden können.
- Als Member möchte ich Keywords und Wettbewerber bearbeiten und löschen können, um die Liste aktuell zu halten.
- Als Admin möchte ich mehrere Projekte pro Tenant verwalten (z. B. ein Projekt pro Endkunde), damit verschiedene Kampagnen getrennt bleiben.

## Acceptance Criteria
- [ ] Admin kann ein Keyword-Projekt anlegen mit: Name, Ziel-Domain, Sprache (z. B. `de`), Land/Region (z. B. `DE`)
- [ ] Bis zu 5 Projekte pro Tenant (MVP-Limit, erweiterbar über Modul-Konfiguration)
- [ ] Einem Projekt können beliebig viele Keywords hinzugefügt werden (MVP-Limit: 50)
- [ ] Einem Projekt können bis zu 5 Wettbewerber-Domains hinzugefügt werden
- [ ] Keywords und Wettbewerber können einzeln gelöscht werden
- [ ] Projekte können umbenannt oder deaktiviert werden
- [ ] Jedes Projekt zeigt eine Übersicht: Anzahl Keywords, Wettbewerber, letzter Tracking-Lauf
- [ ] Daten sind strikt Tenant-isoliert (kein Cross-Tenant-Zugriff)

## Edge Cases
- Duplikat-Keyword im selben Projekt → Fehlermeldung, kein doppelter Eintrag
- Domain ohne `https://`-Prefix eingegeben → automatisch normalisieren oder Fehler
- Projekt-Limit erreicht → klare Fehlermeldung mit Hinweis auf Upgrade
- Keyword-Limit (50) erreicht → klare Fehlermeldung
- Wettbewerber-Domain identisch mit Ziel-Domain → Fehlermeldung
- Projekt wird gelöscht → alle Keywords, Wettbewerber und historischen Ranking-Daten werden mitgelöscht (Cascade)

## Technical Requirements
- Security: RLS-Policy stellt sicher, dass nur Mitglieder des eigenen Tenants Lese-/Schreibzugriff haben
- Performance: Projekt-Übersicht lädt in < 500ms
- Validierung: Domain-Format (valide URL/Hostname), Sprachcode (ISO 639-1), Ländercode (ISO 3166-1 alpha-2)

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

### Komponentenstruktur

```
Keyword Projects Workspace (neue Seite: /tools/keywords)
+-- Projekt-Übersicht (Liste als Cards)
|   +-- Projekt-Card
|       +-- Name, Ziel-Domain, Sprache/Region
|       +-- Metriken: # Keywords, # Wettbewerber, letzter Lauf
|       +-- Aktionen: Öffnen, Umbenennen, Deaktivieren
+-- "Neues Projekt" Button (nur Admin)
+-- Limit-Hinweis (z. B. "3/5 Projekte genutzt")
+-- Leer-Zustand: Erste-Schritte-Karte

Projekt-Detail View (öffnet bei Klick auf Card)
+-- Header: Projektname + Domain + Zurück-Link
+-- Tabs
|   +-- Keywords-Tab
|   |   +-- Keyword-Liste (Tabelle mit Löschen-Button)
|   |   +-- Keyword hinzufügen (Inline-Input + Button)
|   |   +-- Limit-Hinweis ("42/50 Keywords")
|   +-- Wettbewerber-Tab
|   |   +-- Wettbewerber-Liste (Tabelle mit Löschen-Button)
|   |   +-- Domain hinzufügen (Inline-Input + Button)
|   |   +-- Limit-Hinweis ("2/5 Wettbewerber")
|   +-- Einstellungen-Tab
|       +-- Projekt umbenennen
|       +-- Sprache / Region ändern
|       +-- Projekt deaktivieren / löschen
+-- Dialog: Projekt erstellen
+-- Dialog: Projekt löschen (Bestätigung mit Cascade-Warnung)
```

### Datenmodell

**Tabelle: `keyword_projects`**
- `id` — Eindeutige ID
- `tenant_id` — Zugehöriger Tenant (Datenisolation)
- `name` — Projektname (z. B. "Kunde Müller GmbH")
- `target_domain` — Ziel-Domain (normalisiert, z. B. `muellermbh.de`)
- `language_code` — ISO 639-1, z. B. `de`
- `country_code` — ISO 3166-1 alpha-2, z. B. `DE`
- `status` — `active` oder `inactive`
- `created_at` — Erstellungsdatum

**Tabelle: `keywords`**
- `id`, `project_id`, `tenant_id`, `keyword`, `created_at`
- Unique Constraint: `(project_id, keyword)` — kein Duplikat

**Tabelle: `competitor_domains`**
- `id`, `project_id`, `tenant_id`, `domain`, `created_at`
- Unique Constraint: `(project_id, domain)`

Cascade Delete: Projekt löschen → Keywords + Wettbewerber werden automatisch mitgelöscht.

### API-Routen

| Route | Methode | Zweck |
|-------|---------|-------|
| `/api/tenant/keywords/projects` | GET | Alle Projekte des Tenants |
| `/api/tenant/keywords/projects` | POST | Neues Projekt anlegen |
| `/api/tenant/keywords/projects/[id]` | GET | Einzelprojekt mit Counts |
| `/api/tenant/keywords/projects/[id]` | PATCH | Umbenennen / Status ändern |
| `/api/tenant/keywords/projects/[id]` | DELETE | Projekt + Cascade löschen |
| `/api/tenant/keywords/projects/[id]/keywords` | GET | Keywords laden |
| `/api/tenant/keywords/projects/[id]/keywords` | POST | Keyword hinzufügen |
| `/api/tenant/keywords/projects/[id]/keywords/[kwId]` | DELETE | Keyword löschen |
| `/api/tenant/keywords/projects/[id]/competitors` | GET | Wettbewerber laden |
| `/api/tenant/keywords/projects/[id]/competitors` | POST | Wettbewerber hinzufügen |
| `/api/tenant/keywords/projects/[id]/competitors/[cId]` | DELETE | Wettbewerber löschen |

### Technische Entscheidungen

- **Eigene DB-Tabellen** — persistente Datenhaltung, kein localStorage
- **Tenant-ID in allen Tabellen** — RLS-Policies brauchen direkten Zugriff für Datenisolation
- **`tenant-tools-workspace.tsx` erweitern** — bestehende Tools-Navigation wird genutzt
- **Modul-Buchung prüfen** — Zugang ist an gebuchtes Modul geknüpft (PROJ-15)
- **Limits serverseitig enforced** — 5 Projekte, 50 Keywords, 5 Wettbewerber (API-seitig geprüft)
- **Domain-Normalisierung** — `https://` und trailing slashes vor dem Speichern entfernen
- **Keine neuen npm-Pakete** — alle UI-Komponenten (Dialog, Table, Tabs, Input, Badge) bereits installiert

## QA Test Results

**Tested:** 2026-03-28
**App URL:** http://localhost:3000
**Tester:** QA Engineer (AI)
**Method:** Code review + build verification (no live browser session)

### Acceptance Criteria Status

#### AC-1: Admin kann ein Keyword-Projekt anlegen mit: Name, Ziel-Domain, Sprache, Land/Region
- [x] CreateProjectDialog hat Felder: Name, Ziel-Domain, Sprache (Select mit 8 Optionen), Land/Region (Select mit 10 Optionen)
- [x] POST /api/tenant/keywords/projects validiert mit Zod: name (min 1, max 100), target_domain (Domain-Regex), language_code, country_code
- [x] Frontend normalisiert Domain (entfernt https://, www., trailing slashes, lowercase)
- [ ] BUG: Modul-Code-Mismatch verhindert Zugang komplett (siehe BUG-1)

#### AC-2: Bis zu 5 Projekte pro Tenant (MVP-Limit)
- [x] PROJECT_LIMIT = 5 serverseitig enforced in POST-Route (Zeile 98-109)
- [x] Frontend zeigt "X/5 Projekte" Badge
- [x] Frontend deaktiviert "Neues Projekt" Button bei Limit
- [x] Limit-Warnung als Alert bei erreichtem Limit

#### AC-3: Einem Projekt koennen bis zu 50 Keywords hinzugefuegt werden
- [x] KEYWORD_LIMIT = 50 serverseitig enforced in POST-Route (Zeile 97-104)
- [x] Bulk-Import unterstuetzt via `{ keywords: string[] }` (max 50 pro Request)
- [x] Frontend zeigt "X/50" Badge und deaktiviert Input bei Limit
- [x] Fehlermeldung mit aktuellem Count bei Ueberschreitung

#### AC-4: Einem Projekt koennen bis zu 5 Wettbewerber-Domains hinzugefuegt werden
- [x] COMPETITOR_LIMIT = 5 serverseitig enforced in POST-Route (Zeile 99-110)
- [x] Frontend zeigt "X/5" Badge und deaktiviert Input bei Limit

#### AC-5: Keywords und Wettbewerber koennen einzeln geloescht werden
- [x] DELETE /api/tenant/keywords/projects/[id]/keywords/[kwId] implementiert
- [x] DELETE /api/tenant/keywords/projects/[id]/competitors/[cId] implementiert
- [x] Beide DELETE-Routes pruefen project_id + tenant_id (kein Cross-Tenant-Loeschen)
- [x] UI zeigt Trash-Icon pro Zeile mit Lade-Spinner

#### AC-6: Projekte koennen umbenannt oder deaktiviert werden
- [x] PATCH /api/tenant/keywords/projects/[id] erlaubt: name, language_code, country_code, status
- [x] SettingsTab hat eigenes Rename-Formular, Sprache/Region-Formular, Status-Toggle
- [x] Deaktivieren/Aktivieren Button in Settings (nur fuer Admin im UI)
- [ ] BUG: API erlaubt Member-Zugriff auf PATCH/DELETE (siehe BUG-2)

#### AC-7: Jedes Projekt zeigt Uebersicht: Anzahl Keywords, Wettbewerber, letzter Tracking-Lauf
- [x] GET /api/tenant/keywords/projects gibt keyword_count und competitor_count via Supabase count-Aggregation
- [x] Projekt-Cards zeigen "X Keywords", "X Wettbewerber"
- [x] last_tracking_run wird angezeigt wenn vorhanden

#### AC-8: Daten sind strikt Tenant-isoliert
- [x] Alle DB-Tabellen haben tenant_id mit Foreign Key
- [x] Alle API-Queries filtern nach tenant_id
- [x] RLS-Policies erlauben nur SELECT fuer eigene Tenant-Members
- [x] INSERT/UPDATE/DELETE via RLS komplett gesperrt (nur service_role/admin-client)
- [x] DELETE-Routes pruefen tenant_id zusaetzlich zur project_id

### Edge Cases Status

#### EC-1: Duplikat-Keyword im selben Projekt
- [x] UNIQUE Constraint (project_id, keyword) in DB
- [x] API gibt 409 mit "Ein oder mehrere Keywords existieren bereits." bei Code 23505

#### EC-2: Domain ohne https:// eingegeben
- [x] Frontend normalizeDomain() entfernt https://, www., trailing slashes
- [x] Backend validiert mit striktem Domain-Regex (nur lowercase hostname)
- [ ] BUG: Backend normalisiert NICHT vor Validierung (siehe BUG-3)

#### EC-3: Projekt-Limit erreicht
- [x] Klare Fehlermeldung mit Hinweis auf Loeschen oder Support

#### EC-4: Keyword-Limit (50) erreicht
- [x] Klare Fehlermeldung mit aktuellem Count und Limit

#### EC-5: Wettbewerber-Domain identisch mit Ziel-Domain
- [x] Backend prueft in POST /competitors: `parsed.data.domain === project.target_domain`
- [x] Frontend prueft ebenfalls via normalizeDomain() Vergleich
- [x] Toast-Meldung bei identischer Domain

#### EC-6: Projekt wird geloescht -- Cascade
- [x] DB: ON DELETE CASCADE auf keywords.project_id und competitor_domains.project_id
- [x] Delete-Dialog warnt explizit ueber Cascade-Loeschung
- [x] Bestaetigung erforderlich ("Endgueltig loeschen" Button)

### Security Audit Results

- [x] Authentication: Alle Routes pruefen requireTenantUser() -- kein Zugriff ohne Login
- [x] Tenant-Isolation: Alle Queries filtern nach tenant_id aus x-tenant-id Header (Proxy-gesetzt, nicht spoofbar)
- [x] RLS: INSERT/UPDATE/DELETE via RLS gesperrt (nur service_role) -- Defense-in-Depth
- [x] Input Validation: Zod-Schemas auf allen POST/PATCH-Routes
- [x] SQL Injection: Supabase Query Builder verwendet parametrisierte Queries
- [x] XSS: React-Rendering escaped Ausgaben automatisch
- [ ] BUG: Fehlende Admin-Rollenprüfung auf API-Ebene fuer schreibende Projekt-Operationen (siehe BUG-2)
- [ ] BUG: Kein Rate-Limiting auf schreibenden Endpoints (siehe BUG-4)
- [x] Header-Spoofing: x-tenant-id wird im Proxy sanitisiert (PROJ-21 verifiziert)
- [x] Cascade Delete: Verhindert verwaiste Datensaetze

### Cross-Browser / Responsive (Code-Review-Basis)

- [x] Mobile (375px): `flex-col` / `sm:flex-row` Responsive-Klassen auf Header, Grid `sm:grid-cols-2 lg:grid-cols-3`
- [x] Tablet (768px): sm-Breakpoints greifen fuer 2-spaltige Card-Darstellung
- [x] Desktop (1440px): 3-spaltige Card-Darstellung (lg:grid-cols-3)
- [x] Dialog: sm:max-w-md begrenzt Breite, rounded-[24px]
- [x] Tabellen: Datum-Spalte versteckt auf Mobil (`hidden sm:table-cell`)
- Hinweis: Kein Live-Browser-Test moeglich, Bewertung basiert auf Code-Analyse der Tailwind-Klassen

### Bugs Found

#### BUG-1: Modul-Code-Mismatch -- Feature komplett gesperrt (CRITICAL)
- **Severity:** Critical
- **Steps to Reproduce:**
  1. Tenant bucht das Modul "Keyword Rankings" (DB-Code: `keyword_tracking`)
  2. Navigiere zu /tools/keywords
  3. Expected: Workspace wird angezeigt
  4. Actual: Lockscreen "Keyword Rankings ist noch gesperrt" wird IMMER angezeigt
- **Root Cause:** `page.tsx` Zeile 12 prueft `activeModuleCodes.includes('keyword_rankings')`, aber der DB-Modul-Code ist `keyword_tracking` (geseedet in Migration 018). Ebenso in `tenant-shell-navigation.tsx` Zeile 52: `moduleCode: 'keyword_rankings'` statt `'keyword_tracking'`.
- **Betroffene Dateien:**
  - `/Users/tobi/TRAE/boosthive-new/src/app/tools/keywords/page.tsx` (Zeile 12)
  - `/Users/tobi/TRAE/boosthive-new/src/components/tenant-shell-navigation.tsx` (Zeile 52)
- **Priority:** Fix before deployment -- Feature ist komplett unbenutzbar

#### BUG-2: Fehlende Admin-Rollenprüfung auf API-Ebene (MEDIUM)
- **Severity:** Medium
- **Steps to Reproduce:**
  1. Logge dich als Member ein (nicht Admin)
  2. Sende direkt: `POST /api/tenant/keywords/projects` mit gueltigem Body
  3. Expected: 403 Forbidden (nur Admin darf Projekte erstellen)
  4. Actual: 201 Created -- Projekt wird angelegt
- **Details:** Die UI versteckt "Neues Projekt", Umbenennen, Deaktivieren und Loeschen fuer Members. Aber die API-Routes verwenden `requireTenantUser` statt `requireTenantAdmin`, sodass Members durch direkten API-Aufruf schreibende Operationen ausfuehren koennen (POST projects, PATCH, DELETE).
- **Hinweis:** Die Spec sagt "Admin kann ein Keyword-Projekt anlegen", aber "Member moechte Keywords und Wettbewerber hinzufuegen". Die Abgrenzung ist nicht ganz klar. Keywords/Wettbewerber-CRUD fuer Members ist vermutlich gewuenscht, aber Projekt-Create/Delete/StatusToggle sollte Admin-only sein.
- **Priority:** Fix before deployment

#### BUG-3: Backend normalisiert Domain nicht vor Validierung (LOW)
- **Severity:** Low
- **Steps to Reproduce:**
  1. Sende direkt: `POST /api/tenant/keywords/projects` mit `target_domain: "https://Example.DE/"`
  2. Expected: Domain wird normalisiert zu "example.de" und akzeptiert
  3. Actual: 422 Validierungsfehler ("Ungueltige Domain")
- **Details:** Das Frontend normalisiert korrekt, aber der Backend-Validator akzeptiert nur bereits normalisierte Domains. Bei direkten API-Aufrufen (z.B. durch Integrationen oder Tests) wird die Domain abgelehnt, wenn sie nicht vorher normalisiert wurde. Dasselbe gilt fuer den Wettbewerber-POST-Endpoint.
- **Priority:** Nice to have -- Frontend normalisiert bereits

#### BUG-4: Kein Rate-Limiting auf schreibenden Endpoints (LOW)
- **Severity:** Low
- **Steps to Reproduce:**
  1. Sende 100 POST-Requests an /api/tenant/keywords/projects/[id]/keywords in schneller Folge
  2. Expected: Rate-Limiting greift
  3. Actual: Alle Requests werden verarbeitet (bis zum Keyword-Limit)
- **Details:** Schreibende Endpoints (POST keywords, POST competitors, POST/PATCH/DELETE projects) haben kein Rate-Limiting. Das Limit-System verhindert zwar Daten-Explosion, aber ein Angreifer koennte schnell viele Schreib-Operationen ausloesen.
- **Priority:** Fix in next sprint

#### BUG-5: target_domain nicht aenderbar nach Erstellung (LOW)
- **Severity:** Low
- **Steps to Reproduce:**
  1. Erstelle ein Projekt mit target_domain "old-domain.de"
  2. Versuche die Domain in den Einstellungen zu aendern
  3. Expected: Domain kann geaendert werden
  4. Actual: Kein Eingabefeld fuer Domain-Aenderung vorhanden
- **Details:** Das PATCH-Schema erlaubt nur name, language_code, country_code, status. target_domain fehlt. Die UI hat auch kein Feld dafuer. Dies koennte beabsichtigt sein (Domain als unveraenderlicher Projekt-Identifier), sollte aber dokumentiert werden.
- **Priority:** Nice to have -- ggf. by-design

### Summary
- **Acceptance Criteria:** 7/8 passed (1 blockiert durch BUG-1)
- **Edge Cases:** 5/6 bestanden (1 Minor: EC-2 Backend-Normalisierung)
- **Bugs Found:** 5 total (1 Critical, 1 Medium, 3 Low)
- **Security:** Tenant-Isolation solide, RLS korrekt, aber fehlende Admin-Rollenprüfung auf API-Ebene
- **Build:** Erfolgreich (keine TypeScript- oder ESLint-Fehler)
- **Production Ready:** NEIN
- **Recommendation:** BUG-1 (Modul-Code-Mismatch) und BUG-2 (Admin-Rollenprüfung) muessen vor Deployment gefixt werden. BUG-1 macht das Feature komplett unbenutzbar.

## Deployment
_To be added by /deploy_
