# PROJ-21: Auth Hardening

## Status: Deployed
**Created:** 2026-03-28
**Last Updated:** 2026-03-28

## Dependencies
- Requires: PROJ-3 (User Authentication)
- Requires: PROJ-5 (Password Reset Flow)
- Requires: PROJ-7 (Member Invitation)

## Overview
Die bestehende Auth-Strecke soll gezielt gehärtet werden. Fokus: bessere Rate Limits, sauberere Session-Trennung zwischen Owner und Tenant, und optional 2FA für den Owner-Bereich.

## User Stories
- Als Plattformbetreiber möchte ich kritische Logins besser absichern.
- Als Owner möchte ich meinen Plattformzugang stärker schützen können.
- Als Entwickler möchte ich Missbrauch und Session-Leaks systematisch reduzieren.

## Acceptance Criteria
- [ ] Login-, Reset-, Invite- und Forgot-Password-Routen haben gezielte Rate Limits.
- [ ] Owner- und Tenant-Sessions sind klar getrennt und gegenseitig sauber invalidierbar.
- [ ] Optionaler 2FA-Flow für Owner ist konzipiert oder umgesetzt.
- [ ] Sicherheitsrelevante Events werden strukturiert geloggt.
- [ ] Cross-Tenant-Login und Token-Missbrauch bleiben automatisiert abgesichert.

## Edge Cases
- Owner und Tenant parallel in verschiedenen Tabs
- Mehrfaches Reset-Anfordern in kurzer Zeit
- Invite- und Reset-Tokens auf falschem Tenant
- Wechsel von pausiertem zu aktivem Tenant während laufender Session

## Technical Requirements
- Feineres Rate-Limit-Modell
- Session-Cleanup-Strategie für Owner vs Tenant
- Optionaler zweiter Faktor für Owner
- Erweiterte Security-Tests

## Implementation Notes
- Bestehende Logik in `src/proxy.ts` und Auth-APIs weiterverwenden
- 2FA komplett uebersprungen (nicht implementiert, kein Bedarf in MVP)
- `src/lib/rate-limit.ts` um Presets (AUTH_LOGIN, AUTH_OWNER_LOGIN, AUTH_RESET, AUTH_INVITE) und `rateLimitResponse()` Helper erweitert
- Rate Limiting in allen 4 Auth-Routen eingebaut: login (10/15min), owner/login (5/15min), password-reset/request (3/15min), invitations/accept (10/15min)
- `src/lib/auth-guards.ts` um `logSecurity` Aufrufe bei 401/403 in requireTenantUser, requireRole und requireTenantAdmin erweitert
- 429 Responses enthalten Standard-Headers: Retry-After, X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset

## Tech Design (Solution Architect)

### Ist-Zustand Analyse

| Bereich | Status |
|---------|--------|
| `checkRateLimit` auf Billing-Routen | ✅ vorhanden |
| `checkRateLimit` auf Auth-Routen (Login, Reset, Invite) | ❌ fehlt komplett |
| Owner-Login Rate Limit | ❌ fehlt |
| `logSecurity` in `owner-auth.ts` | ✅ vorhanden |
| `logSecurity` in `auth-guards.ts` | ❌ fehlt |
| Session-Trennung Owner vs. Tenant (DB-basiert) | ✅ funktioniert bereits |
| 2FA für Owner | ❌ fehlt |

### Komponenten-Übersicht

```
Auth Hardening
+-- Rate Limiting (Erweiterung bestehender rate-limit.ts)
|   +-- /api/auth/login                    →  10 Versuche / 15 Min / IP
|   +-- /api/auth/owner/login              →  5 Versuche / 15 Min / IP (strenger)
|   +-- /api/auth/password-reset/request   →  3 Versuche / 15 Min / IP (strengst)
|   +-- /api/invitations/accept            →  10 Versuche / 15 Min / IP
+-- Security Logging (Erweiterung bestehender observability.ts)
|   +-- auth-guards.ts: logSecurity bei 401/403
|   +-- Alle Auth-Routen: logSecurity bei Rate Limit Hit
+-- Owner 2FA (Phase 2 — optional)
|   +-- Enrollment-Seite: /owner/settings/security
|   +-- TOTP via Supabase Auth (eingebaut, kein extra Package)
|   +-- Middleware-Check nach Owner-Login
+-- Session-Trennung (Review)
    +-- Bestehende DB-basierte Trennung bleibt (ist bereits sicher)
    +-- Tenant-Status-Check in requireTenantUser bleibt (blockt pausierten Tenant)
```

### Datenmodell

Kein neues Datenbankschema nötig. Bestehende Tabellen:
- `platform_admins` → Owner-Erkennung
- `tenant_members` + `status` Feld → Mitgliedschaft + Sperrung
- `tenants` → Tenant-Status (pausiert/gesperrt/archiviert)
- Supabase Auth TOTP → für 2FA eingebaut, kein eigenes Schema

Rate Limit Store bleibt **in-memory** (wie bisher, gilt pro Serverless-Instanz).

### Tech-Entscheidungen

| Entscheidung | Warum |
|---|---|
| In-memory Rate Limit beibehalten | Kein neues Package, kein Redis — reicht für MVP |
| Supabase nativer TOTP für 2FA | In Supabase Auth eingebaut, kein Drittanbieter nötig |
| DB-basierte Session-Trennung beibehalten | `requireOwner` und `requireTenantUser` sind DB-isoliert |
| 2FA als Phase 2 | Rate Limiting + Logging hat höheren ROI und schnellere Umsetzung |

### Neue Dependencies

Keine. Alle Änderungen nutzen bestehende Infrastruktur.
