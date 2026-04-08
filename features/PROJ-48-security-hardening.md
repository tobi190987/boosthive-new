---
id: PROJ-48
title: Security Hardening Sprint
status: In Progress
priority: P0/P1
created: 2026-04-08
---

# PROJ-48: Security Hardening Sprint

## Ziel
Behebung aller Medium/Low-Befunde aus der Sicherheitsanalyse vor Go-Live.

## Befunde & Status

### P0 — Implementiert

| # | Befund | Datei | Status |
|---|--------|-------|--------|
| 1 | IP-Erkennung: `getClientIp()` auf `x-forwarded-for` zuerst (Vercel-Standard) | `src/lib/rate-limit.ts` | ✅ Erledigt |
| 2 | Security HTTP-Headers: `Permissions-Policy` ergänzt, `Referrer-Policy` auf `strict-origin-when-cross-origin` verschärft | `next.config.ts` | ✅ Erledigt |
| 3 | Tests `password-reset/request`: Rate-Limit-Test (4. Request → 429) | `tests/api/auth/password-reset.spec.ts` | ✅ Erledigt |
| 3 | Tests `password-reset/confirm`: Cross-Tenant-Token-Test | `tests/api/auth/password-reset.spec.ts` | ✅ Erledigt |
| 4a | Supabase Advisor: `function_search_path_mutable` (4 Trigger-Funktionen) | `supabase/migrations/039_fix_function_search_path.sql` | ✅ Erledigt |
| 4b | Supabase Advisor: `auth_leaked_password_protection` | Supabase Dashboard → Auth → Settings | ⚠️ Manuell aktivieren |

### P1 — Implementiert

| # | Befund | Datei | Status |
|---|--------|-------|--------|
| 5 | RLS Soft-Delete Filter: `deleted_at IS NULL` in `customers`, `customer_integrations`, `customer_documents` | `supabase/migrations/038_rls_softdelete_filter.sql` | ✅ Erledigt |
| 6 | Rate-Limit-Konsolidierung: Proxy-Level entfernt, nur Route-Level (`src/lib/rate-limit.ts`) | `src/proxy.ts` | ✅ Erledigt |

### P2 — Geplant (Post-Launch)

| # | Befund | Status |
|---|--------|--------|
| 7 | In-Memory Rate Limiting → Upstash Redis (Cross-Instance) | Planned |
| 8 | 2FA für Owner-Account | Planned |

## Implementierungsdetails

### IP-Erkennung (Schritt 1)
`getClientIp()` in `src/lib/rate-limit.ts`: Reihenfolge von `x-real-ip → x-forwarded-for` auf `x-forwarded-for → x-real-ip` geändert. Vercel setzt `x-forwarded-for` zuverlässig am Edge; `x-real-ip` als Fallback für andere Umgebungen.

### Security Headers (Schritt 2)
`next.config.ts` jetzt mit:
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin` (verschärft von `origin-when-cross-origin`)
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`
- `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`

**CSP nicht gesetzt** — Next.js inline-Scripts und Supabase Realtime erfordern entweder `unsafe-inline` oder einen nonce-Ansatz. Empfehlung: In Phase 2 mit nonce-basiertem CSP umsetzen.

### Rate-Limit-Konsolidierung (Schritt 6)
Aus `src/proxy.ts` entfernt:
- `rateLimitMap`, `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX_REQUESTS`, `AUTH_RATE_LIMIT_MAX_REQUESTS`, `RATE_LIMIT_MAX_ENTRIES`
- `pruneRateLimitMap()`, `checkRateLimit()` (proxy-lokale Implementierung)
- Rate-Limit-Block in der CSRF-Sektion

CSRF-Schutz (Origin-Prüfung) bleibt im Proxy. Rate Limiting liegt jetzt vollständig in den Route-Handlern (`src/lib/rate-limit.ts`).

### Supabase Security Advisors (manuell)
Da kein MCP-Zugriff auf das BoostHive Projekt:
1. Supabase Dashboard → Project → Advisors → Security
2. Befunde prüfen: fehlende RLS-Policies, schwache `auth.uid()` Checks, ungeschützte Tabellen
3. Ziel: Score A oder B

## Verifikation
- [ ] `npm run build` — keine TypeScript-Fehler
- [ ] `npm run test` — alle neuen Tests grün
- [ ] Security Headers via `curl -I https://app.boost-hive.de` oder securityheaders.com prüfen
- [ ] Supabase Advisors manuell im Dashboard auswerten
- [ ] Migration `038_rls_softdelete_filter.sql` in Supabase anwenden
