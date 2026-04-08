# PROJ-35: Realtime Notifications

## Status: Deployed

## Overview
In-App Benachrichtigungssystem mit Supabase Realtime. Nutzer erhalten sofortige Benachrichtigungen bei Freigabe-Entscheidungen (Approved / Changes Requested), ohne die Seite neu laden zu müssen.

## User Stories
- Als Mitarbeiter möchte ich in Echtzeit sehen wenn ein Kunde eine Freigabe erteilt oder Korrekturen anfordert
- Als Nutzer möchte ich ungelesene Nachrichten als Badge auf der Glocke sehen
- Als Nutzer möchte ich einzelne oder alle Benachrichtigungen als gelesen markieren
- Als Nutzer möchte ich per Klick direkt zum betreffenden Inhalt navigieren

## Acceptance Criteria
- [x] Notification Bell in der Topbar zeigt ungelesene Anzahl als roter Badge
- [x] Klick öffnet Popover mit den letzten 10 Benachrichtigungen
- [x] Ungelesene Nachrichten sind visuell hervorgehoben (blauer Hintergrund + Punkt)
- [x] Einzel-Markierung als gelesen via PATCH /api/tenant/notifications/[id]/read
- [x] Alle-Gelesen via PATCH /api/tenant/notifications/read-all
- [x] Klick auf Notification navigiert zum verknüpften Inhalt
- [x] Realtime-Update via Supabase postgres_changes ohne Seitenreload
- [x] Neue Notification wird automatisch in Shell-State geladen
- [x] Notifications werden bei Approval-Entscheidungen erstellt (approved + changes_requested)

## Architecture

### Components
- `src/components/notification-bell.tsx` — Bell-Icon mit Badge, Popover-Liste, Mark-as-Read Logik
- `src/hooks/use-realtime-subscription.ts` — Generischer Supabase Realtime Hook für postgres_changes

### API Routes
- `GET /api/tenant/notifications` — Letzte 30 Notifications des Nutzers
- `PATCH /api/tenant/notifications/[id]/read` — Einzelne Notification als gelesen markieren
- `PATCH /api/tenant/notifications/read-all` — Alle ungelesenen als gelesen markieren

### Database
Tabelle `notifications` in Migration `030_client_approval_hub.sql`:
- `id`, `tenant_id`, `user_id`, `type`, `title`, `body`, `link`, `read_at`, `created_at`
- RLS: Nutzer kann nur eigene Notifications lesen/updaten
- Typen: `approval_approved`, `approval_changes_requested`

### Realtime
- `useRealtimeSubscription('notifications', callback)` abonniert postgres_changes auf der `notifications`-Tabelle
- Bei jeder Änderung wird `/api/tenant/shell` neu gefetcht (sichere Server-seitige Filterung)
- Kein direktes Lesen aus Realtime-Event (Security: Daten kommen immer über API)

### Integration
- `NotificationBell` in `tenant-shell-navigation.tsx` (Desktop + Mobile)
- Initial-Daten aus `getTenantShellSummary()` in `tenant-app-data.ts`
- Notifications werden in `approval/[token]/approve` und `approval/[token]/request-changes` geschrieben

## Implementation Notes
- Realtime-Kanal erhält eindeutigen Namen mit Counter um Doppel-Subscriptions zu vermeiden
- `onchange`-Callback wird per Ref stabilisiert um Effect-Loops zu vermeiden
- NotificationBell fetcht initial wenn keine `initialNotifications` übergeben werden
- Badge zeigt max. `9+` bei >9 ungelesenen
