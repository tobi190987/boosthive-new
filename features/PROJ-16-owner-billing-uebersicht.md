# PROJ-16: Owner Billing-Übersicht

## Status: Deployed
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

**Tested:** 2026-03-28 (Re-Test nach Bug-Fixes)
**App URL:** http://localhost:3000
**Tester:** QA Engineer (AI)
**Build Status:** PASS (npm run build erfolgreich, /owner/billing Route vorhanden)

### Acceptance Criteria Status

#### AC-1: Billing-Bereich im Owner-Dashboard mit Tenant-Abo-Status-Liste
- [x] /owner/billing Route existiert und rendert OwnerBillingWorkspace
- [x] GET /api/owner/billing liefert paginierte Tenant-Liste mit subscriptionStatus pro Tenant
- [x] Status-Werte: active, past_due, canceling, canceled, none korrekt gemappt
- [x] Sidebar-Eintrag "Abrechnung" vorhanden
- **Ergebnis: PASS**

#### AC-2: Tenant-Eintrag zeigt Basis-Plan-Status, aktive Module, naechster Termin, Gesamtbetrag
- [x] TenantBillingTable zeigt: Name/Slug, Abo-Status Badge, Module-Count, naechste Abrechnung, Betrag/Periode, Zugangs-Badge
- [x] Basis-Plan-Preis wird dynamisch aus Stripe geladen
- [x] Module-Count kommt aus tenant_modules (status active/canceling)
- [x] Gesamtbetrag = basePlanAmount + moduleCount * modulePriceAmount
- [ ] **BUG-P16-1 (MEDIUM):** modulePriceAmount wird nur vom ERSTEN Modul geladen (`.limit(1).maybeSingle()`). Wenn Module unterschiedliche Preise haben, ist der Gesamtbetrag in der Uebersicht falsch. Aktuell irrelevant (alle Module gleicher Preis), aber architektonisch problematisch.
- **Ergebnis: PARTIAL PASS**

#### AC-3: Tenants mit past_due/canceled visuell hervorgehoben
- [x] past_due: rotes Badge "Ueberfaellig" (bg-[#fef2f2] text-[#dc2626])
- [x] canceled: graues Badge "Gekuendigt" (bg-[#f1f5f9] text-[#64748b])
- [x] Metriken-Row zeigt Zaehler fuer "Ueberfaellig" mit rotem Icon
- **Ergebnis: PASS**

#### AC-4: Owner kann Detailansicht mit Modulen und Einzelpreisen aufrufen
- [x] "Details" Button verlinkt zu `/owner/tenants/[id]?tab=subscription`
- [x] OwnerTenantSubscriptionTab laedt Daten von GET /api/owner/tenants/[id]/billing
- [x] API liefert Module mit Einzelpreisen, Status, currentPeriodEnd
- [x] Modul-Preise werden einzeln aus Stripe geladen (mit priceCache)
- **Ergebnis: PASS**

#### AC-5: Owner kann Tenant manuell sperren (is_active = false)
- [x] POST /api/owner/tenants/[id]/billing/lock implementiert
- [x] Setzt tenants.status = 'inactive', owner_locked_at, owner_locked_by, owner_lock_reason
- [x] Prueft ob Tenant bereits gesperrt (409 bei Doppel-Sperre)
- [x] Audit-Log wird geschrieben
- [x] UI zeigt Lock-Button in OwnerTenantSubscriptionTab
- **Ergebnis: PASS**

#### AC-6: Owner kann gesperrten Tenant freischalten
- [x] POST /api/owner/tenants/[id]/billing/unlock implementiert
- [x] Prueft ob Tenant wirklich gesperrt ist (409 wenn nicht)
- [x] Neuer Status basiert auf Billing-Zustand (active wenn Abo ok, inactive wenn canceled/unpaid/past_due)
- [x] owner_locked_* Felder werden auf null gesetzt
- [x] Audit-Log wird geschrieben
- [x] UI zeigt Unlock-Button wenn Tenant gesperrt
- **Ergebnis: PASS**

#### AC-7: Owner E-Mail bei past_due-Uebergang
- [x] **FIXED (ehemals BUG-P16-2):** `sendOwnerPastDueNotification()` wird jetzt in `handleInvoicePaymentFailed` aufgerufen (Zeile 306 in webhook route.ts)
- [x] Laedt alle platform_admins und sendet an jede E-Mail-Adresse
- [x] E-Mail-Template in src/emails/owner-past-due.ts mit Link zum Owner-Dashboard
- [x] Non-fatal: Fehler beim Senden werden geloggt, Webhook schlaegt nicht fehl
- **Ergebnis: PASS**

#### AC-8: Billing-Uebersicht nur fuer Owner zugaenglich
- [x] GET /api/owner/billing nutzt `requireOwner()` als erstes
- [x] GET /api/owner/tenants/[id]/billing nutzt `requireOwner()`
- [x] POST lock/unlock nutzen `requireOwner()`
- [x] /owner/billing Route ist im Owner-Layout geschuetzt
- **Ergebnis: PASS**

### Edge Cases Status

#### EC-1: Tenant ohne Stripe Customer
- [x] API liefert subscriptionStatus 'none' wenn kein stripe_customer_id
- [x] UI zeigt "Kein Abo" Badge
- **Ergebnis: PASS**

#### EC-2: Owner sperrt Tenant mit aktivem Stripe-Abo
- [x] Lock-Route setzt status='inactive' unabhaengig vom Stripe-Status
- [x] Webhook respektiert Owner-Lock: `handleSubscriptionUpdated` prueft owner_locked_at und setzt NICHT is_active=true
- [x] `handleInvoicePaymentSucceeded` prueft ebenfalls owner_locked_at
- **Ergebnis: PASS**

#### EC-3: Unlock bei canceled Stripe-Abo
- [x] Unlock-Route setzt status='inactive' wenn Billing-Status canceled/unpaid/past_due
- [x] Response enthaelt Hinweis: "Tenant wurde entsperrt, bleibt aber inaktiv wegen Billing-Status."
- **Ergebnis: PASS**

#### EC-4: Viele Tenants (>100) -- Pagination
- [x] API unterstuetzt page/pageSize Parameter
- [x] pageSize auf max 50 begrenzt (Server-seitig)
- [x] UI zeigt Pagination-Controls (Zurueck/Weiter)
- [ ] **BUG-P16-3 (MEDIUM):** Die API laedt ALLE Tenants aus der DB (`tenantsQuery` ohne Limit) fuer die Metriken-Berechnung und filtert erst danach im JavaScript. Bei >1000 Tenants wird das zur Performance-Falle. Die Metriken sollten per SQL-Aggregation berechnet werden, nicht in-memory.
- **Ergebnis: PARTIAL PASS**

#### EC-5: Stripe-API nicht erreichbar
- [x] Base Plan Preis hat Fallback (4900 wenn Stripe-Abfrage fehlschlaegt)
- [x] Modul-Preis Fehler wird gefangen
- [x] Daten aus DB-Cache werden auch ohne Stripe angezeigt
- **Ergebnis: PASS**

### Security Audit Results

#### Authentifizierung & Autorisierung
- [x] Alle Owner-Billing-Routen nutzen `requireOwner()` als Guard
- [x] Lock/Unlock-Routen validieren Tenant-ID als UUID
- [x] Tenant-Admins oder Members koennen NICHT auf Owner-Billing-APIs zugreifen

#### Input Validation
- [x] Lock-Route validiert `reason` mit Zod (max 500 Zeichen)
- [x] Tenant-ID wird gegen UUID-Regex geprueft
- [x] Search-Query wird escaped (% und _ werden escaped fuer ILIKE)

#### Rate Limiting
- [ ] **BUG-P16-4 (MEDIUM):** KEINE der Owner-Billing-Routen hat Rate Limiting. GET /api/owner/billing, GET .../billing (Detail), POST .../lock, POST .../unlock sind alle ungeschuetzt. Da dies Owner-only ist, ist das Risiko geringer, aber ein kompromittierter Owner-Account koennte die API ueberlasten.

#### Cross-Tenant-Isolation
- [x] Owner kann nur seine eigenen Daten sehen (via platform_admins Check)
- [x] Lock/Unlock-Aktionen werden im Audit-Log protokolliert mit actorUserId
- [x] Kein Tenant-Admin kann die Owner-Billing-Sicht aufrufen

#### Daten-Exposure
- [x] Owner Billing API gibt keine Stripe Secret Keys zurueck
- [x] stripe_customer_id und stripe_subscription_id werden NICHT an den Client gesendet in der Billing-Uebersicht
- [x] Tenant-Detail-Billing zeigt ebenfalls keine Stripe-IDs

#### Access-Filter (API-Feature-Gap)
- [ ] **BUG-P16-5 (LOW):** Der Tech-Design spezifiziert einen `access` Query-Parameter (all | accessible | manual_locked | billing_blocked) fuer die Billing-Uebersicht-API. Dieser Filter ist NICHT implementiert. Die Subscription-Status-Filter funktionieren, aber der Access-Filter fehlt.

#### Neuer Fund: Webhook setzt is_active statt status
- [ ] **BUG-P16-6 (LOW):** Der Webhook (handleSubscriptionUpdated Zeile 182, handleSubscriptionDeleted Zeile 230) setzt `is_active = false` bei canceled/unpaid. Das PROJ-16 Tech Design definiert `tenants.status` als das einzige wirksame Access-Gate. Es gibt also zwei konkurrierende Sperrmechanismen (is_active und status). Dies ist ein Architektur-Inkonsistenz, die in PROJ-18 (Tenant Status Modell) adressiert werden sollte.

### Cross-Browser & Responsive (Code-Review)
- [x] OwnerBillingWorkspace nutzt responsive Grid: `md:grid-cols-2 xl:grid-cols-4` fuer Metriken
- [x] Tabelle ist overflow-x-auto fuer kleine Screens
- [x] Pagination-Controls sind flexbox-basiert und stacken auf Mobile
- [x] Tab-Filter wrappen auf kleinen Screens (`flex-wrap`)
- [x] Debounced Search (250ms timeout) verhindert excessive API-Calls bei Tastatureingabe

### Bugs Found (aktueller Stand nach Fixes)

#### BUG-P16-1: Modul-Preis-Berechnung in Uebersicht nutzt nur ersten Modul-Preis
- **Severity:** Medium
- **Status:** Offen
- **Steps to Reproduce:**
  1. Konfiguriere Module mit unterschiedlichen Stripe-Preisen
  2. Oeffne /owner/billing
  3. Expected: Gesamtbetrag beruecksichtigt individuelle Modul-Preise
  4. Actual: modulePriceAmount wird nur vom ersten aktiven Modul geladen und fuer alle multipliziert
- **Impact:** Aktuell irrelevant (gleiche Preise), aber bricht sobald verschiedene Preise eingefuehrt werden
- **Priority:** Fix in next sprint

#### ~~BUG-P16-2: Owner past_due E-Mail wird nie gesendet~~ -- GEFIXT
- **Status:** Gefixt in Commit 5592e04/f905d48. sendOwnerPastDueNotification() wird jetzt in handleInvoicePaymentFailed aufgerufen (Zeile 306).

#### BUG-P16-3: Owner Billing API laedt alle Tenants fuer Metriken in-memory
- **Severity:** Medium
- **Status:** Offen
- **Steps to Reproduce:**
  1. Habe >500 Tenants in der DB
  2. Oeffne GET /api/owner/billing
  3. Expected: Metriken per SQL-Aggregation, Pagination per SQL LIMIT/OFFSET
  4. Actual: Alle Tenants werden geladen, Metriken in JS berechnet, dann erst paginiert
- **Impact:** O(n) Memory und Latenz, skaliert nicht bei vielen Tenants
- **Priority:** Fix in next sprint

#### BUG-P16-4: Kein Rate Limiting auf Owner-Billing-Routen
- **Severity:** Medium
- **Status:** Offen
- **Steps to Reproduce:**
  1. Sende 1000x GET /api/owner/billing in 10 Sekunden
  2. Expected: Rate Limit greift
  3. Actual: Alle Requests werden verarbeitet
- **Priority:** Fix in next sprint

#### BUG-P16-5: Access-Filter nicht implementiert
- **Severity:** Low
- **Status:** Offen
- **Steps to Reproduce:**
  1. Sende GET /api/owner/billing?access=manual_locked
  2. Expected: Nur manuell gesperrte Tenants werden zurueckgegeben
  3. Actual: Der `access` Parameter wird ignoriert, alle Tenants werden zurueckgegeben
- **Impact:** Feature-Luecke gegenueber dem Tech Design. Der Owner kann nicht nach Zugangsstatus filtern.
- **Priority:** Fix in next sprint

#### BUG-P16-6 (NEU): Webhook setzt is_active statt tenants.status
- **Severity:** Low
- **Status:** Neu entdeckt
- **Steps to Reproduce:**
  1. Stripe Subscription wird canceled oder unpaid
  2. handleSubscriptionUpdated/Deleted setzt `is_active = false`
  3. Expected: Webhook setzt `tenants.status = 'inactive'` (das wirksame Access-Gate laut PROJ-16 Tech Design)
  4. Actual: Webhook setzt nur `is_active = false`, was ein separates Feld ist. tenants.status wird nicht direkt geaendert.
- **Impact:** Architektur-Inkonsistenz zwischen zwei Access-Gates. Lock/Unlock nutzt tenants.status, Webhook nutzt is_active. Beide muessen synchron bleiben. Wird in PROJ-18 (Tenant Status Modell) adressiert.
- **Priority:** Fix im Rahmen von PROJ-18

### Summary
- **Acceptance Criteria:** 7/8 passed (AC-2 partial wegen Modul-Preis-Berechnung)
- **Edge Cases:** 4/5 passed (EC-4 partial wegen in-memory Metriken)
- **Bugs Found:** 5 total (0 critical, 0 high, 3 medium, 2 low) -- 1 ehemals high (BUG-P16-2) wurde gefixt
- **Security:** Rate Limiting fehlt auf Owner-Routen, sonst solide
- **Production Ready:** JA (mit Einschraenkung: BUG-P16-3 und P16-4 sollten zeitnah gefixt werden)
- **Recommendation:** Keine Blocker mehr. Der High-Bug (Owner past_due E-Mail) wurde gefixt. Modul-Preis-Berechnung und In-Memory-Metriken sollten im naechsten Sprint behoben werden.

## Deployment
_To be added by /deploy_
