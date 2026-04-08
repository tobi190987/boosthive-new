---
id: PROJ-43
title: Inline-Confirms
status: Planned
priority: P1
created: 2026-04-08
---

# PROJ-43: Inline-Confirms

## Goal
Popover-based inline confirm dialogs for small destructive actions, replacing heavy AlertDialog where appropriate.

## User Stories
- As a user, I want lightweight confirmation for quick actions so I'm not blocked by modal dialogs

## Acceptance Criteria
- [ ] Create InlineConfirm component using Popover
- [ ] Shows confirm/cancel buttons with custom message
- [ ] Used for delete actions in table rows
- [ ] AlertDialog kept for bulk/irreversible destructive operations

## Technical Notes
Create src/components/inline-confirm.tsx using shadcn Popover; accept message, onConfirm, children props.

## Implementation Notes
_To be filled during implementation_
