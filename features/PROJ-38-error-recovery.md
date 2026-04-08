---
id: PROJ-38
title: Verbesserte Fehler-Recovery
status: Planned
priority: P0
created: 2026-04-08
---

# PROJ-38: Verbesserte Fehler-Recovery

## Goal
Contextual error pages with actionable recovery buttons instead of generic messages.

## User Stories
- As a user, I want specific error messages and clear recovery actions so I can resolve issues faster

## Acceptance Criteria
- [ ] Error pages show specific title/description based on error.message
- [ ] "Zurück" button navigates to parent route
- [ ] "Neu laden" resets the error boundary
- [ ] Error digest shown for support if present
- [ ] Both tenant and owner error.tsx updated

## Technical Notes
Parse error.message for known error types; use useRouter for back navigation; add Home/Back buttons.

## Implementation Notes
_To be filled during implementation_
