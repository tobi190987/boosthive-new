# PROJ-1: Subdomain Routing & Tenant Resolution

## Status: In Progress
**Created:** 2026-03-26
**Last Updated:** 2026-03-26

## Implementation Notes
**Implementiert am 2026-03-26**

Folgende Dateien wurden erstellt/geändert:
- `src/middleware.ts` — Subdomain-Extraktion, Tenant-Resolution mit Supabase, In-Memory-Cache (60s TTL), lokaler Fallback für `*.localhost`
- `src/lib/supabase.ts` — Browser-Client, Server-Client (SSR), schlanker Middleware-Client
- `src/lib/tenant.ts` — `getTenantContext()` und `requireTenantContext()` für Server Components / Route Handlers
- `supabase/migrations/001_create_tenants.sql` — `tenants`-Tabelle mit RLS, Policies, Indexes, Trigger, Seed-Tenant
- `src/app/not-found/page.tsx` — 404-Seite für unbekannte Subdomains
- `.env.local.example` — Dokumentation aller benötigten Env-Variablen

**Abweichungen vom ursprünglichen Plan:**
- Next.js 16 Deprecation: `middleware.ts` → künftig `proxy.ts` (noch nicht umbenannt, da breaking change)
- Lokaler Fallback gibt `local-dev-fallback` als Tenant-ID zurück (kein echter DB-Lookup bei fehlendem Tenant in Dev)

**Noch offen:**
- Migration manuell in Supabase Dashboard ausführen
- Lokales Testen mit `agentur-x.localhost:3000` erfordert hosts-file-Eintrag

## Dependencies
- None (Fundament für alle anderen Features)

## User Stories
- Als System möchte ich aus einer eingehenden Request-URL die Subdomain extrahieren, um den zugehörigen Tenant zu identifizieren.
- Als Besucher von `agentur-x.boost-hive.de` möchte ich automatisch auf den richtigen Tenant-Kontext geleitet werden, ohne manuell navigieren zu müssen.
- Als Owner möchte ich, dass Anfragen an `boost-hive.de` (ohne Subdomain) auf eine Landing Page / Owner-Bereich geleitet werden.
- Als System möchte ich, dass Anfragen an eine unbekannte Subdomain eine klare 404-Fehlermeldung liefern, statt falsche Daten zu zeigen.
- Als Admin möchte ich sicher sein, dass meine Tenant-Daten niemals durch einen falschen Subdomain-Request zugänglich sind.

## Acceptance Criteria
- [ ] Next.js Middleware liest die `host`-Header aller eingehenden Requests aus
- [ ] Subdomain wird aus dem Host extrahiert (z. B. `agentur-x` aus `agentur-x.boost-hive.de`)
- [ ] Subdomain wird gegen die Datenbank aufgelöst → Tenant-Objekt wird ermittelt
- [ ] Unbekannte Subdomains erhalten HTTP 404 mit klarer Fehlermeldung
- [ ] Root-Domain (`boost-hive.de`) leitet auf Owner-Bereich / Landing Page
- [ ] Tenant-ID und Tenant-Slug werden als Request-Kontext an alle nachgelagerten Routen weitergegeben
- [ ] Funktioniert lokal mit `agentur-x.localhost:3000` (via hosts-file oder Middleware-Bypass)
- [ ] Funktioniert in Produktion mit Wildcard-DNS `*.boost-hive.de`

## Edge Cases
- Subdomain enthält Sonderzeichen oder ist zu lang → Ablehnen mit 400
- Subdomain existiert in DB, aber Tenant ist deaktiviert → 403 mit Nachricht "Tenant inaktiv"
- Request kommt ohne `host`-Header (z. B. direkte IP-Anfrage) → Fallback auf Root-Domain
- Lokale Entwicklung ohne Wildcard-DNS → Dokumentierter Workaround (hosts-file / env-Variable)
- Concurrent Requests für denselben Tenant → Kein Race Condition bei DB-Lookup (Connection Pooling)

## Technical Requirements
- Performance: Tenant-Lookup < 50ms (gecacht wenn möglich)
- Security: Kein Tenant-Kontext darf in Client-seitigen Cookies/State ohne Validierung gesetzt werden
- Middleware-Position: Läuft vor allen anderen Middleware-Schichten

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

### How It Works (Big Picture)

Every request to `*.boost-hive.de` passes through a **single middleware layer** that runs before anything else. This middleware reads the URL, figures out which tenant is being requested, validates it, and either passes the request through (with tenant context attached) or blocks it with the appropriate error.

### Component Structure

```
Incoming Request
+-- Next.js Middleware (runs before ALL routes — edge layer)
    +-- 1. Host Header Parser
    |       Extracts subdomain from "agentur-x.boost-hive.de"
    |       → subdomain = "agentur-x"
    |       → root domain? → redirect to Owner/Landing area
    |       → invalid format (special chars, too long)? → 400
    |
    +-- 2. Tenant Resolver
    |       Looks up subdomain in database → Tenant record
    |       → Not found? → 404 page
    |       → Found but inactive? → 403 page ("Tenant inaktiv")
    |       → Found and active? → continue
    |
    +-- 3. Context Injector
    |       Attaches tenant-id + tenant-slug to request headers
    |       (server-side only — never exposed to client directly)
    |
    +-- 4. Route Pass-Through
            Forwards request to normal Next.js routing
            All pages/APIs can now read tenant context from headers

App Pages (receive tenant context automatically)
+-- /                 → Landing page (root domain, no tenant)
+-- /owner/...        → Owner admin area (root domain only)
+-- /dashboard/...    → Tenant workspace (requires valid tenant)
+-- /404              → Unknown subdomain error page
+-- /403              → Inactive tenant error page

Local Dev Proxy
+-- agentur-x.localhost:3000 → mapped via hosts-file or env override
```

### Data Model (Plain Language)

**Tenants table** (stored in Supabase PostgreSQL):
```
Each tenant has:
- ID              (unique internal identifier)
- Slug            (the subdomain, e.g. "agentur-x") — must be unique
- Name            (display name, e.g. "Agentur X GmbH")
- Status          (active / inactive)
- Created date

This is the ONLY table needed for PROJ-1.
Other tables (users, settings) are added by later features.
```

**Request Context** (passed server-side, never in client cookies):
```
After resolution, every request carries:
- x-tenant-id     (internal UUID)
- x-tenant-slug   (the subdomain string)
These travel as HTTP headers within the server — not visible to the browser.
```

### Tech Decisions

| Decision | Choice | Why |
|----------|--------|-----|
| Where routing logic lives | Next.js Middleware | Runs at the edge before any page/API renders — zero performance overhead on the app layer |
| Tenant data storage | Supabase PostgreSQL | Single source of truth, already in our stack |
| Performance (< 50ms target) | In-memory cache with 60s TTL | Avoids a DB round-trip on every request — cache invalidated when a tenant is updated |
| Security | Tenant context in server-only headers | Never set tenant identity from client-side input — only the middleware (server-controlled) writes it |
| Local development | hosts file + env variable override | Wildcard DNS doesn't work on localhost; a documented `LOCAL_DOMAIN=localhost` env var lets the middleware adapt |

### Dependencies

No new packages needed:
- **Next.js Middleware** — built into Next.js
- **Supabase client** — already in stack (`@supabase/supabase-js`)
- **Cache** — simple in-memory Map with TTL (no Redis needed at MVP scale)

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
