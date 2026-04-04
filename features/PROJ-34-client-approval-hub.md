# PROJ-34: Client Approval Hub (Freigabe-Workflow)

## Metadata
- **ID:** PROJ-34
- **Status:** Planned
- **Created:** 2026-04-04
- **Priority:** P2

## Overview
Agenturen können Content-Elemente (Ad-Texte, Content Briefs) direkt in der App zur Kundenfreigabe einreichen. Dazu wird ein einzigartiger, öffentlicher Link (UUID) generiert, den der Kunde ohne Login aufrufen kann. Der Kunde gibt entweder frei oder fordert Korrekturen an. Der zuständige Mitarbeiter wird anschließend benachrichtigt.

## Dependencies
- Requires: PROJ-3 (User Authentication) – eingeloggte Agentur-Mitarbeiter
- Requires: PROJ-6 (Role-Based Access Control) – nur Members/Admins können Freigaben erstellen
- Requires: PROJ-29 (Customer Database) – Zuordnung zum richtigen Kunden
- Requires: PROJ-31 (Content Brief Generator) – erstes unterstütztes Content-Format
- Requires: PROJ-33 (Ad Text Generator) – zweites unterstütztes Content-Format

## User Stories

1. **Als Member** möchte ich ein Content-Element (Ad-Text oder Brief) per Klick zur Freigabe einreichen, damit ich keine E-Mail schreiben muss.
2. **Als Member** möchte ich einen kopierbaren Freigabe-Link erhalten, damit ich ihn einfach per Slack, WhatsApp oder E-Mail an den Kunden senden kann.
3. **Als Kunde (nicht eingeloggt)** möchte ich den Inhalt auf einer öffentlichen Seite angezeigt bekommen, damit ich ihn ohne Registrierung beurteilen kann.
4. **Als Kunde** möchte ich per Klick entweder [Freigeben] oder [Korrektur nötig] wählen, damit die Agentur sofort Bescheid weiß.
5. **Als Kunde** möchte ich bei „Korrektur nötig" ein Textfeld für mein Feedback sehen, damit ich meine Änderungswünsche klar kommunizieren kann.
6. **Als Member** möchte ich eine Benachrichtigung erhalten, sobald der Kunde eine Entscheidung trifft, damit ich sofort reagieren kann.
7. **Als Member** möchte ich den aktuellen Status aller laufenden Freigaben auf einen Blick sehen, damit ich keine Anfragen vergesse.
8. **Als Member** möchte ich nach einer Korrektur-Runde den Inhalt überarbeiten und erneut zur Freigabe einreichen können, damit ein iterativer Workflow möglich ist.
9. **Als Admin** möchte ich alle Freigabe-Vorgänge des Tenants einsehen können, damit ich den Workflow meines Teams überwache.

## Acceptance Criteria

### Status-Management
- [ ] Jedes unterstützte Content-Element (ad_generation, content_brief) bekommt ein `approval_status`-Feld: `draft` | `pending_approval` | `approved` | `changes_requested`
- [ ] Neues Element startet immer mit Status `draft`
- [ ] Ein Element im Status `approved` kann nicht mehr zur Freigabe eingereicht werden (Button deaktiviert mit Hinweis)
- [ ] Status-Badge ist in der jeweiligen Tool-Ansicht (Ad Generator History, Brief History) sichtbar

### Freigabe-Link generieren
- [ ] Button „Zur Freigabe einreichen" ist in der Detail-Ansicht eines Content-Elements vorhanden (für Members/Admins)
- [ ] Klick auf Button erzeugt einen UUID-basierten Public-Link und setzt Status auf `pending_approval`
- [ ] Link-Format: `[tenant-subdomain]/approval/[uuid]`
- [ ] Der Link ist kopierbar (Copy-Button mit Bestätigung)
- [ ] Ein einmal generierter Link bleibt dauerhaft gültig, solange das Element existiert (kein Ablaufdatum in v1)
- [ ] Erneutes Klicken gibt denselben Link zurück (idempotent)

### Externe Freigabe-Seite (kein Login)
- [ ] Route `/approval/[uuid]` ist öffentlich zugänglich (kein Auth-Check)
- [ ] Seite zeigt: Tenant-Name, Content-Typ (Ad-Text / Content Brief), Inhalt des Elements (Read-only)
- [ ] Zwei Buttons: **[Freigeben]** (grün) und **[Korrektur nötig]** (gelb/orange)
- [ ] Wenn bereits `approved` oder `changes_requested`: Seite zeigt Bestätigungsmeldung, Buttons sind deaktiviert
- [ ] Bei Klick auf „Korrektur nötig": Textfeld für Feedback erscheint (Pflichtfeld, min. 10 Zeichen)
- [ ] Absenden setzt Status auf `changes_requested` und speichert Feedback-Text
- [ ] Klick auf „Freigeben" setzt Status sofort auf `approved` (kein Feedback-Feld)
- [ ] Erfolgreiche Aktion: Bestätigungsseite/Banner mit Danke-Nachricht

### Benachrichtigung
- [ ] Nach jeder Kunden-Aktion (Freigabe oder Korrektur) wird der `created_by`-Nutzer des Elements benachrichtigt
- [ ] In-App-Notification: erscheint in der App-Navigation (Glocken-Symbol), mit Link zum Element
- [ ] Notification-Text: „[Kundenname] hat [Elementname] freigegeben." / „[Kundenname] hat Korrekturen zu [Elementname] angefragt."
- [ ] Optional (v1): E-Mail-Benachrichtigung via Mailtrap, wenn der Nutzer online ist oder nicht (immer senden)

### Freigabe-Übersicht (Approvals Dashboard)
- [ ] Neue Seite `/tools/approvals` zeigt alle Content-Elemente mit Status `pending_approval` oder `changes_requested` des Tenants
- [ ] Tabelle mit Spalten: Typ, Titel/Produkt, Kunde, Status, Datum, Aktion
- [ ] Klick auf Zeile öffnet das Element direkt
- [ ] Filterbar nach Status und Typ

### Iterations-Workflow
- [ ] Bei Status `changes_requested` ist Button „Überarbeiten & erneut einreichen" in der Detail-Ansicht sichtbar
- [ ] Klick setzt Status zurück auf `pending_approval` und verwendet denselben Public-Link

## Edge Cases

1. **UUID nicht gefunden:** `/approval/[ungültige-uuid]` zeigt eine freundliche 404-Seite ohne App-Layout.
2. **Element bereits entschieden:** Kunde öffnet Link nach bereits erfolgter Freigabe → Seite zeigt Status-Meldung, keine Buttons.
3. **Feedback leer abgeschickt:** „Korrektur"-Submit ist blockiert bis mindestens 10 Zeichen eingegeben wurden.
4. **Kein Kundenname verfügbar:** Notification-Text fällt zurück auf „Ihr Kunde hat..." wenn kein Kunde zugeordnet ist.
5. **Element gelöscht:** Public-Link eines gelöschten Elements zeigt 404 (Soft-Delete muss respektiert werden).
6. **Mehrfaches Absenden:** Doppelklick auf Freigabe-Button führt nicht zu doppelter Aktion (Button direkt nach erstem Klick deaktivieren).
7. **Tenant inaktiv:** Öffentliche Freigabe-Seite für Tenants mit Status `inactive`/`suspended` zeigt Fehlermeldung (kein Zugriff).
8. **Concurrent Review:** Zwei Personen öffnen denselben Link gleichzeitig – nur die erste Aktion wird verarbeitet, zweiter sieht Bestätigungsmeldung.

## UI Wireframe (konzeptionell)

```
[Detail-Ansicht eines Ad-Textes]
┌─────────────────────────────────────────────────────┐
│ Eventuri Ansaugsystem – Facebook Feed Ad            │
│ Status: [Draft ●]                                   │
│                                                     │
│ [Vorschau des Inhalts...]                           │
│                                                     │
│ [📤 Zur Freigabe einreichen]  [📥 Excel]            │
└─────────────────────────────────────────────────────┘

---

[Externe Freigabe-Seite /approval/uuid]
┌─────────────────────────────────────────────────────┐
│ 🐝 Marketing Agentur GmbH                           │
│ Bitte prüfen Sie folgenden Inhalt:                  │
│ Ad-Text: Eventuri Ansaugsystem                      │
│ ─────────────────────────────────────               │
│ [Inhalt Read-Only angezeigt]                        │
│ ─────────────────────────────────────               │
│                                                     │
│ [✅ Freigeben]    [✏️ Korrektur nötig]              │
└─────────────────────────────────────────────────────┘

[Nach Klick auf "Korrektur nötig"]
┌─────────────────────────────────────────────────────┐
│ Was soll geändert werden?                           │
│ ┌─────────────────────────────────────────────────┐ │
│ │ Bitte ändern Sie die Headline zu...             │ │
│ └─────────────────────────────────────────────────┘ │
│ [Feedback absenden]                                 │
└─────────────────────────────────────────────────────┘

---

[Approvals Dashboard /tools/approvals]
┌─────────────────────────────────────────────────────┐
│ Freigabe-Übersicht                                  │
│ Filter: [Alle Status ▼] [Alle Typen ▼]             │
│ ─────────────────────────────────────               │
│ Typ    │ Titel           │ Kunde  │ Status    │ Datum│
│ Ad     │ Eventuri...     │ Müller │ ⏳ Offen  │ Heute│
│ Brief  │ Herbst-Kampagne │ –      │ 🔄 Korrek.│ Ges. │
│ Ad     │ BMW M3 Launch   │ BMW AG │ ✅ Frei   │ Mo.  │
└─────────────────────────────────────────────────────┘
```

## Database Schema (konzeptionell)

```sql
-- approval_requests: Eine Freigabe-Instanz pro Content-Element
CREATE TABLE approval_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  content_type TEXT NOT NULL,  -- 'ad_generation' | 'content_brief'
  content_id UUID NOT NULL,    -- FK zu ad_generations.id oder content_briefs.id
  public_token UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  status TEXT NOT NULL DEFAULT 'pending_approval',
  -- 'pending_approval' | 'approved' | 'changes_requested'
  feedback TEXT,               -- Kunden-Feedback bei 'changes_requested'
  created_by UUID NOT NULL REFERENCES users(id),
  customer_id UUID REFERENCES customers(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  decided_at TIMESTAMPTZ       -- Zeitpunkt der Kunden-Entscheidung
);

-- notifications: In-App Benachrichtigungen
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  user_id UUID NOT NULL REFERENCES users(id),
  type TEXT NOT NULL,          -- 'approval_approved' | 'approval_changes_requested'
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  link TEXT,                   -- Deeplink zum Content-Element
  read_at TIMESTAMPTZ,         -- NULL = ungelesen
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

## API Routes (konzeptionell)

```
POST /api/tenant/approvals                          -- Neue Freigabe-Anfrage erstellen
GET  /api/tenant/approvals                          -- Alle Freigaben des Tenants (Dashboard)
GET  /api/tenant/approvals/[id]                     -- Einzelne Freigabe (für Mitarbeiter)
GET  /api/public/approval/[token]                   -- Öffentlich: Inhalt laden (kein Auth)
POST /api/public/approval/[token]/approve           -- Öffentlich: Freigeben
POST /api/public/approval/[token]/request-changes   -- Öffentlich: Korrektur + Feedback
GET  /api/tenant/notifications                      -- Notifications abrufen
PATCH /api/tenant/notifications/[id]/read           -- Notification als gelesen markieren
```

## Tech Design (Solution Architect)

### Einordnung
PROJ-34 ist ein **querschnittliches Feature**: Es ergänzt bestehende Content-Tools (PROJ-31 Content Briefs, PROJ-33 Ad Text Generator) um einen Freigabe-Workflow und fügt eine komplett neue öffentliche Route hinzu, die außerhalb der Tenant-Authentifizierung läuft.

### Komponenten-Struktur

```
[Erweiterung bestehender Detail-Ansichten]
Content Brief Detail / Ad Generator Result
+-- ApprovalStatusBadge          (Zeigt aktuellen Status: Draft / Pending / Approved / Changes)
+-- ApprovalSubmitPanel          (Button + kopierbarer Link, erscheint nach Einreichung)

[Neue Seite: Approvals Dashboard]
/tools/approvals/page.tsx
+-- ApprovalsWorkspace           (Haupt-Container)
    +-- ApprovalsFilters         (Filter: Status, Typ)
    +-- ApprovalsTable           (Tabelle aller offenen Freigaben des Tenants)
        +-- ApprovalRow          (Typ | Titel | Kunde | Status | Datum | Link)

[Neue öffentliche Seite: Externe Freigabe]
/approval/[token]/page.tsx       (KEIN Auth-Check — außerhalb Tenant-Middleware)
+-- ApprovalPublicShell          (Minimales Layout: Logo, Tenant-Name, Footer)
    +-- ApprovalContentDisplay   (Read-only Ansicht des Inhalts — Ad-Text oder Brief)
    +-- ApprovalActionPanel      (Zwei Buttons: Freigeben / Korrektur nötig)
        +-- FeedbackForm         (Erscheint bei "Korrektur nötig", Pflichtfeld)
    +-- ApprovalConfirmation     (Bestätigungs-Banner nach Aktion)
    +-- ApprovalAlreadyDecided   (Seite wenn Status bereits final ist)

[Navigation-Erweiterung]
tenant-shell-navigation.tsx
+-- NotificationBell             (Glocken-Icon mit Unread-Counter Badge)
    +-- NotificationDropdown     (Dropdown mit letzten Benachrichtigungen)
+-- Approvals-Eintrag            (Neuer Nav-Link unter Workspace: /tools/approvals)
```

### Datenmodell

**Neue Tabelle: `approval_requests`**
Speichert eine Freigabe-Instanz pro Content-Element pro Runde. Ein Element kann mehrere Runden haben (nach Korrekturen).
- Eindeutiger `public_token` (UUID) — der öffentliche Link-Schlüssel
- Verknüpfung zu Content via `content_type` + `content_id` (generischer Pointer)
- Status: `pending_approval` | `approved` | `changes_requested`
- Optionales `feedback`-Feld für Kunden-Kommentar
- `decided_at` Timestamp — wann der Kunde geklickt hat

**Neue Tabelle: `notifications`**
In-App Benachrichtigungen für Agentur-Mitarbeiter.
- `user_id` — wer soll benachrichtigt werden
- `type` — Art der Benachrichtigung (approval_approved, approval_changes_requested)
- `title` + `body` — Anzeigetext
- `link` — Deeplink zum betroffenen Content-Element
- `read_at` — NULL bedeutet ungelesen

**Erweiterung bestehender Tabellen:**
- `content_briefs` bekommt Spalte `approval_status` (default: `draft`)
- `ad_generations` bekommt Spalte `approval_status` (default: `draft`)
- Diese Spalten sind die "Single Source of Truth" für den Status — `approval_requests` enthält die Details

### Routing-Strategie

Die öffentliche Freigabe-Seite (`/approval/[token]`) ist das kritische Routing-Problem: Sie muss auf `[tenant-slug].boost-hive.de/approval/[token]` erreichbar sein, **ohne** durch den Tenant-Auth-Middleware blockiert zu werden.

**Lösung:** Die Middleware-Konfiguration (`middleware.ts`) enthält bereits eine Whitelist für öffentliche Routen (z. B. `/accept-invite`, `/access`). Der Pfad `/approval/` wird in diese Whitelist aufgenommen, sodass die Route keine Session benötigt.

Die öffentliche Seite liest den Tenant aus der Subdomain (wie alle anderen Tenant-Seiten), prüft aber keine Authentifizierung. Der Approval-Token ist der einzige Zugangsmechanismus.

### API-Routen

**Geschützt (Agentur-intern, Auth erforderlich):**
```
POST /api/tenant/approvals                   → Einreichen: erstellt approval_request, setzt Status
GET  /api/tenant/approvals                   → Dashboard: alle Freigaben des Tenants
GET  /api/tenant/notifications               → Ungelesene Notifications laden
PATCH /api/tenant/notifications/[id]/read    → Als gelesen markieren
```

**Öffentlich (kein Auth, nur Token-Validierung):**
```
GET  /api/public/approval/[token]            → Lädt Inhalt + Status für externe Seite
POST /api/public/approval/[token]/approve    → Kunde klickt "Freigeben"
POST /api/public/approval/[token]/request-changes → Kunde klickt "Korrektur" + Feedback
```

Beide öffentlichen POST-Routes schreiben in die DB und triggern anschließend die Benachrichtigungs-Logik (Notification-Eintrag + E-Mail via Mailtrap).

### Sicherheitsüberlegungen

- **Token-Sicherheit:** UUID v4 ist nicht erratbar (122 Bit Entropie). Kein weiterer Auth-Mechanismus nötig.
- **Tenant-Isolation:** Jede öffentliche API-Route liest `tenant_id` aus dem Token-Lookup in der DB — Cross-Tenant-Zugriff ist strukturell ausgeschlossen.
- **Idempotenz:** Zweites Absenden auf bereits entschiedenem Token gibt HTTP 409 zurück, Frontend zeigt Bestätigungsseite.
- **RLS-Policies:** Tabelle `approval_requests` ist über Service-Role-Key der öffentlichen Routes erreichbar — keine direkte Client-Supabase-Verbindung auf der öffentlichen Seite.

### Navigation-Integration

**Glocken-Icon:**
- Neue Client-Komponente `NotificationBell` im Sidebar-Footer-Bereich (neben ThemeToggle)
- Pollt `/api/tenant/notifications` alle 60 Sekunden (oder via Supabase Realtime in v2)
- Zeigt rotes Badge mit Anzahl ungelesener Notifications
- Klick öffnet Dropdown mit letzten 5 Notifications

**Approvals-Eintrag:**
- Neuer Eintrag in `TOOLS`-Array in `tenant-shell-navigation.tsx`
- Icon: `CheckSquare` (Lucide)
- Pfad: `/tools/approvals`
- Kein `moduleCode`-Check — Feature ist für alle Members/Admins zugänglich (Workflow-Tool, kein Paid-Modul)

### Benachrichtigungs-Flow

```
Kunde klickt auf externer Seite
        ↓
POST /api/public/approval/[token]/approve
        ↓
1. approval_request.status = 'approved'
2. content_briefs/ad_generations.approval_status = 'approved'
3. notifications INSERT für created_by User
4. Mailtrap E-Mail an created_by User
        ↓
Nächster Poll des NotificationBell → Badge erscheint
Member klickt → sieht Notification → navigiert zum Element
```

### Neue Pakete
Keine neuen Pakete erforderlich. E-Mail-Versand läuft über bestehende Mailtrap-Integration (PROJ-4).

### Out of Scope (v1)
- Supabase Realtime für Echtzeit-Notifications (v2)
- Ablaufdatum für Public-Links
- Mehrere gleichzeitige Reviewer
- Audit-Log der Freigabe-Historie

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
