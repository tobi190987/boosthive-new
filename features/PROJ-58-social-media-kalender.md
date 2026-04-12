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

## Tech Design (Solution Architect)

### Komponentenstruktur

```
/tools/social-calendar (neue Page)
└── SocialCalendarWorkspace (Client Component)
    ├── CalendarToolbar
    │   ├── Monats-/Wochenansicht-Toggle (Tabs)
    │   ├── Datumsnavigation (Pfeile + aktueller Monat/Woche)
    │   ├── FilterBar (Kunde, Plattform, Status) → bestehende FilterChips
    │   └── "Neuer Post"-Button → öffnet PostSheet
    ├── MonthView (Custom CSS Grid, 7 Spalten)
    │   └── DayCell (klickbar → öffnet PostSheet mit Datum vorbelegt)
    │       └── PostCard[] (kompakt: Plattform-Icon, Titel, Status-Badge)
    ├── WeekView (7-Tage-Timeline, stündliche Zeilen)
    │   └── TimeSlot → PostCard[]
    └── PostSheet (shadcn Sheet/Slide-Over)
        └── PostForm
            ├── Titel (Input)
            ├── Plattform-Auswahl (Multi-Select mit Icons, Popover+Checkbox)
            ├── Kunde (CustomerAssignmentField — bereits vorhanden)
            ├── Datum + Uhrzeit (datetime-local Input)
            ├── Caption (Textarea)
            ├── Status (Select: Entwurf / In Bearbeitung / Zur Freigabe / Freigegeben / Veröffentlicht)
            ├── Assignee (Select aus Team-Mitgliedern)
            └── Notiz (Textarea, optional)
```

### Datenmodell

**Tabelle `social_media_posts`** — gespeichert in Supabase PostgreSQL, RLS über `tenant_id`:

| Feld | Typ | Beschreibung |
|------|-----|--------------|
| id | UUID | Primärschlüssel |
| tenant_id | UUID | Mandant (RLS-geschützt) |
| customer_id | UUID | Zugeordneter Kunde (optional) |
| title | Text | Post-Titel (Pflichtfeld) |
| caption | Text | Inhalt / Caption |
| platforms | Text[] | instagram, linkedin, facebook, tiktok |
| scheduled_at | Timestamp | Geplanter Termin (Pflichtfeld) |
| status | Text | draft / in_progress / review / approved / published |
| assignee_id | UUID | Zugewiesenes Team-Mitglied |
| notes | Text | Interne Notiz |
| created_by | UUID | Erstellt von |
| created_at | Timestamp | Angelegt am |
| updated_at | Timestamp | Zuletzt geändert |

### API-Endpunkte

| Methode | Route | Zweck |
|---------|-------|-------|
| GET | `/api/tenant/social-calendar` | Posts abrufen (Range, Kunde, Plattform, Status) |
| POST | `/api/tenant/social-calendar` | Neuen Post anlegen |
| GET | `/api/tenant/social-calendar/[id]` | Einzelner Post |
| PUT | `/api/tenant/social-calendar/[id]` | Post bearbeiten |
| DELETE | `/api/tenant/social-calendar/[id]` | Post löschen |

### Tech-Entscheidungen

| Entscheidung | Begründung |
|---|---|
| Kein externes Kalender-Package | Custom Grid mit Tailwind — leichter, besser ins Design-System integrierbar |
| shadcn `Sheet` für Post-Details | Bereits installiert; Slide-Over passt für Detail-/Edit-Ansicht |
| URL-basierte Filter | `useSearchParams` + `useRouter` — shareable Links ohne extra State |
| `CustomerAssignmentField` wiederverwenden | Vorhanden aus PROJ-29 |
| `FilterChips` wiederverwenden | Vorhanden aus PROJ-42 |
| Plattform-MultiSelect via Popover+Checkbox | Kein externes Package nötig |

### Plattform-Farbcodes

| Plattform | Tailwind-Klasse |
|-----------|----------------|
| Instagram | `bg-pink-500` |
| LinkedIn | `bg-blue-600` |
| Facebook | `bg-indigo-700` |
| TikTok | `bg-neutral-900` |

### Navigation

Neuer Eintrag in `src/lib/tool-groups.ts`, Gruppe "Content & Kampagnen":
- Label: `Social Media Kalender`
- Route: `/tools/social-calendar`
- Modul-Code: `social_calendar`
- Farbe: `rose`

### Neue Packages

Keine — alles mit bestehenden shadcn/ui-Komponenten und Tailwind umsetzbar.

## Implementation Notes

### Implementierte Dateien
- `src/app/(tenant)/tools/social-calendar/page.tsx` — Server Component, Modul-Check
- `src/app/(tenant)/tools/social-calendar/loading.tsx` — Skeleton Loading State
- `src/components/social-calendar-workspace.tsx` — Client Component (vollständig)
- `src/lib/social-calendar.ts` — Types, Helpers, Grid-Utilities
- `src/app/api/tenant/social-calendar/route.ts` — GET (mit Filtern), POST
- `src/app/api/tenant/social-calendar/[id]/route.ts` — GET, PUT, DELETE
- `supabase/migrations/045_social_media_posts.sql` — Tabelle + RLS + Indexes
- `src/lib/tool-groups.ts` — Navigation (CalendarDays-Icon, rose, `social_calendar`)

### Abweichungen von der Spec
- Keine — alle ACs implementiert

## Status
- **Status:** In Review
- **Created:** 2026-04-11
- **Last Updated:** 2026-04-12

---

## QA Test Results

**Tested:** 2026-04-12
**App URL:** http://localhost:3000
**Tester:** QA Engineer (AI) -- Code-Level Audit + Static Analysis

### Acceptance Criteria Status

#### AC-1: Kalenderansicht
- [x] Monats-Kalender mit Posts als farbigen Karten (MonthView grid, 7 Spalten, 42 Zellen)
- [x] Umschalten zwischen Monats- und Wochenansicht (Tabs component mit `month`/`week` Werten)
- [x] Posts nach Plattform farblich markiert: IG=pink, LinkedIn=blau, FB=indigo, TikTok=schwarz (SOCIAL_PLATFORM_META definiert korrekte Tailwind-Klassen)

#### AC-2: Post anlegen
- [x] Klick auf Tag oeffnet Create-Sheet mit Datum vorbelegt (openCreateSheet(day), setzt 10:00 Uhr)
- [x] "Neuer Post"-Button oeffnet Create-Sheet (Link zu ?action=create, Sheet oeffnet via useEffect)
- [x] Formular enthaelt: Titel, Plattform (Multi-Select), Kunde, Datum/Uhrzeit, Caption, Status, Assignee, Notiz
- [x] Post erscheint nach Speichern (fetchPosts() wird nach savePost aufgerufen)

#### AC-3: Post-Status Workflow
- [x] Status-Wechsel zwischen Entwurf, In Bearbeitung, Zur Freigabe, Freigegeben, Veroeffentlicht (Select mit allen 5 Stufen)
- [x] Status farblich auf Kalender-Karte angezeigt (StatusBadge mit SOCIAL_STATUS_META badgeClass)
- [ ] BUG: Kein erzwungener Workflow-Richtung -- Status kann beliebig in jede Richtung geaendert werden (z.B. von "Veroeffentlicht" zurueck zu "Entwurf"). Spec sagt "wechseln zwischen diesen Stufen" mit Pfeilen, was eine lineare Progression impliziert. (Siehe BUG-1)

#### AC-4: Filtern & Suchen
- [x] Filter nach Plattform funktioniert (FilterChips + overlaps-Query)
- [x] Filter nach Status funktioniert (FilterChips + in-Query)
- [ ] BUG: Filter nach Kunde fehlt im UI -- nur der globale Kunden-Selektor ist vorhanden, aber kein eigener Kundenfilter in der FilterBar. Die Spec verlangt explizit "nach Kunde, Plattform oder Status filtere". (Siehe BUG-2)
- [x] Filter werden in URL gespeichert (updateUrl setzt platform/status als search params, shareable)

#### AC-5: Kundenspezifische Ansicht
- [x] Globaler Kunden-Selektor steuert die Ansicht (activeCustomer.id wird als customer_id an API gesendet)
- [x] Ohne Kunden-Selektor werden alle Kunden angezeigt

#### AC-6: Post-Details
- [x] Klick auf Post oeffnet Seitenleiste (Sheet/Slide-Over, openEditSheet)
- [x] Post kann direkt bearbeitet werden (PUT-Request)
- [x] Post kann geloescht werden (DELETE-Button mit Loader)

### Edge Cases Status

#### EC-1: Mehrere Posts am selben Tag
- [x] Posts gestapelt dargestellt (space-y-0.5 im MonthView)
- [x] Limitiert auf 3 sichtbare Posts mit "+N weitere"-Anzeige in Monatsansicht
- [ ] BUG: Keine Scroll-Moeglichkeit bei vielen Posts pro Tag -- Spec verlangt "gestapelt mit Scroll-Moeglichkeit", aber die Monatsansicht zeigt nur die ersten 3 und dann "+N weitere" ohne Scroll. Die "+N weitere" Anzeige ist nicht klickbar und fuehrt nicht zu einer expandierten Ansicht. (Siehe BUG-3)

#### EC-2: Kein Kunde ausgewaehlt
- [x] Kalender zeigt alle Kunden (API wird ohne customer_id-Filter aufgerufen)
- [x] Kundenname auf Post-Karten angezeigt (post.customerName wird in erweiterter Karte angezeigt)
- [ ] BUG: In der kompakten Monatsansicht wird kein Kundenname angezeigt -- nur in der erweiterten Wochenansicht. Spec verlangt "deutliche Kundenbezeichnung auf jeder Karte". (Siehe BUG-4)

#### EC-3: Post in der Vergangenheit
- [x] Ueberfaellige Posts werden mit Warn-Icon markiert (AlertTriangle, isOverdue-Funktion prueft scheduledAt < now && status !== 'published')

#### EC-4: Modul nicht gebucht
- [x] Upgrade-Hinweis via ModuleLockedCard (page.tsx prueft activeModuleCodes)
- [x] API-Endpunkte pruefen Modulzugang (hasModuleAccess in beiden Route-Dateien)

### Security Audit Results

#### Authentication & Authorization
- [x] Alle API-Endpunkte pruefen Authentication via requireTenantUser
- [x] Tenant-Isolation: Queries filtern immer nach tenant_id
- [x] x-tenant-id Header wird von Middleware gesetzt und gegen Spoofing sanitized (proxy.ts TENANT_HEADERS)
- [x] RLS Policies auf der Tabelle fuer SELECT, INSERT, UPDATE, DELETE (prueft tenant_memberships)
- [x] Modulzugang wird auf Server-Seite (page.tsx) und in jedem API-Endpunkt geprueft

#### Input Validation
- [x] POST/PUT: Zod-Validierung fuer alle Felder (createPostSchema, updatePostSchema)
- [x] ID-Parameter wird als UUID validiert (idSchema)
- [x] customer_id Filter wird als UUID validiert
- [ ] BUG: `start` und `end` Query-Parameter werden nicht validiert. Sie werden direkt an Supabase .gte/.lte Methoden uebergeben. Obwohl Supabase parametrisierte Queries nutzt (kein SQL-Injection), koennte ein Angreifer mit manipulierten Werten unerwartete Ergebnisse erzielen oder Datenbankfehler provozieren. (Siehe BUG-5)
- [ ] BUG: `platform` und `status` Query-Parameter werden nicht gegen die erlaubten Werte validiert. Ein Angreifer koennte beliebige Strings als Plattform/Status senden (z.B. `?platform=<script>alert(1)</script>`). Da Supabase parametrisierte Queries nutzt, ist dies kein SQL-Injection-Risiko, aber es fuehrt zu leeren Ergebnissen statt einer klaren Fehlermeldung. (Siehe BUG-6)

#### Rate Limiting
- [ ] BUG: Keine Rate-Limiting auf den Social Calendar API-Endpunkten. Alle anderen vergleichbaren Endpunkte (Content Briefs, Ad Generator, Customers, etc.) haben Rate-Limiting implementiert. Ein Angreifer koennte massenhaft Posts erstellen oder die API mit GET-Requests fluten. (Siehe BUG-7)

#### Data Exposure
- [x] API gibt keine sensiblen Daten zurueck (nur Post-Daten, Kundenname, Assignee-Name)
- [x] admin-Client wird korrekt fuer Server-seitige Queries genutzt
- [x] DELETE bestaetigte keine Details ueber geloeschte Zeile (nur { success: true })

#### Cross-Site Scripting (XSS)
- [x] React rendert HTML escaped by default
- [x] Keine dangerouslySetInnerHTML Nutzung
- [x] User-Input (Titel, Caption, Notes) wird als Text gerendert, nicht als HTML

### Responsive & Cross-Browser (Code-Level)
- [x] Mobile-responsive: `sm:` Breakpoints fuer Layout-Aenderungen (Toolbar, Buttons, Grid)
- [x] Flex/Grid Layout mit gap statt fixed widths
- [x] Sheet-Breite: `w-full sm:max-w-lg` (vollbreit auf Mobile)
- [x] MonthView min-h: `min-h-[6rem] sm:min-h-[7rem]` (verschiedene Hoehen)
- [x] "Neuer Post" Button doppelt: Toolbar (nur sm:hidden), Page-Header (immer sichtbar)
- [ ] BUG: Auf 375px Breite werden die FilterChips (4 Plattformen + 5 Status) wahrscheinlich ueberlaufen und koennen den Container sprengen. Kein `overflow-x-auto` oder Wrapping vorhanden auf dem Filter-Container. (Siehe BUG-8)

### Bugs Found

#### BUG-1: Status-Workflow erlaubt beliebige Richtungswechsel
- **Severity:** Low
- **Steps to Reproduce:**
  1. Erstelle einen Post mit Status "Veroeffentlicht"
  2. Oeffne den Post zur Bearbeitung
  3. Aendere den Status zurueck zu "Entwurf"
  4. Erwartet: Entweder Warnung oder Einschraenkung auf vorwaerts-gerichtete Statuswechsel
  5. Tatsaechlich: Status kann frei in jede Richtung geaendert werden
- **Priority:** Nice to have -- die Spec impliziert eine Reihenfolge mit Pfeilen, aber freier Wechsel ist in der Praxis pragmatisch

#### BUG-2: Kundenfilter fehlt in der FilterBar
- **Severity:** Medium
- **Steps to Reproduce:**
  1. Oeffne den Social Media Kalender
  2. Suche einen Kundenfilter in der FilterBar
  3. Erwartet: FilterChips oder Dropdown fuer Kunden (neben Plattform und Status)
  4. Tatsaechlich: Nur Plattform- und Status-Filter vorhanden. Der globale Kunden-Selektor ist separat und nicht Teil der FilterBar
- **Priority:** Fix before deployment -- AC-4 verlangt explizit "nach Kunde, Plattform oder Status filtere"

#### BUG-3: Keine Scroll-Moeglichkeit bei vielen Posts pro Tag
- **Severity:** Low
- **Steps to Reproduce:**
  1. Erstelle 5+ Posts fuer denselben Tag
  2. Wechsle zur Monatsansicht
  3. Erwartet: Gestapelte Darstellung mit Scroll-Moeglichkeit
  4. Tatsaechlich: Nur 3 Posts sichtbar, "+N weitere" Text ohne Interaktion
- **Priority:** Fix in next sprint -- Workaround: Wochenansicht nutzen, die alle Posts zeigt

#### BUG-4: Kein Kundenname auf kompakten Kalender-Karten (Monatsansicht)
- **Severity:** Low
- **Steps to Reproduce:**
  1. Erstelle Posts fuer verschiedene Kunden
  2. Deselektiere den globalen Kunden-Selektor ("Alle Kunden")
  3. Betrachte die Monatsansicht
  4. Erwartet: Kundenbezeichnung auf jeder kompakten Karte sichtbar
  5. Tatsaechlich: Kompakte Karten zeigen nur Plattform-Dot + Titel. Kundenname nur in Wochenansicht
- **Priority:** Nice to have -- Platzmangel in kompakten Karten ist verstaendlich

#### BUG-5: Fehlende Validierung der start/end Query-Parameter
- **Severity:** Low
- **Steps to Reproduce:**
  1. Sende GET /api/tenant/social-calendar?start=invalid-date&end=abc
  2. Erwartet: 400 Bad Request mit Fehlermeldung
  3. Tatsaechlich: Supabase verarbeitet den Request, gibt vermutlich 500 oder leere Ergebnisse
- **Priority:** Fix in next sprint

#### BUG-6: Fehlende Validierung der platform/status Filter-Parameter
- **Severity:** Low
- **Steps to Reproduce:**
  1. Sende GET /api/tenant/social-calendar?platform=xss_test&status=invalid
  2. Erwartet: 400 Bad Request oder Ignorieren ungueltiger Werte
  3. Tatsaechlich: Leeres Ergebnis ohne Fehlermeldung
- **Priority:** Nice to have -- kein Sicherheitsrisiko dank parametrisierter Queries

#### BUG-7: Fehlende Rate-Limiting auf Social Calendar API
- **Severity:** High
- **Steps to Reproduce:**
  1. Sende 100+ POST-Requests an /api/tenant/social-calendar in kurzer Zeit
  2. Erwartet: Nach N Requests wird 429 Too Many Requests zurueckgegeben
  3. Tatsaechlich: Alle Requests werden verarbeitet
- **Note:** Alle anderen vergleichbaren Module (Content Briefs, Ad Generator, Customers, Budgets) haben Rate-Limiting. Das rate-limit.ts hat bereits Presets definiert, die hier wiederverwendet werden koennten.
- **Priority:** Fix before deployment

#### BUG-8: FilterChips Overflow auf kleinen Bildschirmen (375px)
- **Severity:** Low
- **Steps to Reproduce:**
  1. Oeffne den Kalender auf einem 375px breiten Geraet
  2. Betrachte die FilterChips-Zeile (4 Plattformen + 5 Status)
  3. Erwartet: Horizontales Scrollen oder Wrapping
  4. Tatsaechlich: Moeglicher Overflow ohne Scrollbar (abhaengig von FilterChips-Implementierung)
- **Priority:** Fix in next sprint

### Summary
- **Acceptance Criteria:** 5/6 vollstaendig bestanden (AC-4 teilweise -- Kundenfilter fehlt)
- **Edge Cases:** 3/4 bestanden (EC-1 teilweise -- kein Scroll)
- **Bugs Found:** 8 total (0 Critical, 1 High, 1 Medium, 6 Low)
- **Security:** Rate-Limiting fehlt (High), Input-Validierung unvollstaendig auf GET-Parametern (Low)
- **Production Ready:** NEIN
- **Recommendation:** BUG-7 (Rate-Limiting) und BUG-2 (Kundenfilter) muessen vor Deployment behoben werden. Die Low-Severity-Bugs koennen im naechsten Sprint adressiert werden.
