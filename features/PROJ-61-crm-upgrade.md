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
- **Status:** In Progress
- **Created:** 2026-04-11
