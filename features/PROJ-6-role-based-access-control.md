# PROJ-6: Role-Based Access Control (RBAC)

## Status: Deployed
**Created:** 2026-03-26
**Last Updated:** 2026-03-27

## Dependencies
- Requires: PROJ-3 (User Authentication) — Rollen werden in der Session gespeichert

## User Stories
- Als Owner möchte ich systemweit auf alle Tenants zugreifen können, ohne in einem spezifischen Tenant-Kontext zu sein.
- Als Admin möchte ich auf alle Verwaltungsfunktionen meines eigenen Tenants zugreifen, aber nicht auf andere Tenants.
- Als Member möchte ich nur auf die operativen Tools meines Tenants zugreifen, ohne Admin-Bereiche sehen zu können.
- Als System möchte ich bei jedem Request prüfen, ob der eingeloggte User die nötige Rolle für die angeforderte Ressource hat.
- Als Admin möchte ich die Rolle eines bestehenden Members innerhalb meines Tenants ändern können.

## Rollen & Berechtigungen

| Aktion | Owner | Admin | Member |
|--------|-------|-------|--------|
| Tenant erstellen/löschen | ✅ | ❌ | ❌ |
| Tenant deaktivieren | ✅ | ❌ | ❌ |
| Alle Tenants einsehen | ✅ | ❌ | ❌ |
| Members einladen | ❌ | ✅ | ❌ |
| Members entfernen | ❌ | ✅ | ❌ |
| Rollen vergeben (innerhalb Tenant) | ❌ | ✅ | ❌ |
| Tenant-Tools nutzen | ❌ | ✅ | ✅ |
| Eigenes Profil bearbeiten | ✅ | ✅ | ✅ |

## Acceptance Criteria
- [ ] Jeder User hat genau eine Rolle: `owner` | `admin` | `member`
- [ ] Rolle wird bei Login in Session gesetzt und bei jedem Request validiert
- [ ] Server-seitige Middleware prüft Rollen für alle geschützten API-Routen
- [ ] Client-seitige Navigation zeigt nur Menüpunkte, auf die der User Zugriff hat
- [ ] Admin kann Rolle eines Members zwischen `admin` und `member` wechseln
- [ ] Owner-Rolle kann nur manuell (DB-Level) vergeben werden — kein UI-Flow
- [ ] Unbefugter Zugriff auf geschützte Route → HTTP 403 mit klarer Fehlermeldung
- [ ] Rollen-Checks sind in einer zentralen Middleware/Helper-Funktion implementiert (kein duplicated Code)

## Edge Cases
- Admin versucht eigene Rolle zu degradieren → Abgelehnt (min. 1 Admin pro Tenant)
- Letzter Admin eines Tenants soll entfernt werden → Abgelehnt mit Fehlermeldung
- User wechselt Tenant (via direktem URL-Zugriff) → Zugriff abgelehnt, Rollen gelten nur im eigenen Tenant
- Owner greift auf Tenant-Route zu → Sonderbehandlung: Owner hat globale Leseberechtigung
- Role-Check bei API-Route ohne Session → 401 (nicht 403)

## Technical Requirements
- Security: Rollen-Checks IMMER serverseitig — Client-seitiges Ausblenden ist nur UX, kein Sicherheitsfeature
- Security: Row-Level Security (RLS) in Supabase als zweite Sicherheitsebene
- Maintainability: Rollen als TypeScript-Enum / konstante Strings definiert

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

### 3 Schutzschichten
1. **Middleware (proxy.ts)** — `/settings/*` → nur `role === 'admin'` im JWT; `/owner/*` → Owner-Session
2. **API Route Guards** — `requireRole()` / `requireTenantAdmin()` in `src/lib/auth-guards.ts`
3. **Supabase RLS** — DB-Ebene: Admin kann Members des eigenen Tenants SELECTen

### Neue Dateien
| Datei | Zweck |
|---|---|
| `src/lib/auth-guards.ts` | `requireRole()` + `requireTenantAdmin()` Helper |
| `src/hooks/use-role.ts` | Client-Hook: `useRole()` für bedingte UI-Anzeige |
| `src/app/api/tenant/members/[id]/role/route.ts` | `PATCH` — Rolle eines Members ändern (admin only) |
| `supabase/migrations/005_rbac.sql` | RLS: Admin kann alle Members seines Tenants lesen |

### Proxy-Erweiterung (proxy.ts)
- `ADMIN_ONLY_PREFIXES = ['/settings']` — neue Konstante
- `isAdminOnlyPath()` — neue Hilfsfunktion
- `maybeProtectTenantRoute()` erweitert: nach Membership-Check, Rollenprüfung aus `user.app_metadata.role`
- Redirect zu `/dashboard` bei fehlender Admin-Rolle

### Rollen-Änderungs-Flow
`PATCH /api/tenant/members/[id]/role` → `requireTenantAdmin(tenantId)` → Edge-Case-Checks → DB-Update + JWT-Claim-Update

Edge Cases implementiert:
- Letzter Admin kann nicht degradiert werden (HTTP 422)
- Admin kann eigene Rolle nicht ändern (HTTP 422)
- Cross-Tenant-Zugriff blockiert (tenantId aus Header vs. JWT verglichen)

## QA Test Results
_To be added by /qa_

## Deployment
**Deployed:** 2026-03-27
**Production URL:** https://boosthive-ks4bwve4g-tobis-projects-24837701.vercel.app
**Wildcard Domain:** https://*.boost-hive.de
**Vercel Project:** tobis-projects-24837701/boosthive-new
**Build:** Successful (21 app routes, Next.js 16.1.1 Turbopack)
**DB Migration:** Applied — `005_rbac.sql` in Supabase Production ausgeführt
