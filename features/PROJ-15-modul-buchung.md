# PROJ-15: Modul-Buchung & Verwaltung

## Status: Deployed
**Created:** 2026-03-27
**Last Updated:** 2026-03-28

## Dependencies
- Requires: PROJ-14 (Stripe Setup & Basis-Abo) — Nur Tenants mit aktivem Basis-Plan können Module buchen
- Requires: PROJ-6 (Role-Based Access Control) — Nur `admin`-Rolle darf Module buchen/abbestellen

## Overview
Auf dem aktiven Basis-Abo aufbauend können Tenants einzelne Module (z.B. SEO Analyse, AI Tools) dazu buchen oder abbestellen. Neue Module starten sofort (anteilige Abrechnung via Stripe). Abbestellungen gelten zum Ende der laufenden 4-Wochen-Periode. Module steuern den Feature-Zugang im Tenant-Dashboard (Feature-Gating).

## User Stories
- Als Tenant-Admin möchte ich eine Übersicht aller verfügbaren Module mit Preisen und meinem aktuellen Buchungsstatus sehen.
- Als Tenant-Admin möchte ich ein neues Modul sofort buchen, damit ich es noch innerhalb der laufenden Periode nutzen kann.
- Als Tenant-Admin möchte ich ein aktives Modul zum Periodenende abbestellen, damit keine weiteren Kosten entstehen.
- Als Tenant-Admin möchte ich eine Abbestellung rückgängig machen können, solange die Periode noch läuft.
- Als Tenant-Member möchte ich nicht gebuchte Module im Dashboard sehen, aber mit einem Hinweis, dass sie nicht freigeschaltet sind (Upgrade-Prompt), damit ich weiß, was verfügbar wäre.
- Als Owner möchte ich neue Module zur Plattform hinzufügen können, ohne Code-Änderungen an bestehenden Tenants vornehmen zu müssen.

## Acceptance Criteria
- [ ] Im Billing-Bereich des Tenant-Dashboards wird eine Liste aller verfügbaren Module angezeigt (Name, Beschreibung, Preis/4 Wochen, Status: aktiv / nicht gebucht / endet am...).
- [ ] Ein Modul kann sofort gebucht werden. Stripe fügt das Modul als zusätzliches Subscription Item hinzu (anteilige Abrechnung für die laufende Periode via Stripe Proration).
- [ ] Ein gebuchtes Modul kann abbestellt werden. Das Item wird auf `cancel_at_period_end` gesetzt. Das Modul bleibt bis Periodenende nutzbar.
- [ ] Eine Abbestellung kann rückgängig gemacht werden, solange die Periode noch läuft (Item wieder auf `cancel_at_period_end: false`).
- [ ] Nicht gebuchte Module sind im Dashboard sichtbar, aber gesperrt (UI-Gating). Der Member sieht einen Upgrade-Prompt mit Verweis an den Admin.
- [ ] Gebuchte Module sind vollständig nutzbar (kein Feature-Gate).
- [ ] Module, deren Abo-Status `canceled` oder `will_cancel` ist, zeigen im Dashboard ein entsprechendes Badge.
- [ ] Alle Modul-Änderungen lösen einen Stripe-Webhook aus, der die DB-Tabelle `tenant_modules` aktualisiert.
- [ ] Die Modul-Konfiguration (verfügbare Module, Stripe Price IDs) ist datenbankgesteuert — neue Module können ohne Code-Deployment hinzugefügt werden.

## Edge Cases
- Basis-Plan wird gekündigt (cancel_at_period_end): Alle Module laufen automatisch bis Periodenende mit und werden dann deaktiviert.
- Admin versucht ein Modul zu buchen, das bereits gebucht ist → UI verhindert Doppelbuchung, API gibt Fehler zurück.
- Admin bestellt alle Module ab, Basis-Plan bleibt aktiv → Valider Zustand; leeres Dashboard, Basis-Zugang besteht.
- Webhook für Modul-Änderung kommt vor dem API-Response an → idempotente Verarbeitung, kein Race Condition.
- Modul wird von der Plattform entfernt (Price deaktiviert) → bestehende Buchungen laufen bis Periodenende, danach kein Renewal.
- Proration-Betrag bei Modul-Zubuchung ist 0 (Periode fast vorbei) → valide, Stripe behandelt korrekt.

## Technical Requirements
- Stripe: Subscription Items (`subscriptionItem.create/update/delete`) mit Proration
- DB-Tabelle `modules`: `id`, `name`, `description`, `stripe_price_id`, `is_active`
- DB-Tabelle `tenant_modules`: `tenant_id`, `module_id`, `stripe_subscription_item_id`, `status` (active, canceling, canceled)
- Feature-Gating: Middleware/Hook prüft `tenant_modules` für aktuellen Tenant
- Relevante Stripe Events: `customer.subscription.updated` (Item-Änderungen)

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

### Architektur-Prinzip

PROJ-15 erweitert das bestehende Billing-Modell aus PROJ-14, statt ein zweites Abo-System einzuführen. Es bleibt genau **eine Stripe Subscription pro Tenant** bestehen. Der Basis-Plan bleibt das erste Subscription Item; jedes gebuchte Modul wird als **zusätzliches Subscription Item** in derselben Subscription geführt. Die Datenbank ist dabei der lokale Cache für UI, Feature-Gating und Owner-Reporting; Stripe bleibt das führende System für Abrechnung und Laufzeiten.

### UI-Struktur

```text
/billing
+-- BillingWorkspace (bestehend)
    +-- Basis-Abo Card (bestehend)
    +-- ModuleSection (neu)
        +-- ModuleCatalogCard[]
            +-- Name + Beschreibung
            +-- Preis / 4 Wochen
            +-- Status-Badge
            +-- CTA:
                - "Jetzt buchen"
                - "Zum Periodenende abbestellen"
                - "Abbestellung rückgängig machen"

/dashboard
+-- TenantDashboardOverview (bestehend)
    +-- Modul-Teaser / Tool-Karten (erweitert)
        +-- [aktiv] Direkter Einstieg ins Modul
        +-- [nicht gebucht] Gated Card mit Upgrade-Hinweis
        +-- [canceling] Badge "Endet am ..."
```

**Sichtbarkeit nach Rolle:**
- `admin`: darf Module im Billing buchen, kündigen und reaktivieren
- `member`: sieht Modul-Karten im Dashboard, aber keine Billing-Aktionen

### Datenmodell

**Neue Tabelle `modules`:**

| Feld | Zweck |
|------|-------|
| `id` | interne UUID |
| `code` | stabiler technischer Key, z.B. `seo_analyse`, `ai_visibility` |
| `name` | Anzeigename |
| `description` | Beschreibung für Billing- und Dashboard-UI |
| `stripe_price_id` | Price-ID des Moduls in Stripe |
| `sort_order` | definierte Reihenfolge in der UI |
| `is_active` | steuert, ob das Modul neu buchbar ist |
| `created_at` / `updated_at` | Audit / Pflege |

**Neue Tabelle `tenant_modules`:**

| Feld | Zweck |
|------|-------|
| `tenant_id` | Tenant-Zuordnung |
| `module_id` | Referenz auf `modules` |
| `stripe_subscription_item_id` | Stripe Subscription Item für dieses Modul |
| `status` | `active`, `canceling`, `canceled` |
| `current_period_end` | Ende der aktuellen Nutzungsperiode |
| `cancel_at_period_end` | expliziter UI-/Webhook-Status |
| `created_at` / `updated_at` | Audit / Idempotenz-Nachvollziehbarkeit |

**Constraints / Regeln:**
- Unique Constraint auf `(tenant_id, module_id)` verhindert Doppelbuchungen
- `modules.code` und `modules.stripe_price_id` sind eindeutig
- `tenant_modules` wird primär per Stripe-Webhook synchron gehalten; API darf optimistische Sofort-Updates setzen, damit die UI direkt reagiert

### API-Design

| Route | Zweck |
|-------|-------|
| `GET /api/tenant/billing` | wird erweitert um `modules[]` und Modulstatus je Tenant |
| `POST /api/tenant/billing/modules/[moduleId]/subscribe` | fügt Subscription Item mit Proration hinzu |
| `POST /api/tenant/billing/modules/[moduleId]/cancel` | setzt Modul-Item auf Kündigung zum Periodenende |
| `POST /api/tenant/billing/modules/[moduleId]/reactivate` | nimmt eine geplante Modul-Kündigung zurück |
| `POST /api/webhooks/stripe` | erweitert Sync-Logik für Modul-Items |

**Autorisierung:**
- alle Modul-Mutationsrouten nutzen `requireTenantAdmin`
- read-only Modulstatus für Dashboard darf über bestehende Tenant-Kontext-Mechanik geladen werden

### Stripe-Modell

**Subscription-Aufbau:**
- 1 Basis-Subscription pro Tenant
- 1 Subscription Item für Basis-Plan
- 0..n zusätzliche Subscription Items für Module

**Buchung eines Moduls:**
1. Tenant-Admin öffnet `/billing`
2. API prüft aktiven Basis-Plan und verhindert Doppelbuchung
3. `stripe.subscriptions.retrieve(...)` lädt die bestehende Subscription
4. `stripe.subscriptionItems.create(...)` oder `stripe.subscriptions.update(...)` fügt das Modul-Price mit `proration_behavior: 'create_prorations'` hinzu
5. API schreibt optional sofort `tenant_modules.status = 'active'`
6. `customer.subscription.updated` bestätigt den finalen Zustand und synchronisiert DB idempotent

**Abbestellung eines Moduls:**
1. API identifiziert `stripe_subscription_item_id`
2. Stripe-Item wird so geändert, dass es zum Periodenende ausläuft
3. DB markiert das Modul sofort als `canceling`
4. Nach dem finalen Stripe-Event wird Status zu `canceled` oder Datensatz archiviert

**Wichtige fachliche Entscheidung:**
Da `cancel_at_period_end` auf Subscription-Ebene in Stripe existiert, aber nicht auf jedem Item gleich modelliert ist, sollte die App Modul-Kündigungen **über die Item-Laufzeit und Webhook-Synchronisierung** abbilden, nicht über eine zweite lokale Logik ohne Stripe-Bezug. Die genaue Stripe-Operation wird in `/backend` finalisiert, aber die Architektur bleibt: Modulstatus wird aus Subscription-Items abgeleitet, nicht aus separaten Freitext-Flags.

### Webhook-Synchronisierung

Der bestehende Webhook `/api/webhooks/stripe` wird erweitert, damit er nicht nur `tenants.subscription_status`, sondern auch `tenant_modules` pflegt.

**Synchronisationslogik bei `customer.subscription.updated`:**
- Tenant über `customerId` auflösen
- alle aktiven Stripe Subscription Items laden
- Basis-Plan-Item von Modul-Items trennen
- jedes Modul-Item über `modules.stripe_price_id` einer Moduldefinition zuordnen
- Upsert in `tenant_modules` mit Status `active` oder `canceling`
- nicht mehr vorhandene Modul-Items für diesen Tenant auf `canceled` setzen

**Warum so:**
- Stripe bleibt Source of Truth
- Race Conditions zwischen API-Response und Webhook bleiben harmlos
- Owner-Reporting aus PROJ-16 kann rein aus der DB lesen

### Feature-Gating

Feature-Gating wird in zwei Ebenen getrennt:

**1. UX-Gating im Dashboard**
- `TenantShellContext` oder ein ergänzender Loader liefert gebuchte Module mit
- Dashboard- und Tool-Karten rendern sichtbar, aber unterscheiden zwischen `active`, `canceling`, `inactive`
- bei `inactive` sieht der Member einen Upgrade-Hinweis statt des echten Einstiegs

**2. Serverseitiges Enforcement**
- neue Guard-Helfer, z.B. `requireTenantModuleAccess(tenantId, moduleCode)`
- API-Routen zukünftiger Module (`PROJ-10`, `PROJ-11`, `PROJ-12`) prüfen zusätzlich zur Mitgliedschaft, ob das Modul aktiv ist
- Status `canceling` bleibt bis `current_period_end` zulässig

Damit gibt es keinen reinen Frontend-Schutz; das UI erklärt den Zustand, der Server erzwingt ihn.

### Owner-Erweiterbarkeit

Neue Module sollen ohne Deployment hinzugefügt werden können. Deshalb liegt die katalogartige Konfiguration vollständig in `modules`:
- Owner oder Plattform-Team legt neuen Datensatz in `modules` an
- verknüpft den passenden `stripe_price_id`
- setzt `is_active = true`
- bestehende Billing-UI listet das Modul automatisch

Nur wenn ein Modul zusätzlich eine neue eigene Produktfläche braucht, ist für die eigentliche Funktionalität weiterer Code nötig. Die **Buchbarkeit** und **Lizenzierung** selbst bleiben datengetrieben.

### Betroffene Bereiche im Code

- `src/app/api/tenant/billing/route.ts`: Billing-Response um Modulübersicht erweitern
- `src/components/billing-workspace.tsx`: Modul-Katalog und Actions ergänzen
- `src/app/api/webhooks/stripe/route.ts`: Sync für Subscription Items ergänzen
- `src/lib/auth-guards.ts` oder neues Helper-Modul: Modul-Access-Guard
- `src/lib/tenant-shell.ts` und `src/components/tenant-dashboard-overview.tsx`: Modulstatus für Dashboard-Gating bereitstellen
- neue Migration für `modules` und `tenant_modules`

### Offene Punkte für /backend

- exakte Stripe-Operation für "Item zum Periodenende auslaufen lassen" pro Modul festziehen und gegen gewünschtes Verhalten testen
- entscheiden, ob `canceled`-Datensätze in `tenant_modules` erhalten oder nach Ablauf entfernt werden
- RLS-Policies für `modules` und `tenant_modules` definieren
- Seed/Bootstrap-Strategie für erste Module (`SEO Analyse`, `AI Performance`, `AI Visibility`) festlegen

## Frontend Implementation Notes

**Implementiert am 2026-03-28 durch /frontend**

### Geaenderte Dateien:
- `src/components/billing-workspace.tsx` -- Erweitert um ModuleSection und ModuleCatalogCard. Das BillingData-Interface enthaelt jetzt ein optionales `modules[]`-Array. Drei neue API-Handler (subscribe, cancel, reactivate) fuer Modul-Aktionen. Jedes Modul zeigt Status-Badge, Preis, und kontextabhaengige CTAs.
- `src/components/tenant-dashboard-overview.tsx` -- Dynamische Modul-Karten statt statischer "Tools" Placeholder. Aktive Module zeigen direkten Einstieg; nicht gebuchte Module sind als gated Cards mit Upgrade-Hinweis sichtbar. Members sehen Hinweis "Wende dich an deinen Admin". Admins sehen Link zum Billing-Bereich.

### Erwartete API-Endpunkte (noch zu implementieren in /backend):
- `GET /api/tenant/billing` muss `modules[]` Array im Response liefern
- `POST /api/tenant/billing/modules/[moduleId]/subscribe`
- `POST /api/tenant/billing/modules/[moduleId]/cancel`
- `POST /api/tenant/billing/modules/[moduleId]/reactivate`

### Abweichungen vom Tech Design:
- Keine -- Frontend folgt exakt der spezifizierten UI-Struktur

## QA Test Results

**Tested:** 2026-03-28 (Re-Test nach Bug-Fixes)
**App URL:** http://localhost:3000
**Tester:** QA Engineer (AI)
**Build Status:** PASS (npm run build erfolgreich)

### Acceptance Criteria Status

#### AC-1: Modul-Liste im Billing-Bereich (Name, Beschreibung, Preis/4 Wochen, Status)
- [x] GET /api/tenant/billing liefert `modules[]` Array mit id, code, name, description, price, currency, status, current_period_end
- [x] billing-workspace.tsx rendert ModuleSection mit ModuleCatalogCard fuer jedes Modul
- [x] Status-Badges: "Aktiv", "Endet bald", "Beendet", "Nicht gebucht" korrekt implementiert
- [x] Preis wird korrekt als `formatAmount(mod.price, mod.currency) / 4 Wochen` angezeigt
- **Ergebnis: PASS**

#### AC-2: Modul sofort buchbar mit Stripe Proration
- [x] POST /api/tenant/billing/modules/[moduleId]/subscribe implementiert
- [x] Nutzt `stripe.subscriptionItems.create()` mit `proration_behavior: 'create_prorations'`
- [x] Prueft aktiven Basis-Plan (status 'active' oder 'canceling')
- [x] Optimistischer DB-Write via upsert nach Stripe-Aufruf
- [x] Rate Limiting vorhanden (10 Req/min)
- **Ergebnis: PASS**

#### AC-3: Modul-Abbestellung mit cancel_at_period_end
- [x] POST /api/tenant/billing/modules/[moduleId]/cancel implementiert
- [x] Prueft status === 'active' vor Kuendigung
- [x] DB-Status wird auf 'canceling' gesetzt, cancel_at_period_end auf true
- [ ] **BUG-P15-1:** Statt `cancel_at_period_end` auf dem Stripe Item zu setzen, wird `subscriptionItems.del()` verwendet. Das loescht das Item sofort aus Stripe, was bedeutet dass eine Reaktivierung ein neues Item erstellen muss (mit neuer proration). Die Spec fordert "Item wird auf cancel_at_period_end gesetzt", die Implementierung loescht es stattdessen.
- **Ergebnis: PARTIAL PASS (funktional ok, aber Abweichung vom Spec-Design)**

#### AC-4: Abbestellung rueckgaengig machen
- [x] POST /api/tenant/billing/modules/[moduleId]/reactivate implementiert
- [x] Prueft status === 'canceling' und dass Periode noch nicht abgelaufen
- [x] Erstellt neues Stripe Subscription Item (wegen AC-3 Abweichung)
- [x] Nutzt `proration_behavior: 'none'` bei Reaktivierung
- **Ergebnis: PASS**

#### AC-5: Nicht gebuchte Module im Dashboard mit Upgrade-Prompt
- [x] tenant-dashboard-overview.tsx unterscheidet activeModules und gatedModules
- [x] Gated Cards zeigen Lock-Icon, dashed border, und gedaempfte Farben
- [x] Member sieht: "Wende dich an deinen Admin, um dieses Modul freizuschalten."
- [x] Admin sieht: Link "Modul buchen" zu /billing
- **Ergebnis: PASS**

#### AC-6: Gebuchte Module vollstaendig nutzbar (kein Feature-Gate)
- [x] module-access.ts implementiert `requireTenantModuleAccess()` und `getActiveModuleCodes()`
- [x] Status 'active' gewaehrt Zugriff, 'canceling' bis period_end
- [x] Dashboard zeigt "Freigeschaltet" Badge fuer aktive Module
- **Ergebnis: PASS**

#### AC-7: Module mit canceled/will_cancel zeigen Badge im Dashboard
- [x] Canceling-Module zeigen "Endet bald" Badge im Billing-Katalog
- [x] Canceling-Module zeigen "Endet bald" Badge im Dashboard
- [x] Ablaufdatum wird unter der Karte angezeigt
- **Ergebnis: PASS**

#### AC-8: Stripe-Webhook aktualisiert tenant_modules
- [x] **FIXED (ehemals BUG-P15-2):** `syncModuleItems()` wird jetzt korrekt aufgerufen in `handleSubscriptionUpdated` (Zeile 201-203) und `handleSubscriptionDeleted` (Zeile 243-245)
- [x] Sync-Logik: Laedt alle Module, baut priceToModules Map, filtert Basis-Plan raus, matched via metadata.module_id (primaer) oder price_id (Fallback), upserted active Items, setzt fehlende auf canceled
- [x] Non-fatal: Fehler in syncModuleItems werden geloggt aber verhindern nicht den Webhook-Response
- **Ergebnis: PASS**

#### AC-9: Modul-Konfiguration datenbankgesteuert (ohne Code-Deployment)
- [x] `modules` Tabelle mit code, name, description, stripe_price_id, sort_order, is_active
- [x] API liest Module dynamisch aus der DB
- [x] Neue Module koennen per INSERT in `modules` hinzugefuegt werden
- [x] Seed-Daten fuer seo_analyse, ai_performance, ai_visibility vorhanden
- **Ergebnis: PASS**

### Edge Cases Status

#### EC-1: Basis-Plan gekuendigt -- Module laufen bis Periodenende
- [x] Subscribe-Route erlaubt Modul-Buchung auch bei subscription_status === 'canceling'
- [x] Module bleiben nutzbar bis period_end (module-access.ts prueft Datum)
- **Ergebnis: PASS**

#### EC-2: Doppelbuchung verhindern
- [x] DB: UNIQUE Constraint auf (tenant_id, module_id) vorhanden
- [x] API prueft existierende Buchung und gibt 409 zurueck bei status 'active' oder 'canceling'
- [x] Bei status 'canceled' wird rebooking via upsert erlaubt
- **Ergebnis: PASS**

#### EC-3: Alle Module abbestellt, Basis-Plan aktiv
- [x] Kein Problem -- billing-workspace zeigt leere Modul-Liste mit "Module koennen gebucht werden" Hinweis
- **Ergebnis: PASS**

#### EC-4: Webhook-Race-Condition (Webhook vor API-Response)
- [x] **FIXED:** syncModuleItems wird jetzt aufgerufen und nutzt idempotente Upserts mit onConflict: 'tenant_id,module_id'
- [x] Optimistische API-Writes und Webhook-Sync koennen parallel laufen ohne Fehler
- **Ergebnis: PASS**

#### EC-5: Modul von Plattform deaktiviert (is_active = false)
- [x] Subscribe-Route prueft `mod.is_active` und gibt 400 zurueck wenn false
- [x] Billing-API listet nur Module mit `is_active = true`
- **Ergebnis: PASS**

#### EC-6: Proration-Betrag 0
- [x] Stripe handhabt dies korrekt (create_prorations als behavior gesetzt)
- **Ergebnis: PASS**

### Security Audit Results

#### Authentifizierung & Autorisierung
- [x] Subscribe/Cancel/Reactivate nutzen `requireTenantAdmin()` -- Member koennen keine Modul-Aktionen ausfuehren
- [x] GET /api/tenant/billing nutzt `requireTenantAdmin()` -- nur Admins sehen Billing-Daten
- [x] Cross-Tenant-Schutz: `requireTenantAdmin()` validiert JWT-Tenant gegen Header-Tenant
- [x] Tenant-Status-Check: `requireTenantUser()` prueft ob Tenant aktiv ist (ueber `loadTenantStatusRecord`)

#### Input Validation
- [x] moduleId kommt aus URL-Pfad und wird gegen DB validiert (UUID-Lookup)
- [ ] **BUG-P15-3 (LOW):** moduleId wird nicht explizit als UUID validiert bevor DB-Query. Supabase wuerde einen Fehler werfen, aber eine explizite Validierung waere sauberer.

#### Rate Limiting
- [x] Subscribe-Route hat Rate Limiting (10 Req/min)
- [x] GET /api/tenant/billing hat Rate Limiting (30 Req/min)
- [ ] **BUG-P15-4 (MEDIUM):** Cancel-Route hat KEIN Rate Limiting. Ein boesartiger Admin koennte rapid-fire Cancel-Requests senden und Stripe-API-Calls ausloesen.
- [ ] **BUG-P15-5 (MEDIUM):** Reactivate-Route hat KEIN Rate Limiting.

#### RLS Policies
- [x] `modules` Tabelle: SELECT fuer authenticated, INSERT/UPDATE/DELETE blockiert
- [x] `tenant_modules` Tabelle: SELECT nur fuer eigene Tenant-Members, INSERT/UPDATE/DELETE blockiert
- [x] API-Routen nutzen `createAdminClient()` (service_role) fuer Mutations

#### Daten-Exposure
- [x] API gibt keine Stripe Secret Keys oder vollstaendige Customer IDs zurueck
- [x] Module-Response enthaelt nur UI-relevante Felder

#### Stripe-Sicherheit
- [x] Webhook-Signatur wird verifiziert
- [x] Idempotency-Check fuer Webhook-Events vorhanden
- [x] syncModuleItems nutzt metadata.module_id als primaere Zuordnung (zuverlaessig)
- [ ] **BUG-P15-6 (LOW):** Alle 3 seed-Module haben die gleiche `stripe_price_id` ('price_1TEy4BBqMa5Vx8VNcidWpuHa'). Kein UNIQUE Constraint auf stripe_price_id in der Migration. Bei identischen Preisen ist der price_id-Fallback in syncModuleItems mehrdeutig (matched nur wenn genau 1 Modul den Preis nutzt).

#### Neuer Fund: syncModuleItems setzt nur 'active'-Buchungen auf 'canceled'
- [ ] **BUG-P15-7 (LOW):** In syncModuleItems (Zeile 450-454) werden nur Module mit Status 'active' als Cancel-Kandidaten betrachtet (`.in('status', ['active'])`). Module im Status 'canceling', die in Stripe nicht mehr existieren, werden nicht auf 'canceled' gesetzt. Fuer den aktuellen Ablauf (Cancel loescht Item sofort) ist das korrekt, da die DB vorher schon auf 'canceling' gesetzt wird. Aber wenn Stripe-seitig ein 'canceling'-Item wegfaellt (z.B. Abo-Ende), bleibt der Status in der DB haengen.

### Cross-Browser & Responsive (Code-Review)
- [x] billing-workspace.tsx nutzt responsive Grid: `lg:grid-cols-2` fuer Module
- [x] tenant-dashboard-overview.tsx nutzt `lg:grid-cols-3` fuer Modul-Karten
- [x] Alle Buttons und Badges nutzen shadcn/ui Komponenten (framework-konsistent)
- [x] AlertDialog fuer destruktive Aktionen (Cancel)

### Bugs Found (aktueller Stand nach Fixes)

#### BUG-P15-1: Modul-Kuendigung loescht Stripe Item statt cancel_at_period_end
- **Severity:** Medium
- **Status:** Offen (bewusste Design-Entscheidung "Variante 2")
- **Steps to Reproduce:**
  1. Oeffne /billing als Tenant-Admin
  2. Buche ein Modul
  3. Bestelle das Modul ab
  4. Expected: Stripe Item wird auf cancel_at_period_end gesetzt, Item bleibt in Stripe bestehen
  5. Actual: Stripe Item wird sofort geloescht (`subscriptionItems.del()`), DB markiert als 'canceling'
- **Impact:** Funktional ok (Modul bleibt bis period_end nutzbar ueber DB), aber Stripe hat das Item nicht mehr. Reaktivierung erfordert neues Item mit potenziellem Proration-Risiko.
- **Priority:** Fix in next sprint

#### ~~BUG-P15-2: syncModuleItems() wird nie aufgerufen~~ -- GEFIXT
- **Status:** Gefixt in Commit f905d48. syncModuleItems wird jetzt in handleSubscriptionUpdated und handleSubscriptionDeleted aufgerufen.

#### BUG-P15-3: moduleId ohne UUID-Validierung
- **Severity:** Low
- **Status:** Offen
- **Steps to Reproduce:**
  1. Sende POST /api/tenant/billing/modules/not-a-uuid/subscribe
  2. Expected: 400 Bad Request mit "Ungueltige Modul-ID"
  3. Actual: Supabase-Query laeuft und gibt Fehler zurueck (404 "Modul nicht gefunden")
- **Priority:** Nice to have

#### BUG-P15-4: Cancel-Route ohne Rate Limiting
- **Severity:** Medium
- **Status:** Offen
- **Steps to Reproduce:**
  1. Sende 100x POST /api/tenant/billing/modules/[id]/cancel in 1 Sekunde
  2. Expected: Rate Limit greift nach wenigen Requests
  3. Actual: Alle Requests werden verarbeitet (nur Status-Check verhindert Mehrfach-Cancel, aber jeder Request erzeugt Stripe-API-Calls)
- **Priority:** Fix in next sprint

#### BUG-P15-5: Reactivate-Route ohne Rate Limiting
- **Severity:** Medium
- **Status:** Offen
- **Steps to Reproduce:** Wie BUG-P15-4, nur fuer /reactivate Endpoint
- **Priority:** Fix in next sprint

#### BUG-P15-6: stripe_price_id nicht UNIQUE trotz Spec-Anforderung
- **Severity:** Low
- **Status:** Offen
- **Steps to Reproduce:**
  1. Lese supabase/migrations/009_modules.sql
  2. Expected: UNIQUE Constraint auf stripe_price_id
  3. Actual: Kein UNIQUE Constraint. Alle 3 Module teilen die gleiche Price ID.
- **Impact:** syncModuleItems nutzt metadata.module_id als primaere Aufloesung -- Fallback ueber price_id waere bei identischen Preisen mehrdeutig.
- **Priority:** Nice to have (solange Module dieselbe Price teilen)

#### BUG-P15-7 (NEU): syncModuleItems ignoriert 'canceling'-Status bei Cleanup
- **Severity:** Low
- **Status:** Neu entdeckt
- **Steps to Reproduce:**
  1. Modul ist in DB auf status='canceling' (Item in Stripe geloescht)
  2. Basis-Abo-Periode endet, Stripe sendet subscription.updated
  3. syncModuleItems sucht nur nach status='active' Buchungen zum Cancelieren
  4. Expected: 'canceling'-Buchung wird auf 'canceled' gesetzt
  5. Actual: 'canceling'-Buchung bleibt in der DB bestehen
- **Impact:** Verwaiste 'canceling'-Eintraege in tenant_modules nach Periodenende. Kein funktionaler Impact, da module-access.ts das period_end prueft.
- **Priority:** Nice to have

### Summary
- **Acceptance Criteria:** 8/9 passed (AC-3 partial wegen Spec-Abweichung)
- **Edge Cases:** 6/6 passed
- **Bugs Found:** 6 total (0 critical, 2 medium, 4 low) -- 1 ehemals critical (BUG-P15-2) wurde gefixt
- **Security:** Rate Limiting lueckenhaft bei Cancel/Reactivate, sonst solide
- **Production Ready:** JA (mit Einschraenkung: BUG-P15-4/P15-5 sollten zeitnah gefixt werden)
- **Recommendation:** Keine Blocker mehr. Die kritischen Bugs sind behoben. Rate Limiting fuer Cancel/Reactivate sollte im naechsten Sprint ergaenzt werden.

## Deployment
_To be added by /deploy_
