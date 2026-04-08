---
id: PROJ-47
title: Onboarding Guided Tour
status: Planned
priority: P2
created: 2026-04-08
---

# PROJ-47: Onboarding Guided Tour

## Goal
One-time guided tooltip tour for new admin users on first login.

## User Stories
- As a new admin, I want a guided tour on first login so I know the key features

## Acceptance Criteria
- [ ] Tour shown once per user (tracked in localStorage)
- [ ] Highlights sidebar sections, customer selector, command palette
- [ ] Can be dismissed
- [ ] Can be restarted from Help page
- [ ] Uses driver.js or custom tooltip steps

## Technical Notes
Install driver.js; create OnboardingTour component; trigger on first login by checking localStorage key.

## Implementation Notes
_To be filled during implementation_
