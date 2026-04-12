# PROJ-59: Content Workflow Integration (Brief → Approval → Kanban)

## Overview
Verbindung der drei bereits vorhandenen, aber isolierten Tools — Content Brief Generator (PROJ-31), Client Approval Hub (PROJ-34) und Kanban Board — zu einem durchgängigen Content-Workflow. Kein Neubau: bestehende Features werden mit Status-Übergaben, Verlinkungen und Statusanzeigen verknüpft.

## User Stories

### Als Agentur-Mitarbeiter möchte ich
- **STORY-1:** Aus einem fertigen Content Brief direkt eine Kanban-Karte erstellen können, damit kein manueller Aufwand entsteht
- **STORY-2:** Einen Content Brief zur Kundenfreigabe schicken können, ohne das Tool wechseln zu müssen
- **STORY-3:** Den aktuellen Status eines Briefs (Brief erstellt → In Bearbeitung → Freigabe ausstehend → Freigegeben → Fertig) direkt in der Brief-Liste sehen

### Als Agentur-Admin möchte ich
- **STORY-4:** Im Kanban-Board sehen können, ob für eine Karte ein Brief hinterlegt ist, um den Kontext zu verstehen
- **STORY-5:** Im Approval Hub Kommentare zu einem Brief geben können und die Kommentare mit dem Brief verknüpft sehen

### Als Agentur-Kunde (via Approval Hub) möchte ich
- **STORY-6:** Den vollständigen Content Brief einsehen und mit einem Klick freigeben oder kommentieren können

## Acceptance Criteria

### AC-1: Brief → Kanban-Karte erstellen
- **GIVEN** ich habe einen fertigen Content Brief generiert
- **WHEN** ich auf „Als Aufgabe anlegen" klicke
- **THEN** wird eine Kanban-Karte im Board erstellt mit: Titel (Brief-Keyword), Link zurück zum Brief, Assignee (optional), Fälligkeitsdatum (optional)
- **AND** die Karte zeigt ein Brief-Icon zur Kennzeichnung

### AC-2: Brief → Freigabe senden
- **GIVEN** ich bin in einem Content Brief
- **WHEN** ich auf „Zur Freigabe senden" klicke
- **THEN** wird ein Freigabe-Eintrag im Approval Hub erstellt (verknüpft mit Brief-ID)
- **AND** der Brief-Status ändert sich auf „Freigabe ausstehend"
- **AND** der Status ist in der Brief-Liste sichtbar

### AC-3: Status-Spalte in Brief-Liste
- **GIVEN** ich bin auf der Content Briefs-Übersicht
- **WHEN** Briefs existieren
- **THEN** zeigt die Liste eine Status-Spalte: `Entwurf` / `In Bearbeitung` / `Freigabe ausstehend` / `Freigegeben` / `Fertig`
- **AND** der Status ist per Dropdown änderbar ohne den Brief zu öffnen

### AC-4: Approval Hub zeigt Brief-Inhalt
- **GIVEN** ein Freigabe-Eintrag ist mit einem Content Brief verknüpft
- **WHEN** ich den Freigabe-Eintrag öffne
- **THEN** sehe ich den vollständigen Brief-Inhalt (H1, Meta, Outline, LSI-Keywords) inline im Approval Hub
- **AND** ich kann kommentieren und freigeben/ablehnen ohne Seitenwechsel

### AC-5: Kanban-Karte zeigt Brief-Link
- **GIVEN** eine Kanban-Karte ist mit einem Brief verknüpft
- **WHEN** ich die Karte öffne
- **THEN** sehe ich einen direkten Link „Brief öffnen" und den aktuellen Brief-Status

### AC-6: Kommentar-Versionierung im Approval Hub
- **GIVEN** ein Freigabe-Eintrag wird abgelehnt
- **WHEN** ein neuer Brief generiert und erneut zur Freigabe gesendet wird
- **THEN** wird dieser als Version v2 (etc.) im gleichen Freigabe-Eintrag hinterlegt
- **AND** alle Versionen sind nachvollziehbar

## Edge Cases

### EC-1: Brief ohne Kundenzuordnung
- **WHEN** ein Brief ohne Kunden-Kontext erstellt wurde und zu Kanban/Approval gesendet wird
- **THEN** erscheint eine Warnung mit Aufforderung, einen Kunden zuzuweisen

### EC-2: Kanban-Board leer / Spalten fehlen
- **WHEN** das Kanban-Board noch keine Spalten hat
- **THEN** wird automatisch eine Standard-Spalte „Offen" erstellt beim ersten Brief-Export

### EC-3: Approval-Link läuft ab
- **WHEN** ein Freigabe-Link abläuft (falls Expire-Datum gesetzt)
- **THEN** wird der Brief-Status zurückgesetzt auf „In Bearbeitung" mit Notiz „Freigabe-Link abgelaufen"

### EC-4: Doppeltes Senden zur Freigabe
- **WHEN** ein Brief bereits „Freigabe ausstehend" ist
- **THEN** wird der Button deaktiviert mit Tooltip: „Freigabe bereits angefordert"

## Technical Requirements

### Datenbankänderungen (Erweiterungen bestehender Tabellen)
```sql
-- content_briefs Tabelle: Status-Feld ergänzen
ALTER TABLE content_briefs
  ADD COLUMN workflow_status TEXT NOT NULL DEFAULT 'draft',
  -- 'draft', 'in_progress', 'review', 'approved', 'done'
  ADD COLUMN kanban_card_id UUID,   -- Verweis auf Kanban-Karte
  ADD COLUMN approval_request_id UUID; -- Verweis auf Approval-Eintrag

-- approval_requests Tabelle: Brief-Verknüpfung + Versionierung
ALTER TABLE approval_requests
  ADD COLUMN content_brief_id UUID REFERENCES content_briefs(id),
  ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
```

### Neue/geänderte API Endpoints
- `POST /api/tenant/content-briefs/[id]/send-to-kanban` — Kanban-Karte aus Brief erstellen
- `POST /api/tenant/content-briefs/[id]/send-to-approval` — Freigabe-Eintrag aus Brief erstellen
- `PATCH /api/tenant/content-briefs/[id]/status` — Status direkt ändern
- `GET /api/tenant/approvals/[id]` — Approval mit eingebettetem Brief-Inhalt (erweitert)

### UI-Änderungen
- Content Brief Detail-View: Neue Action-Buttons „Als Aufgabe anlegen" + „Zur Freigabe senden"
- Content Brief Liste: Neue Spalte „Status" mit Inline-Dropdown
- Approval Hub Item: Brief-Inhalt als ausklappbarer Accordion-Bereich
- Kanban-Karte: Brief-Link-Badge wenn verknüpft

## Dependencies
- **PROJ-31:** Content Brief Generator — Quell-Feature
- **PROJ-34:** Client Approval Hub — Freigabe-Ziel
- **PROJ-46:** Drag-and-Drop Content Workflow (Kanban) — Kanban-Ziel
- **PROJ-29:** Customer Database — Kundenzuordnung

## Success Metrics
- >50% aller Briefs werden über den Workflow-Status verwaltet
- Zeit von „Brief erstellt" bis „Freigegeben" messbar verkürzt
- Weniger Tool-Wechsel pro Session (Ziel: -40%)

## Non-Goals
- Kein Neubau von Brief Generator, Approval Hub oder Kanban
- Keine E-Mail-Notifications (kommt separat mit PROJ-35 Realtime Notifications)
- Keine automatischen Status-Übergänge (immer manuell ausgelöst)

## Tech Design (Solution Architect)

### Architektur-Erkenntnis
`workflow_status` und `approval_status` existieren bereits auf `content_briefs` — das Kanban liest diese Spalten bereits. Der Großteil ist **UI-Integration**, keine Neuentwicklung.

### Was bereits existiert (kein Aufwand)
- `content_briefs.workflow_status` Spalte (vorhanden, von Kanban genutzt)
- `content_briefs.approval_status` Spalte (vorhanden)
- Kanban liest Content Briefs über workflow_status (virtuell, kein eigenes Tabellen-Schema)
- `POST /api/tenant/approvals` unterstützt content_brief Typ bereits
- `PATCH /api/tenant/kanban` aktualisiert workflow_status bereits

### Komponentenstruktur

```
content-briefs-workspace.tsx (ERWEITERN)
+-- Brief-Liste (Tabelle)
|   +-- Neue Spalte: "Workflow-Status" (Inline-Dropdown)
|   +-- Neue Spalte: "Freigabe" (approval_status Badge)
+-- Brief-Detail-View
    +-- Action-Bereich (NEU)
        +-- Button "Zur Freigabe senden"
        +-- Button "Workflow-Status ändern"

approvals-workspace.tsx (ERWEITERN)
+-- Approval-Detail-View
    +-- Content Brief Accordion (NEU)
        +-- Brief-Inhalt inline (H1, Meta, Outline, LSI)

kanban-workspace.tsx (MINIMALE ANPASSUNG)
+-- Kanban-Karte
    +-- Brief-Icon-Badge wenn content_type = 'content_brief'
    +-- "Brief öffnen" Link in Karten-Detail
```

### Datenfluss
```
Brief generiert (workflow_status = 'open')
  → Mitarbeiter: "Zur Freigabe senden"
  → POST /api/tenant/content/briefs/[id]/send-to-approval
      → Erstellt approval_requests Eintrag
      → Setzt workflow_status = 'review'
  → Approval Hub zeigt Brief-Inhalt (via content_id)
  → Kunde genehmigt/lehnt ab
  → approval_status = 'approved'/'changes_requested'
  → workflow_status = 'done'/'open'
```

### Neue API-Endpunkte
| Endpoint | Zweck |
|---|---|
| `POST /api/tenant/content/briefs/[id]/send-to-approval` | Freigabe starten + workflow_status auf 'review' |
| `PATCH /api/tenant/content/briefs/[id]/workflow-status` | Inline-Status-Update aus Brief-Liste |
| `GET /api/tenant/approvals/[id]` (erweitert) | Approval + eingebetteter Brief-Inhalt |

### Datenbankänderungen
- `approval_requests.version` (INTEGER, default 1) — Kommentar-Versionierung
- Keine neuen Tabellen (Kanban ist virtuelle View über workflow_status)
- `kanban_card_id` / `approval_request_id` aus Spec entfallen — nicht benötigt

### Packages
Keine neuen — Accordion, Badge, Select, Button, Tooltip bereits installiert.

## Status
- **Status:** Deployed
- **Created:** 2026-04-11
- **Architecture:** 2026-04-11
- **Frontend:** 2026-04-11
- **Backend:** 2026-04-11

## Implementation Notes (Frontend)
- `content-briefs-workspace.tsx`: Workflow-Status-Dropdown + Freigabe-Badge in Brief-Liste (AC-3), `ApprovalSubmitPanel` in Detail-View (AC-2, EC-4 über pending-Zustand), Status-Badges (Entwurf/In Bearbeitung/Freigabe ausstehend/Fertig).
- `kanban-workspace.tsx`: Brief-Icon-Badges per `content_type`, Content-Type-Filter, Brief-Link in Karten-Detail (AC-1, AC-5).
- `approvals-workspace.tsx`: Neue expandable Row mit Chevron-Toggle + `BriefInlinePreview`-Komponente. Lädt `brief_json` on-demand via `GET /api/tenant/content/briefs/[id]` und zeigt Keyword, Suchintention, H1-Titel, Meta, Outline, LSI-Keywords, CTA inline (AC-4).
- `tenant-app-data.ts`: `ContentBriefListItem` um `workflow_status` + `approval_status` erweitert damit SSR-Liste konsistent ist.
- Keine neuen shadcn/ui-Komponenten nötig (Badge, Button, Tooltip, Table bereits vorhanden).
- AC-6 (Kunden-Inline-Ansicht + Approve/Reject) bereits durch `approval-public-page.tsx` abgedeckt.

## Implementation Notes (Backend)
- `POST /api/tenant/content/briefs/[id]/send-to-approval`: Zod-UUID-Check, `requireTenantUser` + `requireTenantModuleAccess('content_briefs')` + `CONTENT_BRIEFS_WRITE` Rate-Limit. Erzwingt `status='done'`, blockt `approval_status IN ('pending_approval','approved')` (AC-2, EC-4). Validiert `customer_id` (EC-1) und Kunden-E-Mail bevor `submitContentForApproval` ausgeführt wird. Setzt `workflow_status='client_review'` + `workflow_status_changed_at` nach erfolgreicher Freigabe-Einreichung.
- `PATCH /api/tenant/content/briefs/[id]/workflow-status`: Zod-Enum aus `KANBAN_WORKFLOW_STATUSES` (`none`/`in_progress`/`client_review`/`done`), `requireTenantUser` + Modul-Zugriff + Rate-Limit. No-op wenn Status identisch (AC-3).
- Versionierung (AC-6) via `submitContentForApproval` in `src/lib/approvals.ts`: Bei existierendem Approval wird `status=pending_approval` gesetzt und ein `resubmitted` Event in `approval_request_events` angelegt -> vollständige Version-Historie abrufbar via `GET /api/tenant/approvals` (history pro Eintrag).
- Inline-Brief-Anzeige im Approval Hub (AC-4) konsumiert bestehenden `GET /api/tenant/content/briefs/[id]` — kein neuer Approval-Detail-Endpoint benötigt. Tech-Design-Punkt „GET /api/tenant/approvals/[id] erweitert" entfaellt.
- Datenbank: Alle erforderlichen Spalten (`content_briefs.workflow_status`, `workflow_status_changed_at`, `approval_status`) und Index `idx_content_briefs_workflow_status(tenant_id, workflow_status, updated_at DESC)` bereits in Migration `036_kanban_workflow_status.sql`. Keine neuen Tabellen/Migrationen noetig. `approval_request_id`/`kanban_card_id` aus initialer Spec entfallen laut Tech-Design.
- RLS: Alle neuen Endpoints nutzen `createAdminClient()` und filtern immer explizit auf `tenant_id` -> Cross-Tenant-Isolation wie in bestehenden Briefs-Endpoints.
