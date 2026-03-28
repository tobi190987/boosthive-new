# PROJ-15: Modul-Buchung & Verwaltung

## Status: Planned
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

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
