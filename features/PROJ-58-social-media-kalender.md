# PROJ-58: Social Media Kalender

## Overview
Ein visueller Content-Kalender für die Planung und Verwaltung von Social-Media-Posts über alle relevanten Plattformen (Instagram, LinkedIn, Facebook, TikTok). Kein direktes Publishing — fokus auf Planung, Statusverfolgung und Team-Koordination.

## User Stories

### Als Agentur-Admin möchte ich
- **STORY-1:** Posts für mehrere Kunden im Kalender planen können, um die Content-Strategie zu koordinieren
- **STORY-2:** Den Status jedes Posts verfolgen können (Geplant → In Bearbeitung → Zur Freigabe → Freigegeben → Veröffentlicht), um den Workflow im Blick zu behalten
- **STORY-3:** Postings zwischen Kunden und Plattformen filtern können, um fokussiert zu arbeiten

### Als Agentur-Mitarbeiter möchte ich
- **STORY-4:** Neue Content-Ideen als Entwürfe im Kalender anlegen können, damit sie im Team weiterverarbeitet werden
- **STORY-5:** Posts einem Kollegen zuweisen können, damit Verantwortlichkeiten klar sind
- **STORY-6:** Den Kalender in Monats- und Wochenansicht anzeigen können, um kurz- und langfristige Planung zu ermöglichen

### Als Agentur-Kunde (via Client-Portal, zukünftig) möchte ich
- **STORY-7:** Die für mich geplanten Posts sehen können, um informiert zu bleiben (Read-Only)

## Acceptance Criteria

### AC-1: Kalenderansicht
- **GIVEN** ich bin auf der Social Media Kalender-Seite
- **WHEN** ich die Seite öffne
- **THEN** sehe ich einen Monats-Kalender mit allen geplanten Posts als farbige Karten
- **AND** ich kann zwischen Monats- und Wochenansicht wechseln
- **AND** Posts werden nach Plattform farblich markiert (IG = pink, LinkedIn = blau, FB = dunkelblau, TikTok = schwarz)

### AC-2: Post anlegen
- **GIVEN** ich bin im Kalender
- **WHEN** ich auf einen Tag klicke oder „Neuer Post" drücke
- **THEN** öffnet sich ein Formular mit Feldern: Titel, Plattform (Multi-Select), Kunde, Geplantes Datum/Uhrzeit, Text/Caption, Status, Assignee, Notiz
- **AND** der Post erscheint nach dem Speichern im Kalender

### AC-3: Post-Status Workflow
- **GIVEN** ich öffne einen bestehenden Post
- **WHEN** ich den Status ändere
- **THEN** kann ich zwischen diesen Stufen wechseln: `Entwurf` → `In Bearbeitung` → `Zur Freigabe` → `Freigegeben` → `Veröffentlicht`
- **AND** der Status wird farblich auf der Kalender-Karte angezeigt

### AC-4: Filtern & Suchen
- **GIVEN** ich habe mehrere Kunden im System
- **WHEN** ich nach Kunde, Plattform oder Status filtere
- **THEN** zeigt der Kalender nur die gefilterten Posts
- **AND** die Filter werden in der URL gespeichert (shareable links)

### AC-5: Kundenspezifische Ansicht
- **GIVEN** ich habe einen Kunden im globalen Kunden-Selektor ausgewählt
- **WHEN** ich den Kalender öffne
- **THEN** zeigt der Kalender nur Posts dieses Kunden

### AC-6: Post-Details
- **GIVEN** ich klicke auf einen Post im Kalender
- **THEN** öffnet sich eine Seitenleiste (Slide-Over) mit allen Post-Details
- **AND** ich kann den Post direkt bearbeiten oder löschen

## Edge Cases

### EC-1: Mehrere Posts am selben Tag
- **WHEN** mehrere Posts für denselben Tag/dieselbe Plattform geplant sind
- **THEN** werden sie gestapelt dargestellt mit Scroll-Möglichkeit

### EC-2: Kein Kunde ausgewählt
- **WHEN** kein Kunde im Selektor aktiv ist
- **THEN** zeigt der Kalender Posts aller Kunden mit deutlicher Kundenbezeichnung auf jeder Karte

### EC-3: Post in der Vergangenheit
- **WHEN** ein Post-Datum in der Vergangenheit liegt und Status nicht "Veröffentlicht" ist
- **THEN** wird die Karte mit einem Warn-Icon markiert ("Überfällig")

### EC-4: Modul nicht gebucht
- **WHEN** das Modul `social_calendar` nicht im Subscription-Plan enthalten ist
- **THEN** erhält der Nutzer einen Upgrade-Hinweis

## Technical Requirements

### Database Schema
```sql
CREATE TABLE social_media_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) NOT NULL,
  customer_id UUID REFERENCES customers(id),
  title TEXT NOT NULL,
  caption TEXT,
  platforms TEXT[] NOT NULL, -- ['instagram', 'linkedin', 'facebook', 'tiktok']
  scheduled_at TIMESTAMP NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  -- 'draft', 'in_progress', 'review', 'approved', 'published'
  assignee_id UUID REFERENCES auth.users(id),
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_social_posts_tenant ON social_media_posts(tenant_id);
CREATE INDEX idx_social_posts_scheduled ON social_media_posts(tenant_id, scheduled_at);
CREATE INDEX idx_social_posts_customer ON social_media_posts(customer_id);
```

### API Endpoints
- `GET /api/tenant/social-calendar` — Posts mit Range-Filter (start, end, customer_id, platform, status)
- `POST /api/tenant/social-calendar` — Neuen Post anlegen
- `GET /api/tenant/social-calendar/[id]` — Post-Details
- `PUT /api/tenant/social-calendar/[id]` — Post aktualisieren
- `DELETE /api/tenant/social-calendar/[id]` — Post löschen

### Module Code
`social_calendar`

### UI-Komponenten
- Monats-Kalender Grid (custom, keine externe Kalender-Lib nötig)
- Wochenansicht als Timeline
- Post-Karte (Compact: Plattform-Icon, Titel, Status-Badge)
- Slide-Over / Drawer für Post-Details
- Plattform-Select (Multi-Select mit Icons)

## Dependencies
- **PROJ-28:** Globaler Kunden-Selektor — für Kundenfiler
- **PROJ-29:** Customer Database — Kundenliste für Post-Zuordnung
- **PROJ-6:** RBAC — Zugriffssteuerung
- **PROJ-34:** Client Approval Hub — Status "Zur Freigabe" kann dort weiterlaufen

## Success Metrics
- Durchschnittliche Posts pro Tenant/Monat > 20
- Status-Nutzung: >60% der Posts durchlaufen mindestens 3 Status-Stufen
- Adoption: 70% der aktiven Tenants nutzen den Kalender in Woche 4

## Non-Goals
- Kein direktes Publishing via Social-Media-APIs (kein OAuth zu Instagram/LinkedIn)
- Kein Bild-Upload / Asset-Management (wird separat behandelt)
- Kein öffentlicher Kalender-Link für Endkunden (kommt mit Client-Portal PROJ-62)

## Status
- **Status:** Planned
- **Created:** 2026-04-11
