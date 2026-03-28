# PROJ-18: Tenant Status Modell

## Status: Deployed
**Created:** 2026-03-28
**Last Updated:** 2026-03-28

## Dependencies
- Requires: PROJ-1 (Subdomain Routing & Tenant Resolution)
- Requires: PROJ-3 (User Authentication)
- Requires: PROJ-14 (Stripe Setup & Basis-Abo)

## Overview
Der Tenant-Status soll fachlich klarer modelliert werden. Aktuell ist `active` / `inactive` technisch nutzbar, aber für Billing, Setup und manuelle Owner-Sperren zu grob. Ziel ist ein klarer Statusrahmen für Zugriff, Onboarding und Billing.

## User Stories
- Als Owner möchte ich wissen, warum ein Tenant gesperrt ist.
- Als Entwickler möchte ich Statuslogik zentral statt in Proxy, Auth und UI verstreut pflegen.
- Als Tenant-Admin möchte ich klare Fehlermeldungen bei blockierten Zuständen sehen.

## Acceptance Criteria
- [x] Es gibt eine zentrale Statusdefinition für Tenants.
- [x] Der Status deckt mindestens `active`, `inactive`, `setup_incomplete` und einen Billing-Blocker-Zustand ab.
- [x] Proxy, Login, Onboarding und Owner-UI nutzen dieselbe Statuslogik.
- [x] Öffentliche Auth-Seiten funktionieren auch für blockierte Tenants sauber weiter, wenn fachlich gewünscht.
- [x] Redirect-Loops und widersprüchliche Zustände werden verhindert.
- [x] Owner sieht im UI den effektiven Sperrgrund.

## Edge Cases
- Manuell gesperrter Tenant mit aktivem Stripe-Abo
- Billing-gesperrter Tenant mit vorhandener Session
- Setup-unvollständiger Tenant während Invite- oder Reset-Flow
- Statuswechsel während aktiver Browser-Session

## Technical Requirements
- Zentrale Status-Helper in `src/lib`
- Vereinheitlichung in `src/proxy.ts`, Auth-Routen und Owner-APIs
- UI-Badges und Fehlermeldungen je Status
- E2E-Tests für Statuswechsel und Zugriff

## Implementation Notes
- Bestehendes `tenants.status` nicht sofort aufbrechen, sondern schrittweise erweitern
- Owner-Lock und Billing-Block fachlich trennen, auch wenn derselbe Access-Gate genutzt wird

## Deployment
### Deployment Date: 2026-03-28
### Deployment Status: Deployed

- Preview deploy erfolgreich unter `https://boosthive-gytkg5e2c-tobis-projects-24837701.vercel.app`
- `npm run build` lief lokal erfolgreich vor dem Deploy
- Gezielte Status-QA lief erfolgreich mit `3 passed` und `2 skipped` in `tests/e2e/tenant-status.spec.ts`
- Die verbleibenden Skips betreffen nur lokale Supabase-Schema-Cache-Limits fuer `billing_blocked` und `archived`
