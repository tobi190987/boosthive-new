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

**Tested:** 2026-03-27
**Re-Tested:** 2026-03-27 (Second Pass -- Deep Code Review)
**App URL:** http://localhost:3000
**Tester:** QA Engineer (AI)
**Build Status:** Kompiliert erfolgreich (npm run build -- 0 Errors, 13 Routen generiert)
**Methode:** Code-Review + Static Analysis + Build-Verification (kein laufender Supabase-Server)

---

### Acceptance Criteria Status

#### AC-1: Login-Formular auf [subdomain].boost-hive.de/login mit E-Mail und Passwort
- [x] Login-Page unter `/login` vorhanden (`src/app/login/page.tsx`)
- [x] LoginForm-Komponente mit E-Mail- und Passwort-Feldern (`src/components/login-form.tsx`)
- [x] Korrekte HTML-Typen: `type="email"`, `type="password"` (mit Show/Hide-Toggle)
- [x] `autoComplete="email"` und `autoComplete="current-password"` gesetzt
- [x] Tenant-Kontext wird via `getTenantContext()` gelesen und als Titel angezeigt ("Anmeldung bei {slug}")
- **PASS**

#### AC-2: Validierung: Beide Felder erforderlich, E-Mail-Format geprueft
- [x] Zod-Schema `LoginSchema` in `src/lib/schemas/auth.ts` validiert beide Felder
- [x] E-Mail: min(1) + .email() -- leeres Feld und ungueltige Formate werden abgefangen
- [x] Passwort: min(1) + min(6) -- leeres Feld und zu kurze Passwoerter werden abgefangen
- [x] Client-seitige Validation via react-hook-form + zodResolver
- [x] Server-seitige Validation via LoginSchema.safeParse() in der API-Route
- [x] Fehlermeldungen werden als FormMessage unter den Feldern angezeigt
- **PASS**

#### AC-3: Bei falschen Credentials: Generische Fehlermeldung
- [x] `GENERIC_ERROR = 'Ungueltige Zugangsdaten.'` wird fuer ALLE Fehlerszenarien verwendet
- [x] Falsches Passwort -> generischer Fehler (Zeile 48-49 in login/route.ts)
- [x] Kein Tenant-Mitglied -> generischer Fehler (Zeile 62-66)
- [x] Inaktiver Account -> generischer Fehler (Zeile 69-72)
- [x] Kein Hinweis ob E-Mail existiert oder Passwort falsch ist
- **PASS**

#### AC-4: Bei erfolgreichem Login: Session mit tenant_id, user_id und role
- [x] Supabase Auth Session wird via `signInWithPassword()` erstellt
- [x] API-Response enthaelt `user.id`, `user.email`, `user.role` (aus tenant_members)
- [ ] BUG: Die Session selbst enthaelt KEINE tenant_id oder role. Nur die API-Response gibt diese Werte zurueck. Fuer nachfolgende Requests muss der Tenant-Kontext aus dem x-tenant-id Header (Proxy) gelesen werden, nicht aus der Session. Die Role muss bei jedem geschuetzten Request erneut aus der DB gelesen werden -- es gibt keine Session-basierte Role-Information.
- **PARTIAL PASS** (Session hat user_id via Supabase Auth, aber tenant_id und role nur in der API-Response, nicht in der Session selbst)

#### AC-5: Session-Cookie an Subdomain gebunden (kein Cross-Subdomain-Zugriff)
- [x] `createMiddlewareClient()` in `supabase-middleware.ts` setzt `domain: undefined`
- [x] Kommentar erklaert: "scopes the cookie to the exact host (e.g. agentur-x.boost-hive.de)"
- [x] `createClient()` in `supabase.ts` (Server) verwendet ebenfalls Standard-Cookie-Verhalten ohne explizites Domain-Setting
- [ ] BUG: Der Login-API-Endpunkt (`/api/auth/login`) verwendet `createClient()` aus `src/lib/supabase.ts`, NICHT `createMiddlewareClient()`. Die `createClient()`-Funktion setzt kein explizites `domain: undefined` bei Cookies. Das Cookie-Scoping haengt vom Default-Verhalten von `@supabase/ssr` ab. Es sollte verifiziert werden, dass `@supabase/ssr` Cookies nicht auf die Parent-Domain `.boost-hive.de` setzt.
- **PARTIAL PASS** (Design korrekt, aber Login-Route nutzt anderen Client als den mit explizitem domain:undefined)

#### AC-6: Nach Login: Redirect auf [subdomain].boost-hive.de/dashboard
- [x] `returnTo` Parameter wird aus searchParams gelesen (Default: `/dashboard`)
- [x] `window.location.href = returnTo` wird verwendet (korrekt fuer Cookie-Refresh)
- [x] Frontend-Rule eingehalten: `window.location.href` statt `router.push`
- **PASS**

#### AC-7: Logout: Session wird serverseitig invalidiert und Cookie geloescht
- [x] POST `/api/auth/logout` ruft `supabase.auth.signOut()` auf
- [x] Supabase SSR-Client loescht Session-Cookies automatisch bei signOut()
- [ ] BUG: Logout-Route hat keinen Auth-Check. Jeder kann POST `/api/auth/logout` aufrufen (auch ohne Session). Kein Sicherheitsrisiko, aber unclean -- sollte zumindest pruefen ob eine Session existiert.
- **PASS** (Kernfunktionalitaet korrekt, minor Issue)

#### AC-8: Nach Logout: Redirect auf [subdomain].boost-hive.de/login
- [ ] BUG: Die Logout-API gibt nur `{ success: true }` zurueck. Es gibt keinen Redirect und keinen Client-Code, der nach dem Logout-Call auf `/login` weiterleitet. Die LoginForm-Komponente hat keinen Logout-Button. Es gibt keinen Logout-Button oder Logout-Mechanismus im Frontend. Der User kann sich aktuell nicht ausloggen, weil es kein UI dafuer gibt.
- **FAIL**

#### AC-9: Geschuetzte Routen leiten nicht-authentifizierte User auf /login um
- [x] `maybeProtectTenantRoute()` in `proxy.ts` prueft Session fuer `/dashboard/*` und `/settings/*`
- [x] Bei fehlender Session: Redirect auf `/login?returnTo={originalPath}`
- [x] `isPublicPath()` laesst `/login`, `/api/`, `/_next/`, `/favicon.ico` durch
- [x] `createMiddlewareClient()` wird im Proxy fuer Session-Check verwendet
- **PASS**

#### AC-10: Owner-Login ueber boost-hive.de/owner/login (separate Route)
- [x] Owner-Login-Page unter `/owner/login` (`src/app/owner/login/page.tsx`)
- [x] Separate API-Route: POST `/api/auth/owner/login`
- [x] Prueft `platform_admins`-Tabelle nach Auth
- [x] Liegt AUSSERHALB der `(owner)` Route-Group (kein Sidebar-Layout)
- [x] Eigenes Branding: "BoostHive Admin" / "Plattform-Owner Login"
- [x] Proxy schuetzt `/owner/*` Routen und leitet auf `/owner/login` um
- **PASS**

---

### Edge Cases Status

#### EC-1: User versucht Login auf falschem Tenant
- [x] Login-Route prueft `tenant_members` fuer den aktuellen Tenant (x-tenant-id Header)
- [x] User existiert in anderem Tenant -> `membership` Query gibt null zurueck -> generischer Fehler
- [x] Kein Hinweis auf Existenz in anderem Tenant (Information Leakage verhindert)
- **PASS**

#### EC-2: Session laeuft ab waehrend User aktiv ist
- [x] Proxy prueft Session bei jedem Request an geschuetzte Routen via `getUser()`
- [x] Abgelaufene Session -> `user` ist null -> Redirect auf `/login?returnTo=...`
- [ ] BUG: Es gibt keinen "Graceful Redirect mit Hinweis" wie im Spec gefordert. Der User wird einfach auf die Login-Seite umgeleitet, ohne Hinweis dass die Session abgelaufen ist. Kein `?reason=session_expired` o.Ae. Parameter.
- **PARTIAL PASS**

#### EC-3: Mehrfach-Login mit gleichen Credentials
- [x] Supabase Auth unterstuetzt standardmaessig mehrere parallele Sessions
- [x] Kein Single-Session-Lock implementiert (wie gefordert)
- **PASS**

#### EC-4: Direkt-URL-Zugriff auf geschuetzte Seite ohne Login
- [x] Proxy erkennt fehlende Session und leitet auf `/login?returnTo={path}` um
- [x] Nach Login: `window.location.href = returnTo` nutzt den gespeicherten Pfad
- **PASS**

#### EC-5: User-Account deaktiviert (durch Admin)
- [x] Login-Route prueft `membership.status !== 'active'` (Zeile 69)
- [x] Inaktiver Account -> `signOut()` + generischer Fehler
- [ ] BUG: Der generische Fehler "Ungueltige Zugangsdaten" wird zurueckgegeben statt der im Spec geforderten spezifischen Meldung "Konto deaktiviert, wende dich an deinen Admin". Dies ist eine bewusste Design-Entscheidung zugunsten der Security (kein Information Leaking), widerspricht aber dem Acceptance Criteria.
- **PARTIAL PASS** (Security > UX Tradeoff, aber Spec sagt spezifische Meldung)

---

### Security Audit Results

#### SEC-1: Authentication -- Login-API-Endpunkte
- [x] Tenant-Login: Prueft x-tenant-id Header, Supabase Auth, tenant_members, Status
- [x] Owner-Login: Prueft Supabase Auth, platform_admins
- [x] Bei JEDEM Fehlertyp identische generische Meldung (kein Information Leaking)
- [x] Fehlgeschlagener Login -> explizites signOut() um partielle Session zu bereinigen
- **PASS**

#### SEC-2: Authorization -- Cross-Tenant Session-Isolation
- [x] Login prueft tenant_members fuer den spezifischen Tenant
- [x] Proxy injiziert x-tenant-id serverseitig (nicht manipulierbar vom Client)
- [x] Cookie-Domain nicht explizit auf Parent-Domain gesetzt
- [ ] BUG (MEDIUM): Nach erfolgreichem Login auf Tenant A kann die Supabase Auth Session theoretisch auf Tenant B wiederverwendet werden, da das Session-Token (JWT) user-global ist. Die Schutzschicht ist der tenant_members-Check bei der Login-Route. ABER: Fuer bereits eingeloggte User gibt es keinen tenant_members-Check im Proxy (`maybeProtectTenantRoute` prueft nur ob ein User existiert via `getUser()`, nicht ob der User Mitglied des Tenants ist). Wenn ein Cookie irgendwie auf eine andere Subdomain gelangt (z.B. via Browser-Dev-Tools), koennte ein User geschuetzte Seiten eines anderen Tenants sehen.
- **FAIL** (Cross-Tenant Session nicht vollstaendig isoliert im Proxy)

#### SEC-3: Input Validation / Injection
- [x] Zod-Schema validiert E-Mail und Passwort server-seitig
- [x] Kein direktes SQL -- Supabase parametrisiert Queries
- [x] React escaped HTML-Output automatisch (XSS-Schutz)
- [x] JSON-Parse-Fehler werden abgefangen
- **PASS**

#### SEC-4: Rate Limiting auf Login-Endpunkten
- [x] Rate Limiting im Proxy fuer `/api/owner/*` (30 req/min pro IP)
- [ ] BUG (HIGH): Rate Limiting gilt NUR fuer `/api/owner/*` Pfade. Der Tenant-Login-Endpunkt `/api/auth/login` hat KEIN Rate Limiting. Ein Angreifer kann unbegrenzt Brute-Force-Versuche gegen den Tenant-Login durchfuehren. Der Spec fordert explizit "max. 5 Versuche/Minute pro IP".
- [ ] BUG (MEDIUM): Selbst das vorhandene Rate Limiting nutzt `x-forwarded-for` als IP-Quelle, was in Produktionsumgebungen hinter einem Proxy spoofbar sein kann. Vercel setzt zwar einen vertrauenswuerdigen x-forwarded-for, aber ein Angreifer koennte den Header direkt setzen wenn kein Reverse-Proxy davor steht.
- **FAIL**

#### SEC-5: CSRF-Schutz auf Login-Endpunkten
- [x] CSRF-Schutz im Proxy fuer `/api/owner/*` vorhanden
- [ ] BUG (MEDIUM): CSRF-Schutz gilt NUR fuer `/api/owner/*`. Die Tenant-Login- und Logout-Endpunkte (`/api/auth/login`, `/api/auth/logout`) haben KEINEN CSRF-Schutz. Ein boeswilliges Script koennte Logout-Requests im Namen eines eingeloggten Users senden (Logout-CSRF).
- **FAIL**

#### SEC-6: Sensitive Data Exposure
- [x] Passwort wird nie in API-Responses zurueckgegeben
- [x] Login-Response enthaelt nur id, email, role -- keine internen IDs oder DB-Details
- [x] Service-Role-Key nur server-seitig
- [ ] BUG (LOW): Login-Validation-Error-Response (Status 400) enthaelt `details: parsed.error.flatten().fieldErrors`. Dies gibt strukturierte Zod-Fehlermeldungen zurueck, die einem Angreifer verraten koennten, welche Felder fehlen/falsch sind. Bei einem Login-Formular sollte auch die 400-Response generisch sein.
- **PARTIAL PASS**

#### SEC-7: returnTo Open Redirect
- [ ] BUG (HIGH): Der `returnTo`-Parameter aus den SearchParams wird OHNE Validierung als `window.location.href` verwendet. Ein Angreifer kann einen Link wie `https://agentur-x.boost-hive.de/login?returnTo=https://evil.com/phishing` erstellen. Nach erfolgreichem Login wird der User auf die Phishing-Seite weitergeleitet. Es gibt keine Pruefung ob returnTo eine relative URL ist oder zur selben Domain gehoert.
- **FAIL**

#### SEC-8: Owner-Login auf Subdomain erreichbar
- [x] Owner-Login-Page liegt unter `/owner/login`
- [ ] BUG (MEDIUM): Die Owner-Login-API (`/api/auth/owner/login`) ist auch auf Subdomains erreichbar (z.B. `agentur-x.boost-hive.de/api/auth/owner/login`). Der Proxy blockiert dies nicht, da `/api/` ein Public Path ist. Ein Owner koennte sich versehentlich auf einer Subdomain als Owner einloggen. Die API-Route selbst prueft korrekt platform_admins, aber die Session wuerde auf der falschen Subdomain gesetzt.
- **PARTIAL PASS**

#### SEC-9: Supabase Auth eigene Rate Limits
- [x] Supabase Auth hat internes Rate Limiting (GoTrue), unabhaengig von der Anwendung
- [x] Dies bietet eine zweite Schutzschicht, reicht aber nicht als einzige Verteidigung
- **PASS** (als Defense-in-Depth)

---

### Cross-Browser und Responsive Testing (Code-Review)

#### Browser-Kompatibilitaet
- [x] Standard React/Next.js Patterns ohne browser-spezifische APIs
- [x] shadcn/ui Komponenten (Card, Input, Button, Alert, Label) sind cross-browser getestet
- [x] `window.location.href` fuer Redirect ist universell unterstuetzt
- [x] Eye/EyeOff Toggle nutzt Standard-Button und State (kein Custom-API)
- **PASS** (Chrome, Firefox, Safari)

#### Responsive Design
- [x] Login-Card: `max-w-md` (448px) zentriert mit `px-4` Padding
- [x] Bei 375px: Card passt (375px - 32px Padding = 343px < 448px) -- korrekt
- [x] Bei 768px: Card zentriert mit viel Platz -- korrekt
- [x] Bei 1440px: Card zentriert mit viel Platz -- korrekt
- [x] `min-h-screen` + `items-center justify-center` fuer vertikale/horizontale Zentrierung
- **PASS** (375px, 768px, 1440px)

---

### Regression Testing

#### PROJ-1: Subdomain Routing
- [x] `proxy.ts` wurde erweitert um Route-Protection, aber bestehende Logik (Subdomain-Extraktion, Tenant-Resolution, Header-Injection) bleibt unveraendert
- [x] `sanitizedHeaders()` wird weiterhin in allen Pfaden aufgerufen
- [x] `extractSubdomain()` unveraendert
- [x] Neue Public Paths (`/login`, `/owner/login`) korrekt in `PUBLIC_PATHS` aufgenommen
- **PASS**

#### PROJ-2: Tenant Provisioning
- [x] Owner-Layout Auth-Guard unveraendert
- [x] API-Routen unter `/api/owner/tenants` weiterhin durch `requireOwner()` geschuetzt
- [x] Rate Limiting und CSRF-Schutz weiterhin aktiv fuer `/api/owner/*`
- [x] Login-Form-Komponente ist neu und hat keine Ueberlappung mit bestehenden Komponenten
- **PASS**

---

### Bugs Found

#### BUG-1: Kein Rate Limiting auf Tenant-Login-Endpunkt
- **Severity:** High
- **Steps to Reproduce:**
  1. Sende 100+ POST-Requests in schneller Folge an `/api/auth/login` auf einer Subdomain
  2. Expected: Ab 5 Versuchen/Minute werden Requests mit 429 abgelehnt (laut Technical Requirements)
  3. Actual: Alle Requests werden verarbeitet. Rate Limiting existiert nur fuer `/api/owner/*`, nicht fuer `/api/auth/*`
- **Priority:** Fix before deployment
- **Datei:** `src/proxy.ts` (Zeile 205: `pathname.startsWith('/api/owner/')` muss auf `/api/auth/` erweitert werden)

#### BUG-2: Open Redirect via returnTo-Parameter
- **Severity:** High
- **Steps to Reproduce:**
  1. Erstelle Link: `https://agentur-x.boost-hive.de/login?returnTo=https://evil.com/steal-creds`
  2. Sende Link an ein Opfer
  3. Opfer loggt sich ein
  4. Expected: Redirect auf /dashboard (oder nur relative Pfade erlaubt)
  5. Actual: `window.location.href = 'https://evil.com/steal-creds'` -- User wird auf externe Seite weitergeleitet
- **Priority:** Fix before deployment
- **Datei:** `src/components/login-form.tsx` (Zeile 53) und `src/app/login/page.tsx` (Zeile 18)

#### BUG-3: Cross-Tenant Session nicht vollstaendig isoliert im Proxy
- **Severity:** High
- **Steps to Reproduce:**
  1. User ist Mitglied von Tenant A, loggt sich auf `tenant-a.boost-hive.de/login` ein
  2. User kopiert den Supabase-Session-Cookie aus dem Browser
  3. User setzt den Cookie manuell fuer `tenant-b.boost-hive.de`
  4. User besucht `tenant-b.boost-hive.de/dashboard`
  5. Expected: Redirect auf /login (User ist kein Mitglied von Tenant B)
  6. Actual: Proxy prueft nur `getUser()` (ob User existiert), nicht ob User Mitglied des Tenants ist. Die /dashboard-Seite wird moeglicherweise ausgeliefert.
- **Priority:** Fix before deployment
- **Datei:** `src/proxy.ts` Funktion `maybeProtectTenantRoute()` -- muss tenant_members-Check hinzufuegen

#### BUG-4: Kein Logout-UI vorhanden
- **Severity:** High
- **Steps to Reproduce:**
  1. Logge dich als Tenant-User ein
  2. Suche nach einem Logout-Button
  3. Expected: Logout-Button sichtbar (z.B. in Navigation oder Header)
  4. Actual: Es gibt keinen Logout-Button im gesamten Frontend. Die API-Route `/api/auth/logout` existiert, aber es gibt keinen Client-Code der sie aufruft.
- **Priority:** Fix before deployment
- **Datei:** Fehlend -- es muss eine Logout-Funktion im UI integriert werden

#### BUG-5: Kein CSRF-Schutz auf /api/auth/* Endpunkten
- **Severity:** Medium
- **Steps to Reproduce:**
  1. User ist auf Tenant A eingeloggt
  2. User besucht boeswillige Webseite
  3. Boeswillige Seite sendet POST an `/api/auth/logout` (Logout-CSRF)
  4. Expected: Request wird wegen fehlendem CSRF-Token abgelehnt
  5. Actual: User wird ausgeloggt, da `/api/auth/*` keinen CSRF-Schutz hat
- **Priority:** Fix before deployment
- **Datei:** `src/proxy.ts` -- CSRF-Schutz muss auf `/api/auth/*` erweitert werden

#### BUG-6: Owner-Login-API auf Subdomains erreichbar
- **Severity:** Medium
- **Steps to Reproduce:**
  1. Besuche `agentur-x.boost-hive.de/owner/login`
  2. Expected: Nicht erreichbar (Owner-Login nur auf Root-Domain)
  3. Actual: Page wird ausgeliefert, API-Endpunkt `/api/auth/owner/login` funktioniert auch auf Subdomains
- **Priority:** Fix in next sprint
- **Datei:** `src/proxy.ts` -- `/owner/login` und `/api/auth/owner/*` sollten auf Root-Domain beschraenkt werden

#### BUG-7: Session enthaelt keine tenant_id/role Information
- **Severity:** Medium
- **Steps to Reproduce:**
  1. Logge dich erfolgreich ein
  2. Supabase Session JWT enthaelt nur user_id und email
  3. Fuer jeden geschuetzten API-Call muss die Role erneut aus der DB gelesen werden
  4. Expected: Session/JWT enthaelt tenant_id und role (via Supabase Custom Claims)
  5. Actual: Kein Custom Claim im JWT. Performance-Impact bei vielen API-Calls.
- **Priority:** Fix in next sprint
- **Datei:** Supabase Auth Config -- Custom Claims Hook fehlt

#### BUG-8: Login-Validation gibt strukturierte Fehlermeldungen zurueck
- **Severity:** Low
- **Steps to Reproduce:**
  1. Sende POST an `/api/auth/login` mit `{ "email": "not-an-email", "password": "1" }`
  2. Expected: Generische Fehlermeldung (wie bei falschen Credentials)
  3. Actual: Response enthaelt `details: { email: [...], password: [...] }` neben der generischen Meldung
- **Priority:** Nice to have
- **Datei:** `src/app/api/auth/login/route.ts` Zeile 35-38 und `src/app/api/auth/owner/login/route.ts` Zeile 28-31

#### BUG-9: Fehlender Session-Expired-Hinweis bei Redirect
- **Severity:** Low
- **Steps to Reproduce:**
  1. Logge dich ein und warte bis Session ablaeuft
  2. Versuche eine geschuetzte Seite zu laden
  3. Expected: Redirect auf `/login?reason=session_expired` mit Hinweis "Sitzung abgelaufen"
  4. Actual: Redirect auf `/login?returnTo=...` ohne Hinweis warum
- **Priority:** Nice to have
- **Datei:** `src/proxy.ts` Funktion `maybeProtectTenantRoute()` und `src/app/login/page.tsx`

#### BUG-10: Deaktivierter Account zeigt generische statt spezifische Meldung
- **Severity:** Low
- **Steps to Reproduce:**
  1. Admin deaktiviert einen User (status -> inactive in tenant_members)
  2. User versucht Login
  3. Expected: "Konto deaktiviert, wende dich an deinen Admin" (laut Edge Case Spec)
  4. Actual: "Ungueltige Zugangsdaten" (generische Meldung)
- **Priority:** Nice to have (Design-Entscheidung: Security > UX)
- **Datei:** `src/app/api/auth/login/route.ts` Zeile 69-72

#### BUG-11: Owner-Login Open Redirect (identisch zu BUG-2, aber fuer Owner)
- **Severity:** High
- **Steps to Reproduce:**
  1. Erstelle Link: `https://boost-hive.de/owner/login?returnTo=https://evil.com/phishing`
  2. Owner loggt sich ein
  3. Expected: Redirect auf /owner (oder nur relative Pfade)
  4. Actual: `window.location.href = 'https://evil.com/phishing'` -- Owner wird auf externe Seite weitergeleitet
- **Priority:** Fix before deployment
- **Datei:** `src/app/owner/login/page.tsx` (Zeile 19: `const returnTo = params.returnTo || '/owner'`) und `src/components/login-form.tsx` (Zeile 53)

#### BUG-12: Owner-Layout Auth-Guard leitet auf `/` statt `/owner/login` um
- **Severity:** Medium
- **Steps to Reproduce:**
  1. Besuche `/owner` ohne eingeloggt zu sein
  2. Expected: Redirect auf `/owner/login`
  3. Actual: `(owner)/layout.tsx` Zeile 18 macht `redirect('/')` statt `redirect('/owner/login')`. Der Proxy schuetzt zwar `/owner/*` und leitet auf `/owner/login` um, aber der Server-seitige Auth-Guard im Layout hat einen veralteten Redirect-Pfad (TODO-Kommentar in Zeile 17: "Nach PROJ-3 auf /login anpassen").
- **Priority:** Fix before deployment
- **Datei:** `src/app/(owner)/layout.tsx` Zeile 18 -- `redirect('/')` sollte `redirect('/owner/login')` sein

#### BUG-13: Rate Limiting Memory Leak -- Map waechst unbegrenzt
- **Severity:** Medium
- **Steps to Reproduce:**
  1. In-Memory `rateLimitMap` in `proxy.ts` hat keinen Cleanup-Mechanismus
  2. Abgelaufene Eintraege werden nur geloescht wenn derselbe Key erneut abgefragt wird (Zeile 28-30)
  3. Bei vielen unterschiedlichen IPs/Pfaden waechst die Map unbegrenzt
  4. Expected: Periodisches Aufraemen abgelaufener Eintraege oder LRU-Cache
  5. Actual: Potentieller Memory Leak bei Langzeit-Betrieb (in Vercel Serverless weniger relevant, aber in Dev-Server oder langlebigen Prozessen problematisch)
- **Priority:** Fix in next sprint
- **Datei:** `src/proxy.ts` Zeile 15 -- `rateLimitMap` braucht periodischen Cleanup oder Upstash Redis (wie im Kommentar erwaehnt)

#### BUG-14: Login-API gibt nur HTTP-Only Cookies via Supabase SSR, aber kein explizites HttpOnly/Secure Flag
- **Severity:** Low
- **Steps to Reproduce:**
  1. Login-Route nutzt `createClient()` aus `supabase.ts`, die via `cookieStore.set(name, value, options)` Cookies setzt
  2. Die `options` kommen von Supabase SSR und sollten HttpOnly + Secure enthalten
  3. ABER: Es gibt keine Verifikation, dass Supabase SSR diese Flags korrekt setzt
  4. Die `createClient()` in `supabase.ts` uebergibt die `options` 1:1 an `cookieStore.set()` -- kein explizites `httpOnly: true, secure: true`
  5. Risiko: Wenn Supabase SSR die Flags nicht setzt, waere das Session-Cookie per JavaScript auslesbar (XSS-Angriff)
- **Priority:** Nice to have (Supabase SSR setzt normalerweise korrekte Flags, sollte aber verifiziert werden)
- **Datei:** `src/lib/supabase.ts` Zeile 34

---

### Build und Lint Results

| Check | Status | Details |
|-------|--------|---------|
| `npm run build` | PASS | Kompiliert erfolgreich in 1.9s (Turbopack). 13 Routen generiert. |
| TypeScript | PASS | Keine Type-Errors. |
| Proxy (Middleware) | PASS | Korrekt als `proxy.ts` erkannt, keine Deprecation-Warnung. |
| Alle neuen Routen | PASS | `/login`, `/owner/login`, `/api/auth/login`, `/api/auth/logout`, `/api/auth/owner/login` alle im Build-Output. |

---

### Summary

- **Acceptance Criteria:** 7/10 passed, 2 partial (AC-4 Session-Inhalt, AC-5 Cookie-Scoping), 1 failed (AC-8 Logout-UI fehlt)
- **Edge Cases:** 3/5 passed, 2/5 partial
- **Bugs Found:** 14 total (0 Critical, 5 High, 4 Medium, 5 Low)
- **Security:** Schwerwiegende Findings -- Open Redirect auf beiden Login-Pages (BUG-2 + BUG-11), fehlendes Rate Limiting auf Tenant-Login (BUG-1), Cross-Tenant Session Bypass (BUG-3), CSRF-Schutz fehlt auf Auth-Endpunkten (BUG-5)
- **Production Ready:** NEIN

**Empfehlung (Prioritaet 1 -- Fix before deployment):**
1. BUG-2 + BUG-11: Open Redirect auf beiden Login-Pages beheben (returnTo auf relative Pfade beschraenken)
2. BUG-1: Rate Limiting auf `/api/auth/login` und `/api/auth/owner/login` erweitern
3. BUG-3: Cross-Tenant Session-Check im Proxy (`maybeProtectTenantRoute`) hinzufuegen
4. BUG-4: Logout-UI implementieren (Button + Client-Code der `/api/auth/logout` aufruft + Redirect auf `/login`)
5. BUG-5: CSRF-Schutz auf `/api/auth/*` erweitern
6. BUG-12: Owner-Layout Auth-Guard von `redirect('/')` auf `redirect('/owner/login')` aendern

**Empfehlung (Prioritaet 2 -- Fix in next sprint):**
- BUG-6: Owner-Login-API auf Subdomains blockieren
- BUG-7: Custom Claims im JWT fuer tenant_id/role
- BUG-13: Rate Limiting Map Cleanup

**Empfehlung (Prioritaet 3 -- Nice to have):**
- BUG-8, BUG-9, BUG-10, BUG-14

## Deployment
_To be added by /deploy_
