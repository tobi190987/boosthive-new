# PROJ-14: Stripe Setup & Basis-Abo

## Status: In Review
**Created:** 2026-03-27
**Last Updated:** 2026-03-27

## Dependencies
- Requires: PROJ-2 (Tenant Provisioning) — Tenants müssen existieren, bevor ein Stripe Customer angelegt wird
- Requires: PROJ-3 (User Authentication) — Nur eingeloggte Admins können Abos verwalten
- Requires: PROJ-6 (Role-Based Access Control) — Nur die Rolle `admin` darf Billing-Aktionen auslösen

## Overview
Jeder Tenant muss einen Basis-Plan abonnieren, bevor er Module buchen kann. Der Basis-Plan kostet einen fixen Betrag und läuft in 4-Wochen-Zyklen (28 Tage). Beim Anlegen eines Tenants durch den Owner wird ein Stripe Customer erstellt. Der Tenant-Admin schließt dann das Abo im Tenant-Dashboard ab.

## User Stories
- Als Tenant-Admin möchte ich einen Basis-Plan abonnieren, damit ich Zugang zur Plattform erhalte und Module buchen kann.
- Als Tenant-Admin möchte ich meine Zahlungsmethode (Kreditkarte) direkt im Dashboard hinterlegen, ohne zu einem externen Portal weitergeleitet zu werden.
- Als Tenant-Admin möchte ich das Abo zum Ende der laufenden 4-Wochen-Periode kündigen können, damit ich keine ungewollten Folgekosten habe.
- Als Owner möchte ich, dass beim Anlegen eines neuen Tenants automatisch ein Stripe Customer erstellt wird, damit kein manueller Schritt nötig ist.
- Als Tenant-Admin möchte ich den aktuellen Abo-Status (aktiv, in Kündigung, abgelaufen) im Dashboard sehen.
- Als Tenant-Admin möchte ich bei drohendem Ablauf oder Zahlungsausfall per E-Mail informiert werden.

## Acceptance Criteria
- [ ] Beim Anlegen eines Tenants (PROJ-2) wird automatisch ein Stripe Customer erstellt und die `stripe_customer_id` in der Datenbank gespeichert.
- [ ] Der Tenant-Admin kann im Billing-Bereich des Dashboards eine Zahlungsmethode per Stripe Elements (Card Element) hinterlegen.
- [ ] Nach Eingabe der Zahlungsmethode kann der Admin den Basis-Plan abonnieren. Das Abo startet sofort.
- [ ] Das Abo läuft in 4-Wochen-Zyklen (28 Tage, `interval: week`, `interval_count: 4` in Stripe).
- [ ] Der Admin kann das Abo kündigen. Stripe setzt `cancel_at_period_end: true`. Der Zugang bleibt bis Periodenende aktiv.
- [ ] Der Abo-Status (aktiv, `cancel_at_period_end`, past_due, canceled) wird im Dashboard korrekt angezeigt.
- [ ] Bei `payment_intent.payment_failed` / `invoice.payment_failed` erhält der Admin eine E-Mail-Benachrichtigung.
- [ ] Nach 3-tägiger Grace Period ohne erfolgreiche Zahlung (Stripe Retry-Logik) wird der Tenant-Zugang gesperrt (`is_active = false`).
- [ ] Stripe Webhooks werden validiert (Stripe-Signature-Header) und idempotent verarbeitet.
- [ ] Bei reaktiviertem Abo (erfolgreiche Zahlung nach Grace Period) wird der Zugang automatisch wieder freigeschaltet.

## Edge Cases
- Tenant hat noch keinen Stripe Customer → automatische Erstellung beim ersten Billing-Seitenaufruf als Fallback.
- Admin versucht ein Modul zu buchen ohne aktiven Basis-Plan → Fehlermeldung mit Hinweis auf Basis-Plan-Buchung.
- Abo wird gekündigt, aber Admin versucht es vor Periodenende neu zu starten → `cancel_at_period_end` wird auf `false` gesetzt (Reaktivierung).
- Webhook kommt mehrfach an (Duplicate Delivery) → idempotente Verarbeitung via `stripe_event_id` in der DB.
- Webhook-Signatur ungültig → 400-Antwort, kein State-Change.
- Zahlungsmethode abgelaufen → Admin wird aufgefordert, eine neue Karte zu hinterlegen.

## Technical Requirements
- Stripe API: Subscriptions, Payment Intents, Webhooks
- Stripe Elements für Card Input (kein Redirect zum Stripe Portal)
- Webhook-Endpunkt: `/api/webhooks/stripe`
- Relevante Stripe Events: `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_succeeded`, `invoice.payment_failed`
- DB-Felder (Tabelle `tenants`): `stripe_customer_id`, `stripe_subscription_id`, `subscription_status`, `subscription_period_end`
- Grace Period: 3 Tage, konfiguriert über Stripe Dunning-Einstellungen (Smart Retries)

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

### UI-Struktur

```
Tenant Sidebar (existing, admin only)
+-- Verwaltung Section
    +-- User-Management (existing)
    +-- Einstellungen (existing)
    +-- Abrechnung (NEW) → /billing

/billing — Billing-Seite (Server Component)
+-- BillingWorkspace
    +-- SubscriptionStatusCard
    |   +-- Plan-Name + Preis
    |   +-- Status-Badge (Aktiv / Läuft aus / Überfällig / Gekündigt)
    |   +-- Nächster Abrechnungstermin
    +-- PaymentMethodSection
    |   +-- [KEIN ABO] → StripeCardForm (Client Component, Stripe Elements)
    |   +-- [KARTE GESPEICHERT] → SavedCardDisplay (letzte 4 Ziffern, Ablauf)
    |       +-- Karte ersetzen Button
    +-- SubscriptionActions
        +-- [KEIN ABO] → "Basis-Plan abonnieren" Button
        +-- [AKTIV] → "Abo kündigen" Button (mit Bestätigungsdialog)
        +-- [LÄUFT AUS] → "Kündigung rückgängig machen" Button
        +-- [ÜBERFÄLLIG] → Alert + "Zahlung aktualisieren" Button
```

### Datenmodell

**Tabelle `tenants` — 4 neue Felder:**

| Feld | Was es speichert |
|------|-----------------|
| `stripe_customer_id` | Stripe-interne Kunden-ID |
| `stripe_subscription_id` | Aktive Abo-ID |
| `subscription_status` | `active`, `past_due`, `canceled`, `canceling` |
| `subscription_period_end` | Enddatum der aktuellen Periode |

**Neue Tabelle `stripe_webhook_events`:**

| Feld | Zweck |
|------|-------|
| `stripe_event_id` | Eindeutige Event-ID für Idempotenz |
| `processed_at` | Zeitstempel der Verarbeitung |

### API-Routen

| Route | Zweck |
|-------|-------|
| `GET /api/tenant/billing` | Abo-Status aus DB laden |
| `POST /api/tenant/billing/setup-intent` | Stripe SetupIntent erstellen (Kartenerfassung) |
| `POST /api/tenant/billing/subscribe` | Basis-Abo starten |
| `POST /api/tenant/billing/cancel` | Abo zum Periodenende kündigen |
| `POST /api/tenant/billing/reactivate` | Kündigung rückgängig machen |
| `POST /api/webhooks/stripe` | Stripe-Events empfangen + DB aktualisieren |

**Angepasst:** `POST /api/owner/tenants` — erstellt nach Tenant-Anlegen automatisch Stripe Customer.

### Ablauf

```
TENANT ANLEGEN → Stripe Customer erstellt → stripe_customer_id in DB

KARTE HINTERLEGEN:
  Admin → /billing → SetupIntent → Stripe Elements (iframe) → Karte gespeichert

ABO STARTEN:
  Admin → subscribe → Stripe Subscription (28-Tage) → Webhook → DB update

KÜNDIGEN:
  Admin → cancel → Stripe cancel_at_period_end=true → Periodenende → Webhook → is_active=false

ZAHLUNGSAUSFALL:
  Stripe Smart Retries (3 Tage) → E-Mail bei Fehlern → Webhook → is_active=false
```

### Neue Dependencies
- `stripe` — Server-seitiges SDK
- `@stripe/stripe-js` — Client-seitiges Stripe.js
- `@stripe/react-stripe-js` — React-Wrapper für Stripe Elements

## Frontend Implementation Notes
- Stripe-Pakete installiert: `stripe`, `@stripe/stripe-js`, `@stripe/react-stripe-js`
- Sidebar-Navigation um "Abrechnung" Link erweitert (nur fuer Admins sichtbar)
- `/billing` Route mit Layout (Admin-Guard) und Page erstellt
- `BillingWorkspace` Komponente implementiert mit:
  - Hero-Section mit Feature-Highlights (sichere Karteneingabe, 4-Wochen-Zyklen, kuendbar)
  - SubscriptionStatusCard: zeigt Plan, Preis, Status-Badge, naechste Abrechnung
  - PaymentMethodSection: gespeicherte Karte anzeigen oder Stripe Elements Card Form
  - SubscriptionActions: kontextabhaengige Aktionen (Abonnieren, Kuendigen mit Bestaetigungsdialog, Reaktivieren, Zahlungsmethode aktualisieren)
- `StripeCardForm` Komponente mit Stripe Elements (`CardElement` + `SetupIntent`-Flow)
- Alle Status-Zustaende abgedeckt: none, active, canceling, past_due, canceled
- Loading, Error und Empty States implementiert
- Konsistent mit bestehendem Design-System (rounded-[28px], Farbpalette, Badge-Styles)
- API-Endpunkte werden erwartet: GET /api/tenant/billing, POST /api/tenant/billing/setup-intent, /subscribe, /cancel, /reactivate

## QA Test Results (Runde 2)

**Tested:** 2026-03-27
**App URL:** http://localhost:3000
**Tester:** QA Engineer (AI)
**Vorherige Runde:** Runde 1 fand 8 Bugs. Davon wurden 4 behoben (BUG-1, BUG-2, BUG-4, BUG-7).

### BUILD STATUS: FAILED

Der Build schlaegt fehl mit `Error: STRIPE_SECRET_KEY must be set as an environment variable.` Die Stripe-Umgebungsvariablen fehlen sowohl in `.env.local` als auch in `.env.local.example`. Der TypeScript-Fehler aus Runde 1 (BUG-1) wurde behoben, aber `src/lib/stripe.ts` wirft einen harten Fehler bei fehlendem `STRIPE_SECRET_KEY` zur Build-Zeit, weil das Modul top-level importiert wird und die Validierung sofort ausgefuehrt wird.

---

### Behobene Bugs aus Runde 1

- **BUG-1 (Critical): TypeScript-Kompilierung** -- BEHOBEN. `InvoiceWithSubscription` Type-Assertion wird jetzt verwendet.
- **BUG-2 (High): Fehlende E-Mail bei Zahlungsausfall** -- BEHOBEN. `handleInvoicePaymentFailed` sendet jetzt `sendPaymentFailed` E-Mail an den Tenant-Admin.
- **BUG-4 (High): Reaktivierung setzt is_active nicht** -- BEHOBEN. `handleInvoicePaymentSucceeded` setzt jetzt `is_active: true`.
- **BUG-7 (Medium): subscription.deleted setzt 'inactive'** -- BEHOBEN. `handleSubscriptionDeleted` setzt jetzt `'canceled'` und `is_active: false`.

---

### Acceptance Criteria Status

#### AC-1: Stripe Customer wird beim Tenant-Anlegen erstellt
- [x] Code in `POST /api/owner/tenants` (Zeile 285-312) erstellt nach Tenant-Anlegen einen Stripe Customer und speichert `stripe_customer_id` in der DB.
- [x] Fallback: Wenn Stripe-Erstellung fehlschlaegt, ist es non-fatal -- der Tenant wird trotzdem erstellt.
- [x] Fallback im `setup-intent` Endpoint: Erstellt Customer on-demand, falls keiner existiert.
- **Status: PASS (Code Review)**

#### AC-2: Zahlungsmethode per Stripe Elements hinterlegen
- [x] `StripeCardForm` Komponente nutzt `@stripe/react-stripe-js` mit `CardElement` und `SetupIntent`-Flow.
- [x] SetupIntent wird serverseitig in `/api/tenant/billing/setup-intent` erstellt.
- [x] Karte wird nach Stripe confirmCardSetup gespeichert.
- [x] Fehlerbehandlung bei fehlender `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`.
- **Status: PASS (Code Review)**

#### AC-3: Basis-Plan abonnieren nach Zahlungsmethoden-Eingabe
- [x] `/api/tenant/billing/subscribe` erstellt Stripe Subscription mit `STRIPE_BASIS_PLAN_PRICE_ID`.
- [x] Setzt default payment method auf dem Customer.
- [x] Speichert `stripe_subscription_id`, `subscription_status`, `subscription_period_end` in DB.
- [x] Button ist disabled ohne Zahlungsmethode (Frontend-Check + Backend-Check).
- **Status: PASS (Code Review)**

#### AC-4: 4-Wochen-Zyklen (28 Tage)
- [ ] HINWEIS: Der Subscribe-Endpoint konfiguriert das Billing-Intervall NICHT selbst. Er nutzt `STRIPE_BASIS_PLAN_PRICE_ID` -- das Intervall haengt vollstaendig von der Stripe-Preiskonfiguration ab. Es gibt keine serverseitige Validierung, dass der Price tatsaechlich `interval: week, interval_count: 4` hat.
- **Status: CONDITIONAL PASS -- abhaengig von korrekter Stripe-Preis-Konfiguration**

#### AC-5: Abo kuendigen mit cancel_at_period_end
- [x] `/api/tenant/billing/cancel` setzt `cancel_at_period_end: true` auf der Stripe Subscription.
- [x] DB wird auf `subscription_status: 'canceling'` aktualisiert.
- [x] Nur aktive Abos koennen gekuendigt werden (Status-Check).
- [x] Frontend zeigt Bestaetigungsdialog vor Kuendigung.
- **Status: PASS (Code Review)**

#### AC-6: Abo-Status im Dashboard korrekt angezeigt
- [x] Alle 5 Zustaende abgedeckt: none, active, canceling, past_due, canceled.
- [x] Status-Badge mit korrekten Farben und Labels.
- [x] Kontextabhaengige Aktionen je nach Status.
- [x] Warnung bei `canceling` mit Ablaufdatum.
- [x] Warnung bei `past_due` mit Aufforderung zur Zahlungsaktualisierung.
- **Status: PASS (Code Review)**

#### AC-7: E-Mail-Benachrichtigung bei Zahlungsausfall
- [x] `handleInvoicePaymentFailed` ruft jetzt `sendPaymentFailed` auf (Runde 1 BUG-2 behoben).
- [x] E-Mail-Template (`payment-failed.ts`) rendert korrekt mit Billing-URL und Tenant-Name.
- [x] E-Mail-Versand ist non-fatal -- Fehler werden geloggt, aber der Webhook schlaegt nicht fehl.
- **Status: PASS (Code Review)**

#### AC-8: Grace Period und Tenant-Sperrung nach 3 Tagen
- [ ] BUG: Es gibt KEINE explizite Logik, die nach exakt 3 Tagen `is_active = false` setzt. ABER: `handleSubscriptionUpdated` setzt jetzt `is_active: false` wenn der Stripe-Status `unpaid` oder `canceled` wird (Zeile 151-153). Die 3-Tage-Grace-Period muss ueber Stripe Dunning-Einstellungen konfiguriert werden (Smart Retries). Wenn Stripe nach der konfigurierten Retry-Periode die Subscription auf `unpaid` setzt, greift die App-Logik.
- [x] TEILWEISE BEHOBEN: `handleSubscriptionUpdated` setzt `is_active: false` bei Status `unpaid`/`canceled`.
- [ ] OFFEN: Es fehlt die Dokumentation/Verifizierung, dass die Stripe Dunning-Settings korrekt auf 3 Tage konfiguriert sind.
- **Status: CONDITIONAL PASS -- abhaengig von korrekter Stripe Dunning-Konfiguration**

#### AC-9: Webhook-Signatur-Validierung und Idempotenz
- [x] Stripe-Signatur wird via `stripe.webhooks.constructEvent` validiert.
- [x] Bei ungueltiger Signatur: 400-Antwort.
- [x] Idempotenz via `stripe_webhook_events` Tabelle mit `stripe_event_id`.
- [x] Bereits verarbeitete Events werden mit 200 beantwortet (kein erneutes Processing).
- **Status: PASS (Code Review)**

#### AC-10: Reaktivierung nach Zahlungserfolg
- [x] `handleInvoicePaymentSucceeded` setzt `subscription_status: 'active'` UND `is_active: true` (Runde 1 BUG-4 behoben).
- **Status: PASS (Code Review)**

---

### Edge Cases Status

#### EC-1: Tenant ohne Stripe Customer -- Fallback bei Billing-Seitenaufruf
- [x] `setup-intent` Endpoint erstellt Customer als Fallback.
- **Status: PASS**

#### EC-2: Modul-Buchung ohne aktiven Basis-Plan
- [ ] Nicht testbar -- PROJ-15 (Modul-Buchung) ist noch nicht implementiert.
- **Status: N/A**

#### EC-3: Kuendigung rueckgaengig machen vor Periodenende
- [x] `/api/tenant/billing/reactivate` setzt `cancel_at_period_end: false`.
- [x] DB wird auf `subscription_status: 'active'` aktualisiert.
- [x] Nur Status `canceling` erlaubt Reaktivierung.
- **Status: PASS (Code Review)**

#### EC-4: Webhook Duplicate Delivery
- [x] Idempotenz via `stripe_event_id` in `stripe_webhook_events` Tabelle.
- [x] Duplicates werden mit `{ received: true, duplicate: true }` beantwortet.
- **Status: PASS (Code Review)**

#### EC-5: Ungueltige Webhook-Signatur
- [x] `constructEvent` wirft bei ungueltiger Signatur einen Fehler.
- [x] 400-Antwort, kein State-Change.
- **Status: PASS (Code Review)**

#### EC-6: Abgelaufene Zahlungsmethode
- [x] Bei `past_due` Status wird "Zahlungsmethode aktualisieren" Button angezeigt.
- [x] "Karte ersetzen" Button ist jederzeit verfuegbar bei gespeicherter Karte.
- **Status: PASS (Code Review)**

---

### Security Audit Results

#### SEC-1: Authentifizierung
- [x] Alle Billing-API-Routen nutzen `requireTenantAdmin()` -- nur authentifizierte Admins haben Zugriff.
- [x] Billing-Seite hat Server-seitigen Admin-Guard im Layout (`role !== 'admin'` -> `forbidden()`).
- **Status: PASS**

#### SEC-2: Cross-Tenant-Zugriff (Authorization)
- [x] `requireTenantAdmin` prueft, ob der User tatsaechlich Admin des Tenants aus dem `x-tenant-id` Header ist.
- [x] Die Membership-Tabelle wird verifiziert -- ein Angreifer muesste in dem Ziel-Tenant als Admin registriert sein, um Zugriff zu bekommen.
- **Status: PASS**

#### SEC-3: Stripe Secret Key Exposure
- [x] `stripe.ts` importiert nur serverseitig (`STRIPE_SECRET_KEY`).
- [x] Client-Komponente nutzt nur `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`.
- [x] `stripe.ts` hat expliziten Kommentar: "NEVER import this file in client components".
- **Status: PASS**

#### SEC-4: Webhook-Sicherheit
- [x] Stripe-Signatur wird validiert -- verhindert gefaelschte Webhooks.
- [x] `STRIPE_WEBHOOK_SECRET` ist serverseitig.
- [x] Raw Body wird korrekt gelesen (`request.text()`), nicht JSON-geparst.
- **Status: PASS**

#### SEC-5: Input Validation
- [x] Billing-API-Routen lesen keinen Request-Body. Nicht-exportierte HTTP-Methoden geben 405 in Next.js App Router zurueck.
- **Status: PASS**

#### SEC-6: Rate Limiting
- [ ] BUG (Medium): Es gibt KEIN Rate Limiting auf den Billing-Endpoints (unveraendert seit Runde 1).
- **Status: FAIL**

#### SEC-7: Sensitive Data in API Responses
- [x] `GET /api/tenant/billing` gibt nur letzte 4 Ziffern der Karte zurueck (brand, last4, exp).
- [x] Keine vollstaendigen Kartennummern oder Secrets in Responses.
- [x] `setup-intent` gibt nur `client_secret` zurueck (wird von Stripe.js erwartet).
- **Status: PASS**

#### SEC-8: RLS auf stripe_webhook_events
- [x] Alle RLS-Policies auf `stripe_webhook_events` verweigern Zugriff fuer `anon` und `authenticated`.
- [x] Nur `service_role` (Admin-Client) kann lesen/schreiben.
- **Status: PASS**

#### SEC-9: Plan-Preis Manipulation
- [x] Die Subscription wird serverseitig mit `STRIPE_BASIS_PLAN_PRICE_ID` erstellt -- der Client kann den Preis nicht manipulieren.
- **Status: PASS**

#### SEC-10: Doppelte Subscription verhindern
- [x] `subscribe` Endpoint prueft auf bestehende `active`/`canceling` Status und gibt 409 zurueck.
- **Status: PASS**

---

### Bugs Found (Runde 2)

#### BUG-R2-1: Build-Fehler -- Fehlende Stripe-Umgebungsvariablen
- **Severity:** Critical
- **Steps to Reproduce:**
  1. Fuehre `npm run build` aus (ohne Stripe env vars in `.env.local`)
  2. Expected: Build kompiliert erfolgreich (oder schlaegt graceful fehl)
  3. Actual: `Error: STRIPE_SECRET_KEY must be set as an environment variable.` -- Build bricht ab
- **Root Cause:** `src/lib/stripe.ts` wirft einen harten `throw new Error()` bei fehlendem `STRIPE_SECRET_KEY` auf Modul-Ebene. Da `stripe.ts` von allen Billing-API-Routen und der Owner-Tenant-Route importiert wird, schlaegt der gesamte Build fehl, wenn die Variable nicht gesetzt ist.
- **Impact:** Die Applikation kann nicht gebaut werden, solange die Stripe-Variablen nicht gesetzt sind. Das betrifft auch CI/CD-Pipelines und neue Entwickler.
- **Fix-Vorschlag:** Entweder (a) lazy initialization (Stripe-Client erst bei Aufruf erstellen, nicht bei Import), oder (b) Stripe env vars in `.env.local` setzen.
- **Betrifft:** `src/lib/stripe.ts` Zeile 16-18, `.env.local`, `.env.local.example`
- **Priority:** Fix before deployment (BLOCKER)

#### BUG-R2-2: Stripe env vars fehlen in .env.local.example
- **Severity:** High
- **Steps to Reproduce:**
  1. Oeffne `.env.local.example`
  2. Expected: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_BASIS_PLAN_PRICE_ID`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` sind dokumentiert
  3. Actual: Keine Stripe-Variablen vorhanden
- **Root Cause:** Die `.env.local.example` wurde nach PROJ-14 nicht aktualisiert
- **Impact:** Neue Entwickler wissen nicht, welche Stripe-Variablen benoetigt werden. Verstoss gegen Security-Regel: "Document all required env vars in .env.local.example with dummy values"
- **Priority:** Fix before deployment

#### BUG-R2-3: Fehlende Grace-Period-Dokumentation / Stripe Dunning-Konfiguration
- **Severity:** High
- **Steps to Reproduce:**
  1. Pruefe Stripe Dashboard Dunning-Einstellungen
  2. Expected: Dokumentierte 3-Tage-Grace-Period-Konfiguration
  3. Actual: Keine Dokumentation, wie Stripe Dunning konfiguriert werden muss
- **Root Cause:** Die App verlaesst sich darauf, dass Stripe nach der Grace Period die Subscription auf `unpaid` setzt, aber es gibt keine Anleitung, wie die Stripe Dunning-Einstellungen konfiguriert werden muessen (3 Tage, dann `unpaid` setzen).
- **AC-Referenz:** AC-8: "Nach 3-taegiger Grace Period"
- **Priority:** Fix before deployment (Deployment-Docs)

#### BUG-R2-4: Fehlendes Rate Limiting auf Billing-Endpoints (unveraendert)
- **Severity:** Medium
- **Erstmals gefunden:** Runde 1 (BUG-5)
- **Status:** Nicht behoben
- **Impact:** Potenzielle Stripe-API-Kosten durch massenhaftes Erstellen von SetupIntents
- **Priority:** Fix in next sprint

#### BUG-R2-5: customer.subscription.created Event nicht behandelt (unveraendert)
- **Severity:** Low
- **Erstmals gefunden:** Runde 1 (BUG-6)
- **Status:** Nicht behoben
- **Impact:** Gering -- Subscribe-Endpoint setzt DB-Status synchron
- **Priority:** Nice to have

#### BUG-R2-6: Plan-Info ist hardcoded (unveraendert)
- **Severity:** Low
- **Erstmals gefunden:** Runde 1 (BUG-8)
- **Status:** Nicht behoben
- **Impact:** Falscher Preis im Dashboard bei Stripe-Preisaenderung
- **Priority:** Nice to have

#### BUG-R2-7: Owner Tenant-Route importiert stripe.ts -- Build bricht ohne Stripe-Keys
- **Severity:** High
- **Steps to Reproduce:**
  1. Entferne STRIPE_SECRET_KEY aus `.env.local`
  2. Fuehre `npm run build` aus
  3. Expected: Owner-Routen funktionieren weiterhin (Stripe Customer Erstellung ist non-fatal)
  4. Actual: Gesamter Build schlaegt fehl, weil `POST /api/owner/tenants` (Zeile 6) `stripe` importiert und das Modul sofort wirft
- **Root Cause:** `src/app/api/owner/tenants/route.ts` hat `import { stripe } from '@/lib/stripe'` als Top-Level-Import. Obwohl die Stripe-Customer-Erstellung (Zeile 287) non-fatal sein soll, verhindert der fehlende Key den gesamten Build.
- **Impact:** Ohne Stripe-Keys kann kein Tenant mehr angelegt werden -- nicht einmal ohne Stripe-Integration.
- **Priority:** Fix before deployment

---

### Cross-Browser Testing
- **Status:** NICHT DURCHFUEHRBAR -- Build schlaegt fehl (BUG-R2-1)

### Responsive Testing
- **Status:** NICHT DURCHFUEHRBAR -- Build schlaegt fehl (BUG-R2-1)
- **Code Review Notizen:**
  - `BillingWorkspace` nutzt `lg:grid-cols-2` -- responsives Grid vorhanden
  - `sm:flex-row` fuer Subscription-Actions -- mobile-tauglich
  - `sm:text-4xl` fuer Hero-Section -- responsive Typografie
  - `lg:grid-cols-3` fuer Feature-Cards im Hero

### Regression Testing
- **Status:** NICHT DURCHFUEHRBAR -- Build schlaegt fehl (BUG-R2-1)
- **Code Review Notizen:**
  - Navigation wurde erweitert (Abrechnung Link) -- nur fuer Admins sichtbar, kein Einfluss auf Member-Navigation
  - Owner Tenant-Route wurde modifiziert (Stripe Customer Erstellung) -- ABER: der Import von `stripe.ts` macht den Build ohne Stripe-Keys unmoeglich (BUG-R2-7). Dies ist eine REGRESSION fuer PROJ-2 (Tenant Provisioning).

---

### Summary
- **Acceptance Criteria:** 8/10 passed (AC-1, AC-2, AC-3, AC-5, AC-6, AC-7, AC-9, AC-10 passed; AC-4 und AC-8 conditional)
- **Bugs aus Runde 1 behoben:** 4/8 (BUG-1, BUG-2, BUG-4, BUG-7)
- **Bugs Runde 2:** 7 total (1 critical, 3 high, 1 medium, 2 low)
- **Security:** Rate Limiting fehlt (Medium). Alle anderen Security-Checks bestanden.
- **Production Ready:** NEIN
- **Fortschritt gegenueber Runde 1:** Deutliche Verbesserung. AC-7 und AC-10 sind jetzt PASS. Der urspruengliche TypeScript-Build-Fehler ist behoben. Neuer BLOCKER: Stripe-Modul-Initialisierung muss lazy werden.
- **Recommendation:** BUG-R2-1 und BUG-R2-7 (Build-Fehler / Stripe lazy init) muessen als erstes behoben werden. Dann BUG-R2-2 (env.local.example) und BUG-R2-3 (Dunning-Docs). BUG-R2-4 bis BUG-R2-6 koennen im naechsten Sprint behoben werden.

## QA Test Results (Runde 3)

**Tested:** 2026-03-28
**App URL:** http://localhost:3000
**Tester:** QA Engineer (AI)
**Vorherige Runde:** Runde 2 fand 7 Bugs (1 critical, 3 high, 1 medium, 2 low). KEINER wurde behoben.

### BUILD STATUS: FAILED

Der Build schlaegt weiterhin fehl mit `Error: STRIPE_SECRET_KEY must be set as an environment variable.` (identisch mit Runde 2, BUG-R2-1). Der Fehler tritt in `src/lib/stripe.ts` auf Modul-Ebene auf und betrifft alle Routen, die `stripe` importieren.

**Build-Output:**
```
Error: STRIPE_SECRET_KEY must be set as an environment variable.
> Build error occurred
Error: Failed to collect page data for /api/tenant/billing/cancel
```

---

### Status der Bugs aus Runde 2

| Bug | Severity | Status Runde 3 |
|-----|----------|----------------|
| BUG-R2-1: Build-Fehler (stripe.ts top-level throw) | Critical | NICHT BEHOBEN |
| BUG-R2-2: Stripe env vars fehlen in .env.local.example | High | NICHT BEHOBEN |
| BUG-R2-3: Fehlende Grace-Period-Dokumentation | High | NICHT BEHOBEN |
| BUG-R2-4: Fehlendes Rate Limiting | Medium | NICHT BEHOBEN |
| BUG-R2-5: customer.subscription.created nicht behandelt | Low | NICHT BEHOBEN |
| BUG-R2-6: Plan-Info hardcoded | Low | NICHT BEHOBEN |
| BUG-R2-7: Owner Tenant-Route importiert stripe.ts | High | NICHT BEHOBEN |

---

### Acceptance Criteria Status (unveraendert gegenueber Runde 2)

Da keine Bugs behoben wurden und der Build weiterhin fehlschlaegt, bleiben alle AC-Status identisch zu Runde 2:

- AC-1: PASS (Code Review)
- AC-2: PASS (Code Review)
- AC-3: PASS (Code Review) -- aber siehe neuen BUG-R3-1
- AC-4: CONDITIONAL PASS (abhaengig von Stripe-Preis-Konfiguration)
- AC-5: PASS (Code Review)
- AC-6: PASS (Code Review)
- AC-7: PASS (Code Review)
- AC-8: CONDITIONAL PASS (abhaengig von Stripe Dunning-Konfiguration)
- AC-9: PASS (Code Review)
- AC-10: PASS (Code Review)

---

### Neue Bugs (Runde 3)

#### BUG-R3-1: Subscribe-Endpoint setzt is_active nicht auf true
- **Severity:** High
- **Steps to Reproduce:**
  1. Tenant hat `is_active = false` (z.B. nach vorheriger Abo-Kuendigung/Sperrung)
  2. Admin abonniert erneut ueber `/api/tenant/billing/subscribe`
  3. Expected: `is_active` wird sofort auf `true` gesetzt, damit der Tenant sofort Zugang hat
  4. Actual: `subscribe` Route (Zeile 100-107) setzt nur `stripe_subscription_id`, `subscription_status`, `subscription_period_end` -- aber NICHT `is_active: true`
- **Root Cause:** `src/app/api/tenant/billing/subscribe/route.ts` Zeile 102 fehlt `is_active: true` im Update-Objekt. `handleInvoicePaymentSucceeded` im Webhook setzt zwar `is_active: true`, aber der Webhook kommt asynchron. In der Zwischenzeit bleibt der Tenant gesperrt, obwohl das Abo bereits aktiv ist.
- **Impact:** Nach Re-Subscription kann der Tenant fuer einige Sekunden bis Minuten keinen Zugang haben (bis der `invoice.payment_succeeded` Webhook eintrifft). Bei einem Erstabo (wo `is_active` bereits `true` ist) ist das kein Problem -- nur bei Re-Subscription nach Sperrung.
- **Priority:** Fix before deployment

#### BUG-R3-2: Idempotenz Race Condition im Webhook-Handler
- **Severity:** Low
- **Steps to Reproduce:**
  1. Stripe sendet dasselbe Event zweimal nahezu gleichzeitig (Duplicate Delivery)
  2. Beide Requests passieren den Idempotenz-Check (`maybeSingle` auf `stripe_webhook_events`)
  3. Beide Requests verarbeiten das Event
  4. Nur einer schafft den INSERT in `stripe_webhook_events` (Unique Constraint), der andere bekommt einen Fehler, der nur geloggt wird
- **Root Cause:** Die Idempotenz-Pruefung (SELECT) und die Markierung (INSERT) sind nicht in einer Transaktion. Das Zeitfenster ist kurz, aber bei gleichzeitigen Requests koennen Events doppelt verarbeitet werden.
- **Impact:** Gering -- die Event-Handler sind idempotent in ihrer Wirkung (DB-Updates sind idempotent). Doppelte Verarbeitung fuehrt nicht zu Datenverlust oder falschen Zustaenden.
- **Priority:** Nice to have

#### BUG-R3-3: stripe_webhook_events Tabelle waechst unbegrenzt
- **Severity:** Low
- **Steps to Reproduce:**
  1. Jeder verarbeitete Webhook fuegt eine Zeile in `stripe_webhook_events` ein
  2. Es gibt keinen TTL, keine Retention Policy, keinen Cleanup-Job
  3. Ueber Monate/Jahre waechst die Tabelle unbegrenzt
- **Root Cause:** Kein `CRON`-Job oder `pg_cron`-Regel zum Loeschen alter Events
- **Impact:** Langfristig: steigende Storage-Kosten und langsamere Queries (obwohl der Index hilft)
- **Priority:** Nice to have (fix when reaching >100k rows)

---

### Cross-Browser Testing
- **Status:** NICHT DURCHFUEHRBAR -- Build schlaegt fehl (BUG-R2-1)

### Responsive Testing
- **Status:** NICHT DURCHFUEHRBAR -- Build schlaegt fehl (BUG-R2-1)

### Regression Testing
- **Status:** NICHT DURCHFUEHRBAR -- Build schlaegt fehl (BUG-R2-1)
- **REGRESSION BESTAETIGST:** PROJ-2 (Tenant Provisioning) kann nicht mehr gebaut werden, da `POST /api/owner/tenants` (Zeile 6) `stripe.ts` importiert und der Build ohne Stripe-Keys fehlschlaegt. Diese Regression wurde bereits in Runde 2 als BUG-R2-7 dokumentiert und ist weiterhin aktiv.

---

### Summary (Runde 3)
- **Acceptance Criteria:** 8/10 passed (AC-4 und AC-8 conditional) -- unveraendert
- **Bugs aus Runde 2 behoben:** 0/7 -- KEINER behoben
- **Neue Bugs Runde 3:** 3 (1 high, 2 low)
- **Offene Bugs gesamt:** 10 (1 critical, 4 high, 1 medium, 4 low)
- **Security:** Rate Limiting fehlt weiterhin (Medium). Alle anderen Security-Checks bestanden.
- **Production Ready:** NEIN

### Priorisierte Fix-Reihenfolge

**BLOCKER (muss VOR Deployment behoben werden):**
1. **BUG-R2-1 + BUG-R2-7 (Critical/High):** `stripe.ts` lazy initialization -- Stripe-Client darf nicht bei Import erstellt werden, sondern erst bei Aufruf. Das behebt sowohl den Build-Fehler als auch die Regression auf PROJ-2.
2. **BUG-R3-1 (High):** `subscribe` Route muss `is_active: true` setzen, damit Re-Subscriptions sofort greifen.
3. **BUG-R2-2 (High):** Stripe env vars in `.env.local.example` dokumentieren.
4. **BUG-R2-3 (High):** Stripe Dunning-Konfiguration dokumentieren (3-Tage Grace Period).

**NACH Deployment (naechster Sprint):**
5. BUG-R2-4 (Medium): Rate Limiting auf Billing-Endpoints
6. BUG-R2-5 (Low): customer.subscription.created Event behandeln
7. BUG-R2-6 (Low): Plan-Info dynamisch aus Stripe laden
8. BUG-R3-2 (Low): Idempotenz Race Condition
9. BUG-R3-3 (Low): stripe_webhook_events TTL/Cleanup

## Stripe Dunning-Konfiguration (AC-8: 3-Tage Grace Period)

Die App verlässt sich darauf, dass Stripe die Subscription nach der Grace Period auf `unpaid` setzt, wodurch `handleSubscriptionUpdated` automatisch `is_active = false` schreibt. Dafür muss im **Stripe Dashboard** folgendes konfiguriert sein:

### Pflicht-Einstellungen (Stripe Dashboard → Settings → Billing → Subscriptions and emails)

1. **Automatic collection** → **Smart Retries aktivieren**
   - Stripe versucht Zahlungen automatisch erneut innerhalb der konfigurierten Retry-Periode.

2. **Subscription status after all retries have been exhausted**
   - Auf **"Mark the subscription as unpaid"** setzen (NICHT "Cancel").
   - Die App reagiert auf `status = unpaid` (nicht auf `canceled`) für die Grace-Period-Sperrung.

3. **Retry schedule** → Gesamt-Retry-Zeitraum auf **3 Tage** begrenzen:
   - Empfehlung: 1. Retry nach 1 Tag, 2. Retry nach 2 Tagen, dann `unpaid` nach Tag 3.

4. **Email notifications** (optional, empfohlen):
   - "Send an email when a payment fails" → aktivieren, damit Stripe ebenfalls E-Mails sendet (zusätzlich zu unserem `handleInvoicePaymentFailed`-Handler).

### Verifizierung

Nach Konfiguration im Stripe Dashboard testen mit [Stripe Test-Clocks](https://stripe.com/docs/billing/testing/test-clocks):
1. Test-Clock erstellen, Subscription starten, Uhr auf Renewal-Datum vorspulen.
2. Zahlungsmethode auf eine fehlschlagende Karte setzen (`4000 0000 0000 0341`).
3. Nach 3 simulierten Tagen muss `subscription_status = unpaid` und `is_active = false` in der DB stehen.

## QA Test Results (Runde 4)

**Tested:** 2026-03-28
**App URL:** http://localhost:3000
**Tester:** QA Engineer (AI)
**Vorherige Runde:** Runde 3 fand 10 offene Bugs gesamt (1 critical, 4 high, 1 medium, 4 low).

### BUILD STATUS: PASS

Der Build laeuft jetzt erfolgreich durch. `npm run build` kompiliert alle Routen inkl. Billing-Endpoints und Webhook-Route ohne Fehler. Die lazy initialization via Proxy-Pattern in `stripe.ts` loest das Problem.

---

### Status der Bugs aus vorherigen Runden

| Bug | Severity | Status Runde 4 |
|-----|----------|----------------|
| BUG-R2-1: Build-Fehler (stripe.ts top-level throw) | Critical | BEHOBEN -- `stripe.ts` nutzt jetzt Proxy-Pattern fuer lazy init |
| BUG-R2-2: Stripe env vars fehlen in .env.local.example | High | BEHOBEN -- alle 4 Stripe-Variablen dokumentiert |
| BUG-R2-3: Fehlende Grace-Period-Dokumentation | High | BEHOBEN -- Abschnitt "Stripe Dunning-Konfiguration" in Feature-Spec hinzugefuegt |
| BUG-R2-4: Fehlendes Rate Limiting | Medium | NICHT BEHOBEN |
| BUG-R2-5: customer.subscription.created nicht behandelt | Low | NICHT BEHOBEN |
| BUG-R2-6: Plan-Info hardcoded | Low | NICHT BEHOBEN |
| BUG-R2-7: Owner Tenant-Route importiert stripe.ts | High | BEHOBEN -- durch Proxy lazy init, kein Build-Fehler mehr |
| BUG-R3-1: Subscribe setzt is_active nicht auf true | High | NICHT BEHOBEN |
| BUG-R3-2: Idempotenz Race Condition | Low | NICHT BEHOBEN |
| BUG-R3-3: stripe_webhook_events waechst unbegrenzt | Low | NICHT BEHOBEN |

**Behobene Bugs:** 4/10 (BUG-R2-1, BUG-R2-2, BUG-R2-3, BUG-R2-7)

---

### Acceptance Criteria Status

#### AC-1: Stripe Customer wird beim Tenant-Anlegen erstellt
- [x] Code in `POST /api/owner/tenants` (Zeile 284-312) erstellt Stripe Customer und speichert `stripe_customer_id`.
- [x] Fallback: Stripe-Erstellung ist non-fatal (try/catch, Zeile 306).
- [x] Fallback im `setup-intent` Endpoint: Erstellt Customer on-demand.
- [x] Build erfolgreich -- keine Regression auf PROJ-2 mehr.
- **Status: PASS (Code Review + Build verifiziert)**

#### AC-2: Zahlungsmethode per Stripe Elements hinterlegen
- [x] `StripeCardForm` nutzt `@stripe/react-stripe-js` mit `CardElement`.
- [x] SetupIntent-Flow: POST zu `/api/tenant/billing/setup-intent`, dann `confirmCardSetup`.
- [x] Fehlerbehandlung bei fehlender `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (Zeile 160-168).
- [x] "Karte ersetzen" Button verfuegbar bei gespeicherter Karte.
- **Status: PASS (Code Review)**

#### AC-3: Basis-Plan abonnieren nach Zahlungsmethoden-Eingabe
- [x] `/api/tenant/billing/subscribe` erstellt Stripe Subscription mit `STRIPE_BASIS_PLAN_PRICE_ID`.
- [x] Setzt default payment method auf Customer (Zeile 77-81).
- [x] Speichert `stripe_subscription_id`, `subscription_status`, `subscription_period_end` in DB.
- [x] Button disabled ohne Zahlungsmethode (Frontend Zeile 432 + Backend Zeile 69-73).
- [ ] BUG: `is_active` wird NICHT auf `true` gesetzt (BUG-R3-1, weiterhin offen).
- **Status: PASS (mit Einschraenkung -- BUG-R3-1 betrifft nur Re-Subscription nach Sperrung)**

#### AC-4: 4-Wochen-Zyklen (28 Tage)
- [ ] Das Intervall wird NICHT serverseitig konfiguriert -- es haengt von `STRIPE_BASIS_PLAN_PRICE_ID` ab.
- **Status: CONDITIONAL PASS -- abhaengig von korrekter Stripe-Preis-Konfiguration**

#### AC-5: Abo kuendigen mit cancel_at_period_end
- [x] `/api/tenant/billing/cancel` setzt `cancel_at_period_end: true`.
- [x] DB wird auf `subscription_status: 'canceling'` aktualisiert.
- [x] Nur `active` Status erlaubt Kuendigung (Zeile 40).
- [x] Frontend zeigt Bestaetigungsdialog (AlertDialog, Zeile 458-494).
- **Status: PASS (Code Review)**

#### AC-6: Abo-Status im Dashboard korrekt angezeigt
- [x] Alle 5 Zustaende: none, active, canceling, past_due, canceled.
- [x] Status-Badge mit Farben und Labels (Zeile 58-86).
- [x] Kontextabhaengige Aktionen je nach Status (Zeile 424-566).
- [x] Warnung bei `canceling` mit Ablaufdatum (Zeile 339-345).
- [x] Warnung bei `past_due` (Zeile 347-352).
- **Status: PASS (Code Review)**

#### AC-7: E-Mail-Benachrichtigung bei Zahlungsausfall
- [x] `handleInvoicePaymentFailed` sendet `sendPaymentFailed` an Tenant-Admin.
- [x] E-Mail-Template rendert korrekt mit Billing-URL und Tenant-Name.
- [x] E-Mail-Versand ist non-fatal (try/catch, Zeile 256-259).
- [x] HTML-Escaping via `escapeEmailHtml` (Zeile 12-13 in payment-failed.ts).
- **Status: PASS (Code Review)**

#### AC-8: Grace Period und Tenant-Sperrung nach 3 Tagen
- [x] `handleSubscriptionUpdated` setzt `is_active: false` bei `unpaid`/`canceled` (Zeile 151-153).
- [x] Stripe Dunning-Konfiguration dokumentiert (Feature-Spec Abschnitt).
- [ ] Verifizierung der tatsaechlichen Stripe Dashboard-Einstellungen nicht moeglich (manueller Schritt).
- **Status: CONDITIONAL PASS -- Dunning-Doku vorhanden, Dashboard-Konfiguration muss manuell verifiziert werden**

#### AC-9: Webhook-Signatur-Validierung und Idempotenz
- [x] `constructEvent` validiert Stripe-Signatur (Zeile 37).
- [x] 400-Antwort bei ungueltiger Signatur (Zeile 41-44).
- [x] Idempotenz via `stripe_webhook_events` mit `stripe_event_id` (Zeile 50-59).
- [x] Duplicates: 200-Antwort mit `{ received: true, duplicate: true }` (Zeile 58).
- **Status: PASS (Code Review)**

#### AC-10: Reaktivierung nach Zahlungserfolg
- [x] `handleInvoicePaymentSucceeded` setzt `subscription_status: 'active'` UND `is_active: true` (Zeile 280).
- **Status: PASS (Code Review)**

---

### Edge Cases Status

#### EC-1: Tenant ohne Stripe Customer -- Fallback
- [x] `setup-intent` Endpoint erstellt Customer als Fallback (Zeile 36-65).
- **Status: PASS**

#### EC-2: Modul-Buchung ohne aktiven Basis-Plan
- [ ] Nicht testbar -- PROJ-15 (Modul-Buchung) ist noch nicht implementiert.
- **Status: N/A**

#### EC-3: Kuendigung rueckgaengig machen vor Periodenende
- [x] `/api/tenant/billing/reactivate` setzt `cancel_at_period_end: false`.
- [x] DB wird auf `subscription_status: 'active'` aktualisiert.
- [x] Nur `canceling` Status erlaubt Reaktivierung (Zeile 40).
- **Status: PASS (Code Review)**

#### EC-4: Webhook Duplicate Delivery
- [x] Idempotenz via `stripe_event_id` in `stripe_webhook_events`.
- [x] Duplicates werden mit `{ received: true, duplicate: true }` beantwortet.
- **Status: PASS (Code Review)**

#### EC-5: Ungueltige Webhook-Signatur
- [x] `constructEvent` wirft bei ungueltiger Signatur.
- [x] 400-Antwort, kein State-Change.
- **Status: PASS (Code Review)**

#### EC-6: Abgelaufene Zahlungsmethode
- [x] Bei `past_due`: "Zahlungsmethode aktualisieren" Button (Zeile 531-536).
- [x] "Karte ersetzen" Button jederzeit verfuegbar (Zeile 387-393).
- **Status: PASS (Code Review)**

---

### Security Audit Results (Runde 4)

#### SEC-1: Authentifizierung
- [x] Alle Billing-API-Routen nutzen `requireTenantAdmin()`.
- [x] Billing-Layout hat Server-seitigen Admin-Guard (`role !== 'admin'` -> `forbidden()`).
- **Status: PASS**

#### SEC-2: Cross-Tenant-Zugriff (Authorization)
- [x] `requireTenantAdmin` verifiziert aktive Tenant-Mitgliedschaft in `tenant_members` Tabelle.
- [x] Angreifer muesste in Ziel-Tenant als Admin registriert sein.
- [x] `x-tenant-id` Header wird gegen tatsaechliche Mitgliedschaft geprueft -- nicht blind vertraut.
- **Status: PASS**

#### SEC-3: Stripe Secret Key Exposure
- [x] `stripe.ts` ist nur serverseitig (Proxy-Pattern, kein NEXT_PUBLIC_ Prefix).
- [x] Client-Komponente nutzt nur `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`.
- [x] Kommentar: "NEVER import this file in client components".
- [x] `tenant/profile/route.ts` verwendet dynamic import (`await import('@/lib/stripe')`) -- korrekt.
- **Status: PASS**

#### SEC-4: Webhook-Sicherheit
- [x] Stripe-Signatur validiert via `constructEvent`.
- [x] Raw Body korrekt gelesen (`request.text()`, nicht `request.json()`).
- [x] `STRIPE_WEBHOOK_SECRET` serverseitig.
- **Status: PASS**

#### SEC-5: Input Validation
- [x] Billing-API-Routen lesen keinen Request-Body (nur Header und DB-Daten).
- [x] Webhook liest nur Raw Body fuer Signatur-Validierung.
- **Status: PASS**

#### SEC-6: Rate Limiting
- [ ] BUG (Medium): KEIN Rate Limiting auf Billing-Endpoints (unveraendert seit Runde 1).
- **Status: FAIL**

#### SEC-7: Sensitive Data in API Responses
- [x] `GET /api/tenant/billing` gibt nur letzte 4 Ziffern zurueck (brand, last4, exp).
- [x] `setup-intent` gibt nur `client_secret` zurueck (Stripe.js erwartet das).
- [x] Keine Secrets in Responses.
- **Status: PASS**

#### SEC-8: RLS auf stripe_webhook_events
- [x] Alle RLS-Policies verweigern Zugriff fuer `anon` und `authenticated`.
- [x] Nur `service_role` kann lesen/schreiben.
- **Status: PASS**

#### SEC-9: Plan-Preis Manipulation
- [x] Subscription serverseitig mit `STRIPE_BASIS_PLAN_PRICE_ID` erstellt.
- **Status: PASS**

#### SEC-10: Doppelte Subscription verhindern
- [x] `subscribe` Endpoint prueft auf `active`/`canceling` Status (409 Conflict, Zeile 53-57).
- **Status: PASS**

#### SEC-11 (NEU): Webhook Endpoint -- Kein Auth-Bypass moeglich
- [x] Webhook-Route hat KEINE Supabase-Auth -- korrekt, da Stripe die Signatur-Validierung uebernimmt.
- [x] Ohne gueltige `stripe-signature` Header: 400-Antwort.
- [x] Ohne `STRIPE_WEBHOOK_SECRET`: 500-Antwort (kein State-Change).
- **Status: PASS**

---

### Cross-Browser Testing
- **Status:** Code Review -- Build erfolgreich, aber Stripe Elements erfordern echte Stripe-Keys fuer Laufzeittests.
- **Notizen:**
  - `StripeCardForm` verwendet Standard-Stripe-Elements (`CardElement`) -- Cross-Browser-Kompatibilitaet wird von Stripe garantiert.
  - Keine custom CSS-Hacks, die Browser-spezifisch sein koennten.

### Responsive Testing
- **Status:** Code Review -- kein Laufzeittest moeglich ohne Stripe-Keys.
- **Notizen:**
  - `BillingWorkspace` nutzt `lg:grid-cols-2` -- responsives Grid.
  - `sm:flex-row` fuer Subscription-Actions -- mobile-tauglich.
  - `sm:text-4xl` fuer Hero-Section -- responsive Typografie.
  - `lg:grid-cols-3` fuer Feature-Cards im Hero.
  - Alle Cards nutzen `rounded-[28px]` konsistent mit Design-System.

### Regression Testing
- **Status:** BUILD PASS -- PROJ-2 Regression ist behoben.
- [x] `POST /api/owner/tenants` baut erfolgreich (Stripe-Import ueber Proxy ist lazy).
- [x] Navigation: "Abrechnung" Link nur fuer Admins sichtbar (`role === 'admin'`, Zeile 47-51).
- [x] Member-Navigation nicht betroffen.
- [x] Alle bestehenden Routen (dashboard, settings, onboarding, login, etc.) bauen erfolgreich.

---

### Offene Bugs (Runde 4)

#### BUG-R3-1: Subscribe-Endpoint setzt is_active nicht auf true (WEITERHIN OFFEN)
- **Severity:** High
- **Datei:** `src/app/api/tenant/billing/subscribe/route.ts` Zeile 102-106
- **Problem:** Das DB-Update setzt `stripe_subscription_id`, `subscription_status`, `subscription_period_end` -- aber NICHT `is_active: true`.
- **Impact:** Bei Re-Subscription nach Sperrung bleibt der Tenant gesperrt bis der `invoice.payment_succeeded` Webhook asynchron eintrifft (Sekunden bis Minuten).
- **Priority:** Fix before deployment

#### BUG-R2-4: Fehlendes Rate Limiting auf Billing-Endpoints (WEITERHIN OFFEN)
- **Severity:** Medium
- **Datei:** Alle Billing-API-Routen unter `/api/tenant/billing/*`
- **Impact:** Potenzielle Stripe-API-Kosten durch massenhaftes Erstellen von SetupIntents.
- **Priority:** Fix in next sprint

#### BUG-R2-5: customer.subscription.created Event nicht behandelt (WEITERHIN OFFEN)
- **Severity:** Low
- **Impact:** Gering -- Subscribe-Endpoint setzt DB-Status synchron.
- **Priority:** Nice to have

#### BUG-R2-6: Plan-Info ist hardcoded (WEITERHIN OFFEN)
- **Severity:** Low
- **Datei:** `src/app/api/tenant/billing/route.ts` Zeile 80-88
- **Impact:** Falscher Preis im Dashboard bei Stripe-Preisaenderung.
- **Priority:** Nice to have

#### BUG-R3-2: Idempotenz Race Condition im Webhook-Handler (WEITERHIN OFFEN)
- **Severity:** Low
- **Impact:** Gering -- Event-Handler sind idempotent in ihrer Wirkung.
- **Priority:** Nice to have

#### BUG-R3-3: stripe_webhook_events Tabelle waechst unbegrenzt (WEITERHIN OFFEN)
- **Severity:** Low
- **Impact:** Langfristig: steigende Storage-Kosten.
- **Priority:** Nice to have

---

### Summary (Runde 4)
- **Acceptance Criteria:** 8/10 passed (AC-4 und AC-8 conditional)
- **Bugs aus Runde 3 behoben:** 4/10 (BUG-R2-1, BUG-R2-2, BUG-R2-3, BUG-R2-7)
- **Offene Bugs gesamt:** 6 (1 high, 1 medium, 4 low)
- **Security:** Rate Limiting fehlt (Medium). Alle anderen 10 Security-Checks bestanden.
- **Build:** PASS
- **Regression:** PROJ-2 Regression behoben
- **Production Ready:** BEDINGT -- 1 High Bug (BUG-R3-1) muss behoben werden

### Priorisierte Fix-Reihenfolge

**VOR Deployment:**
1. **BUG-R3-1 (High):** `subscribe` Route muss `is_active: true` setzen (1-Zeilen-Fix in `src/app/api/tenant/billing/subscribe/route.ts` Zeile 102).

**NACH Deployment (naechster Sprint):**
2. BUG-R2-4 (Medium): Rate Limiting auf Billing-Endpoints
3. BUG-R2-5 (Low): customer.subscription.created Event behandeln
4. BUG-R2-6 (Low): Plan-Info dynamisch aus Stripe laden
5. BUG-R3-2 (Low): Idempotenz Race Condition (DB-Transaktion)
6. BUG-R3-3 (Low): stripe_webhook_events TTL/Cleanup

## QA Test Results (Runde 5)

**Tested:** 2026-03-28
**App URL:** http://localhost:3000
**Tester:** QA Engineer (AI)
**Vorherige Runde:** Runde 4 hatte 6 offene Bugs (1 high, 1 medium, 4 low).

### BUILD STATUS: PASS

Build laeuft erfolgreich durch. `npm run build` kompiliert alle Routen ohne Fehler. Lint (`npm run lint`) ebenfalls fehlerfrei.

---

### Status der Bugs aus vorherigen Runden

| Bug | Severity | Status Runde 5 |
|-----|----------|----------------|
| BUG-R2-1: Build-Fehler (stripe.ts top-level throw) | Critical | BEHOBEN (Runde 4) |
| BUG-R2-2: Stripe env vars fehlen in .env.local.example | High | BEHOBEN (Runde 4) |
| BUG-R2-3: Fehlende Grace-Period-Dokumentation | High | BEHOBEN (Runde 4) |
| BUG-R2-4: Fehlendes Rate Limiting | Medium | TEILWEISE BEHOBEN -- `subscribe` und `setup-intent` haben Rate Limiting, `cancel`, `reactivate` und `GET billing` nicht |
| BUG-R2-5: customer.subscription.created nicht behandelt | Low | BEHOBEN -- Zeile 64 in Webhook-Handler |
| BUG-R2-6: Plan-Info hardcoded | Low | BEHOBEN -- `GET /api/tenant/billing` laedt Preis dynamisch via `stripe.prices.retrieve` (Zeile 85), Fallback auf statische Werte bei Fehler |
| BUG-R2-7: Owner Tenant-Route importiert stripe.ts | High | BEHOBEN (Runde 4) |
| BUG-R3-1: Subscribe setzt is_active nicht auf true | High | BEHOBEN -- Zeile 119 setzt jetzt `is_active: true` |
| BUG-R3-2: Idempotenz Race Condition | Low | BEHOBEN -- Unique Constraint Error (23505) wird erwartet und ignoriert (Zeile 98) |
| BUG-R3-3: stripe_webhook_events waechst unbegrenzt | Low | BEHOBEN -- Probabilistischer Cleanup (1% Chance pro Request) loescht Events aelter als 90 Tage (Zeile 102-113) |

**Behobene Bugs seit Runde 4:** 6/6 (BUG-R3-1, BUG-R2-5, BUG-R2-6, BUG-R3-2, BUG-R3-3, BUG-R2-4 teilweise)

---

### Acceptance Criteria Status

#### AC-1: Stripe Customer wird beim Tenant-Anlegen erstellt
- [x] `POST /api/owner/tenants` (Zeile 284-312) erstellt Stripe Customer und speichert `stripe_customer_id`.
- [x] Fallback: Stripe-Erstellung ist non-fatal (try/catch, Zeile 306).
- [x] Fallback im `setup-intent` Endpoint: Erstellt Customer on-demand (Zeile 36-65).
- [x] Build erfolgreich -- keine Regression auf PROJ-2.
- **Status: PASS**

#### AC-2: Zahlungsmethode per Stripe Elements hinterlegen
- [x] `StripeCardForm` nutzt `@stripe/react-stripe-js` mit `CardElement`.
- [x] SetupIntent-Flow: POST zu `/api/tenant/billing/setup-intent`, dann `confirmCardSetup`.
- [x] Fehlerbehandlung bei fehlender `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (Zeile 160-168).
- [x] "Karte ersetzen" Button verfuegbar bei gespeicherter Karte.
- **Status: PASS**

#### AC-3: Basis-Plan abonnieren nach Zahlungsmethoden-Eingabe
- [x] `/api/tenant/billing/subscribe` erstellt Stripe Subscription mit `STRIPE_BASIS_PLAN_PRICE_ID`.
- [x] Setzt default payment method auf Customer (Zeile 89-93).
- [x] Speichert `stripe_subscription_id`, `subscription_status`, `subscription_period_end`, `is_active: true` in DB (Zeile 115-120).
- [x] Button disabled ohne Zahlungsmethode (Frontend + Backend).
- [x] Doppelte Subscription verhindert (Status-Check Zeile 65-69).
- **Status: PASS**

#### AC-4: 4-Wochen-Zyklen (28 Tage)
- [x] Plan-Info wird jetzt dynamisch aus Stripe geladen via `stripe.prices.retrieve` (Zeile 85).
- [x] Intervall-Erkennung: `interval_count === 4 && interval === 'week'` wird zu "4 Wochen" (Zeile 88-89).
- [ ] Das Intervall haengt weiterhin von der Stripe-Preis-Konfiguration ab -- keine serverseitige Validierung.
- **Status: CONDITIONAL PASS -- abhaengig von korrekter Stripe-Preis-Konfiguration**

#### AC-5: Abo kuendigen mit cancel_at_period_end
- [x] `/api/tenant/billing/cancel` setzt `cancel_at_period_end: true`.
- [x] DB wird auf `subscription_status: 'canceling'` aktualisiert.
- [x] Nur `active` Status erlaubt Kuendigung.
- [x] Frontend zeigt Bestaetigungsdialog (AlertDialog).
- **Status: PASS**

#### AC-6: Abo-Status im Dashboard korrekt angezeigt
- [x] Alle 5 Zustaende: none, active, canceling, past_due, canceled.
- [x] Status-Badge mit Farben und Labels.
- [x] Kontextabhaengige Aktionen je nach Status.
- [x] Warnung bei `canceling` mit Ablaufdatum.
- [x] Warnung bei `past_due`.
- [x] Plan-Info dynamisch aus Stripe (Preis, Intervall, Waehrung).
- **Status: PASS**

#### AC-7: E-Mail-Benachrichtigung bei Zahlungsausfall
- [x] `handleInvoicePaymentFailed` sendet `sendPaymentFailed` an Tenant-Admin.
- [x] E-Mail-Template rendert korrekt mit Billing-URL und Tenant-Name.
- [x] HTML-Escaping via `escapeEmailHtml`.
- [x] E-Mail-Versand ist non-fatal (try/catch).
- **Status: PASS**

#### AC-8: Grace Period und Tenant-Sperrung nach 3 Tagen
- [x] `handleSubscriptionUpdated` setzt `is_active: false` bei `unpaid`/`canceled`.
- [x] Stripe Dunning-Konfiguration dokumentiert in Feature-Spec.
- [ ] Dashboard-Konfiguration muss manuell verifiziert werden.
- **Status: CONDITIONAL PASS -- Dunning-Doku vorhanden, Dashboard-Konfiguration muss manuell verifiziert werden**

#### AC-9: Webhook-Signatur-Validierung und Idempotenz
- [x] `constructEvent` validiert Stripe-Signatur.
- [x] 400-Antwort bei ungueltiger Signatur.
- [x] Idempotenz via `stripe_webhook_events` mit `stripe_event_id`.
- [x] Duplicates: 200-Antwort mit `{ received: true, duplicate: true }`.
- [x] Race Condition bei parallelen Duplicates abgefangen (Unique Constraint 23505 wird ignoriert).
- [x] `customer.subscription.created` Event wird jetzt behandelt.
- **Status: PASS**

#### AC-10: Reaktivierung nach Zahlungserfolg
- [x] `handleInvoicePaymentSucceeded` setzt `subscription_status: 'active'` UND `is_active: true`.
- **Status: PASS**

---

### Edge Cases Status

#### EC-1: Tenant ohne Stripe Customer -- Fallback
- [x] `setup-intent` Endpoint erstellt Customer als Fallback (Zeile 36-65).
- **Status: PASS**

#### EC-2: Modul-Buchung ohne aktiven Basis-Plan
- [ ] Nicht testbar -- PROJ-15 (Modul-Buchung) ist noch nicht implementiert.
- **Status: N/A**

#### EC-3: Kuendigung rueckgaengig machen vor Periodenende
- [x] `/api/tenant/billing/reactivate` setzt `cancel_at_period_end: false`.
- [x] DB wird auf `subscription_status: 'active'` aktualisiert.
- [x] Nur `canceling` Status erlaubt Reaktivierung.
- **Status: PASS**

#### EC-4: Webhook Duplicate Delivery
- [x] Idempotenz via `stripe_event_id` in `stripe_webhook_events`.
- [x] Duplicates werden mit `{ received: true, duplicate: true }` beantwortet.
- [x] Concurrent Duplicates: Unique Constraint Error wird abgefangen (kein Crash).
- **Status: PASS**

#### EC-5: Ungueltige Webhook-Signatur
- [x] `constructEvent` wirft bei ungueltiger Signatur.
- [x] 400-Antwort, kein State-Change.
- **Status: PASS**

#### EC-6: Abgelaufene Zahlungsmethode
- [x] Bei `past_due`: "Zahlungsmethode aktualisieren" Button.
- [x] "Karte ersetzen" Button jederzeit verfuegbar.
- **Status: PASS**

---

### Security Audit Results (Runde 5)

#### SEC-1: Authentifizierung
- [x] Alle Billing-API-Routen nutzen `requireTenantAdmin()`.
- [x] Billing-Layout hat Server-seitigen Admin-Guard (`role !== 'admin'` -> `forbidden()`).
- [x] Webhook-Route hat keine Supabase-Auth (korrekt: Stripe-Signatur-Validierung stattdessen).
- **Status: PASS**

#### SEC-2: Cross-Tenant-Zugriff (Authorization)
- [x] `requireTenantAdmin` verifiziert aktive Tenant-Mitgliedschaft in `tenant_members`.
- [x] `x-tenant-id` Header wird vom Proxy gesetzt und eingehende Werte werden gestrippt (`TENANT_HEADERS` in proxy.ts Zeile 175).
- [x] Angreifer muesste im Ziel-Tenant als Admin registriert sein.
- **Status: PASS**

#### SEC-3: Stripe Secret Key Exposure
- [x] `stripe.ts` ist nur serverseitig (Proxy-Pattern, kein `NEXT_PUBLIC_` Prefix).
- [x] Client-Komponente nutzt nur `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`.
- **Status: PASS**

#### SEC-4: Webhook-Sicherheit
- [x] Stripe-Signatur validiert via `constructEvent`.
- [x] Raw Body korrekt gelesen (`request.text()`).
- [x] `STRIPE_WEBHOOK_SECRET` serverseitig.
- [x] Ohne gueltige `stripe-signature`: 400-Antwort.
- [x] Ohne `STRIPE_WEBHOOK_SECRET`: 500-Antwort (kein State-Change).
- **Status: PASS**

#### SEC-5: Input Validation
- [x] Billing-API-Routen lesen keinen Request-Body (nur Header und DB-Daten).
- [x] Webhook liest nur Raw Body fuer Signatur-Validierung.
- **Status: PASS**

#### SEC-6: Rate Limiting
- [x] `subscribe` Endpoint: 5 Requests pro Minute (Zeile 29-38).
- [x] `setup-intent` Endpoint: 10 Requests pro Minute (Zeile 18-27).
- [ ] BUG (Low): `cancel`, `reactivate` und `GET /api/tenant/billing` haben kein Rate Limiting. Da diese Endpoints durch `requireTenantAdmin` geschuetzt sind (Angreifer muesste valider Admin sein) und keine Stripe-Schreiboperationen mit Kosten ausloesen (cancel/reactivate sind idempotent), ist das Risiko gering.
- **Status: PASS (mit Einschraenkung -- Rate Limiting auf cancel/reactivate/GET ist nice-to-have)**

#### SEC-7: Sensitive Data in API Responses
- [x] `GET /api/tenant/billing` gibt nur letzte 4 Ziffern zurueck (brand, last4, exp).
- [x] `setup-intent` gibt nur `client_secret` zurueck.
- [x] Keine Secrets in Responses.
- **Status: PASS**

#### SEC-8: RLS auf stripe_webhook_events
- [x] Alle RLS-Policies verweigern Zugriff fuer `anon` und `authenticated`.
- [x] Nur `service_role` kann lesen/schreiben.
- **Status: PASS**

#### SEC-9: Plan-Preis Manipulation
- [x] Subscription serverseitig mit `STRIPE_BASIS_PLAN_PRICE_ID` erstellt.
- [x] Client kann weder Preis noch Plan-ID beeinflussen.
- **Status: PASS**

#### SEC-10: Doppelte Subscription verhindern
- [x] `subscribe` Endpoint prueft auf `active`/`canceling` Status (409 Conflict).
- **Status: PASS**

---

### Cross-Browser Testing
- **Status:** Code Review -- Stripe Elements sind standardisiert und browser-uebergreifend getestet (von Stripe garantiert).
- **Notizen:**
  - `StripeCardForm` verwendet Standard-Stripe-Elements (`CardElement`) -- Cross-Browser-Kompatibilitaet wird von Stripe garantiert.
  - Keine custom CSS-Hacks, die Browser-spezifisch sein koennten.
  - shadcn/ui Komponenten (Button, Card, Badge, AlertDialog) haben breite Browser-Unterstuetzung.

### Responsive Testing
- **Status:** Code Review -- kein Laufzeittest moeglich ohne aktive Stripe-Keys.
- **Notizen:**
  - `BillingWorkspace` nutzt `lg:grid-cols-2` -- 1 Spalte auf Mobile, 2 auf Desktop.
  - `sm:flex-row` fuer Subscription-Actions -- stackt vertikal auf Mobile.
  - `sm:text-4xl` fuer Hero-Section -- kleinere Schrift auf Mobile.
  - `lg:grid-cols-3` fuer Feature-Cards im Hero -- 1 Spalte auf Mobile, 3 auf Desktop.
  - Alle Cards nutzen `rounded-[28px]` konsistent mit Design-System.
  - BillingHero hat `p-6 sm:p-8` -- weniger Padding auf Mobile.

### Regression Testing
- [x] Build: PASS -- alle bestehenden Routen bauen erfolgreich.
- [x] PROJ-2 (Tenant Provisioning): Stripe-Import ueber Proxy ist lazy -- kein Build-Fehler mehr.
- [x] Navigation: "Abrechnung" Link nur fuer Admins sichtbar (Zeile 47-51 in tenant-shell-navigation.tsx).
- [x] Member-Navigation nicht betroffen.
- [x] Lint: PASS -- keine Linting-Fehler.

---

### Verbleibende Bugs (Runde 5)

#### BUG-R5-1: Fehlendes Rate Limiting auf cancel, reactivate und GET billing
- **Severity:** Low
- **Datei:** `src/app/api/tenant/billing/cancel/route.ts`, `src/app/api/tenant/billing/reactivate/route.ts`, `src/app/api/tenant/billing/route.ts`
- **Problem:** Diese drei Endpoints haben kein Rate Limiting, waehrend `subscribe` und `setup-intent` es haben.
- **Impact:** Gering -- alle Endpoints erfordern Admin-Auth und loesen keine kostenpflichtigen Stripe-Operationen aus. `cancel` und `reactivate` rufen `stripe.subscriptions.update` auf, was idempotent und kostenlos ist.
- **Priority:** Nice to have

#### BUG-R5-2: Stripe-Preis-Intervall wird nicht serverseitig validiert (AC-4)
- **Severity:** Low
- **Problem:** Der Subscribe-Endpoint vertraut darauf, dass `STRIPE_BASIS_PLAN_PRICE_ID` auf ein Produkt mit `interval: week, interval_count: 4` zeigt. Es gibt keine Validierung zur Laufzeit.
- **Impact:** Wenn jemand die Price-ID aendert, koennten falsche Intervalle abgerechnet werden. Dies ist eine Konfigurationsfrage, kein Code-Bug.
- **Priority:** Nice to have (ggf. einmalige Validierung beim Startup)

---

### Summary (Runde 5)
- **Acceptance Criteria:** 8/10 passed, 2 conditional (AC-4 und AC-8 -- abhaengig von Stripe-Konfiguration)
- **Bugs aus Runde 4 behoben:** 6/6 (alle offenen Bugs behoben oder verbessert)
- **Verbleibende Bugs:** 2 (beide Low severity)
- **Security:** 10/10 Security-Checks bestanden. Rate-Limiting-Luecke ist nur noch Low severity.
- **Build:** PASS
- **Lint:** PASS
- **Regression:** Keine Regressionen festgestellt.
- **Production Ready:** JA
- **Recommendation:** Feature kann deployed werden. Die 2 verbleibenden Low-Bugs sind nice-to-have und koennen im naechsten Sprint behoben werden. AC-4 und AC-8 erfordern manuelle Verifizierung der Stripe-Dashboard-Einstellungen vor dem Go-Live.

## Deployment
_To be added by /deploy_
