# PROJ-62: Client-Portal (Kunden-Login, Read-Only)

## Overview
Ein White-Label-Client-Portal, über das Endkunden der Agentur (die Kunden der Agentur) einen eigenen Read-Only-Zugang zu ihren Daten erhalten. Kunden sehen Reports, Dashboard-Metriken und freigegebene Inhalte — ohne Zugriff auf das interne Agentur-System. Jeder Tenant kann das Portal mit eigenem Branding versehen.

## User Stories

### Als Agentur-Admin möchte ich
- **STORY-1:** Für jeden meiner Kunden einen Portal-Zugang anlegen können (E-Mail + Einladung), damit sie ihre Daten selbst einsehen können
- **STORY-2:** Steuern können, welche Inhalte ein Kunde im Portal sieht (welche Reports, welche Metriken), um sensible Daten zu schützen
- **STORY-3:** Das Portal mit meinem Agentur-Logo und Farben branden können, damit es als Whitelabel-Produkt erscheint

### Als Endkunde (Client-Portal-User) möchte ich
- **STORY-4:** Meine aktuellen Marketing-Metriken (Traffic, Ads, Rankings) in einem übersichtlichen Dashboard sehen, ohne in mehrere Plattformen einloggen zu müssen
- **STORY-5:** Freigegebene Reports als PDF herunterladen können
- **STORY-6:** Freigaben (Content Briefs, Ad Texte) direkt im Portal kommentieren und bestätigen können

### Als System möchte ich
- **STORY-7:** Strikte Datentrennung sicherstellen — ein Client-Portal-User darf ausschließlich seine eigenen Daten sehen

## Acceptance Criteria

### AC-1: Client-Portal-Zugang anlegen
- **GIVEN** ich bin Admin und öffne einen Kunden in der Kundenverwaltung
- **WHEN** ich den Tab „Portal-Zugang" öffne
- **THEN** kann ich eine E-Mail-Adresse eingeben und eine Einladung versenden
- **AND** der Kunde erhält eine E-Mail mit einem Magic-Link zum Portal
- **AND** der Portal-User wird in einer eigenen Tabelle gespeichert (kein normaler Tenant-User)

### AC-2: Portal-Branding
- **GIVEN** ich bin Admin und öffne die Portal-Einstellungen
- **WHEN** ich das Branding konfiguriere
- **THEN** kann ich Logo, Primärfarbe und Agenturname einstellen
- **AND** das Portal zeigt beim Einloggen und in der Kopfleiste das Agentur-Branding (nicht BoostHive)

### AC-3: Portal-Dashboard (Read-Only)
- **GIVEN** ein Endkunde ist im Client-Portal eingeloggt
- **WHEN** er das Dashboard öffnet
- **THEN** sieht er seine freigeschalteten Metriken: Traffic (GA4), aktive Ads-Kampagnen (Spend, ROAS), Top-Keywords (GSC), aktueller SEO-Score
- **AND** alle Daten sind read-only — keine Bearbeitungsmöglichkeit
- **AND** die Navigation zeigt nur die vom Admin freigegebenen Bereiche

### AC-4: Report-Download im Portal
- **GIVEN** ein Report wurde vom Admin für den Kunden freigegeben
- **WHEN** der Endkunde den Bereich „Reports" öffnet
- **THEN** sieht er eine Liste aller freigegebenen Reports mit Datum
- **AND** kann jeden Report als PDF herunterladen

### AC-5: Freigaben im Portal
- **GIVEN** ein Content Brief oder Ad Text wurde zur Freigabe gesendet
- **WHEN** der Endkunde den Bereich „Freigaben" öffnet
- **THEN** sieht er alle ausstehenden Freigaben mit Inhalt
- **AND** kann mit einem Klick freigeben oder ablehnen (mit optionalem Kommentar)
- **AND** der Status wird sofort im Agentur-System aktualisiert

### AC-6: Sichtbarkeits-Steuerung
- **GIVEN** ich bin Admin und öffne Portal-Einstellungen für einen Kunden
- **WHEN** ich die Sichtbarkeit konfiguriere
- **THEN** kann ich per Toggle aktivieren/deaktivieren: GA4-Metriken, Ads-Daten, SEO-Rankings, Reports, Freigaben
- **AND** der Kunde sieht im Portal nur die aktivierten Bereiche

## Edge Cases

### EC-1: Endkunde vergisst Passwort
- **WHEN** ein Portal-User auf „Passwort vergessen" klickt
- **THEN** erhält er einen Reset-Link per E-Mail (separater Flow vom Agentur-User-Reset)

### EC-2: Admin löscht Kunden
- **WHEN** ein Kunde in der Kundenverwaltung soft-deleted wird
- **THEN** wird der Portal-Zugang sofort deaktiviert
- **AND** der Portal-User erhält bei nächstem Login eine Meldung: „Ihr Zugang wurde deaktiviert"

### EC-3: Keine Daten verfügbar
- **WHEN** ein Portal-User eingeloggt ist aber GA4/Ads nicht verbunden sind
- **THEN** zeigt das Dashboard leere Bereiche mit Platzhalter: „Daten werden vorbereitet"
- **AND** kein Fehler-Crash

### EC-4: Mehrere Endkunden für einen Kunden
- **WHEN** ein Agentur-Kunde mehrere Ansprechpartner hat
- **THEN** können mehrere Portal-User für denselben Kunden angelegt werden
- **AND** alle sehen dieselben Daten

### EC-5: Portal-URL
- **WHEN** ein Endkunde den Portal-Link aufruft
- **THEN** ist das Portal erreichbar unter `[subdomain].boost-hive.de/portal` oder einer konfigurierbaren Custom-Domain

## Technical Requirements

### Database Schema
```sql
CREATE TABLE client_portal_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) NOT NULL,
  customer_id UUID REFERENCES customers(id) NOT NULL,
  email TEXT NOT NULL,
  name TEXT,
  auth_user_id UUID, -- Supabase Auth User ID (separater User-Typ)
  is_active BOOLEAN DEFAULT true,
  invited_at TIMESTAMP DEFAULT NOW(),
  last_login TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE client_portal_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) NOT NULL UNIQUE,
  portal_logo_url TEXT,
  primary_color TEXT DEFAULT '#000000',
  agency_name TEXT,
  custom_domain TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE client_portal_visibility (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES customers(id) NOT NULL UNIQUE,
  show_ga4 BOOLEAN DEFAULT true,
  show_ads BOOLEAN DEFAULT true,
  show_seo BOOLEAN DEFAULT true,
  show_reports BOOLEAN DEFAULT true,
  show_approvals BOOLEAN DEFAULT true,
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_portal_users_tenant ON client_portal_users(tenant_id);
CREATE INDEX idx_portal_users_customer ON client_portal_users(customer_id);
```

### Neue Routen
- `src/app/portal/` — Separater App-Bereich für Portal (eigenes Layout ohne Tenant-Shell)
- `src/app/portal/login/page.tsx`
- `src/app/portal/dashboard/page.tsx`
- `src/app/portal/reports/page.tsx`
- `src/app/portal/approvals/page.tsx`

### API Endpoints
- `POST /api/portal/auth/invite` — Portal-User einladen
- `POST /api/portal/auth/login` — Portal-Login (Magic Link / Passwort)
- `GET /api/portal/dashboard` — Metriken für eingeloggten Portal-User
- `GET /api/portal/reports` — Freigegebene Reports
- `GET /api/portal/approvals` — Ausstehende Freigaben
- `POST /api/portal/approvals/[id]/approve` — Freigabe erteilen
- `POST /api/portal/approvals/[id]/reject` — Freigabe ablehnen
- `GET /api/tenant/portal/settings` — Portal-Einstellungen (Admin)
- `PUT /api/tenant/portal/settings` — Portal-Einstellungen speichern

### Sicherheit
- Portal-User sind vollständig von Tenant-Usern getrennt (eigene Supabase Auth Gruppe oder separate JWT-Claims)
- RLS: Portal-User darf nur Daten seines eigenen `customer_id` sehen
- Kein Zugriff auf `/api/tenant/*` Endpoints

## Dependencies
- **PROJ-29:** Customer Database — Kundenzuordnung
- **PROJ-55:** Reporting & Export Center — Reports im Portal anzeigen
- **PROJ-34:** Client Approval Hub — Freigaben im Portal
- **PROJ-50/51/52:** GA4/Google Ads/Meta Ads — Metriken im Portal-Dashboard
- **PROJ-3:** User Authentication — Auth-Pattern als Vorlage

## Success Metrics
- >60% der aktiven Tenants aktivieren das Portal für mindestens einen Kunden
- Portal-User-Login-Rate: >2 Logins/Monat pro aktivem Portal-User
- Freigaben über Portal: >40% aller Freigaben laufen über das Client-Portal

## Non-Goals
- Kein Schreibzugriff für Endkunden (außer Freigaben)
- Keine eigene Subdomain pro Endkunde (nur pro Agentur-Tenant)
- Kein Self-Signup für Endkunden (immer vom Admin eingeladen)
- Keine Mobile App (nur Web, responsive)

## Status
- **Status:** Planned
- **Created:** 2026-04-11
