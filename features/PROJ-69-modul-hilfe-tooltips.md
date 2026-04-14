# PROJ-69: Modul-Hilfe & Tooltips System

## Status: Deployed
**Created:** 2026-04-14
**Last Updated:** 2026-04-14

## Problem
Viele Module in der Tenant-Sidebar sind für neue Nutzer nicht selbsterklärend (z.B. "AI Visibility", "Brand Trends"). Nutzer wissen nicht was ein Modul tut, bevor sie es anklicken.

## Solution
Dreistufiges Hilfe-System:
1. **Sidebar-Tooltips**: ℹ-Icon erscheint beim Hovern über einen Nav-Eintrag → Tooltip mit Kurzbeschreibung
2. **Page-Header**: HelpCircle-Icon neben dem Seitentitel → Popover mit Feature-Liste
3. **Billing-Seite**: Feature-Bullet-Points auf Modul-Cards

## Implementation Notes

### Neue Dateien
- `src/lib/tool-groups.ts` — `MODULE_HELP`-Objekt hinzugefügt (Record<moduleCode, { tagline, features[] }>)
- `src/components/module-help-tooltip.tsx` — Neue Client-Komponente für HelpCircle + Tooltip

### Geänderte Dateien
- `src/components/tenant-shell-navigation.tsx` — HelpCircle-Icon (group-hover/navitem reveal)
- `src/components/tenant-shell-header.tsx` — Optionaler `features?: string[]` Prop
- `src/components/billing-workspace.tsx` — MODULE_HELP Feature-Bullets in ModuleCatalogCard
- `src/components/module-locked-card.tsx` — Bug-Fix: `/settings/billing` → `/billing`
- `src/app/(tenant)/tools/seo-analyse/page.tsx` — ModuleHelpTooltip hinzugefügt
- `src/app/(tenant)/tools/keywords/page.tsx` — ModuleHelpTooltip hinzugefügt
- `src/app/(tenant)/tools/ai-performance/page.tsx` — ModuleHelpTooltip hinzugefügt
- `src/app/(tenant)/tools/ai-visibility/page.tsx` — ModuleHelpTooltip hinzugefügt
- `src/app/(tenant)/tools/brand-trends/page.tsx` — ModuleHelpTooltip hinzugefügt
- `src/app/(tenant)/tools/content-briefs/page.tsx` — ModuleHelpTooltip hinzugefügt
- `src/app/(tenant)/tools/ad-generator/page.tsx` — features-Prop an TenantShellHeader
- `src/app/(tenant)/tools/ads-library/page.tsx` — features-Prop an TenantShellHeader

### Bug Fix
`module-locked-card.tsx`: Button-Link zeigte auf nicht-existente Route `/settings/billing` statt korrektem `/billing`.
