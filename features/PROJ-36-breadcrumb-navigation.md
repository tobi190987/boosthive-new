---
id: PROJ-36
title: Breadcrumb Navigation
status: Planned
priority: P0
created: 2026-04-08
---

# PROJ-36: Breadcrumb Navigation

## Goal
Auto-generated breadcrumb navigation derived from Next.js route path displayed in main content area.

## User Stories
- As a user, I want to see my current location in the app so I can navigate back easily

## Acceptance Criteria
- [ ] Breadcrumb shows current route path
- [ ] Items are clickable links
- [ ] Last item is non-clickable current page
- [ ] Uses shadcn/ui Breadcrumb component
- [ ] Route segments are mapped to human-readable German labels

## Technical Notes
Client component using usePathname(), mounted in tenant-app-shell.tsx main area; segment label map for German translations.

## Implementation Notes
_To be filled during implementation_
