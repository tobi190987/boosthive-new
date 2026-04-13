# Archived Features

> Features, die aus der Navigation/UI entfernt wurden, aber als vollständige Codebase erhalten bleiben.
> Archiviert: April 2026 — Bereinigung der Hauptnavigation.

---

## Wie reaktivieren?

Alle Routes und Pages sind **unverändert erhalten**. Nur die Einsprungspunkte (Nav-Links, Tabs) wurden entfernt.
Zur Reaktivierung einfach die kommentierten Stellen rückgängig machen (siehe Verweise unten).

---

## 1. Portfolio-Übersicht (PROJ-56)

**Route:** `/dashboard/portfolio`  
**Page:** `src/app/(tenant)/dashboard/portfolio/page.tsx`  
**Spec:** `features/PROJ-56-dashboard-portfolio-uebersicht.md`

**Entfernt aus:** `src/components/tenant-shell-navigation.tsx`  
**Reaktivierung:** Im `<ul>` unter dem Dashboard-Link folgenden Block wieder einfügen (und `LayoutGrid` wieder in den Imports aktivieren):

```tsx
<li>
  <Link
    href="/dashboard/portfolio"
    onClick={() => handleNavigate('/dashboard/portfolio')}
    onMouseEnter={() => router.prefetch('/dashboard/portfolio')}
    onFocus={() => router.prefetch('/dashboard/portfolio')}
    data-tour="nav-portfolio"
    className={cn(
      'flex items-center justify-between rounded-2xl px-3 py-2.5 text-sm font-medium transition-colors',
      isNavActive(pathname, '/dashboard/portfolio')
        ? 'bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400'
        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-[#1e2635]/60 dark:hover:text-slate-100'
    )}
    aria-current={isNavActive(pathname, '/dashboard/portfolio') ? 'page' : undefined}
  >
    <span className="flex items-center gap-3">
      <LayoutGrid className={cn('h-4 w-4', isNavActive(pathname, '/dashboard/portfolio') ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400 dark:text-slate-500')} />
      Portfolio
    </span>
    {visiblePendingHref === '/dashboard/portfolio' ? (
      <Loader2 className="h-4 w-4 animate-spin text-slate-300 dark:text-slate-600" />
    ) : (
      <ChevronRight className="h-4 w-4 text-slate-300 dark:text-slate-600" />
    )}
  </Link>
</li>
```

---

## 2. Export Center (PROJ-55)

**Route:** `/exports`  
**Page:** `src/app/(tenant)/exports/page.tsx`  
**Spec:** `features/PROJ-55-reporting-export.md`

**Entfernt aus:** `src/components/tenant-shell-navigation.tsx`  
**Reaktivierung:** Im `<ul>` neben den anderen Top-Level-Links folgenden Block wieder einfügen (und `Download` wieder in den Imports aktivieren):

```tsx
<li>
  <Link
    href="/exports"
    onClick={() => handleNavigate('/exports')}
    onMouseEnter={() => router.prefetch('/exports')}
    onFocus={() => router.prefetch('/exports')}
    data-tour="nav-exports"
    className={cn(
      'flex items-center justify-between rounded-2xl px-3 py-2.5 text-sm font-medium transition-colors',
      isNavActive(pathname, '/exports')
        ? 'bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400'
        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-[#1e2635]/60 dark:hover:text-slate-100'
    )}
    aria-current={isNavActive(pathname, '/exports') ? 'page' : undefined}
  >
    <span className="flex items-center gap-3">
      <Download className={cn('h-4 w-4', isNavActive(pathname, '/exports') ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400 dark:text-slate-500')} />
      Export Center
    </span>
    {visiblePendingHref === '/exports' ? (
      <Loader2 className="h-4 w-4 animate-spin text-slate-300 dark:text-slate-600" />
    ) : (
      <ChevronRight className="h-4 w-4 text-slate-300 dark:text-slate-600" />
    )}
  </Link>
</li>
```

---

## 3. Kanban Board (PROJ-46 / PROJ-59)

**Route:** `/tools/kanban`  
**Page:** `src/app/(tenant)/tools/kanban/page.tsx`  
**Spec:** `features/PROJ-46-drag-drop-content-workflow.md`, `features/PROJ-59-content-workflow-integration.md`

**Entfernt aus:** `src/lib/tool-groups.ts` — `showInNav: false, showInGrid: false`  
**Reaktivierung:** In `tool-groups.ts` bei dem Kanban-Eintrag `showInNav` und `showInGrid` entfernen oder auf `true` setzen.

---

## 4. Social Media Kalender (PROJ-58)

**Route:** `/tools/social-calendar`  
**Page:** `src/app/(tenant)/tools/social-calendar/page.tsx`  
**Spec:** `features/PROJ-58-social-media-kalender.md`

**Entfernt aus:** `src/lib/tool-groups.ts` — `showInNav: false, showInGrid: false`  
**Reaktivierung:** In `tool-groups.ts` bei dem Social-Calendar-Eintrag `showInNav` und `showInGrid` entfernen oder auf `true` setzen.

---

## 5. Client-Portal / Kunden-Tenant (PROJ-62)

**Routes:**
- `/portal/login` — Kunden-Login
- `/portal/dashboard` — Kunden-Dashboard (Read-Only)
- `/portal/reports` — Kunden-Reports
- `/portal-invite` — Einladungs-Flow
- `/settings/portal` — Portal-Konfiguration (Admin)

**Pages:** `src/app/portal/`, `src/app/portal-invite/page.tsx`  
**Spec:** `features/PROJ-62-client-portal.md`

**Entfernt aus:** `src/components/settings-profile-tabs.tsx` — Portal-Tab auskommentiert  
**Reaktivierung:**
1. In `settings-profile-tabs.tsx` den Kommentar-Block wieder aktivieren:
   ```tsx
   ...(isAdmin ? [{ href: '/settings/portal', label: 'Client-Portal', icon: Globe }] : []),
   ```
2. `Globe` wieder in den Imports hinzufügen.

**Hinweis:** Die Portal-Einladungs-Logik (API-Routes, Supabase-Functions) ist vollständig erhalten. Nur der UI-Einsprungspunkt in den Settings fehlt.
