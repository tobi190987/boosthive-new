# PROJ-26: Google Search Console OAuth Integration

## Status: Deployed
**Created:** 2026-03-28
**Last Updated:** 2026-03-29

## Dependencies
- Requires: PROJ-3 (User Authentication)
- Requires: PROJ-6 (Role-Based Access Control) — nur Admin kann GSC verbinden
- Requires: PROJ-25 (Keyword Project Management) — Projekte müssen existieren
- External: Google Search Console API (OAuth 2.0)

## User Stories
- Als Admin möchte ich für jedes Kundenprojekt ein eigenes Google-Konto (Search Console) verbinden, damit Ranking-Daten pro Kunde automatisch abgerufen werden können.
- Als Admin möchte ich sehen, ob die GSC-Verbindung eines Projekts aktiv ist und für welche Properties Zugriff besteht, damit ich Fehler früh erkennen kann.
- Als Admin möchte ich die GSC-Verbindung eines Projekts trennen können, wenn ein Kunde wechselt oder die Berechtigung entzogen wird.
- Als Member möchte ich klare Fehlermeldungen sehen, wenn das GSC-Token abgelaufen ist, damit ich meinen Admin informieren kann.

## Acceptance Criteria
- [ ] Admin kann pro Keyword-Projekt einen OAuth-Flow mit Google starten (Button "Google Search Console verbinden" im Integrationen-Tab)
- [ ] Nach erfolgreichem OAuth wird Access Token + Refresh Token AES-256 verschlüsselt in der Datenbank gespeichert (pro Projekt)
- [ ] System zeigt Liste der verfügbaren GSC-Properties (verifizierte Domains) aus dem Google-Konto
- [ ] Admin kann eine Property aus der Liste als aktive Property für das Projekt auswählen
- [ ] Verbindungsstatus ist im Integrationen-Tab sichtbar: verbunden / nicht verbunden / Token abgelaufen
- [ ] Bei abgelaufenem Refresh Token: Fehler-State im UI, kein Tracking-Lauf
- [ ] Admin kann die Verbindung trennen (Tokens werden aus DB gelöscht)
- [ ] Ein Projekt hat maximal eine GSC-Verbindung (1:1)
- [ ] Verschiedene Projekte desselben Tenants können verschiedene Google-Konten verwenden

## Edge Cases
- OAuth-Flow wird vom User abgebrochen → keine Tokens gespeichert, kein Fehler-State
- Google verweigert Zugriff (falscher Account, keine GSC-Property) → verständliche Fehlermeldung
- Refresh Token wird von Google widerrufen → System erkennt 401-Fehler beim nächsten Tracking-Lauf und setzt Status auf "Token abgelaufen"
- Projekt wird gelöscht → GSC-Verbindung wird mitgelöscht (Cascade)
- Tenant wird gelöscht → alle GSC-Verbindungen werden mitgelöscht (Cascade, DSGVO)
- GSC-Property wurde nach dem Verbinden in Google gelöscht → Tracking-Lauf schlägt fehl, Fehlermeldung im Dashboard

## Technical Requirements
- Security: Tokens AES-256 verschlüsselt in der DB (nie im Klartext)
- Security: OAuth State-Parameter gegen CSRF absichern
- Compliance: Minimale OAuth-Scopes (`https://www.googleapis.com/auth/webmasters.readonly`)
- Performance: Token-Refresh erfolgt serverseitig vor jedem API-Call, nicht im Client

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

### Kernkonzept

Jedes Keyword-Projekt (= ein Kundenprojekt) kann genau eine GSC-Verbindung haben. Ein Tenant mit 5 Projekten kann bis zu 5 verschiedene GSC-Accounts verbinden.

### Komponenten-Struktur

```
Keyword Projects Workspace (/tools/keywords)
+-- Projekt-Card
    +-- GSC Status Badge (verbunden / nicht verbunden / abgelaufen)

Projekt-Detail View (/tools/keywords/[id])
+-- Tabs (bestehend: Keywords, Wettbewerber, Einstellungen)
    +-- NEU: Integrationen-Tab (Admin: editierbar, Member: read-only)
        +-- GSC Integration Card
            +-- Status Badge
            +-- [Google Search Console verbinden] Button
            +-- (wenn verbunden)
                |-- Verbundenes Google-Konto (E-Mail)
                |-- Property Selector (Dropdown: verfügbare Domains)
                |-- Aktive Property
                |-- [Verbindung trennen] Button (mit Bestätigung)

API-Routen (neu, unter Projekt):
/api/tenant/keywords/projects/[id]/gsc/connect      → startet OAuth-Flow
/api/tenant/keywords/projects/[id]/gsc/callback     → empfängt Tokens von Google
/api/tenant/keywords/projects/[id]/gsc/properties   → listet GSC-Properties
/api/tenant/keywords/projects/[id]/gsc/property     → setzt aktive Property (PATCH)
/api/tenant/keywords/projects/[id]/gsc/disconnect   → löscht Tokens
/api/tenant/keywords/projects/[id]/gsc/status       → Verbindungsstatus
```

### Datenmodell

**Neue Tabelle: `gsc_connections`**

| Feld | Bedeutung |
|------|-----------|
| `id` | Eindeutige ID |
| `project_id` | Zugehöriges Keyword-Projekt (UNIQUE — 1 GSC pro Projekt) |
| `tenant_id` | Für Tenant-Isolation & Cascade bei Tenant-Delete |
| `google_email` | E-Mail des verbundenen Google-Kontos (kein Secret) |
| `encrypted_access_token` | Google Access Token (AES-256 verschlüsselt) |
| `encrypted_refresh_token` | Langzeit-Token für Token-Erneuerung (AES-256 verschlüsselt) |
| `token_expires_at` | Ablaufzeit des Access Tokens |
| `selected_property` | Gewählte GSC-Property (z. B. `https://example.com/`) |
| `status` | `connected` / `expired` / `revoked` |
| `connected_at` | Timestamp der Verbindung |
| `connected_by` | User-ID des Admins |

**Cascade-Regeln:**
- Projekt gelöscht → GSC-Verbindung wird mitgelöscht
- Tenant gelöscht → alle GSC-Verbindungen werden mitgelöscht (DSGVO)

### OAuth-Flow

```
Admin öffnet Integrationen-Tab in Projekt "Müller GmbH"
      ↓
Klick "Verbinden" → API generiert State-Token (enthält project_id + CSRF-Token)
      ↓
Browser → Google OAuth (Scope: webmasters.readonly)
      ↓
Callback: /api/tenant/keywords/projects/[id]/gsc/callback?code=...&state=...
      ↓
Server: State validieren → project_id extrahieren → Code gegen Tokens tauschen
      ↓
Tokens AES-256 verschlüsselt in gsc_connections gespeichert
      ↓
GSC-Properties des Google-Kontos werden geladen
      ↓
Admin wählt passende Property für dieses Projekt
```

### Tech-Entscheidungen

| Entscheidung | Warum |
|---|---|
| **Verbindung pro Projekt (nicht pro Tenant)** | Jeder Kunde hat eigene Domain + eigenes Google-Konto |
| **Integrationen-Tab im bestehenden Projekt-Detail** | Kein neues UI-Konzept — Tab-Pattern aus PROJ-25 wiederverwenden |
| **State enthält project_id** | OAuth-Callback weiß, zu welchem Projekt die Tokens gehören |
| **UNIQUE auf project_id** | 1:1-Beziehung — kein Multi-Account-Chaos pro Projekt |
| **tenant_id redundant in gsc_connections** | Schnellerer Zugriff für RLS-Policies ohne JOIN auf keyword_projects |
| **AES-256 via node:crypto (built-in)** | Tokens niemals im Klartext — kein externes Package nötig |
| **Nur `webmasters.readonly` Scope** | Minimale Berechtigung — Google kann nur gelesen, nie geschrieben werden |
| **Token-Refresh serverseitig** | Client bekommt echte Tokens nie zu sehen |

### Abhängigkeiten (neue Packages)

| Package | Zweck |
|---|---|
| `googleapis` | Google OAuth 2.0 + Search Console API |
| `node:crypto` (built-in) | AES-256 Tokenverschlüsselung — kein externes Paket nötig |

## Implementation Notes (Frontend)

**Implemented in:** `src/components/keyword-projects-workspace.tsx`

### Changes:
- Added new "Integrationen" tab in ProjectDetail view (Admin: editierbar, Member: read-only)
- New `IntegrationsTab` component with full GSC integration UI:
  - `GscStatusBadge` component showing: Verbunden (green), Token abgelaufen (amber), Zugriff widerrufen (red), Nicht verbunden (grey)
  - Not connected state: empty state with "Google Search Console verbinden" button that triggers OAuth flow via POST to `/api/tenant/keywords/projects/[id]/gsc/connect`
  - Connected state: shows Google account email, property selector dropdown (loaded from `/gsc/properties`), active property selection (PATCH to `/gsc/property`), disconnect button with confirmation dialog
  - Expired/Revoked state: warning alert with reconnect and disconnect options
  - OAuth callback handling: reads `?gsc=connected` or `?gsc_error=...` from URL after redirect
- New TypeScript types: `GscStatus`, `GscConnection`, `GscProperty`
- All states (loading skeleton, error, empty) implemented
- Responsive design with mobile-first approach
- Uses existing shadcn/ui components: Card, Badge, Button, Alert, Select, Dialog, Tabs, Separator, Skeleton, Label

### API endpoints consumed (frontend expects these):
- `GET /api/tenant/keywords/projects/[id]/gsc/status` — returns `{ connection: GscConnection | null }`
- `POST /api/tenant/keywords/projects/[id]/gsc/connect` — returns `{ url: string }` (OAuth redirect URL)
- `GET /api/tenant/keywords/projects/[id]/gsc/properties` — returns `{ properties: GscProperty[] }`
- `PATCH /api/tenant/keywords/projects/[id]/gsc/property` — body: `{ selected_property: string }`
- `DELETE /api/tenant/keywords/projects/[id]/gsc/disconnect`

## Implementation Notes (Backend)

**Migration:** `supabase/migrations/020_gsc_connections.sql`
- `gsc_connections` Tabelle mit UNIQUE auf `project_id` (1:1 pro Projekt)
- RLS: SELECT für Tenant-Members, alle Mutations über Service Role

**Neue Libraries:**
- `src/lib/gsc-crypto.ts` — AES-256-GCM Token-Verschlüsselung (`encryptToken`/`decryptToken`) + HMAC-State
- `src/lib/gsc-oauth.ts` — OAuth-Flow-Helpers via `fetch` (kein googleapis-Package): `buildAuthorizationUrl`, `createOAuthState`/`verifyOAuthState`, `exchangeCodeForTokens`, `refreshAccessToken`, `getGoogleEmail`, `listGscProperties`, `TokenRevokedError`

**API-Routen:**
- `GET /api/gsc/callback` — Zentraler OAuth-Callback (kein Tenant-Header nötig), validiert State, tauscht Code gegen Tokens, verschlüsselt und speichert in DB, redirectet zu `{slug}.boost-hive.de/tools/keywords/{id}?gsc=connected`
- `POST .../gsc/connect` — Generiert OAuth-URL mit HMAC-gesichertem State (Rate Limit: 5/15min)
- `GET .../gsc/status` — Verbindungsstatus ohne Tokens (auch für Members)
- `GET .../gsc/properties` — GSC-Properties mit automatischem Token-Refresh; setzt Status auf `expired`/`revoked` bei Fehler
- `PATCH .../gsc/property` — Setzt aktive GSC-Property
- `DELETE .../gsc/disconnect` — Löscht Verbindung aus DB

**Neue Rate-Limit-Presets:** `GSC_CONNECT` (5/15min), `GSC_READ` (60/min), `GSC_WRITE` (20/min) in `src/lib/rate-limit.ts`

**Neue Env-Variablen:**
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` — bereits in `.env.local`
- `NEXT_PUBLIC_APP_URL` — für OAuth redirect_uri base
- `GSC_ENCRYPTION_KEY` — 64 Hex-Zeichen (AES-256 Key)
- `GSC_STATE_SECRET` — HMAC-Secret für State-Token

**Google Cloud Console:** Redirect-URI `http://localhost:3000/api/gsc/callback` (dev) und `https://app.boost-hive.de/api/gsc/callback` (prod) muss in den OAuth-Credentials eingetragen sein.

## QA Test Results

**Tested:** 2026-03-29
**App URL:** http://localhost:3000
**Tester:** QA Engineer (AI)
**Method:** Code review + static analysis (OAuth integration cannot be end-to-end tested without real Google credentials)

### Acceptance Criteria Status

#### AC-1: Admin kann OAuth-Flow starten (Button "Google Search Console verbinden")
- [x] "Integrationen" Tab vorhanden in der Projekt-Detailansicht
- [x] Button "Google Search Console verbinden" vorhanden im Not-Connected-State (Zeile 1724-1735)
- [x] POST-Request an `/api/tenant/keywords/projects/[id]/gsc/connect` erzeugt OAuth-URL
- [x] `requireTenantAdmin` Guard auf connect-Endpoint
- [x] Rate Limit: `GSC_CONNECT` (5/15min)
- **PASS**

#### AC-2: Tokens AES-256 verschluesselt gespeichert
- [x] `gsc-crypto.ts` nutzt AES-256-GCM via node:crypto
- [x] IV ist zufaellig (16 Bytes), AuthTag wird gespeichert
- [x] Format iv:authTag:ciphertext (hex-encoded)
- [x] Key wird direkt aus einem 64-stelligen Hex-Secret geladen
- [x] Callback-Route verschluesselt Tokens vor dem Speichern (Zeile 74-75)
- **PASS**

#### AC-3: System zeigt Liste der GSC-Properties
- [x] GET `/gsc/properties` Endpoint vorhanden
- [x] Automatischer Token-Refresh wenn abgelaufen (60s Buffer)
- [x] TokenRevokedError wird korrekt behandelt und Status in DB aktualisiert
- [x] Frontend zeigt Properties im Select-Dropdown
- **PASS**

#### AC-4: Admin kann Property auswaehlen
- [x] PATCH `/gsc/property` Endpoint vorhanden
- [x] Zod-Validierung fuer `selected_property` (min 1, max 2048)
- [x] `requireTenantAdmin` Guard
- [x] Tenant-Isolation: `.eq('tenant_id', tenantId)` in Update-Query
- [x] Frontend Select-Komponente mit `onValueChange` triggert PATCH
- **PASS**

#### AC-5: Verbindungsstatus sichtbar (verbunden / nicht verbunden / abgelaufen)
- [x] `GscStatusBadge` Komponente mit 4 Status: connected (gruen), expired (amber), revoked (rot), not_connected (grau)
- [x] Status-Endpoint gibt Verbindung ohne Tokens zurueck
- [x] `requireTenantUser` Guard (auch Members koennen Status sehen)
- [x] Members sehen den Integrationen-Tab read-only mit klaren Hinweisen bei `expired`/`revoked`
- **PASS**

#### AC-6: Fehler-State bei abgelaufenem Refresh Token
- [x] Alert-Komponente fuer expired/revoked Status mit Reconnect-Option
- [x] Properties-Endpoint setzt Status auf `revoked` bei widerrufenem Token
- [x] Temporaere Refresh-Fehler fuehren nicht mehr zu einem falschen permanenten `expired`-Status
- [x] `TokenRevokedError` Custom-Error-Klasse korrekt implementiert
- **PASS**

#### AC-7: Admin kann Verbindung trennen
- [x] DELETE `/gsc/disconnect` Endpoint vorhanden
- [x] Bestaetigung via Dialog vor dem Loeschen
- [x] `requireTenantAdmin` Guard
- [x] Tenant-Isolation in Delete-Query
- **PASS**

#### AC-8: Ein Projekt hat maximal eine GSC-Verbindung (1:1)
- [x] `UNIQUE` Constraint auf `project_id` in Migration
- [x] Upsert mit `onConflict: 'project_id'` im Callback
- **PASS**

#### AC-9: Verschiedene Projekte koennen verschiedene Google-Konten nutzen
- [x] Architektur erlaubt dies: jedes Projekt hat eigene `gsc_connections`-Zeile
- [x] Kein Tenant-weiter UNIQUE-Constraint auf `google_email`
- **PASS**

### Edge Cases Status

#### EC-1: OAuth-Flow vom User abgebrochen
- [x] Callback prueft `error === 'access_denied'` und redirected ohne Tokens zu speichern
- [x] Browsergebundener State-Cookie erlaubt projektspezifischen Redirect bei vorhandenem State
- **PASS**

#### EC-2: Google verweigert Zugriff
- [x] Fehlermeldung wird an Frontend als `gsc_error` Query-Parameter weitergegeben
- [x] Frontend zeigt Toast mit Fehlerbeschreibung
- **PASS**

#### EC-3: Refresh Token von Google widerrufen
- [x] `refreshAccessToken()` erkennt `invalid_grant` und wirft `TokenRevokedError`
- [x] Properties-Endpoint setzt Status auf `revoked` in DB
- [x] Fehler-Parsing ist gegen nicht-JSON Responses abgesichert
- **PASS**

#### EC-4: Projekt geloescht -> Cascade
- [x] `ON DELETE CASCADE` auf `project_id` FK in Migration
- **PASS**

#### EC-5: Tenant geloescht -> Cascade (DSGVO)
- [x] `ON DELETE CASCADE` auf `tenant_id` FK in Migration
- **PASS**

#### EC-6: GSC-Property nach Verbindung in Google geloescht
- [x] `listGscProperties` gibt leere Liste zurueck wenn keine Properties mehr vorhanden
- [x] Frontend zeigt "Keine Properties gefunden" Alert
- **PASS**

### Security Audit Results

#### Authentication & Authorization
- [x] Alle Mutation-Endpoints (connect, disconnect, property) pruefen `requireTenantAdmin`
- [x] Status-Endpoint erlaubt auch Members (via `requireTenantUser`) -- korrekt laut Spec
- [x] Module-Access-Check (`requireTenantModuleAccess('seo_analyse')`) auf allen Endpoints
- [x] RLS: SELECT nur fuer Tenant-Members, INSERT/UPDATE/DELETE per Policy verboten (nur Service Role)
- [x] Callback-Route prueft browsergebundenen Nonce-Cookie gegen den signierten State
- [x] OAuth-State enthaelt `issuedAt` und laeuft nach 10 Minuten ab

#### CSRF Protection
- [x] State-Parameter mit HMAC-SHA256 signiert
- [x] Nonce in State-Payload (16 Bytes zufaellig)
- [x] Constant-time HMAC-Vergleich via `timingSafeEqual`

#### Input Validation
- [x] `selected_property`: Zod-Validierung (min 1, max 2048)
- [x] `projectId` wird in allen GSC-Routen als UUID validiert
- [x] `selected_property` wird serverseitig gegen die tatsaechlich verfuegbaren GSC-Properties validiert

#### Token Security
- [x] Tokens werden nie an den Client gesendet (Status-Endpoint filtert encrypted-Felder)
- [x] AES-256-GCM mit Auth-Tag (authenticated encryption)
- [x] Token-Refresh serverseitig
- [x] Nur `webmasters.readonly` Scope

#### Rate Limiting
- [x] GSC_CONNECT: 5/15min (OAuth-Flow-Start)
- [x] GSC_READ: 60/min (Status, Properties)
- [x] GSC_WRITE: 20/min (Property setzen, Disconnect)
- [x] Rate Limit auf Callback fehlt -- aber Callback ist ueber HMAC-State geschuetzt

#### Data Exposure
- [x] `token_expires_at` wird im Status-Response zurueckgegeben -- unkritisch
- [x] Keine Tokens in API-Responses
- [x] Keine Secrets in Client-seitigem Code

#### Env Variables
- [x] Alle neuen Env-Variablen in `.env.local.example` dokumentiert
- [x] `GOOGLE_CLIENT_SECRET`, `GSC_ENCRYPTION_KEY`, `GSC_STATE_SECRET` ohne `NEXT_PUBLIC_` Prefix

### Cross-Browser Testing
*Hinweis: Rein Code-basierte Analyse. OAuth-Redirect und Callback funktionieren browser-unabhaengig (HTTP-Redirects).*
- [x] Chrome: Standard-Verhalten, keine browser-spezifischen APIs verwendet
- [x] Firefox: Keine Kompatibilitaetsprobleme erkennbar
- [x] Safari: `window.history.replaceState` wird nach OAuth-Callback genutzt -- kompatibel

### Responsive Testing
*Hinweis: Code-basierte Analyse der CSS-Klassen.*
- [x] 375px (Mobile): `flex-col` Layout fuer Buttons, `w-full` auf Selects, truncate auf E-Mails
- [x] 768px (Tablet): `sm:flex-row` fuer Buttons, `sm:w-96` auf Select
- [x] 1440px (Desktop): Card-Layout mit `max-w-md` auf Dialog

### Bugs Found
- Keine offenen Findings im finalen QA-Review.

### Summary
- **Acceptance Criteria:** 9/9 passed
- **Edge Cases:** 6/6 passed
- **Bugs Found:** 0 offene Findings im finalen QA-Review
- **Security:** Solide Grundlage. Token-Verschluesselung, browsergebundener OAuth-State mit TTL, Tenant-Isolation, serverseitige Property-Validierung und RLS sind umgesetzt.
- **Production Ready:** JA
- **Recommendation:** Bereit fuer produktiven Einsatz; echter Google-OAuth-End-to-End-Test bleibt ein sinnvoller Smoke-Test nach dem Live-Deploy.

## Deployment

**Deployed:** 2026-03-29
**Environment:** Vercel Preview
**Status:** Erfolgreich deployed

### Deployment Details
- Preview-URL: `https://boosthive-8doj9i0gt-tobis-projects-24837701.vercel.app`
- Alias: `https://boosthive-new-tobiaswollenweber-5176-tobis-projects-24837701.vercel.app`
- Inspector: `https://vercel.com/tobis-projects-24837701/boosthive-new/C1mehgVpAWEbuU5SsLXXbdkFmAQD`
- Deployment-ID: `dpl_C1mehgVpAWEbuU5SsLXXbdkFmAQD`

### Pre-Deploy Checks
- `npm run build` erfolgreich
- `npm run lint` erfolgreich bis auf eine bestehende, fachfremde Warning in `src/components/tenant-tools-workspace.tsx`
- GSC-Routen und Integrationen-Tab in Vercel-Build enthalten

### Hinweise
- Dieses Deployment wurde als Preview aus einem dirty Worktree per Vercel CLI erstellt (`gitDirty=1`).
- Production wurde in diesem Schritt **nicht** promoted. Fuer Live unter `www.boost-hive.de` waere ein separater `vercel --prod` Deploy noetig.
- Der Google-OAuth-Flow konnte ohne reale Google-Credentials weiterhin nicht end-to-end gegen die Preview verifiziert werden.
