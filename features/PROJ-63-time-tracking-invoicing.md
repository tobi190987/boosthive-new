# PROJ-63: Time Tracking & Client-Invoicing

## Overview
Zeiterfassung pro Kunde und Projekt für Agentur-Mitarbeiter, kombiniert mit einer einfachen Rechnungsgenerierung an Endkunden. Agenturen können billable hours tracken, Stundensätze hinterlegen und daraus monatliche Rechnungen als PDF erstellen. Kein vollständiges Buchhaltungssystem — fokus auf Zeiterfassung und Rechnungs-PDF.

## User Stories

### Als Agentur-Mitarbeiter möchte ich
- **STORY-1:** Meine Arbeitszeit pro Kunde und Tätigkeit per Timer oder manueller Eingabe erfassen können, damit meine Stunden korrekt abgerechnet werden
- **STORY-2:** Meine eigenen Zeiteinträge einsehen und korrigieren können (innerhalb von 48h)
- **STORY-3:** Sehen, wie viele Stunden ich diese Woche/diesen Monat pro Kunde gearbeitet habe

### Als Agentur-Admin möchte ich
- **STORY-4:** Die Zeiteinträge aller Mitarbeiter pro Kunde einsehen und für die Abrechnung exportieren können
- **STORY-5:** Stundensätze pro Mitarbeiter oder Tätigkeitstyp hinterlegen können
- **STORY-6:** Aus den Zeiteinträgen eines Monats automatisch eine Rechnung generieren können (PDF mit Agentur-Briefkopf)
- **STORY-7:** Den Abrechnungsstatus pro Rechnung tracken (Entwurf → Versendet → Bezahlt)

## Acceptance Criteria

### AC-1: Zeit erfassen
- **GIVEN** ich bin eingeloggt als Mitarbeiter
- **WHEN** ich auf „Zeit erfassen" klicke
- **THEN** kann ich eingeben: Kunde, Tätigkeitstyp (aus Liste: SEO, Content, Ads, Meeting, Sonstiges), Beschreibung (optional), Datum, Dauer (manuell in h:mm) oder Start/Stop-Timer
- **AND** der Eintrag erscheint in meiner Tages-/Wochenübersicht

### AC-2: Timer-Funktion
- **GIVEN** ich starte einen Timer für einen Kunden
- **WHEN** ich den Timer stoppe
- **THEN** wird die Dauer automatisch berechnet und ein Zeiteintrag vorausgefüllt
- **AND** ein laufender Timer ist in der Navigation sichtbar (Indikator + verstrichene Zeit)

### AC-3: Zeitübersicht (Mitarbeiter)
- **GIVEN** ich bin auf der Zeiterfassungs-Seite
- **WHEN** ich die Wochenansicht öffne
- **THEN** sehe ich alle meine Einträge der Woche gruppiert nach Tag
- **AND** eine Summe pro Tag und Gesamtsumme der Woche wird angezeigt
- **AND** ich kann zwischen Wochen- und Monatsansicht wechseln

### AC-4: Zeitübersicht (Admin)
- **GIVEN** ich bin Admin und öffne die Abrechnungsübersicht
- **WHEN** ich einen Kunden und Monat auswähle
- **THEN** sehe ich alle Zeiteinträge aller Mitarbeiter für diesen Kunden im gewählten Monat
- **AND** gruppiert nach Mitarbeiter und Tätigkeitstyp mit Stunden-Summen
- **AND** ein CSV-Export aller Einträge ist möglich

### AC-5: Stundensätze konfigurieren
- **GIVEN** ich bin Admin und öffne die Einstellungen
- **WHEN** ich Stundensätze konfiguriere
- **THEN** kann ich pro Tätigkeitstyp einen Standard-Stundensatz hinterlegen (€/h)
- **AND** optional pro Mitarbeiter einen abweichenden Stundensatz

### AC-6: Rechnung generieren
- **GIVEN** ich bin Admin und habe Zeiteinträge eines Monats für einen Kunden
- **WHEN** ich auf „Rechnung erstellen" klicke
- **THEN** wird eine Rechnungs-Vorschau generiert mit: Agentur-Briefkopf (Logo, Adresse aus Tenant-Einstellungen), Kunden-Adresse, Rechnungsnummer (auto-inkrementiert), Leistungspositionen (Tätigkeitstyp, Stunden, Stundensatz, Betrag), Gesamtbetrag netto + MwSt. + brutto
- **AND** die Rechnung kann als PDF heruntergeladen werden

### AC-7: Rechnungsstatus
- **GIVEN** eine Rechnung wurde erstellt
- **WHEN** ich die Rechnungsübersicht öffne
- **THEN** sehe ich alle Rechnungen mit Status: `Entwurf` → `Versendet` → `Bezahlt` → `Storniert`
- **AND** ich kann den Status manuell aktualisieren

## Edge Cases

### EC-1: Timer läuft bei Logout
- **WHEN** ein Mitarbeiter ausloggt während ein Timer läuft
- **THEN** wird der Timer gestoppt und ein Zeiteintrag mit aktueller Dauer gespeichert
- **AND** eine Benachrichtigung beim nächsten Login: „Timer wurde automatisch gestoppt"

### EC-2: Zeiteintrag bearbeiten nach 48h
- **WHEN** ein Mitarbeiter einen Eintrag älter als 48h bearbeiten möchte
- **THEN** ist die Bearbeitung gesperrt (nur Admin kann korrigieren)
- **AND** eine Meldung erklärt die Sperrfrist

### EC-3: Kein Stundensatz hinterlegt
- **WHEN** kein Stundensatz für einen Tätigkeitstyp konfiguriert wurde
- **THEN** zeigt die Rechnungsvorschau „0,00 €" für diese Position mit Warn-Hinweis
- **AND** der Admin kann den Stundensatz direkt in der Vorschau nachtragen

### EC-4: Rechnungsnummer bereits vergeben
- **WHEN** eine Rechnung storniert und neu erstellt wird
- **THEN** erhält sie eine neue Rechnungsnummer (keine Wiederverwendung)
- **AND** die stornierte Rechnung bleibt im System erhalten

### EC-5: Keine Zeiteinträge für gewählten Monat
- **WHEN** für einen Kunden in einem Monat keine Zeiteinträge vorhanden sind
- **THEN** ist der „Rechnung erstellen"-Button deaktiviert mit Tooltip: „Keine Zeiteinträge für diesen Monat"

## Technical Requirements

### Database Schema
```sql
CREATE TABLE time_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) NOT NULL,
  customer_id UUID REFERENCES customers(id),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  activity_type TEXT NOT NULL,
  -- 'seo', 'content', 'ads', 'meeting', 'other'
  description TEXT,
  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  duration_minutes INTEGER NOT NULL, -- in Minuten
  timer_started_at TIMESTAMP, -- für laufende Timer
  hourly_rate NUMERIC(8,2), -- zum Zeitpunkt der Erfassung eingefroren
  is_billable BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE hourly_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) NOT NULL,
  activity_type TEXT, -- NULL = gilt für alle
  user_id UUID REFERENCES auth.users(id), -- NULL = gilt für alle
  rate NUMERIC(8,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'EUR',
  valid_from DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) NOT NULL,
  customer_id UUID REFERENCES customers(id) NOT NULL,
  invoice_number TEXT NOT NULL UNIQUE,
  invoice_month DATE NOT NULL, -- Erster Tag des Abrechnungsmonats
  status TEXT NOT NULL DEFAULT 'draft',
  -- 'draft', 'sent', 'paid', 'cancelled'
  subtotal NUMERIC(12,2) NOT NULL,
  tax_rate NUMERIC(5,2) DEFAULT 19.0,
  tax_amount NUMERIC(12,2),
  total NUMERIC(12,2),
  pdf_url TEXT,
  line_items JSONB NOT NULL, -- Snapshot der Positionen
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_time_entries_tenant_customer ON time_entries(tenant_id, customer_id);
CREATE INDEX idx_time_entries_user_date ON time_entries(user_id, entry_date);
CREATE INDEX idx_invoices_tenant ON invoices(tenant_id, invoice_month);
```

### API Endpoints
- `GET /api/tenant/time-entries` — Einträge (Filter: user, customer, date-range)
- `POST /api/tenant/time-entries` — Eintrag anlegen
- `PUT /api/tenant/time-entries/[id]` — Eintrag bearbeiten (48h-Sperre für Members)
- `DELETE /api/tenant/time-entries/[id]` — Eintrag löschen
- `POST /api/tenant/time-entries/timer/start` — Timer starten
- `POST /api/tenant/time-entries/timer/stop` — Timer stoppen
- `GET /api/tenant/invoices` — Rechnungsübersicht
- `POST /api/tenant/invoices` — Rechnung generieren (aus Zeiteinträgen)
- `GET /api/tenant/invoices/[id]/pdf` — PDF generieren/herunterladen
- `PATCH /api/tenant/invoices/[id]/status` — Status aktualisieren
- `GET /api/tenant/hourly-rates` — Stundensätze
- `PUT /api/tenant/hourly-rates` — Stundensätze speichern

### Module Code
`time_tracking`

### PDF-Generierung
- Bibliothek: `@react-pdf/renderer` oder `puppeteer` (serverseitig)
- Template: Briefkopf aus Tenant-Einstellungen, Positionen-Tabelle, MwSt.-Berechnung
- Gespeichert in Supabase Storage, URL in `invoices.pdf_url`

## Dependencies
- **PROJ-29:** Customer Database — Kundenzuordnung
- **PROJ-6:** RBAC — Members können nur eigene Einträge bearbeiten
- **PROJ-13:** Tenant Detail Management — Agentur-Adresse für Rechnungsbriefkopf
- **PROJ-56:** Portfolio-Übersicht — Stunden-Indicator auf Kunden-Karten

## Success Metrics
- >50% der Tenants mit Team-Mitgliedern nutzen Zeiterfassung aktiv
- Durchschnittlich >10 Zeiteinträge/Mitarbeiter/Woche
- >30% der Tenants generieren mindestens eine Rechnung pro Monat

## Non-Goals
- Keine Buchhaltungs-Integration (DATEV, Lexoffice)
- Keine automatische Zahlung oder Stripe-Integration für Endkunden-Rechnungen
- Kein Projektbudget-Tracking in Stunden (nur €-Budgets in PROJ-57)
- Keine Urlaubsverwaltung oder HR-Funktionen

## Status
- **Status:** Planned
- **Created:** 2026-04-11
