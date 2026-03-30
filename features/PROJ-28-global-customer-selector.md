# PROJ-28: Globaler Kunden-Selektor

## Status: In Review
**Created:** 2026-03-30
**Last Updated:** 2026-03-30

## Dependencies
- Requires: PROJ-3 (User Authentication) — eingeloggte Tenant-Session
- Requires: PROJ-6 (RBAC) — Kunden-Verwaltung nur für Admins
- Requires: PROJ-9 (Tenant Dashboard Shell) — Header/Navigation als Integrationsort
- Requires: PROJ-10, PROJ-11, PROJ-12, PROJ-25, PROJ-27 — Analyse-Tools, die customer_id verwenden sollen

## Übersicht

Innerhalb des Tenant-Workspaces (Agentur-Umgebung) verwalten Agenturen mehrere eigene End-Kunden. Ein **globaler Kunden-Selektor** im Header ermöglicht es, einen aktiven Kunden zu wählen. Alle Analyse-Tools (SEO, AI Performance, AI Visibility, Keyword Rankings) zeigen danach ausschließlich die Daten dieses Kunden.

## User Stories

1. Als **Admin**, möchte ich Kunden (Name, Domain, Status) anlegen und verwalten, damit ich für jeden Kunden separate Analyse-Daten speichern kann.
2. Als **Admin oder Member**, möchte ich im Header jederzeit sehen, welcher Kunde gerade aktiv ist, damit ich nicht versehentlich falsche Daten bearbeite.
3. Als **Admin oder Member**, möchte ich den aktiven Kunden über ein Dropdown mit Suchfunktion wechseln, damit ich schnell zwischen vielen Kunden navigieren kann.
4. Als **Admin oder Member**, möchte ich nach einem Seiten-Reload noch denselben aktiven Kunden sehen (Persistenz via localStorage), damit ich nicht bei jedem Besuch neu wählen muss.
5. Als **Admin oder Member**, der noch keinen Kunden gewählt hat, möchte ich auf den Analyse-Seiten einen klaren Empty State sehen ("Bitte wählen Sie zuerst einen Kunden aus"), damit ich weiß, was zu tun ist.
6. Als **Admin**, möchte ich den Status eines Kunden (Aktiv / Pausiert) sehen, damit ich sofort erkenne, ob der Kunde gerade betreut wird.

## Acceptance Criteria

### Kunden-Verwaltung (Datenmodell)
- [ ] Tabelle `customers` mit Feldern: `id`, `tenant_id`, `name`, `domain` (optional), `status` (`active` | `paused`), `created_at`, `updated_at`
- [ ] RLS: Kunden sind strikt auf den eigenen Tenant begrenzt (kein Cross-Tenant-Zugriff)
- [ ] API `GET /api/tenant/customers` — Liste aller Kunden des Tenants (Name, Domain, Status)
- [ ] API `POST /api/tenant/customers` — Kunden anlegen (nur Admin)
- [ ] API `PATCH /api/tenant/customers/[id]` — Kunden bearbeiten (nur Admin)
- [ ] API `DELETE /api/tenant/customers/[id]` — Kunden löschen (nur Admin, Soft Delete bevorzugt)

### Kunden-Selektor UI
- [ ] `CustomerSelectorDropdown`-Komponente im Tenant-Header (Desktop: Sidebar-Top-Bereich oder Mobile-Header), immer sichtbar
- [ ] Zeigt den aktiven Kunden-Namen an; wenn keiner gewählt: Placeholder "Kunden wählen..."
- [ ] Status-Indikator als farbiger Punkt: Grün (active), Grau (paused)
- [ ] Dropdown enthält eine Suchleiste, die nach Name und Domain filtert (client-side)
- [ ] Dropdown listet alle Kunden mit Name, Domain (falls vorhanden) und Status-Punkt
- [ ] Klick auf Kunden im Dropdown → setzt aktiven Kunden im Context und speichert im localStorage

### ActiveCustomerContext
- [ ] React Context `ActiveCustomerContext` stellt `{ activeCustomer, setActiveCustomer }` bereit
- [ ] Provider wird in `TenantAppShell` eingebettet
- [ ] Beim Mounten wird der gespeicherte `customer_id` aus localStorage geladen und der passende Kunde aus der API geladen/gesetzt
- [ ] Wenn ein Customer-Wechsel stattfindet, triggert der Context eine Re-Render aller konsumierenden Komponenten

### Empty State
- [ ] Komponente `NoCustomerSelected` mit CTA "Kunden auswählen" (öffnet Dropdown oder leitet zu Kunden-Verwaltung)
- [ ] Alle Analyse-Seiten (SEO, AI Performance, AI Visibility, Keyword Rankings) prüfen `activeCustomer !== null` und zeigen ggf. `NoCustomerSelected`

### API-Integration
- [ ] Alle bestehenden Analyse-API-Calls akzeptieren und validieren optional einen `customer_id` Query-Parameter
- [ ] Frontend-Komponenten übergeben die `activeCustomer.id` automatisch an alle Analyse-API-Calls

## Edge Cases

- **Kein Kunde vorhanden:** Agentur hat noch keinen Kunden angelegt → Selektor zeigt "Noch keine Kunden" + Link zur Kunden-Verwaltung
- **Gespeicherter Kunde existiert nicht mehr:** localStorage enthält eine alte `customer_id`, die gelöscht wurde → Selektor fällt auf "Kunden wählen..." zurück und löscht den localStorage-Eintrag
- **Member ohne Kunden:** Wenn ein Member auf die App zugreift und noch nie ein Kunde gewählt wurde → Empty State auf Analyse-Seiten
- **Viele Kunden:** Dropdown mit 50+ Kunden → Suchfunktion muss performant filtern (kein API-Call, rein client-side)
- **Kunden-Wechsel während aktiver Analyse:** Wenn eine Analyse läuft und der Nutzer den Kunden wechselt → laufende Anfragen abbrechen, neue Daten für neuen Kunden laden
- **Soft Delete:** Gelöschter Kunde taucht nicht mehr in der Liste auf; verknüpfte Analysen bleiben erhalten (historische Daten)
- **Cross-Tenant-Isolation:** Kunden von Tenant A dürfen nie für Tenant B sichtbar sein (RLS sicherstellen)

## Technical Requirements

- Performance: Kunden-Liste lädt in < 300ms (paginated bei > 100 Kunden)
- localStorage Key: `boosthive_active_customer_{tenant_slug}` (tenant-spezifisch, damit Multi-Tab korrekt funktioniert)
- Suchfunktion: client-side, debounced 200ms
- Context-Wechsel löst keine Seiten-Navigation aus (SPA-Verhalten: nur Daten-Refetch)
- Sicherheit: `customer_id` in API-Calls wird serverseitig validiert, dass der Kunde zum Tenant gehört

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

### Komponenten-Struktur

```
TenantAppShell (Server Component — unverändert)
└── ActiveCustomerProvider (neuer Client Provider, wraps alles)
    ├── TenantSidebar
    │   └── CustomerSelectorDropdown  ← NEU, direkt unter dem Tenant-Logo (Option A)
    │       ├── Trigger: Aktiver Kunde (Name + Status-Punkt) oder "Kunden wählen..."
    │       └── Popover/Dropdown (shadcn Command)
    │           ├── Suchfeld (client-side, debounced 200ms)
    │           └── Kunden-Liste
    │               └── KundeItem (Name, Domain, Status-Punkt)
    ├── TenantMobileHeader
    │   └── CustomerSelectorDropdown  ← selbe Komponente, mobil
    └── main (Seiten-Inhalt)
        ├── Analyse-Seiten: prüfen activeCustomer → zeigen Daten ODER NoCustomerSelected
        └── NoCustomerSelected  ← NEU
            └── CTA: "Kunden auswählen" oder "Kunden verwalten"

Neue Seite: /tools/customers (Kunden-Verwaltung, nur Admin)
└── CustomersManagementWorkspace  ← NEU
    ├── CustomerTable (Liste aller Kunden)
    ├── CustomerDialog (Anlegen / Bearbeiten — nutzt Dialog aus shadcn/ui)
    │   └── Felder: Name, Domain (optional), Status
    └── DeleteConfirmDialog (Soft Delete mit Bestätigung)
```

### Datenmodell

Neue Tabelle `customers`:
- `id` (UUID, Primärschlüssel)
- `tenant_id` (UUID, Fremdschlüssel → Tenant)
- `name` (Text, Pflicht)
- `domain` (Text, optional)
- `status` (Enum: `active` | `paused`)
- `created_at`, `updated_at` (Timestamps)
- `deleted_at` (Timestamp, null = aktiv — Soft Delete)

RLS sichert strenge Tenant-Isolation (kein Cross-Tenant-Zugriff).

localStorage Key: `boosthive_active_customer_{tenant_slug}` (tenant-spezifisch).

### ActiveCustomerContext

Client-seitiger React Context, eingebettet in `TenantAppShell`:
- Hält `{ activeCustomer, setActiveCustomer }` (id, name, domain, status)
- Beim Mount: localStorage-Eintrag laden → mit API validieren (Kunde noch aktiv?) → bei Fehler: automatisch zurückfallen auf null
- Kunden-Wechsel: löst keine Navigation aus, nur Daten-Refetch in konsumierenden Komponenten

### API-Endpunkte (neu)

| Methode | Route | Berechtigung |
|---------|-------|--------------|
| GET | `/api/tenant/customers` | Admin + Member |
| POST | `/api/tenant/customers` | Admin only |
| PATCH | `/api/tenant/customers/[id]` | Admin only |
| DELETE | `/api/tenant/customers/[id]` | Admin only (Soft Delete) |

Bestehende Analyse-APIs erhalten optionalen `customer_id` Query-Parameter; serverseitige Validierung stellt sicher, dass Kunde zum Tenant gehört.

### Technische Entscheidungen

| Entscheidung | Begründung |
|---|---|
| React Context + localStorage | Kein Reload beim Wechsel, saubere URL |
| Soft Delete | Historische Analyse-Daten bleiben erhalten |
| Client-side Suche | Kein API-Call pro Tastendruck, performant bis 100+ Kunden |
| shadcn `Command` + `Popover` | Bereits installiert, eingebaute Suchfunktion |
| Separate Seite `/tools/customers` | Trennung: "Wählen" (Header) vs. "Verwalten" (Admin-Seite) |

### Neue Pakete

Keine. Alle shadcn/ui-Komponenten bereits installiert: `Popover`, `Command`, `Dialog`, `Badge`, `Table`.

## Backend Implementation Notes

### Migration
- `supabase/migrations/024_customers.sql` — Tabelle `customers` mit Soft Delete, RLS (SELECT für aktive Tenant-Members; INSERT/UPDATE/DELETE via Service-Role in API), Indizes auf `tenant_id` und `(tenant_id, status)`.

### API-Routen (neu)
- `GET /api/tenant/customers` — Liste aller aktiven Kunden (Admin + Member)
- `POST /api/tenant/customers` — Anlegen (nur Admin, `requireTenantAdmin`)
- `PATCH /api/tenant/customers/[id]` — Bearbeiten (nur Admin, Soft-Delete-Filter)
- `DELETE /api/tenant/customers/[id]` — Soft Delete via `deleted_at` (nur Admin)

### Rate-Limiting
- `CUSTOMERS_READ`: 60 req/min pro Tenant+IP
- `CUSTOMERS_WRITE`: 30 req/min pro Tenant+IP

### Validierung
- Zod-Schemas: `createCustomerSchema` / `updateCustomerSchema` in den jeweiligen Routen
- `domain` ist optional/nullable; `status` ist Enum `active | paused`

### Offene Aufgabe
- Migration `024_customers.sql` manuell im Supabase Dashboard (SQL Editor) anwenden — CLI-Link fehlt noch.

## QA Test Results

**Tested:** 2026-03-30
**App URL:** http://localhost:3000
**Tester:** QA Engineer (AI)
**Build Status:** Erfolgreich (npm run build ohne Fehler)

### Acceptance Criteria Status

#### AC-1: Kunden-Verwaltung (Datenmodell)
- [x] Tabelle `customers` mit Feldern: `id`, `tenant_id`, `name`, `domain` (optional), `status` (`active` | `paused`), `created_at`, `updated_at` -- Migration 024_customers.sql korrekt, zusaetzlich `created_by` und `deleted_at` vorhanden
- [x] RLS: Kunden sind strikt auf den eigenen Tenant begrenzt -- SELECT-Policy prueft tenant_members-Zugehoerigkeit; INSERT/UPDATE/DELETE per RLS gesperrt (nur Service-Role via API)
- [x] API `GET /api/tenant/customers` -- implementiert in route.ts, filtert nach tenant_id und deleted_at IS NULL, sorted by name
- [x] API `POST /api/tenant/customers` -- implementiert, requireTenantAdmin, Zod-Validierung, setzt created_by
- [x] API `PATCH /api/tenant/customers/[id]` -- implementiert, requireTenantAdmin, Soft-Delete-Filter, 404 bei nicht gefundenem Kunden
- [x] API `DELETE /api/tenant/customers/[id]` -- implementiert als Soft Delete (setzt deleted_at), requireTenantAdmin

#### AC-2: Kunden-Selektor UI
- [x] `CustomerSelectorDropdown`-Komponente im Tenant-Header (Desktop: Sidebar direkt unter Tenant-Logo), immer sichtbar
- [x] Zeigt den aktiven Kunden-Namen an; wenn keiner gewaehlt: Placeholder "Kunden waehlen..."
- [x] Status-Indikator als farbiger Punkt: Gruen (active via bg-emerald-500), Grau (paused via bg-slate-300)
- [x] Dropdown enthaelt eine Suchleiste (via shadcn CommandInput), die nach Name und Domain filtert (client-side, CommandItem value enthaelt Name + Domain)
- [x] Dropdown listet alle Kunden mit Name, Domain (falls vorhanden) und Status-Punkt
- [x] Klick auf Kunden im Dropdown setzt aktiven Kunden im Context und speichert im localStorage

#### AC-3: ActiveCustomerContext
- [x] React Context `ActiveCustomerContext` stellt `{ activeCustomer, setActiveCustomer }` bereit (plus customers, loading, refetchCustomers)
- [x] Provider wird in `TenantAppShell` eingebettet (Zeile 25 tenant-app-shell.tsx)
- [x] Beim Mounten wird der gespeicherte customer_id aus localStorage geladen und der passende Kunde aus der API geladen/gesetzt (useEffect in active-customer-context.tsx)
- [x] Wenn ein Customer-Wechsel stattfindet, triggert der Context eine Re-Render (useMemo-basierte value, setState triggers)

#### AC-4: Empty State
- [x] Komponente `NoCustomerSelected` mit CTA "Kunden verwalten" (Link zu /tools/customers) wenn keine Kunden vorhanden
- [ ] **BUG:** Alle Analyse-Seiten (SEO, AI Performance, AI Visibility, Keyword Rankings) pruefen `activeCustomer !== null` NICHT und zeigen NICHT `NoCustomerSelected` -- die Integration in die Analyse-Seiten fehlt komplett

#### AC-5: API-Integration
- [ ] **BUG:** Keine der bestehenden Analyse-APIs akzeptiert oder validiert einen `customer_id` Query-Parameter -- SEO, AI Performance, AI Visibility und Keyword-APIs wurden nicht angepasst
- [ ] **BUG:** Frontend-Komponenten uebergeben die `activeCustomer.id` NICHT an Analyse-API-Calls -- kein useActiveCustomer in Analyse-Workspace-Komponenten

### Edge Cases Status

#### EC-1: Kein Kunde vorhanden
- [x] Selektor zeigt "Noch keine Kunden" (customer-selector-dropdown.tsx Zeile 74)
- [ ] **BUG:** Kein Link zur Kunden-Verwaltung im Selektor-Dropdown selbst -- der Dropdown zeigt nur "Noch keine Kunden angelegt." als leere Nachricht

#### EC-2: Gespeicherter Kunde existiert nicht mehr
- [x] Korrekt behandelt: localStorage wird geleert und Selektor faellt auf "Kunden waehlen..." zurueck (active-customer-context.tsx Zeilen 95-100)

#### EC-3: Member ohne Kunden
- [ ] **BUG:** Empty State auf Analyse-Seiten fehlt (siehe AC-4)

#### EC-4: Viele Kunden (50+)
- [x] Client-side Suche via shadcn Command -- performant da kein API-Call
- [x] API begrenzt auf 500 Kunden (.limit(500))

#### EC-5: Kunden-Wechsel waehrend aktiver Analyse
- [ ] **BUG:** Nicht implementiert -- da die Analyse-Seiten den ActiveCustomerContext nicht nutzen, gibt es keinen Mechanismus zum Abbrechen laufender Anfragen bei Kundenwechsel

#### EC-6: Soft Delete
- [x] Geloeschter Kunde taucht nicht mehr in der Liste auf (API filtert deleted_at IS NULL)
- [x] Verknuepfte Analysen bleiben erhalten (Soft Delete setzt nur deleted_at)

#### EC-7: Cross-Tenant-Isolation
- [x] RLS-Policy auf customers-Tabelle prueft tenant_members-Zugehoerigkeit
- [x] API-Routen pruefen tenant_id via x-tenant-id Header + requireTenantUser/requireTenantAdmin
- [x] INSERT/UPDATE/DELETE per RLS komplett gesperrt (nur Service-Role hat Zugriff)

### Security Audit Results

- [x] **Authentication:** Alle Endpunkte pruefen Auth via requireTenantUser / requireTenantAdmin
- [x] **Authorization (RBAC):** POST/PATCH/DELETE nur fuer Admins (requireTenantAdmin), GET fuer alle Tenant-Members
- [x] **Cross-Tenant-Isolation:** Doppelt gesichert durch RLS (tenant_members check) UND API-Layer (tenant_id filter)
- [x] **Input-Validierung:** Zod-Schemas fuer Create und Update, Name max 200 Zeichen, Domain max 500 Zeichen
- [x] **Rate Limiting:** CUSTOMERS_READ (60/min), CUSTOMERS_WRITE (30/min), pro Tenant+IP
- [x] **Soft Delete Sicherheit:** Geloeschte Kunden koennen nicht erneut geloescht oder bearbeitet werden (deleted_at IS NULL filter)
- [x] **SQL Injection:** Kein rohes SQL, Supabase Query Builder genutzt
- [x] **XSS:** React escaped Output automatisch, keine dangerouslySetInnerHTML
- [ ] **BUG (Low):** DELETE-Endpunkt gibt 204 zurueck auch wenn der Kunde nicht existiert (kein rowCount-Check) -- kein Sicherheitsproblem, aber inkonsistentes API-Verhalten
- [ ] **BUG (Low):** PATCH-Endpunkt erlaubt leeres Update-Objekt (alle Felder optional) -- setzt nur updated_at, kein Fehler

### Bugs Found

#### BUG-1: Analyse-Seiten zeigen keinen Empty State bei fehlendem Kunden
- **Severity:** High
- **Steps to Reproduce:**
  1. Gehe zu /tools/seo-analyse, /tools/ai-performance, /tools/ai-visibility oder /tools/keywords
  2. Kein Kunde ist im Selektor gewaehlt
  3. Expected: `NoCustomerSelected`-Komponente wird angezeigt mit CTA "Kunden auswaehlen"
  4. Actual: Die Analyse-Seiten laden normal ohne Kundenbezug -- kein Hinweis, dass ein Kunde gewaehlt werden muss
- **Priority:** Fix before deployment
- **Betroffene Dateien:** src/components/ai-performance-workspace.tsx, sowie alle Analyse-Workspace-Komponenten fuer SEO, AI Visibility, Keywords

#### BUG-2: Analyse-APIs akzeptieren keinen customer_id Parameter
- **Severity:** High
- **Steps to Reproduce:**
  1. Rufe z.B. GET /api/tenant/seo/analyze?customer_id=xxx auf
  2. Expected: API validiert customer_id gehoert zum Tenant und filtert Daten nach Kunde
  3. Actual: customer_id wird komplett ignoriert; Analyse-Daten haben keinen Kundenbezug
- **Priority:** Fix before deployment
- **Betroffene Dateien:** Alle API-Routen unter src/app/api/tenant/seo/, src/app/api/tenant/visibility/, src/app/api/tenant/keywords/, src/app/api/tenant/performance/

#### BUG-3: Frontend uebergibt activeCustomer.id nicht an API-Calls
- **Severity:** High
- **Steps to Reproduce:**
  1. Waehle einen Kunden im Selektor
  2. Oeffne eine Analyse-Seite (z.B. AI Performance)
  3. Pruefe Network-Tab im Browser
  4. Expected: API-Calls enthalten customer_id als Query-Parameter
  5. Actual: Kein customer_id wird uebergeben
- **Priority:** Fix before deployment
- **Betroffene Dateien:** Alle Analyse-Workspace-Komponenten

#### BUG-4: Kein Link zur Kunden-Verwaltung im leeren Dropdown
- **Severity:** Low
- **Steps to Reproduce:**
  1. Neuer Tenant ohne Kunden
  2. Oeffne den Kunden-Selektor-Dropdown
  3. Expected: Link/CTA zur Kunden-Verwaltung (/tools/customers)
  4. Actual: Nur Text "Noch keine Kunden angelegt." ohne Aktion
- **Priority:** Nice to have

#### BUG-5: DELETE gibt 204 auch fuer nicht-existente Kunden
- **Severity:** Low
- **Steps to Reproduce:**
  1. Sende DELETE /api/tenant/customers/non-existent-uuid
  2. Expected: 404 Not Found
  3. Actual: 204 No Content (Supabase update matched 0 rows, kein Fehler)
- **Priority:** Nice to have

#### BUG-6: PATCH erlaubt leeres Update-Objekt
- **Severity:** Low
- **Steps to Reproduce:**
  1. Sende PATCH /api/tenant/customers/[id] mit leerem Body {}
  2. Expected: 400 Bad Request (mindestens ein Feld muss angegeben werden)
  3. Actual: 200 OK, nur updated_at wird geaendert
- **Priority:** Nice to have

#### BUG-7: Mobile Header zeigt CustomerSelectorDropdown nicht direkt
- **Severity:** Medium
- **Steps to Reproduce:**
  1. Oeffne App auf Mobile (375px)
  2. Der Kunden-Selektor ist NICHT direkt im Mobile-Header sichtbar
  3. Er ist nur im Sheet (Hamburger-Menu) zugaenglich, da NavigationContent den Selektor enthaelt
  4. Expected laut Spec: CustomerSelectorDropdown auch im Mobile-Header direkt sichtbar
  5. Actual: Nur im ausgeklappten Sheet sichtbar
- **Priority:** Fix in next sprint

### Cross-Browser Testing (Code Review)
- [x] Chrome: shadcn/ui Komponenten sind cross-browser kompatibel
- [x] Firefox: Keine browser-spezifischen CSS-Features genutzt
- [x] Safari: Keine bekannten Inkompatibilitaeten

### Responsive Testing (Code Review)
- [x] Desktop (1440px): Sidebar mit CustomerSelectorDropdown korrekt
- [x] Tablet (768px): Sidebar collapsed, Mobile-Header mit Sheet
- [ ] Mobile (375px): BUG-7 -- Selektor nur im Sheet erreichbar, nicht im Header

### Regression Testing
- [x] Build kompiliert fehlerfrei (npm run build erfolgreich)
- [x] /tools/customers Seite existiert und ist geroutet
- [x] Navigation zeigt "Kunden" fuer Admins unter "Verwaltung"
- [x] Bestehende Features (Sidebar, Dashboard, Auth) nicht beeintraechtigt

### Summary
- **Acceptance Criteria:** 14/19 passed (5 failed)
- **Bugs Found:** 7 total (0 critical, 3 high, 1 medium, 3 low)
- **Security:** PASS -- Alle Sicherheitsanforderungen erfuellt (Auth, RBAC, RLS, Rate Limiting, Input Validation)
- **Production Ready:** NEIN
- **Recommendation:** Die 3 High-Severity Bugs (BUG-1, BUG-2, BUG-3) muessen vor dem Deployment behoben werden. Sie betreffen die Kernfunktionalitaet: die Integration des Kunden-Selektors in die Analyse-Tools. Die Kunden-Verwaltung (CRUD) und der Selektor selbst funktionieren einwandfrei.

## Deployment
_To be added by /deploy_
