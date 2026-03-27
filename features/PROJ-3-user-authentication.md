# PROJ-3: User Authentication

## Status: In Review
**Created:** 2026-03-26
**Last Updated:** 2026-03-27

## Dependencies
- Requires: PROJ-1 (Subdomain Routing) — Login-Page muss Tenant-Kontext aus Subdomain kennen
- Requires: PROJ-2 (Tenant Provisioning) — User-Accounts existieren im jeweiligen Tenant

## User Stories
- Als Member möchte ich mich auf der Login-Seite meines Tenants (`agentur-x.boost-hive.de/login`) mit E-Mail und Passwort anmelden.
- Als eingeloggter User möchte ich mich sicher ausloggen können, sodass meine Session vollständig gelöscht wird.
- Als System möchte ich sicherstellen, dass ein Login auf Tenant A niemals auf Daten von Tenant B zugreifen kann.
- Als Owner möchte ich mich über eine separate Root-Domain-Route einloggen, die keinem Tenant gehört.
- Als Member möchte ich nach erfolgreichem Login automatisch auf das Dashboard meines Tenants weitergeleitet werden.

## Acceptance Criteria
- [ ] Login-Formular auf `[subdomain].boost-hive.de/login` mit E-Mail und Passwort
- [ ] Validierung: Beide Felder erforderlich, E-Mail-Format geprüft
- [ ] Bei falschen Credentials: Generische Fehlermeldung (kein Hinweis ob E-Mail oder Passwort falsch)
- [ ] Bei erfolgreichem Login: Session wird erstellt mit `tenant_id` und `user_id` und `role`
- [ ] Session-Cookie ist an die Subdomain gebunden (kein Cross-Subdomain-Zugriff)
- [ ] Nach Login: Redirect auf `[subdomain].boost-hive.de/dashboard`
- [ ] Logout: Session wird serverseitig invalidiert und Cookie gelöscht
- [ ] Nach Logout: Redirect auf `[subdomain].boost-hive.de/login`
- [ ] Geschützte Routen leiten nicht-authentifizierte User auf `/login` um
- [ ] Owner-Login über `boost-hive.de/owner/login` (separate Route)

## Edge Cases
- User versucht Login auf falschem Tenant (E-Mail existiert, aber in anderem Tenant) → Fehlermeldung "Ungültige Zugangsdaten" (keine Info über andere Tenants)
- Session läuft ab während User aktiv ist → Graceful Redirect auf Login mit Hinweis
- Mehrfach-Login mit gleichen Credentials von verschiedenen Geräten → Alle Sessions sind gültig (kein Single-Session-Lock)
- Direkt-URL-Zugriff auf geschützte Seite ohne Login → Redirect auf Login, nach Login zurück zur ursprünglichen URL
- User-Account deaktiviert (durch Admin) → Fehlermeldung "Konto deaktiviert, wende dich an deinen Admin"

## Technical Requirements
- Security: Passwörter werden nie im Klartext gespeichert (Supabase Auth handles this)
- Security: CSRF-Schutz für Login-Formular
- Security: Rate-Limiting auf Login-Endpoint (max. 5 Versuche/Minute pro IP)
- Performance: Login-Response < 500ms

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

### Datenmodell

Nutzt `tenant_members`-Tabelle aus PROJ-2 (user_id, tenant_id, role, status).

### Komponentenstruktur

```
[subdomain].boost-hive.de/login  (Tenant-Login)
+-- LoginCard (Tenant-Name im Header)
    +-- LoginForm
        +-- Input: E-Mail
        +-- Input: Passwort (Show/Hide Toggle)
        +-- LoginButton
        +-- ErrorAlert (generisch)
        +-- Link: "Passwort vergessen?" (→ PROJ-5)

boost-hive.de/owner/login  (Owner-Login)
+-- LoginCard (BoostHive-Branding)
    +-- OwnerLoginForm
```

### Login-Flow

1. User gibt Credentials auf `agentur-x.boost-hive.de/login` ein
2. Proxy hat `tenant_id` bereits in Request-Headers injiziert (PROJ-1)
3. Login-API authentifiziert via Supabase Auth
4. API prüft: Existiert User in `tenant_members` für diesen Tenant?
5. Ja → Session-Cookie setzen, Redirect `/dashboard`
6. Nein → generische Fehlermeldung (kein Cross-Tenant-Hinweis)

### Geschützte Routen

- Proxy prüft Session-Cookie auf `/dashboard/*`, `/settings/*` etc.
- Kein Cookie → Redirect auf `/login` (mit Return-URL)
- Cookie vorhanden, falscher Tenant → Redirect auf `/login`

### Tech-Entscheidungen

- **`@supabase/ssr`:** Cookie-basierte Sessions für Next.js App Router
- **Session-Cookie auf Subdomain-Ebene:** Gilt nur für `agentur-x.boost-hive.de`, kein Cross-Tenant
- **Supabase Auth Rate-Limiting:** Eingebaut, deckt 5 Versuche/Minute ab
- **Owner-Login separat:** `/owner/login` nur auf Root-Domain, prüft `platform_admins`-Tabelle

## Implementation Notes (Backend)

### Erstellte Dateien
- `src/lib/schemas/auth.ts` — Zod LoginSchema (email + password)
- `src/lib/supabase-middleware.ts` — Supabase-Client fuer Proxy mit Cookie-Handling (domain: undefined fuer Subdomain-Scoping)
- `src/app/api/auth/login/route.ts` — Tenant-Login: Auth + tenant_members-Pruefung + generischer Fehler
- `src/app/api/auth/logout/route.ts` — Session-Invalidierung via Supabase signOut
- `src/app/api/auth/owner/login/route.ts` — Owner-Login: Auth + platform_admins-Pruefung
- `src/components/login-form.tsx` — Wiederverwendbare Login-Form-Komponente (Client Component)
- `src/app/login/page.tsx` — Tenant-Login-Page mit returnTo-Support
- `src/app/owner/login/page.tsx` — Owner-Login-Page (ausserhalb (owner) Route-Group, kein Sidebar-Layout)

### Geaenderte Dateien
- `src/proxy.ts` — Erweitert um Route-Protection: /dashboard/*, /settings/* erfordern Session, /owner/* erfordert Owner-Session. Redirect auf /login?returnTo= bzw. /owner/login?returnTo=

### Design-Entscheidungen
- **Generischer Fehler:** ALLE Auth-Fehler (falsches Passwort, kein Mitglied, inaktiv, falscher Tenant) geben identische Meldung "Ungueltige Zugangsdaten" zurueck
- **Cookie-Scoping:** domain: undefined in supabase-middleware.ts stellt sicher, dass Cookies nur fuer den exakten Host gelten (kein .boost-hive.de)
- **Owner-Login-Page:** Liegt unter src/app/owner/login/ (NICHT unter (owner)/owner/login/), damit kein Sidebar-Layout angewendet wird
- **Admin-Client fuer Membership-Check:** Login-API nutzt Service-Role-Client fuer tenant_members-Abfrage, da RLS zu restriktiv ist fuer den Moment des Logins
- **returnTo-Parameter:** Wird als Query-Parameter /login?returnTo=/dashboard/reports uebergeben und nach Login als Redirect-Ziel genutzt

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
