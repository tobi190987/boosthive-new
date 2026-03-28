# PROJ-21: Auth Hardening

## Status: Planned
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
- 2FA kann in einem ersten Schritt Owner-only bleiben
