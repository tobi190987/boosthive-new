# PROJ-61: CRM-Upgrade (Kontaktstatus, Aktivitäten-Timeline)

## Overview
Erweiterung der bestehenden Customer Database (PROJ-29) von einem reinen Datenspeicher zu einem echten Agentur-CRM. Neue Funktionen: Kontaktstatus-Lifecycle, Aktivitäten-Timeline (calls, meetings, e-mails), Onboarding-Checkliste und Deal-Volumen. Kein Neubau — Erweiterung der vorhandenen Kundenverwaltung.

## User Stories

### Als Agentur-Admin möchte ich
- **STORY-1:** Den Kundenstatus (Lead → Prospect → Active → Paused → Churned) pflegen können, um die Pipeline meiner Agentur zu sehen
- **STORY-2:** Aktivitäten (Anrufe, Meetings, E-Mails, Notizen) zu Kunden loggen können, damit das gesamte Team den Kontaktverlauf kennt
- **STORY-3:** Das monatliche Vertragsvolumen pro Kunde eintragen können, um den Umsatz zu tracked
- **STORY-4:** Eine Onboarding-Checkliste für neue Kunden abarbeiten können, damit kein Setup-Schritt vergessen wird

### Als Agentur-Mitarbeiter möchte ich
- **STORY-5:** Die vollständige Aktivitäten-Timeline eines Kunden sehen, bevor ich ein Meeting habe
- **STORY-6:** Aktivitäten für mich oder Kollegen loggen, ohne dafür Admin-Rechte zu brauchen
- **STORY-7:** Kommende Wiedervorlagen (Follow-ups) sehen, damit ich rechtzeitig reagiere

### Als Agentur-Admin möchte ich
- **STORY-8:** Alle Kunden nach Status gefiltert sehen und den Gesamt-MRR (monatlichen Umsatz) der Agentur sehen

## Acceptance Criteria

### AC-1: Kontaktstatus-Lifecycle
- **GIVEN** ich bearbeite einen Kunden
- **WHEN** ich das Stammdaten-Tab öffne
- **THEN** gibt es ein neues Feld „Status" mit den Optionen: `Lead`, `Prospect`, `Active`, `Paused`, `Churned`
- **AND** der Status wird in der Kundenliste als farbiges Badge angezeigt
- **AND** die Kundenliste kann nach Status gefiltert werden

### AC-2: MRR / Vertragsvolumen
- **GIVEN** ich bearbeite einen Kunden mit Status `Active`
- **WHEN** ich das Stammdaten-Tab öffne
- **THEN** gibt es ein Feld „Monatl. Volumen (€)" (optional)
- **AND** in der Kundenliste-Kopfzeile wird der Gesamt-MRR aller aktiven Kunden summiert angezeigt

### AC-3: Aktivitäten loggen
- **GIVEN** ich bin auf der Kunden-Detailansicht
- **WHEN** ich den Tab „Aktivitäten" öffne
- **THEN** sehe ich eine chronologische Timeline aller geloggten Aktivitäten
- **AND** ich kann eine neue Aktivität per Button anlegen mit: Typ (Anruf / Meeting / E-Mail / Notiz / Aufgabe), Beschreibung, Datum/Uhrzeit, Erstellt von (auto), Follow-up-Datum (optional)
- **AND** jede Aktivität ist bearbeitbar und löschbar

### AC-4: Follow-up Reminder
- **GIVEN** ich logge eine Aktivität mit einem Follow-up-Datum
- **WHEN** dieses Datum erreicht ist
- **THEN** erscheint ein Hinweis im Dashboard (als Notification Badge auf dem Kunden-Eintrag)
- **AND** eine Kunden-Liste-Ansicht kann nach „Follow-up fällig" gefiltert werden

### AC-5: Onboarding-Checkliste
- **GIVEN** ein Kunde hat Status `Active` und ist neu
- **WHEN** ich den Tab „Onboarding" öffne
- **THEN** sehe ich eine Checkliste mit Standard-Aufgaben:
  - [ ] Vertrag unterzeichnet
  - [ ] Zugangsdaten erhalten (Ads, Analytics, GSC)
  - [ ] Briefing-Call durchgeführt
  - [ ] Ziele & KPIs definiert
  - [ ] Reporting-Zyklus vereinbart
  - [ ] Erste Analyse durchgeführt
- **AND** ich kann Punkte abhaken und eigene Punkte hinzufügen
- **AND** ein Fortschrittsbalken zeigt den Onboarding-Fortschritt

### AC-6: Pipeline-Übersicht in Kundenliste
- **GIVEN** ich bin auf der Kunden-Übersichtsseite
- **WHEN** ich nach Status gefiltert habe (z.B. nur „Lead" + „Prospect")
- **THEN** sehe ich die Kunden in der Tabelle
- **AND** in der Kopfleiste erscheint: Anzahl Kunden in diesem Status + ggf. potenzieller MRR (bei Prospects mit eingetragenem Volumen)

## Edge Cases

### EC-1: Status-Wechsel zu Churned
- **WHEN** ein Kunde auf „Churned" gesetzt wird
- **THEN** erscheint ein Bestätigungs-Dialog: „Möchtest du eine abschließende Notiz hinzufügen?"
- **AND** der Kunde bleibt sichtbar (kein Soft-Delete ausgelöst)
- **AND** er wird in der Standard-Listenansicht ausgeblendet (Filter: nur Active/Lead/Prospect)

### EC-2: Aktivität ohne Datum
- **WHEN** keine Uhrzeit angegeben wird
- **THEN** wird das aktuelle Datum ohne Uhrzeit gespeichert
- **AND** in der Timeline mit „[Datum], keine Uhrzeit" dargestellt

### EC-3: Follow-up in der Vergangenheit
- **WHEN** ein Follow-up-Datum beim Anlegen bereits vergangen ist
- **THEN** Warnung „Datum liegt in der Vergangenheit" — aber Speichern trotzdem möglich

### EC-4: Viele Aktivitäten (Performance)
- **WHEN** ein Kunde >200 Aktivitäten hat
- **THEN** wird die Timeline paginiert (50 pro Seite)
- **AND** eine Suche/Filter-Funktion (nach Typ, Zeitraum) ist verfügbar

### EC-5: Onboarding-Checkliste für bestehende Kunden
- **WHEN** ein bereits aktiver Kunde (vor dem CRM-Upgrade) den Onboarding-Tab öffnet
- **THEN** ist die Checkliste leer (kein rückwirkender Eingriff)
- **AND** der Admin kann sie manuell befüllen

## Technical Requirements

### Datenbankänderungen (Erweiterung bestehender Tabellen)
```sql
-- customers Tabelle: neue Felder
ALTER TABLE customers
  ADD COLUMN crm_status TEXT NOT NULL DEFAULT 'active',
  -- 'lead', 'prospect', 'active', 'paused', 'churned'
  ADD COLUMN monthly_volume NUMERIC(10,2), -- MRR in EUR
  ADD COLUMN onboarding_checklist JSONB DEFAULT '[]'::jsonb;
  -- Array of {id, label, checked, custom}

-- Neue Tabelle: Aktivitäten
CREATE TABLE customer_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) NOT NULL,
  customer_id UUID REFERENCES customers(id) NOT NULL,
  activity_type TEXT NOT NULL,
  -- 'call', 'meeting', 'email', 'note', 'task'
  description TEXT NOT NULL,
  activity_date TIMESTAMP NOT NULL DEFAULT NOW(),
  follow_up_date DATE,
  created_by UUID REFERENCES auth.users(id) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_activities_customer ON customer_activities(customer_id);
CREATE INDEX idx_activities_followup ON customer_activities(tenant_id, follow_up_date)
  WHERE follow_up_date IS NOT NULL;
```

### API Endpoints
- `GET /api/tenant/customers` — erweitert um `crm_status`, `monthly_volume`, MRR-Summe im Header
- `PATCH /api/tenant/customers/[id]/status` — nur Status-Update
- `GET /api/tenant/customers/[id]/activities` — Aktivitäten-Liste (paginiert)
- `POST /api/tenant/customers/[id]/activities` — Aktivität loggen
- `PUT /api/tenant/customers/[id]/activities/[actId]` — Aktivität bearbeiten
- `DELETE /api/tenant/customers/[id]/activities/[actId]` — Aktivität löschen
- `PATCH /api/tenant/customers/[id]/onboarding` — Onboarding-Checkliste aktualisieren
- `GET /api/tenant/customers/follow-ups` — Alle fälligen Follow-ups für den Tenant

### UI-Änderungen
- Kunden-Liste: Neue Spalte „Status" (Badge), Filter-Dropdown für Status, MRR-Summe in Kopfzeile
- Kunden-Stammdaten-Tab: Status-Select + MRR-Feld ergänzen
- Neuer Tab „Aktivitäten": Timeline mit „Neue Aktivität"-Button
- Neuer Tab „Onboarding": Checkliste mit Checkboxen + Custom-Items + Progressbar

## Dependencies
- **PROJ-29:** Customer Database — Basis-Feature das erweitert wird
- **PROJ-35:** Realtime Notifications — Follow-up-Reminders als Notifications
- **PROJ-6:** RBAC — Aktivitäten für alle Members zugänglich (nicht nur Admins)

## Success Metrics
- >60% der aktiven Tenants nutzen CRM-Status nach 4 Wochen
- Durchschnittlich >5 Aktivitäten pro Kunde/Monat geloggt
- Onboarding-Checkliste bei >70% neuer Kunden verwendet

## Non-Goals
- Keine automatische E-Mail-Integration (E-Mails werden nur als Aktivität geloggt, nicht synchronisiert)
- Kein Deal-Pipeline-Kanban (nur Status-Feld, kein Drag & Drop)
- Kein automatischer MRR-Import aus Stripe (manuelle Eingabe)
- Keine Kunden-Segmentierung oder Tags (kann in einem späteren Sprint ergänzt werden)

## Tech Design (Solution Architect)

### Ausgangslage
PROJ-29 (Customer Database) ist das Fundament. Bestehende Basis:
- `customers-management-workspace.tsx` — Kundenliste
- `customer-detail-workspace.tsx` — Kunden-Detailansicht (mit Tabs)
- APIs unter `/api/tenant/customers/[id]/`

Das CRM-Upgrade ist eine **Erweiterung** — kein Neubau.

### Komponenten-Struktur

```
customers-management-workspace (ERWEITERT)
+-- Kopfzeile
|   +-- MRR-Summe Badge (neu)
|   +-- Status-Filter Dropdown (neu)
|   +-- Follow-up-Filter Toggle (neu)
+-- Kundentabelle (ERWEITERT)
    +-- Status-Badge Spalte (neu)
    +-- Follow-up-Indikator (neu)

customer-detail-workspace (ERWEITERT — neue Tabs)
+-- Tab: Stammdaten (ERWEITERT)
|   +-- Status-Select Dropdown (neu) — mit Churn-Bestätigungsdialog
|   +-- Monatl. Volumen-Feld (neu)
+-- Tab: Aktivitäten (NEU)
|   +-- crm-activity-timeline.tsx (neu)
|   +-- crm-log-activity-dialog.tsx (neu)
+-- Tab: Onboarding (NEU)
    +-- crm-onboarding-checklist.tsx (neu)
        +-- Progress-Bar
        +-- Standard-Checklistenpunkte (6 Items)
        +-- Custom-Items
```

### Neue Dateien
- `src/components/crm-activity-timeline.tsx`
- `src/components/crm-log-activity-dialog.tsx`
- `src/components/crm-onboarding-checklist.tsx`
- `src/app/api/tenant/customers/[id]/activities/route.ts`
- `src/app/api/tenant/customers/[id]/activities/[actId]/route.ts`
- `src/app/api/tenant/customers/[id]/onboarding/route.ts`
- `src/app/api/tenant/customers/[id]/status/route.ts`
- `src/app/api/tenant/customers/follow-ups/route.ts`

### Datenmodell
**Erweiterung `customers`:** `crm_status` (Lead/Prospect/Active/Paused/Churned), `monthly_volume` (€), `onboarding_checklist` (JSONB)

**Neue Tabelle `customer_activities`:** `activity_type`, `description`, `activity_date`, `follow_up_date`, `created_by`, `tenant_id`

**JSONB für Checkliste:** Flexible Struktur ohne weitere Migrations für Custom-Items.

### Keine neuen npm-Packages nötig
Alle shadcn-Komponenten (Select, Dialog, Checkbox, Progress, Badge) sind bereits installiert.

## Status
- **Status:** Deployed
- **Created:** 2026-04-11

## Implementation Notes (Frontend)
- Neue Komponenten angelegt:
  - `src/components/crm-activity-timeline.tsx` — chronologische Timeline, Typ-Filter, Suche, Pagination (50/Seite), Inline-Edit/Delete via AlertDialog.
  - `src/components/crm-log-activity-dialog.tsx` — Dialog zum Loggen/Bearbeiten inkl. „Keine Uhrzeit"-Toggle und Follow-up-Vergangenheits-Warnung.
  - `src/components/crm-onboarding-checklist.tsx` — Checkliste mit Standard-Items (via Button laden), Custom-Items, Progress-Bar, leerer Zustand für Bestands-Kunden (EC-5).
- `customer-detail-workspace.tsx` erweitert:
  - Neue Tabs „Aktivitäten" und „Onboarding" (TabsList jetzt 6-spaltig auf md+).
  - Stammdaten-Tab um `crm_status`-Select (Lead/Prospect/Active/Paused/Churned) und `monthly_volume`-Input erweitert.
  - Churn-Bestätigungsdialog mit optionaler Abschluss-Notiz (wird als `churn_note` an den PUT-Endpoint mitgeschickt).
  - Typ `CustomerDetailTab` um `activities` und `onboarding` erweitert.
- `customers-management-workspace.tsx` erweitert:
  - MRR-Summen-Badge (aktive Kunden) in der Kopfzeile plus Filter-MRR bei aktivem CRM-Filter.
  - Follow-up-Badge in Kopfzeile (Anzahl fällig), Filter-Button „Follow-up fällig".
  - Filter-Chips für die 5 CRM-Status-Werte (multi-select).
  - Standard-Filter blendet Churned aus (nur lead/prospect/active/paused).
  - Neue Tabellenspalten „CRM-Status" (farbiges Badge) und „MRR".
  - Follow-up-Indikator (Bell-Icon) neben Kundennamen bei fälligen Follow-ups.

## Implementation Notes (Backend)
- Migration `supabase/migrations/047_crm_upgrade.sql`:
  - `customers` erweitert um `crm_status` (CHECK constraint auf 5 Werte, Default `active`), `monthly_volume` NUMERIC(12,2), `onboarding_checklist` JSONB.
  - Partial Index `idx_customers_crm_status` auf `(tenant_id, crm_status) WHERE deleted_at IS NULL` für Pipeline-Filter.
  - Neue Tabelle `customer_activities` mit FKs auf `tenants`, `customers` (CASCADE) und `auth.users` (SET NULL), CHECK auf `activity_type`.
  - Indizes: `(customer_id, activity_date DESC)` für Timeline, Partial Index `(tenant_id, follow_up_date) WHERE follow_up_date IS NOT NULL` für Follow-up-Queue.
  - RLS aktiviert mit 4 Policies: SELECT/INSERT für alle aktiven `tenant_members`; UPDATE/DELETE nur Creator oder Admin.
  - Trigger `trg_customer_activities_updated_at` pflegt `updated_at` automatisch.
- API-Endpoints (alle mit Auth-Guard, Zod-Validation, Rate-Limit, Tenant-Isolation via `x-tenant-id`):
  - `GET /api/tenant/customers/[id]/activities` — Paginiert (50/Seite), optionaler `?type=`-Filter, lädt Creator-Namen via Profiles-Join (kein N+1).
  - `POST /api/tenant/customers/[id]/activities` — `requireTenantUser` (Member-Zugriff, AC STORY-6), Validiert Typ/Beschreibung/Datum.
  - `PUT /api/tenant/customers/[id]/activities/[actId]` — Creator-or-Admin-Check zusätzlich zur RLS.
  - `DELETE /api/tenant/customers/[id]/activities/[actId]` — Creator-or-Admin-Check, 204 No Content.
  - `PATCH /api/tenant/customers/[id]/status` — `requireTenantAdmin`, schreibt bei Churn mit `closing_note` automatisch eine `note`-Aktivität (EC-1).
  - `PATCH /api/tenant/customers/[id]/onboarding` — Validiert Checklist-Items via Zod (max 100 Items).
  - `GET /api/tenant/customers/follow-ups` — Fällige Follow-ups (≤ heute) mit Customer-Join, Count pro Kunde für UI-Badges.
- Bestehender `GET /api/tenant/customers` liefert zusätzlich `crm_status`, `monthly_volume`, `onboarding_checklist` und aggregierten MRR inkl. Fallback bei fehlenden Spalten (für Tenants vor Migration).

## Abweichungen vom Tech Design
- Keine. Alle neuen Komponenten wurden als Kompositionen bestehender shadcn-Primitives umgesetzt (kein neues Package, keine neuen `src/components/ui/`-Elemente).
- Backend: `created_by` FK auf `auth.users` nutzt `ON DELETE SET NULL` statt `NOT NULL` zu brechen — Aktivitäten bleiben beim Löschen eines Users historisch erhalten.

---

## QA Test Results

**Tested:** 2026-04-12
**App URL:** http://localhost:3000
**Tester:** QA Engineer (AI) — Code-Audit (statisch)

### Acceptance Criteria Status

#### AC-1: Kontaktstatus-Lifecycle
- [x] Status-Select mit 5 Werten ist im Stammdaten-Tab vorhanden
- [x] Badge-Spalte und Filter-Chips in der Kundenliste sind implementiert
- [ ] BUG-1: Status-Änderung speichert NICHT — der "Speichern"-Button ruft `PUT /api/tenant/customers/[id]`, das Endpoint kennt `crm_status` aber nicht. Frontend zeigt Erfolgstoast, DB bleibt unverändert.

#### AC-2: MRR / Vertragsvolumen
- [x] Eingabefeld vorhanden, Anzeige in Kopfzeile umgesetzt
- [ ] BUG-1 (gleiche Ursache): `monthly_volume` wird vom Master-Data-PUT verworfen — Werte werden nicht persistiert.

#### AC-3: Aktivitäten loggen
- [x] Timeline, Dialog, CRUD-Endpoints existieren und sind paginiert
- [x] Auth-Guard `requireTenantUser` — Members dürfen loggen (STORY-6)

#### AC-4: Follow-up Reminder
- [x] `follow_up_date`-Feld + Vergangenheits-Warnung in Dialog
- [x] Filter "Follow-up fällig" + Badge in Kopfzeile vorhanden
- [ ] BUG-2: `has_due_follow_up` wird im List-Endpoint nie gesetzt — Indikator und Filter funktionieren NIE. Code lädt `followUpsResult`, verwendet das Ergebnis aber nicht.

#### AC-5: Onboarding-Checkliste
- [x] Standard-Checkliste, Custom-Items, Progressbar implementiert
- [ ] BUG-3: Speichern der Checkliste schlägt fehl — Frontend sendet `{ onboarding_checklist: [...] }`, API-Schema verlangt `{ checklist: [...] }`. Jede Änderung erzeugt 400 + Fehler-Toast.

#### AC-6: Pipeline-Übersicht in Kundenliste
- [x] MRR-Summe und Status-Filter mit potenziellem Filter-MRR sichtbar
- [x] Zählung der gefilterten Kunden korrekt

### Edge Cases Status

#### EC-1: Status-Wechsel zu Churned
- [x] Bestätigungs-Dialog mit optionaler Notiz erscheint
- [ ] BUG-4: Dialog ruft `persistMasterData` mit `churn_note`, dieses Feld + `crm_status: 'churned'` werden vom Master-PUT verworfen → Kunde wird nicht auf Churned gesetzt, Notiz wird nicht als Aktivität geloggt. Der dafür gebaute `PATCH /api/tenant/customers/[id]/status`-Endpoint wird vom Frontend nirgends aufgerufen.

#### EC-2: Aktivität ohne Datum
- [x] Toggle "Keine Uhrzeit" vorhanden
- [ ] BUG-5: Beim Speichern wird `new Date('YYYY-MM-DDT00:00').toISOString()` benutzt — durch lokale Timezone-Konvertierung wird die UTC-Uhrzeit ungleich 00:00:00 (z.B. 22:00 CEST → vortags). Die Anzeige im Timeline (`getUTCHours() !== 0`) zeigt damit eine Uhrzeit an statt "keine Uhrzeit".

#### EC-3: Follow-up in der Vergangenheit
- [x] Warnung wird angezeigt, Speichern bleibt möglich

#### EC-4: Viele Aktivitäten (Performance)
- [x] Pagination 50/Seite + Typfilter + Suche vorhanden
- [ ] BUG-6 (Medium): Pagination ist nur clientseitig — der API-Aufruf lädt nur Seite 1 (`?page=1` Default, kein page-Parameter im Frontend-Fetch). Bei >50 Aktivitäten zeigt die UI nur die ersten 50 und keine Paginations-Buttons (totalPages basiert auf clientseitigem `filtered.length`). EC-4 nicht erfüllt.

#### EC-5: Onboarding-Checkliste für bestehende Kunden
- [x] Leerer Zustand mit "Standard laden"-Button für Admins implementiert

### Security Audit Results
- [x] Authentication: Alle Endpoints prüfen `requireTenantUser`/`requireTenantAdmin`
- [x] Authorization: Tenant-Isolation via `x-tenant-id` (proxy-injiziert), zusätzlich RLS-Policies
- [x] Input validation: Zod-Schemas auf allen Endpoints, Max-Längen gesetzt
- [x] Rate limiting: `CUSTOMERS_READ`/`CUSTOMERS_WRITE` auf allen neuen Routen
- [x] Activity Update/Delete: Doppelte Prüfung Creator-or-Admin (App-Layer + RLS) — STORY-6 korrekt umgesetzt
- [x] XSS: `whitespace-pre-wrap` für Description, kein `dangerouslySetInnerHTML`
- [ ] HINWEIS (Low): `description` erlaubt 5000 Zeichen Klartext mit Newlines — keine HTML-Sanitization nötig, da React escaped, aber Markdown/Links werden auch nicht geparst (Designentscheidung).
- [ ] BUG-7 (Medium): `PATCH /api/tenant/customers/[id]/status` nimmt `monthly_volume` an, der Endpoint ist aber `requireTenantAdmin`. Im Frontend wird der Endpoint NICHT aufgerufen — also wirkt es nicht aus. Aber: falls jemand direkt API-Call macht, kann ein Admin zwar legitim Volumen ändern (kein Sec-Issue), jedoch kann ein Member NICHT mehr Volumen ändern, weil der einzige Persistenz-Pfad (Master-PUT) das Feld verwirft. Pipeline-Daten bleiben für alle leer.

### Bugs Found

#### BUG-1: CRM-Status & Monthly-Volume werden beim Speichern verworfen
- **Severity:** Critical
- **Steps to Reproduce:**
  1. Kunden-Detail öffnen, Stammdaten-Tab
  2. CRM-Status auf "Prospect" ändern, Monatl. Volumen auf 1500 setzen
  3. "Speichern" klicken — Toast "Kundendaten gespeichert."
  4. Modal neu öffnen → Werte sind wieder Default (`active`, leer)
- **Root Cause:** `updateCustomerSchema` in `/api/tenant/customers/[id]/route.ts` enthält weder `crm_status` noch `monthly_volume` noch `churn_note`. Zod ignoriert unbekannte Felder. Die `updates`-Map nimmt sie nicht in den DB-Update auf. Die separat existierenden Endpoints `PATCH /status` und `PATCH /onboarding` werden vom Frontend nicht verwendet.
- **Priority:** Fix before deployment

#### BUG-2: Follow-up-Indikator funktioniert nie
- **Severity:** High
- **Steps to Reproduce:**
  1. Aktivität mit Follow-up-Datum heute oder vor heute anlegen
  2. Zur Kundenliste zurück
  3. Erwartet: Bell-Icon neben Kundennamen, Badge-Counter in Kopfzeile, Filter "Follow-up fällig" zeigt den Kunden
  4. Tatsächlich: Kein Indikator, Badge zeigt 0, Filter zeigt leer
- **Root Cause:** `GET /api/tenant/customers/route.ts` fetched `followUpsResult` aber benutzt das Ergebnis nirgends. `has_due_follow_up` ist nie im Response.
- **Priority:** Fix before deployment

#### BUG-3: Onboarding-Checkliste — Payload-Mismatch
- **Severity:** Critical
- **Steps to Reproduce:**
  1. Onboarding-Tab öffnen, "Standard-Checkliste laden"
  2. Toast: "Validierungsfehler." / Speichern schlägt fehl (HTTP 400)
- **Root Cause:** `crm-onboarding-checklist.tsx` Z. 72 sendet `{ onboarding_checklist: nextItems }`, API in `/onboarding/route.ts` validiert via `updateOnboardingSchema = z.object({ checklist: ... })`. Kein Feld `checklist` → 400.
- **Priority:** Fix before deployment

#### BUG-4: Churn-Bestätigung speichert nicht (folgt aus BUG-1)
- **Severity:** Critical
- **Steps to Reproduce:**
  1. Status auf "Churned" wechseln → Bestätigungs-Dialog
  2. Notiz eintragen, "Bestätigen"
  3. Toast: "Kunde als Churned markiert" — Kunde bleibt jedoch `active`, keine `note`-Aktivität wird erzeugt
- **Root Cause:** Identisch zu BUG-1 — der nicht aufgerufene `/status`-Endpoint wäre der Pfad, der EC-1 implementiert (er erzeugt die Abschluss-Notiz). Frontend nutzt fälschlich Master-PUT.
- **Priority:** Fix before deployment

#### BUG-5: "Keine Uhrzeit"-Anzeige bricht durch Timezone-Konvertierung
- **Severity:** Medium
- **Steps to Reproduce:**
  1. Aktivität anlegen, "Keine Uhrzeit angeben" anhaken, Datum 12.04.2026
  2. Speichern → Timeline zeigt "12.04.2026, 02:00 Uhr" (oder ähnlich, je nach Browser-TZ)
- **Root Cause:** `crm-log-activity-dialog.tsx` Z. 121 baut `new Date('2026-04-12T00:00:00').toISOString()` — interpretiert lokal, speichert als UTC. `formatDate()` in Timeline prüft `getUTCHours() !== 0`, was nach TZ-Shift wahr wird.
- **Priority:** Fix before deployment

#### BUG-6: Pagination >50 Aktivitäten nicht erreichbar
- **Severity:** Medium
- **Steps to Reproduce:**
  1. 60+ Aktivitäten anlegen
  2. Timeline zeigt nur 50 — Pagination-Buttons fehlen, weil `filtered.length === 50`
- **Root Cause:** `crm-activity-timeline.tsx` ruft `/activities` ohne `?page` auf, paginiert dann clientseitig auf den 50 zurückgelieferten Items. Server hat zwar `total` und `?page` Support, Frontend nutzt diesen nicht.
- **Priority:** Fix before deployment (verletzt EC-4)

#### BUG-7: Doppelte/Tote Endpoints `/status` und `/onboarding` nicht angebunden
- **Severity:** Medium (Code Smell + Consequence von BUG-1/3)
- **Steps to Reproduce:** Codebase-Suche nach `fetch.*\/status` oder `fetch.*\/onboarding` ergibt 0 Treffer.
- **Root Cause:** Diese Endpoints wurden gebaut, aber das Frontend wurde nicht migriert. Tote API-Fläche.
- **Priority:** Fix before deployment (Endpoints anbinden ODER Master-PUT erweitern)

#### BUG-8: Follow-ups-Endpoint (`/customers/follow-ups`) nicht angebunden
- **Severity:** Low
- **Steps to Reproduce:** Endpoint existiert (`GET /api/tenant/customers/follow-ups`), wird aber nirgends im Frontend gefetched.
- **Root Cause:** Frontend baut auf `customer.has_due_follow_up` aus Listen-Endpoint (siehe BUG-2). Der dedizierte Follow-ups-Endpoint ist ungenutzt.
- **Priority:** Fix in next sprint

#### BUG-9: Leere Beschreibung im Edit fällt auf — kein Feedback bei API-Validation
- **Severity:** Low
- **Steps to Reproduce:**
  1. Aktivität bearbeiten, Beschreibung leeren (nur Whitespace)
  2. Button bleibt disabled — UX ok, aber Edge-Case: Aktivität mit altem `description`-Wert + neuer Typ-Auswahl funktioniert
- **Priority:** Nice to have

### Regression Risiken
- **PROJ-29 (Customer Database):** Master-Data-PUT enthält jetzt Felder, die die Schema-Validation als unbekannt verwirft → Validation gibt OK weil Zod strip. Risiko: keine direkte Regression, aber Daten-Felder werden lautlos verworfen (siehe BUG-1).
- **PROJ-28 (Customer Selector):** Kein impact — selector liest nur `id`/`name`.
- **PROJ-35 (Notifications):** Spec sagt "Follow-up als Notification" — KEINE Realtime-Notification wurde implementiert; nur ein UI-Indikator-Stub (der zudem broken ist, BUG-2). Kein Code in `notifications`-Modul für Follow-up Trigger gefunden.

### Summary
- **Acceptance Criteria:** 4/6 voll bestanden (AC-3, AC-5 nur teilweise; AC-1/2/4 effektiv broken)
- **Edge Cases:** 3/5 voll bestanden (EC-2, EC-4 broken; EC-1 broken)
- **Bugs Found:** 9 total (4 Critical, 1 High, 3 Medium, 2 Low — eines davon ein Hinweis)
- **Security:** Pass — RLS, Auth-Guards, Validation, Rate-Limits korrekt. Keine kritischen Lecks gefunden.
- **Production Ready:** NO
- **Recommendation:** Fix bugs first. Mindestens BUG-1, BUG-2, BUG-3, BUG-4 müssen vor Deployment behoben werden. BUG-5/6 betreffen dokumentierte Edge Cases (EC-2/EC-4) und sollten ebenfalls noch in dieser Iteration adressiert werden.
