---
id: PROJ-46
title: Drag-and-Drop Content Workflow
status: Planned
priority: P2
created: 2026-04-08
---

# PROJ-46: Drag-and-Drop Content Workflow

## Goal
Drag-and-drop between Kanban status columns using @dnd-kit.

## User Stories
- As a user, I want to drag Kanban cards between columns to update status visually

## Acceptance Criteria
- [ ] @dnd-kit/core installed
- [ ] Cards are draggable within kanban board
- [ ] Dropping on a column changes item status
- [ ] Optimistic update with rollback on error
- [ ] Touch-friendly

## Technical Notes
Install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities; wrap kanban board with DndContext; implement DragOverlay.

## Implementation Notes
_To be filled during implementation_
