---
id: PROJ-41
title: Notification History Seite
status: Planned
priority: P1
created: 2026-04-08
---

# PROJ-41: Notification History Seite

## Goal
Dedicated notification history page accessible from "Alle anzeigen" link in notification bell popover.

## User Stories
- As a user, I want to browse all my notifications so I don't miss anything

## Acceptance Criteria
- [ ] "Alle anzeigen" footer link added to notification bell popover
- [ ] New page at /notifications shows paginated list
- [ ] Filter by read/unread
- [ ] Filter by type
- [ ] Mark all read button
- [ ] Uses existing notifications API

## Technical Notes
Add footer to PopoverContent in notification-bell.tsx; create src/app/(tenant)/notifications/page.tsx.

## Implementation Notes
_To be filled during implementation_
