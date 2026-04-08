---
id: PROJ-37
title: Page Transition Loader
status: Planned
priority: P0
created: 2026-04-08
---

# PROJ-37: Page Transition Loader

## Goal
Top-loading-bar indicator during page transitions using nprogress.

## User Stories
- As a user, I want visual feedback when a page is loading so I know the app is responsive

## Acceptance Criteria
- [ ] nprogress installed
- [ ] Thin blue progress bar appears at top during route changes
- [ ] Bar auto-completes on navigation done
- [ ] Integrated into (tenant) layout

## Technical Notes
Install nprogress + @types/nprogress; create RouterProgressBar client component; bind to usePathname/useRouter events.

## Implementation Notes
_To be filled during implementation_
