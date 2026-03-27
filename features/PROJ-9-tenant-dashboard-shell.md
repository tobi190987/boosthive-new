# PROJ-9: Tenant Dashboard Shell

## Status: Deployed
**Created:** 2026-03-26
**Last Updated:** 2026-03-27

## Dependencies
- Requires: PROJ-3 (User Authentication) — Nur eingeloggte User sehen das Dashboard
- Requires: PROJ-6 (Role-Based Access Control) — Navigation abhängig von Rolle

## User Stories
- Als eingeloggter Member möchte ich nach dem Login ein strukturiertes Dashboard sehen, das mir die verfügbaren Tools meines Tenants zeigt.
- Als Admin möchte ich im Dashboard zusätzliche Verwaltungsbereiche (User-Management, Einstellungen) sehen.
- Als Member möchte ich die Navigation meines Tenants klar strukturiert und intuitiv bedienbar finden.
- Als User möchte ich im Dashboard meinen Namen, meine Rolle und den Tenant-Namen sehen.
- Als User möchte ich mich direkt aus dem Dashboard ausloggen können.

## Acceptance Criteria
- [ ] Layout: Sidebar-Navigation + Hauptbereich + Header mit User-Info
- [ ] Header zeigt: Tenant-Name, eingeloggter Username, Rolle, Logout-Button
- [ ] Sidebar-Navigation für Member: Dashboard-Übersicht, Tool-Bereich (Platzhalter für PROJ-10+)
- [ ] Sidebar-Navigation für Admin: + User-Management, Einstellungen
- [ ] Dashboard-Übersicht: Willkommensseite mit Tenant-Name und verfügbaren Modulen
- [ ] Responsive: Sidebar kollapsiert auf mobilen Geräten zu einem Hamburger-Menu
- [ ] Aktive Navigation-Item ist visuell hervorgehoben
- [ ] Leere Tool-Bereiche zeigen "Demnächst verfügbar"-Platzhalter

## Edge Cases
- Nicht-eingeloggter User ruft Dashboard auf → Redirect auf Login
- Admin-Menüpunkt für Member direkt via URL → 403-Response
- Tenant deaktiviert während User eingeloggt → Nächste Anfrage logout + Info-Meldung

## Technical Requirements
- Accessibility: Keyboard-navigierbare Sidebar
- Performance: Layout lädt ohne Flash of Unauthenticated Content (FOUC)

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)
### Überblick
`PROJ-9` führt den Tenant-Bereich in eine gemeinsame App-Shell über. Heute existiert bereits ein einfacher Einstieg unter `/dashboard` und einzelne Tenant-Routen wie `/settings/team`. Die Architektur von `PROJ-9` soll diese Seiten unter einem konsistenten Tenant-Layout zusammenführen:

1. Tenant-Sidebar mit rollenabhängiger Navigation
2. Header mit Tenant-, User- und Rollen-Kontext
3. Content-Slots für Dashboard, Team und spätere Produktmodule
4. Gemeinsame Guards für Auth, Tenant-Zugehörigkeit und Admin-only-Bereiche

Wichtig ist die Abgrenzung zu `PROJ-8`:
- `PROJ-8` = Root-Domain Owner-Oberfläche
- `PROJ-9` = Tenant-gebundene Workspace-Shell auf Subdomains

### Routing-Struktur

```text
Tenant Subdomain Only
+-- /login
|   +-- bestehender Tenant-Login
|
+-- /dashboard
|   +-- TenantDashboardOverviewPage
|
+-- /settings
|   +-- Layout-Segment fuer tenant-interne Verwaltung
|   +-- /settings/team
|
+-- /tools
    +-- Platzhalter fuer PROJ-10+
```

Empfehlung:
- Ein gemeinsames Layout-Segment einfuehren, z. B. `src/app/(tenant)/layout.tsx`
- `/dashboard` und `/settings/team` in diese gemeinsame Shell legen
- Bestehende Pfade beibehalten, damit keine Feature-Regression fuer `PROJ-7` entsteht

### Komponentenstruktur

```text
TenantLayout
+-- TenantMobileHeader
|   +-- Hamburger-Menu
|   +-- Tenant-Branding
|   +-- User Shortcut
|
+-- TenantSidebar
|   +-- Section "Workspace"
|   |   +-- Dashboard
|   |   +-- Tools (Coming Soon)
|   |
|   +-- Section "Administration" (nur admin)
|       +-- Team
|       +-- Einstellungen (spaeter)
|
+-- TenantShellHeader
|   +-- Tenant-Name
|   +-- Username
|   +-- Rollen-Badge
|   +-- Logout
|
+-- MainContent
    +-- DashboardOverview
    +-- TeamInvitationsWorkspace
    +-- spaetere Tool-Module
```

### Navigationslogik

#### Member
- `Dashboard`
- `Tools`

#### Admin
- `Dashboard`
- `Tools`
- `Team`
- spaeter `Einstellungen`

Regeln:
- Aktiver Pfad wird visuell hervorgehoben
- Mobile Navigation nutzt ein `Sheet` / Hamburger-Menu
- Admin-Menüpunkte werden für Member gar nicht erst gerendert

### Datenquellen

Es werden für `PROJ-9` keine neuen Kern-Tabellen benötigt.

Verwendete Quellen:
- `tenants`
  - Tenant-Name / Slug für Header
- `tenant_members`
  - Rolle des aktuellen Users
- Supabase Session
  - User-ID und E-Mail

Bereits vorhandene Bausteine:
- Tenant-Subdomain-Routing aus `PROJ-1`
- Tenant-Login / Session aus `PROJ-3`
- Rollen und Admin-only-Checks aus `PROJ-6`
- Team-Bereich aus `PROJ-7`

### Server-/Client-Aufteilung

#### Server
- Tenant-Layout liest Tenant-Kontext und Session serverseitig
- User, Rolle und Tenant-Metadaten werden vor dem Rendern aufgelöst
- Verhindert Flash of Unauthenticated Content

#### Client
- Sidebar-Mobile-Sheet
- aktive Navigation per `usePathname()`
- optionale spätere UI-Zustände wie Collapsing, Client-Search, lokale Banner

Empfehlung:
- Header-Daten serverseitig vorbereiten und als Props in Client-Navigation geben
- Navigation selbst als Client-Komponente bauen, damit aktiver Pfad und Mobile-Sheet sauber funktionieren

### API-Design

Für die erste Tenant-Shell ist keine neue API zwingend nötig.

Empfohlene Einführung:

#### 1. Session Summary
**GET `/api/tenant/me`** optional

Zweck:
- Liefert Benutzer- und Rollen-Kontext an Client-Komponenten, falls später nötig

Response:

```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "displayName": "Max Mustermann"
  },
  "tenant": {
    "id": "uuid",
    "name": "Nordstern Studio",
    "slug": "nordstern"
  },
  "membership": {
    "role": "admin"
  }
}
```

Empfehlung:
- Für `PROJ-9` möglichst ohne neue API starten
- Daten direkt im Layout laden
- `/api/tenant/me` nur dann hinzufügen, wenn Client-Komponenten echten Runtime-Zugriff brauchen

### Layout-Verhalten

#### Header
Soll anzeigen:
- Tenant-Name bevorzugt aus `tenants.name`
- User-Identifier, initial pragmatisch E-Mail
- Rollen-Badge `Admin` oder `Member`
- Logout-Button

#### Sidebar
Soll:
- keyboard-navigierbar sein
- auf Desktop fix sichtbar sein
- mobil als Drawer/Sheet erscheinen
- für `admin` und `member` unterschiedliche Menüs rendern

#### Main Area
- `/dashboard` wird zur Willkommens- und Modulübersicht
- Karten für verfügbare Bereiche
- Platzhalter für noch nicht gelieferte Tools mit "Demnächst verfügbar"

### Guards und Sicherheit

#### Unauthentifizierte User
- Weiterleitung auf `/login?returnTo=...`
- Muss bereits vor dem eigentlichen Seitenrendern greifen

#### Member vs. Admin
- UI blendet Admin-Menüs für Member aus
- Server-seitige Guard bleibt Pflicht für Admin-Routen wie `/settings/team`

Empfehlung:
- Bestehende Guard-Logik aus `PROJ-6` weiterverwenden
- Keine reine Client-Schutzlogik für Admin-Seiten

#### Tenant-Deaktivierung
- Der bestehende Subdomain-/Tenant-Schutz aus `proxy.ts` bleibt maßgeblich
- Wenn ein Tenant inaktiv wird, verliert der User beim nächsten Request Zugriff
- Optional kann später eine dedizierte Info-Seite für deaktivierte Tenants ergänzt werden

### UX-Entscheidungen

#### Dashboard-Startseite
Die Übersicht auf `/dashboard` sollte drei Gruppen zeigen:
- `Workspace`
- `Verwaltung`
- `Demnächst verfügbar`

So entsteht schon jetzt eine echte App-Struktur, obwohl `PROJ-10+` noch nicht geliefert sind.

#### Tool-Platzhalter
Für noch nicht gebaute Module:
- Karten mit Titel
- knappe Beschreibung
- Badge `Demnächst`

Das hält die Navigation stabil, ohne tote Links zu erzeugen.

#### Responsiveness
- Desktop: Sidebar links, Header oben im Content
- Mobile: Header mit Menu-Button, Navigation im Sheet
- Keine Layout-Sprünge zwischen `/dashboard` und `/settings/team`

### Neue / geänderte Dateien

**Neu**
- `src/app/(tenant)/layout.tsx`
- `src/components/tenant-sidebar.tsx`
- `src/components/tenant-shell-header.tsx`
- `src/components/tenant-dashboard-overview.tsx`

**Erweitern**
- `src/app/dashboard/page.tsx`
  - von einfacher Seite auf Shell-Overview umstellen
- `src/app/settings/team/page.tsx`
  - unter gemeinsamer Tenant-Shell rendern
- `src/components/tenant-logout-button.tsx`
  - in Header integrieren

**Optional**
- `src/app/api/tenant/me/route.ts`

### Architektur-Entscheidung

Empfohlene Lieferreihenfolge:

1. gemeinsames Tenant-Layout
2. rollenabhängige Sidebar + Header
3. `/dashboard` als echte Overview
4. `/settings/team` in dieselbe Shell ziehen
5. Tool-Platzhalter für `PROJ-10+`

Damit liefert `PROJ-9` zuerst die strukturelle Grundlage, auf die sich alle kommenden Tenant-Module sauber aufsetzen können.

## QA Test Results
### Review Date: 2026-03-27
### Reviewer: Codex

### Initial Review
- 2026-03-27: drei Findings zu Header-Logout, Admin-Navigation und Inaktiv-Tenant-Flow identifiziert

### Re-Run Result
- Keine blockierenden Findings mehr

### Acceptance Criteria
- PASS - Layout mit Sidebar, Hauptbereich und Header vorhanden
- PASS - Header zeigt Tenant-Name, User, Rolle und Logout
- PASS - Member-Navigation mit Dashboard und Tool-Platzhalter vorhanden
- PASS - Admin-Navigation zeigt zusaetzlich User-Management und Einstellungen
- PASS - Dashboard-Übersicht mit Tenant-Kontext und Modulen vorhanden
- PASS - Responsive Mobile-Shell mit Hamburger-Menu vorhanden
- PASS - Aktive Navigation ist hervorgehoben
- PASS - Tool-Platzhalter zeigen `Demnaechst verfuegbar`

### Edge Cases
- PASS - Nicht eingeloggte User werden weitergeleitet
- PASS - Member erhalten fuer `/settings/*` serverseitig `403`
- PASS - Deaktivierter Tenant fuehrt beim naechsten Request zu Session-Cleanup und Login-Hinweis

### Production Readiness
**Status: READY**

### Verification
- `npm run build` erfolgreich
- Code Review gegen Spec, Navigation und Guard-Verhalten durchgeführt
- Kein echter Browser-/Session-E2E-Test in dieser Session

## Deployment
### Deployment Date: 2026-03-27
### Deployment Status: Deployed

- Production deploy released with commit `6a1da65` (`deploy(PROJ-9): ship tenant dashboard shell`)
- Follow-up production hotfix released with commit `15feb2c` (`fix(PROJ-9): block tenant routes on root domain`)
- Tenant subdomain routes and root-domain blocking were verified after rollout
- `npm run build` was successful before deploy
