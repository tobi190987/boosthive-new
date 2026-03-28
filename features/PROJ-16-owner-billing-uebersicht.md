# PROJ-16: Owner Billing-Übersicht

## Status: In Progress
**Created:** 2026-03-27
**Last Updated:** 2026-03-28

## Dependencies
- Requires: PROJ-8 (Owner Super-Admin Dashboard) — Billing-Übersicht ist Teil des Owner-Dashboards
- Requires: PROJ-14 (Stripe Setup & Basis-Abo) — Stripe-Daten müssen existieren
- Requires: PROJ-15 (Modul-Buchung & Verwaltung) — Modul-Buchungsstatus muss abfragbar sein

## Overview
Der Owner (Plattformbetreiber) bekommt im Super-Admin-Dashboard eine vollständige Übersicht über den Abostand aller Tenants. Er kann Abos einsehen, bei Bedarf eingreifen (z.B. Abo manuell aktivieren/deaktivieren) und erhält Warnungen bei kritischen Zuständen (Zahlungsausfall, auslaufende Abos).

## User Stories
- Als Owner möchte ich auf einen Blick sehen, welche Tenants ein aktives Abo haben und welche nicht.
- Als Owner möchte ich den detaillierten Abostand eines Tenants einsehen (Basis-Plan, gebuchte Module, nächster Abrechnungstermin, Status).
- Als Owner möchte ich Tenants mit Zahlungsproblemen (past_due, canceled) sofort erkennen, damit ich reagieren kann.
- Als Owner möchte ich das Abo eines Tenants manuell sperren können (z.B. bei Vertragsverstoß), unabhängig vom Zahlungsstatus.
- Als Owner möchte ich eine E-Mail-Benachrichtigung erhalten, wenn ein Tenant in den `past_due`-Status wechselt.

## Acceptance Criteria
- [ ] Im Owner-Dashboard gibt es einen Bereich "Billing", der alle Tenants mit ihrem Abo-Status auflistet (aktiv, past_due, in Kündigung, canceled, kein Abo).
- [ ] Jeder Tenant-Eintrag zeigt: Basis-Plan-Status, Anzahl aktiver Module, nächster Abrechnungstermin, Gesamtbetrag/Periode.
- [ ] Tenants mit Status `past_due` oder `canceled` sind visuell hervorgehoben (z.B. rotes Badge).
- [ ] Der Owner kann die Detailansicht eines Tenants aufrufen und alle gebuchten Module mit Einzelpreisen sehen.
- [ ] Der Owner kann den Zugang eines Tenants manuell sperren (`is_active = false`) — unabhängig vom Stripe-Status.
- [ ] Der Owner kann einen manuell gesperrten Tenant wieder freischalten.
- [ ] Bei Wechsel eines Tenants in `past_due` erhält der Owner eine E-Mail-Benachrichtigung (via Mailtrap/PROJ-4).
- [ ] Die Billing-Übersicht ist nur für die Owner-Rolle zugänglich (nicht für Tenant-Admins).

## Edge Cases
- Tenant hat keinen Stripe Customer (wurde vor PROJ-14 angelegt) → Zeigt "Kein Abo" mit Hinweis.
- Owner sperrt Tenant manuell, obwohl Stripe-Abo aktiv ist → DB-Flag `is_active` hat Vorrang vor Stripe-Status.
- Owner schaltet Tenant frei, Stripe-Abo ist aber bereits `canceled` → Zugang ist frei, aber keine Module buchbar bis neues Abo abgeschlossen.
- Sehr viele Tenants (>100) → Pagination oder Filtering nach Status notwendig.
- Stripe-API nicht erreichbar beim Seitenaufruf → Daten aus DB-Cache anzeigen, Hinweis auf mögliche Verzögerung.

## Technical Requirements
- Liest Daten aus DB-Tabellen: `tenants`, `tenant_modules`, `modules` (kein Live-Stripe-API-Call für die Listenansicht)
- DB wird via Stripe Webhooks aktuell gehalten (PROJ-14)
- Owner-Middleware schützt alle Routen (`/owner/billing/*`)
- E-Mail-Benachrichtigung via bestehendem E-Mail-Service (PROJ-4)

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

### Zielbild

PROJ-16 erweitert den bestehenden Owner-Bereich um eine echte Billing-Sicht fuer alle Tenants. Der Owner bekommt:
- eine systemweite Liste aller Tenant-Abos mit Status, Modulen und naechstem Abrechnungstermin
- einen schnellen Fokus auf kritische Faelle wie `past_due`, `canceling`, `canceled` oder manuell gesperrte Tenants
- eine Detailansicht pro Tenant, ohne den Owner-Kontext zu verlassen

Wichtig fuer dieses Projekt:
- Die Uebersicht ist DB-basiert und nicht von Live-Stripe-Calls pro Tabellenzeile abhaengig.
- Stripe bleibt die Quelle fuer Zahlungsereignisse, aber die Owner-Oberflaeche liest den synchronisierten Zustand aus Supabase.
- Die technische Zugriffssperre soll auf dem bereits vorhandenen Tenant-Zugriffsmodell aufsetzen. In dieser Codebasis ist `tenants.status` der wirksame Access-Gate, nicht ein separates `is_active`-Feld.

### Routing-Struktur

```text
Owner Area
+-- /owner/dashboard
|   +-- bestehende System-Metriken
|   +-- Billing Summary Cards (neu)
|   +-- Link "Abrechnung" zur Vollansicht
|
+-- /owner/billing (neu)
|   +-- BillingOverviewPage
|       +-- BillingMetrics
|       +-- Search / Filter / Pagination
|       +-- TenantBillingTable
|       +-- Row action: "Details ansehen"
|
+-- /owner/tenants/[id]
    +-- bestehende Detailseite
    +-- neuer Tab "Billing"
        +-- Basis-Abo
        +-- Modul-Liste
        +-- Gesamtbetrag / Periode
        +-- manueller Sperrstatus
        +-- Lock / Unlock Action
```

Empfehlung:
- `/owner/billing` wird die operative Arbeitsflaeche fuer Abrechnung.
- `/owner/dashboard` zeigt nur zusammenfassende Billing-Kennzahlen, damit das bestehende Dashboard nicht zu einer ueberladenen Einzelseite wird.
- Die Tenant-Detailansicht aus PROJ-13 wird um einen Billing-Tab erweitert, statt eine zweite Detailroute einzufuehren.

### Komponenten-Struktur

```text
OwnerBillingOverviewPage
+-- Hero / Intro
+-- BillingMetricsRow
|   +-- Aktive Abos
|   +-- Past Due
|   +-- In Kuendigung
|   +-- Manuell gesperrt
|
+-- BillingToolbar
|   +-- SearchInput (Tenant-Name / Subdomain)
|   +-- StatusFilter
|   +-- AccessFilter
|
+-- TenantBillingTable
|   +-- Tenant identity (Name, Slug)
|   +-- Subscription badge
|   +-- Module count
|   +-- Next billing date
|   +-- Total per period
|   +-- Access badge
|   +-- Details action
|
+-- Empty / Error / Loading States

OwnerTenantDetailWorkspace
+-- bestehende Tabs
+-- neuer Tab "Billing"
    +-- SubscriptionStatusCard
    +-- AccessOverrideCard
    +-- ModuleBreakdownTable
    +-- Timeline / Hinweise (past_due, canceling, no subscription)
    +-- Action buttons: Sperren / Freischalten
```

### Datenmodell

Bestehende Felder, die wiederverwendet werden:
- `tenants.stripe_customer_id`
- `tenants.stripe_subscription_id`
- `tenants.subscription_status`
- `tenants.subscription_period_end`
- `tenants.status`

Abhaengige Tabellen aus PROJ-15:
- `modules`
- `tenant_modules`

Ergaenzung fuer PROJ-16:
- Owner-Sperren sollten nicht ueber ein zweites technisches Gate wie `is_active` modelliert werden, weil Login, Middleware und Owner-Flows bereits `tenants.status` verwenden.
- Stattdessen sollte ein kleiner Override-Kontext gespeichert werden, damit "warum ist dieser Tenant gesperrt?" sichtbar bleibt.

Empfohlene neue Felder auf `tenants`:
- `owner_locked_at TIMESTAMPTZ NULL`
- `owner_locked_by UUID NULL` -> Referenz auf `platform_admins.user_id`
- `owner_lock_reason TEXT NULL`

Effektive Regeln:
1. `tenants.status` bleibt das wirksame Zugriffssignal fuer Auth und Tenant-Aufloesung.
2. Eine manuelle Owner-Sperre setzt `tenants.status = 'inactive'` und fuellt `owner_locked_*`.
3. Eine Owner-Freischaltung leert `owner_locked_*` und setzt `tenants.status` anhand des Billing-Zustands neu:
   - `active` / `canceling` -> Zugriff wieder aktiv
   - `canceled` oder dauerhaft gescheiterte Zahlung -> Zugriff bleibt inaktiv
4. Webhooks duerfen einen manuell gesperrten Tenant nicht automatisch wieder freischalten.

Damit gibt es genau ein wirksames Access-Gate, aber trotzdem nachvollziehbare Owner-Overrides.

### API-Design

#### 1. Billing-Uebersicht fuer Owner

**GET `/api/owner/billing`** (neu)

Zweck:
- Liefert die paginierte Owner-Liste aller Tenants mit Billing-Daten aus der DB
- unterstuetzt Suche, Status-Filter und kritische Fokusansichten

Query-Parameter:
- `q` -> Tenant-Name oder Slug
- `subscriptionStatus` -> `active | past_due | canceling | canceled | none | all`
- `access` -> `all | accessible | manual_locked | billing_blocked`
- `page`
- `pageSize`

Response-Struktur:

```json
{
  "metrics": {
    "active": 24,
    "pastDue": 3,
    "canceling": 5,
    "manualLocked": 2
  },
  "tenants": [
    {
      "id": "uuid",
      "name": "Nordstern Studio",
      "slug": "nordstern",
      "tenantStatus": "active",
      "subscriptionStatus": "active",
      "moduleCount": 3,
      "nextBillingAt": "2026-04-15T00:00:00.000Z",
      "totalAmount": 12900,
      "currency": "eur",
      "accessState": "accessible"
    }
  ]
}
```

Leselogik:
- `tenants` ist die Basistabelle
- `tenant_modules` liefert Anzahl und Status aktiver Module
- `modules` liefert Modulpreise und Metadaten
- keine Live-Stripe-Abfrage fuer die Listenansicht

#### 2. Billing-Detail fuer einen Tenant

**GET `/api/owner/tenants/[id]/billing`** (neu)

Zweck:
- liefert die Detaildaten fuer den Billing-Tab auf der bestehenden Tenant-Detailseite

Inhalt:
- Basis-Abo-Status
- naechster Abrechnungstermin
- Stripe-IDs nur falls fuer Support sichtbar noetig
- Liste aller aktiven / kuendigenden / beendeten Module mit Einzelpreisen
- berechneter Gesamtbetrag pro Periode
- manueller Sperrstatus inkl. optionalem Sperrgrund

#### 3. Manueller Owner-Override

**POST `/api/owner/tenants/[id]/billing/lock`** (neu)
- sperrt den Tenant unabhaengig vom Stripe-Status
- setzt `tenants.status = 'inactive'`
- speichert `owner_locked_at`, `owner_locked_by`, optional `owner_lock_reason`

**POST `/api/owner/tenants/[id]/billing/unlock`** (neu)
- entfernt den manuellen Override
- reaktiviert den Tenant nur dann, wenn der Billing-Zustand Zugriff erlaubt

Warum eigene Endpunkte:
- fachlich klarer als eine Mehrzweck-PATCH-Route
- geringeres Risiko, den bestehenden PROJ-13-Update-Flow zu verkomplizieren

### Datenfluss

```text
Tenant Admin aendert Abo / Module
-> Stripe verarbeitet Zahlung / Subscription Change
-> Webhook /api/webhooks/stripe
-> Supabase aktualisiert tenants + tenant_modules
-> Owner Billing APIs lesen nur den DB-Stand
-> Owner sieht konsistente Uebersicht ohne Live-Stripe-Latenz
```

Fuer PROJ-16 wichtig:
- Die Listenansicht zeigt den gecachten Stand.
- Wenn Stripe temporaer nicht erreichbar ist, bleibt die Owner-Sicht trotzdem nutzbar.
- Der Detail-View kann spaeter optional einen "Zuletzt synchronisiert"-Hinweis anzeigen, braucht aber keinen direkten Stripe-Fallback fuer den MVP.

### E-Mail-Benachrichtigungen

Die Benachrichtigung "Tenant wechselt auf `past_due`" sollte am bestehenden Stripe-Webhook andocken, nicht an die Owner-UI.

Empfohlener Ablauf:
1. `invoice.payment_failed` oder `customer.subscription.updated` setzt den Tenant auf `past_due`.
2. Vor dem Update wird der bisherige DB-Status gelesen.
3. Eine Owner-E-Mail wird nur versendet, wenn der Uebergang neu ist (`previous_status != past_due`).
4. Empfaenger sind alle `platform_admins` oder eine spaetere dedizierte Billing-Owner-Liste.
5. Die bestehende Tenant-Admin-Mail aus PROJ-14 bleibt erhalten und wird nicht ersetzt.

So werden Doppelbenachrichtigungen bei wiederholten Webhook-Deliveries minimiert.

### Status- und Access-Modell

Um Verwirrung zwischen Billing-Status und echtem Zugriff zu vermeiden, sollte das UI zwei getrennte Signale zeigen:

- `subscriptionStatus`
  - fachlicher Zahlungs-/Abozustand: `active`, `past_due`, `canceling`, `canceled`, `none`
- `accessState`
  - wirksamer Plattformzugriff: `accessible`, `manual_locked`, `billing_blocked`

Beispiele:
- Stripe aktiv + Owner-Sperre -> `subscriptionStatus = active`, `accessState = manual_locked`
- Stripe canceled + keine Owner-Sperre -> `subscriptionStatus = canceled`, `accessState = billing_blocked`
- Stripe canceling + keine Owner-Sperre -> `subscriptionStatus = canceling`, `accessState = accessible`

Damit bleibt fuer den Owner sofort sichtbar, ob ein Problem aus dem Vertrag, aus einer Zahlung oder aus einem manuellen Eingriff stammt.

### Performance

- Owner-Liste bleibt paginiert, analog zu PROJ-8.
- Modulzaehlung und Summen sollten serverseitig aggregiert werden, nicht im Client.
- Fuer >100 Tenants reichen DB-Queries mit Pagination und Indexen auf:
  - `tenants.subscription_status`
  - `tenants.status`
  - `tenant_modules.tenant_id`
  - `tenant_modules.status`
- Kein N+1 ueber Stripe pro Tabellenzeile.

### Sicherheit

- Alle neuen Owner-Billing-Routen nutzen `requireOwner()`.
- Keine Tenant-Session-Uebernahme und kein Zugriff ueber Tenant-Subdomains.
- Lock/Unlock bleibt ein expliziter Owner-Vorgang mit Audit-Feldern.
- Webhook-Logik muss Owner-Overrides respektieren und darf manuelle Sperren nicht unbeabsichtigt aufheben.

### Tech-Entscheidungen

| Entscheidung | Warum das hier passt |
|---|---|
| Neue Owner-Seite `/owner/billing` statt alles in `/owner/dashboard` | Hält das bestehende Dashboard fokussiert und schafft Platz fuer Filter, Tabelle und kritische Billing-Faelle |
| Billing-Tab auf bestehender Tenant-Detailseite | Nutzt PROJ-13 direkt weiter und vermeidet doppelte Detailrouten |
| DB-Cache statt Live-Stripe in der Uebersicht | Stabiler, schneller und bereits durch PROJ-14/PROJ-15 angelegt |
| `tenants.status` als wirksames Access-Gate | Passt zur aktuellen Auth-/Routing-Logik und verhindert zwei konkurrierende Sperrmechanismen |
| Separate Owner-Lock-Metadaten | Macht manuelle Eingriffe nachvollziehbar, ohne das Zugriffsmodell zu duplizieren |
| Owner-Mail am Webhook statt in der UI | Reagiert sofort auf Zustandswechsel und funktioniert auch ohne offenen Browser-Tab |

### Abhaengigkeiten

- PROJ-14 liefert Stripe-Status und Webhook-Synchronisierung.
- PROJ-15 muss `modules` und `tenant_modules` real in der DB anlegen, damit Modulpreise und Modulstatus in der Owner-Sicht erscheinen koennen.
- PROJ-4 wird fuer die Owner-Benachrichtigung bei `past_due` wiederverwendet.

## Frontend Implementation Notes

**Implementiert am 2026-03-28 durch /frontend**

### Neue Dateien:
- `src/components/owner-billing-workspace.tsx` -- Komplette Owner-Billing-Uebersicht mit Metriken-Row (aktive Abos, ueberfaellig, in Kuendigung, manuell gesperrt), Tenant-Tabelle mit Subscription-Badge, Modul-Count, naechstem Abrechnungstermin, Gesamtbetrag und Access-Badge. Unterstuetzt Suche, Pagination und Status-Filter.
- `src/app/(owner)/owner/billing/page.tsx` -- Neue Owner-Route fuer die Billing-Uebersicht.

### Geaenderte Dateien:
- `src/components/owner-sidebar.tsx` -- Neuer Nav-Eintrag "Abrechnung" mit CreditCard-Icon.
- `src/components/owner-tenant-detail-workspace.tsx` -- Neuer Tab "Abo" (value: subscription) mit OwnerTenantSubscriptionTab. Zeigt Abo-Status, Gesamtbetrag, Zugangs-Override (Sperren/Freischalten) und Modul-Breakdown. Tabs unterstuetzen `?tab=subscription` URL-Parameter fuer Direktnavigation aus der Billing-Tabelle.

### Erwartete API-Endpunkte (noch zu implementieren in /backend):
- `GET /api/owner/billing` -- Paginierte Tenant-Liste mit Billing-Metriken
- `GET /api/owner/tenants/[id]/billing` -- Billing-Detail fuer einzelnen Tenant
- `POST /api/owner/tenants/[id]/billing/lock` -- Manuelle Tenant-Sperre
- `POST /api/owner/tenants/[id]/billing/unlock` -- Tenant-Freischaltung

### Abweichungen vom Tech Design:
- Keine -- Frontend folgt exakt der spezifizierten Komponentenstruktur und dem API-Design

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
