# PROJ-8: Owner Super-Admin Dashboard

## Status: Deployed
**Created:** 2026-03-26
**Last Updated:** 2026-03-27

## Dependencies
- Requires: PROJ-2 (Tenant Provisioning) — Tenant-Liste anzeigen
- Requires: PROJ-6 (Role-Based Access Control) — Owner-only Zugriff

## User Stories
- Als Owner möchte ich eine Übersicht aller Tenants mit Name, Subdomain, Status und Mitgliederzahl sehen.
- Als Owner möchte ich direkt aus dem Dashboard einen neuen Tenant anlegen können.
- Als Owner möchte ich einen Tenant deaktivieren oder reaktivieren können.
- Als Owner möchte ich in einen beliebigen Tenant "hineinschauen" können (Read-only-Ansicht).
- Als Owner möchte ich systemweite Metriken sehen: Anzahl Tenants, aktive User, E-Mails versandt.

## Acceptance Criteria
- [ ] Dashboard erreichbar unter `boost-hive.de/owner/dashboard` (Root-Domain, kein Tenant)
- [ ] Tabelle aller Tenants: Name, Subdomain, Status (aktiv/inaktiv), Member-Count, Erstellt-Datum
- [ ] Filter: Aktiv / Inaktiv / Alle
- [ ] Suche nach Tenant-Name oder Subdomain
- [ ] "Neuer Tenant"-Button öffnet Provisioning-Flow (PROJ-2)
- [ ] "Deaktivieren/Aktivieren"-Toggle pro Tenant mit Bestätigungsdialog
- [ ] Metriken-Karten: Gesamt-Tenants, Aktive Tenants, Gesamt-User
- [ ] Alle Owner-Routen erfordern Owner-Role (403 für alle anderen)

## Edge Cases
- Keine Tenants vorhanden → Empty State mit "Ersten Tenant anlegen"-CTA
- Tenant-Deaktivierung mit aktiven Sessions → Bestehende Sessions werden invalidiert
- Owner versucht eigenen Account zu löschen → Nicht erlaubt

## Technical Requirements
- Security: Owner-Dashboard niemals über eine Tenant-Subdomain erreichbar
- Performance: Tenant-Liste paginiert (max. 50 pro Seite)

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

### Überblick
`PROJ-8` erweitert den bestehenden Owner-Bereich von einem reinen Tenant-Provisioning-Flow zu einem echten Super-Admin-Dashboard. Die Root-Domain bleibt der einzige Einstiegspunkt. Das Dashboard bündelt drei Bereiche:

1. System-Metriken
2. Tenant-Liste mit Suche, Filter und Aktionen
3. Read-only-Einstieg in Tenant-Details

Die vorhandenen Owner-Bausteine aus `PROJ-2` und `PROJ-3` werden bewusst wiederverwendet:
- Auth/Guard: `requireOwner()` und Owner-Layout
- Datenbasis: `tenants`, `tenant_members`, `platform_admins`
- Tenant-Status-Änderung: bestehende PATCH-Route aus `PROJ-2`

### Routing-Struktur

```text
Root Domain Only
+-- /owner
|   +-- bestehender Owner-Startpunkt
|
+-- /owner/dashboard
|   +-- OwnerDashboardPage
|       +-- MetricsGrid
|       +-- TenantFilters
|       +-- TenantSearchInput
|       +-- TenantTable
|       +-- EmptyState
|
+-- /owner/tenants
|   +-- bestehende Tenant-Liste aus PROJ-2
|
+-- /owner/tenants/new
|   +-- bestehender Provisioning-Flow aus PROJ-2
|
+-- /owner/tenants/[id]
    +-- spaetere Read-only-Detailansicht
```

Empfehlung:
- `/owner/dashboard` wird die neue Hauptseite fuer Owner.
- `/owner` wird entweder auf `/owner/dashboard` umgeleitet oder als schlanker Wrapper beibehalten.

### Komponentenstruktur

```text
OwnerDashboardPage
+-- DashboardHeader
|   +-- Titel
|   +-- Kurzbeschreibung
|   +-- CTA "Neuer Tenant"
|
+-- MetricsGrid
|   +-- MetricCard "Gesamt-Tenants"
|   +-- MetricCard "Aktive Tenants"
|   +-- MetricCard "Gesamt-User"
|   +-- MetricCard "Versendete E-Mails" (vorerst Placeholder / optional)
|
+-- TenantToolbar
|   +-- SearchInput (Name oder Subdomain)
|   +-- StatusFilterTabs / Select
|
+-- TenantTable
|   +-- TenantRow
|       +-- Name
|       +-- Subdomain
|       +-- StatusBadge
|       +-- MemberCount
|       +-- CreatedAt
|       +-- ActionsMenu
|           +-- "Details ansehen"
|           +-- "Aktivieren / Deaktivieren"
|
+-- EmptyState
    +-- CTA "Ersten Tenant anlegen"
```

### Datenmodell

Es werden keine neuen Kern-Tabellen fuer `PROJ-8` benoetigt.

Verwendete Tabellen:
- `tenants`
  - `id`
  - `name`
  - `slug`
  - `status`
  - `created_at`
- `tenant_members`
  - fuer Member-Count pro Tenant
- `platform_admins`
  - fuer Owner-Authorisierung

Optionale spaetere Erweiterung fuer System-Metriken:
- `email_events` oder aehnliche Tracking-Tabelle fuer echte Mail-Counts

Da eine solche Tabelle aktuell nicht existiert, sollte "E-Mails versandt" in `PROJ-8` als einer dieser Wege modelliert werden:
- Variante A: vorerst nicht anzeigen
- Variante B: Placeholder "coming soon"
- Variante C: aus Mailtrap/API-Logs spaeter nachziehen

Empfehlung:
- In `PROJ-8` nur Metriken anzeigen, die wir sauber aus der DB liefern koennen:
  - Gesamt-Tenants
  - Aktive Tenants
  - Gesamt-User

### API-Design

#### 1. Dashboard Summary

**GET `/api/owner/dashboard`**

Zweck:
- Liefert aggregierte Kennzahlen fuer die Owner-Startseite

Response:

```json
{
  "metrics": {
    "totalTenants": 12,
    "activeTenants": 10,
    "inactiveTenants": 2,
    "totalUsers": 87
  }
}
```

Implementierung:
- `requireOwner()`
- Admin-Client
- Aggregation ueber `tenants` und `tenant_members`

#### 2. Tenant Listing mit Search / Filter / Pagination

**GET `/api/owner/tenants`**

Bestehende Route aus `PROJ-2` wird erweitert:
- Query-Parameter:
  - `q` = Suche nach Tenant-Name oder Slug
  - `status` = `active | inactive | all`
  - `page`
  - `pageSize` (max. 50)

Response:

```json
{
  "tenants": [
    {
      "id": "uuid",
      "name": "Nordstern Studio",
      "slug": "nordstern",
      "status": "active",
      "created_at": "2026-03-27T09:00:00.000Z",
      "memberCount": 6
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "total": 42,
    "totalPages": 3
  }
}
```

Implementierungshinweis:
- Entweder SQL/RPC mit Aggregation
- Oder zwei Queries:
  1. paginierte Tenants laden
  2. Member-Counts fuer die sichtbaren Tenant-IDs aggregieren

Empfehlung:
- Fuer Lesbarkeit zunaechst zwei Queries statt komplexer RPC
- Erst wenn Performance kippt, auf SQL-View/RPC umstellen

#### 3. Tenant Status Toggle

**PATCH `/api/owner/tenants/[id]`**

Bestehende Route bleibt bestehen.

Erweiterung im Verhalten:
- Bei Deaktivierung soll das UI einen Confirm-Dialog zeigen
- API kann unveraendert bleiben, da sie bereits `status` patcht

#### 4. Read-only Tenant Inspect

**GET `/api/owner/tenants/[id]`**

Zweck:
- Detaildaten fuer eine Read-only-Ansicht

Response:

```json
{
  "tenant": {
    "id": "uuid",
    "name": "Nordstern Studio",
    "slug": "nordstern",
    "status": "active",
    "created_at": "2026-03-27T09:00:00.000Z",
    "memberCount": 6,
    "admins": [
      {
        "email": "owner@nordstern.de",
        "status": "active"
      }
    ]
  }
}
```

Diese Route ist eine gute Bruecke zu `PROJ-13`.

### Datenfluss

#### Dashboard Load
1. Owner ruft `/owner/dashboard` auf
2. Owner-Layout prueft Session + `platform_admins`
3. Client oder Server-Komponente laedt:
   - `/api/owner/dashboard`
   - `/api/owner/tenants?status=all&page=1&pageSize=20`
4. UI rendert Metriken und Tabelle

#### Suche / Filter
1. Owner tippt Suchbegriff oder waehlt Status
2. Debounced Request an `/api/owner/tenants`
3. Tabelle und Pagination werden aktualisiert

#### Tenant deaktivieren
1. Owner klickt "Deaktivieren"
2. Confirm-Dialog erklaert Auswirkungen
3. PATCH `/api/owner/tenants/[id]` mit `status: inactive`
4. Tabelle und Metriken werden aktualisiert

### Read-only Tenant-Ansicht

Das "Hineinschauen" soll **keine Session-Impersonation** sein.

Bewusste Abgrenzung:
- Kein Login als Tenant-User
- Kein Umschreiben von Session-/Tenant-Cookies
- Kein Zugriff auf Tenant-geschuetzte `/dashboard`-Routen als Owner

Stattdessen:
- eigene Owner-Read-only-Seite unter `/owner/tenants/[id]`
- Daten kommen ueber Owner-API

Das ist sicherer und passt besser zu den bereits vorhandenen Grenzen im System.

### Sicherheit

#### Zugriffsschutz
- Alle Owner-Seiten bleiben auf Root-Domain
- `proxy.ts` blockiert Owner-Login-API bereits auf Tenant-Subdomains
- Owner-Layout + `requireOwner()` bleiben die zwei Schutzschichten

#### Kein Cross-Tenant-Impersonation
- "Tenant hineinschauen" nur als dedizierte Owner-Read-only-Oberflaeche
- Keine Session-Umschaltung in Tenant-Kontexte

#### Tenant-Deaktivierung
- Neue Logins sind bereits blockiert
- Bestehende Sessions werden aktuell nicht global invalidiert

Empfehlung fuer `PROJ-8`:
- Im UI klar kommunizieren:
  "Neue Logins werden blockiert; bestehende Sessions koennen kurzzeitig weiterlaufen."

Wenn echte Session-Invalidierung gewuenscht ist, braucht das ein separates Security-/Session-Management-Inkrement.

### Performance

#### Pagination
- Default `pageSize = 20`
- Maximum `pageSize = 50`

#### Suche
- Suche auf `name` und `slug`
- Client-seitig debounce: 250-300ms

#### Aggregation
- `memberCount` nicht fuer alle Tenants global auf einmal berechnen, sondern nur fuer die aktuelle Seite

### UX-Entscheidungen

#### Empty State
Wenn keine Tenants vorhanden sind:
- Metriken bleiben sichtbar
- Tabelle wird durch Empty State ersetzt
- CTA direkt zu `/owner/tenants/new`

#### Confirm Dialog
Beim Deaktivieren:
- Erklärt Auswirkung auf neue Logins
- Vermeidet versehentliche Abschaltung

#### Suche und Filter
- Filter sollen URL-synchron sein
  - z. B. `/owner/dashboard?status=inactive&q=nord`
- Damit sind Ansichten teilbar und refresh-stabil

### Neue / geänderte Dateien

**Neu**
- `src/app/(owner)/owner/dashboard/page.tsx`
- `src/app/api/owner/dashboard/route.ts`
- `src/components/owner-dashboard-metrics.tsx`
- `src/components/owner-tenant-toolbar.tsx`
- `src/components/owner-tenant-table.tsx`

**Erweitern**
- `src/app/api/owner/tenants/route.ts`
  - Search / Filter / Pagination / MemberCount
- `src/components/owner-sidebar.tsx`
  - Navigationseintrag `/owner/dashboard`

**Optional fuer Read-only Inspect**
- `src/app/(owner)/owner/tenants/[id]/page.tsx`
- `src/app/api/owner/tenants/[id]/route.ts`

### Architektur-Entscheidung

Empfohlene Lieferreihenfolge:

1. `/owner/dashboard` mit Metriken + paginierter Liste
2. Suche + Statusfilter
3. Toggle mit Confirm-Dialog
4. Read-only-Tenant-Detailansicht

So liefert `PROJ-8` schnell einen echten Mehrwert, ohne direkt in Impersonation oder komplexe Session-Invalidierung abzurutschen.

## QA Test Results
### Review Date: 2026-03-27
### Reviewer: Codex

### Initial Review
- 2026-03-27: drei Findings zu Session-Invalidierung, `403`-Semantik fuer Non-Owner und User-Metrik identifiziert

### Re-Run Result
- Keine blockierenden Findings mehr

### Acceptance Criteria
- PASS - Dashboard unter `/owner/dashboard` auf Root-Domain vorhanden
- PASS - Tabelle zeigt Name, Subdomain, Status, Member-Count und Erstellt-Datum
- PASS - Filter `Alle / Aktiv / Inaktiv`
- PASS - Suche nach Tenant-Name oder Subdomain
- PASS - CTA zu `/owner/tenants/new`
- PASS - Aktivieren/Deaktivieren mit Bestatigungsdialog
- PASS - Metriken-Karten fuer Gesamt-Tenants, Aktive Tenants, Gesamt-User vorhanden
- PASS - Owner-Routen verweigern Non-Owner jetzt serverseitig

### Edge Cases
- PASS - Empty State fuer leere Trefferliste vorhanden
- PASS - Tenant-Deaktivierung sperrt die Subdomain ohne Cache-Fenster; offene Sessions verlieren spaetestens beim naechsten Request den Zugriff
- PASS - Kein Flow zum Loeschen des eigenen Owner-Accounts vorhanden

### Production Readiness
**Status: READY**

### Verification
- `npm run build` erfolgreich
- Code Review gegen Spec, Acceptance Criteria und Edge Cases durchgefuehrt
- Kein echter Browser-/Session-E2E-Test in dieser Session

## Deployment
### Deployment Date: 2026-03-27
### Deployment Status: Deployed

- Production deploy released with commit `10a742f` (`deploy(PROJ-8): ship owner super-admin dashboard`)
- Follow-up production hotfix released with commit `2869594` (`fix(PROJ-8): block owner routes on tenant subdomains`)
- Root-only owner routing verified live after rollout
- `npm run build` was successful before deploy
