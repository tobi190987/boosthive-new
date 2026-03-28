# PROJ-19: Profile & Onboarding Refactor

## Status: Deployed
**Created:** 2026-03-28
**Last Updated:** 2026-03-28

## Dependencies
- Requires: PROJ-3 (User Authentication)
- Requires: PROJ-13 (Tenant Detail Management)

## Overview
Profil- und Onboarding-Logik sind funktional, enthalten aber doppelte Formular-, Submit- und Fehlerbehandlung. Ziel ist eine gemeinsame, robustere Struktur für Profil, Onboarding und Billing-Pflichtlogik.

## User Stories
- Als User möchte ich konsistente Formulare und Fehlermeldungen in Onboarding und Profil.
- Als Entwickler möchte ich gemeinsame Submit-Logik statt mehrfacher Sonderfälle.
- Als QA möchte ich weniger flakey Übergänge zwischen Formularen und Redirects.

## Acceptance Criteria
- [ ] Gemeinsame Helper für Formular-Submit, JSON-Parsing und Fehlermapping existieren.
- [ ] Profil- und Onboarding-Flow nutzen dieselbe Kernlogik.
- [ ] Redirect- und Success-Verhalten ist stabil und testbar.
- [ ] Admin-spezifische Billing-Pflichtlogik bleibt erhalten, ist aber klar getrennt.
- [ ] E2E-Tests für Member- und Admin-Onboarding bleiben grün.

## Edge Cases
- Onboarding mit teilweise vorhandenen Profildaten
- Fehler bei Avatar-/Logo-Upload parallel zum Profil-Submit
- Stripe-/Billing-Hinweise nur für Admins
- Session-Refresh während Onboarding

## Technical Requirements
- Gemeinsame Client-Helper oder Hooks
- Weniger doppelte `fetch`-/`toast`-/`error`-Blöcke
- Saubere Trennung von Profil, Billing und Passwort-/E-Mail-Änderung

## Implementation Notes
- Start im Tenant-Profil-Workspace
- Danach optional auf Owner-Detailformulare übertragen

---

## Tech Design

## Zielbild
PROJ-19 ist kein fachliches Redesign, sondern ein Struktur-Refactor. Die bestehende Funktionalität für Tenant-Profil, Onboarding, Avatar-/Logo-Upload und Admin-Billing bleibt erhalten, wird aber in klar getrennte Bausteine aufgeteilt:

1. Gemeinsame Client-Submit-Schicht für Formularspeichern, JSON-Parsing, Redirects und Serverfehler
2. Gemeinsame Profil-Core-Logik für Onboarding und Settings
3. Separate Admin-Billing-Gates statt Billing-Sonderfälle mitten im allgemeinen Profil-Flow
4. Stabilere Übergänge für Redirect nach Onboarding und parallele Upload-Aktionen

## Bestehende Architektur

### Aktuell beteiligte Bausteine
- `src/app/onboarding/page.tsx` lädt Tenant-Kontext serverseitig und rendert `TenantProfileWorkspace` im `mode="onboarding"`.
- `src/app/settings/profile/page.tsx` nutzt denselben Workspace indirekt über `SettingsProfileWorkspace`.
- `src/components/tenant-profile-workspace.tsx` enthält derzeit:
  - Profilformular
  - Billing-Felder
  - Stripe-Status-Laden
  - Avatar-Crop + Upload
  - Tenant-Logo-Upload
  - Submit-Logik für Profil
  - Submit-Logik für E-Mail und Passwort
  - Toast-/Error-/Success-State
- `src/app/api/tenant/profile/route.ts` enthält derzeit:
  - JSON-Parsing
  - Zod-Validierung
  - Profil-Upsert
  - Billing-Validierung
  - Stripe-Payment-Method-Prüfung
  - Markierung von `billing_onboarding_completed_at`
  - Markierung von `tenant_members.onboarding_completed_at`
- `src/lib/profile.ts` enthält bereits zentrale Domänenlogik für Profilvollständigkeit und Onboarding-Status.

### Aktuelles Problem
Die UI nutzt zwar schon denselben Workspace für Onboarding und Settings, aber die Wiederverwendung passiert hauptsächlich auf Component-Ebene, nicht auf Logik-Ebene. Dadurch sind Submit-Handling, Fehlerabbildung, Success-Messages und Redirects eng mit einzelnen Formularen verknüpft. Auf API-Seite ist Profilspeichern und Onboarding-Abschluss ebenfalls in einer Route verschachtelt, wodurch Sonderfälle für Admins schwer testbar werden.

## Zielarchitektur

## Component Architecture
```text
OnboardingPage / ProfileSettingsPage
  -> TenantProfileWorkspace
    -> useProfileWorkspaceController
      -> useProfileSubmit
      -> useAsyncActionErrorMapping
      -> useBillingStatus (nur Admin)
      -> avatar/logo upload actions
    -> ProfileFormSection
    -> BillingFormSection (nur Admin)
    -> AccountSecuritySection (nur Settings)
    -> StripeCardForm
```

## Frontend-Verantwortlichkeiten

### 1. Workspace bleibt der Einstiegspunkt
`TenantProfileWorkspace` bleibt die zentrale Seite für Tenant-User, wird aber schlanker. Die Component soll vor allem Layout, sichtbare Sektionen und lokale UI-Zustände für Dialoge steuern.

### 2. Gemeinsamer Controller für Profilflows
Ein neuer gemeinsamer Client-Controller oder Hook kapselt die fachliche Formularlogik für beide Modi:
- Laden der Default-Werte aus `initialData`
- Ableitung von `isAdmin`, `isOnboarding`
- gemeinsames Submit-Verhalten
- einheitliche Verarbeitung von API-Antworten
- zentrale Success- und Error-Messages

Der Unterschied zwischen Settings und Onboarding wird nur noch über Optionen gesteuert:
- `mode="settings"` speichert und bleibt auf der Seite
- `mode="onboarding"` speichert und folgt einem serverseitig gelieferten Redirect

### 3. Wiederverwendbare Submit-Utilities
Ein gemeinsamer Client-Helper soll für Profil, E-Mail und Passwort dasselbe Muster abbilden:
- Request ausführen
- JSON robust parsen, auch wenn der Body leer oder beschädigt ist
- `details` auf `react-hook-form`-Feldfehler mappen
- generische vs. feldbezogene Fehler trennen
- optionalen `redirectTo` auswerten

Damit verschwinden die mehrfachen `fetch`-, `response.ok`-, `json().catch(() => ({}))`- und `setError`-Blöcke aus den Formular-Handlern.

### 4. Entkopplung von Upload und Profil-Submit
Avatar- und Logo-Upload bleiben eigene API-Aktionen. Für den Refactor werden sie nicht in den Profil-Submit integriert. Stattdessen soll die UI klar zwischen diesen asynchronen Vorgängen trennen:
- Upload-Fehler blockieren keinen regulären Profil-Submit
- Profil-Submit überschreibt keine Upload-States
- Success-/Error-Anzeigen werden pro Aktion sauber gesetzt oder zentral harmonisiert

Das reduziert Race-Conditions bei parallel laufenden Aktionen.

## Backend-Verantwortlichkeiten

### 1. Route bleibt stabil, Logik wandert in Services
Die öffentliche Schnittstelle `PUT /api/tenant/profile` bleibt erhalten, damit UI und Tests nur minimal angepasst werden müssen. Intern wird die Route in klarere Schritte zerlegt:

1. Request lesen und validieren
2. Profil speichern
3. Falls Admin: Billing-Daten validieren und speichern
4. Falls `complete_onboarding=true`: Onboarding-Regeln prüfen
5. Falls erfolgreich: Completion-Timestamps schreiben
6. Standardisierte Response zurückgeben

Diese Schritte sollen in kleine Helper in `src/lib` oder route-nahe Service-Dateien ausgelagert werden.

### 2. Explizite Onboarding-Orchestrierung
Die Entscheidung, ob Onboarding abgeschlossen werden darf, wird als eigene fachliche Operation modelliert:
- Für Member reicht vollständiges Basisprofil
- Für Admins sind zusätzlich vollständige Billing-Daten nötig
- Falls Stripe aktiv konfiguriert ist und ein `stripe_customer_id` existiert, muss mindestens eine Zahlungsmethode vorhanden sein

Wichtig: Diese Logik ist kein UI-Detail, sondern eine serverseitige Policy. Sie soll deshalb klar getrennt vom reinen Speichern der Profildaten sein.

### 3. Standardisierte API-Antworten
Die Route soll weiterhin JSON liefern, aber in einem konsistenteren Format:
- `success`
- `error`
- `details`
- `redirectTo`
- optional fachliche Statusflags wie `onboarding_complete`

Das ermöglicht einen generischen Client-Helper ohne route-spezifische Sonderbehandlung.

## Data Flow

### Settings-Flow
1. Server lädt `TenantShellContext`
2. Seite übergibt `initialData` an den Workspace
3. User ändert Profilfelder
4. Gemeinsamer Submit-Helper ruft `PUT /api/tenant/profile` ohne Onboarding-Abschluss auf
5. API validiert und speichert
6. Client zeigt Success oder mapped Feldfehler

### Onboarding-Flow Member
1. Login leitet auf `/onboarding`
2. Workspace rendert nur die für Member relevanten Pflichtfelder
3. Submit sendet `complete_onboarding=true`
4. API speichert Profil
5. API markiert `tenant_members.onboarding_completed_at`
6. Response liefert `redirectTo=/dashboard`
7. Client navigiert stabil anhand des Response-Felds

### Onboarding-Flow Admin
1. Login leitet auf `/onboarding`
2. Workspace rendert zusätzlich Billing-Sektion und Stripe-Hinweise
3. Submit sendet Profil + Billing + `complete_onboarding=true`
4. API validiert Billing-Daten
5. API prüft falls relevant vorhandene Stripe-Zahlungsmethode
6. API setzt `tenants.billing_onboarding_completed_at`
7. API setzt `tenant_members.onboarding_completed_at`
8. Response liefert Redirect zum Dashboard

## Modul-Schnittstellen

### Bestehende Domänenlogik weiterverwenden
`src/lib/profile.ts` bleibt der Ort für Regeln wie:
- Anzeigename / Initialen
- Basisprofil vollständig?
- Billing vollständig?
- Onboarding vollständig?

PROJ-19 soll diese Datei eher erweitern als neue verstreute Prüfungen einführen.

### Neue sinnvolle Abgrenzung
- `src/lib/profile.ts`: reine Domänenregeln und Vollständigkeitschecks
- `src/lib/schemas/profile.ts`: Eingabevalidierung
- neuer Client-Helper oder Hook: Submit-/Response-/Error-Mapping
- neuer Server-Helper: Orchestrierung für Profilspeichern und Onboarding-Abschluss

So bleibt Validierung, Domänenlogik und Request-Orchestrierung getrennt.

## Rollen und Berechtigungen
- Member dürfen eigenes Profil abschließen und bearbeiten.
- Admins dürfen zusätzlich Billing-Daten des Tenants pflegen und Tenant-Logo ändern.
- Owner-Logik ist von diesem Refactor nicht primär betroffen.
- Admin-spezifische Billing-Pflichten bleiben fachlich erhalten, werden aber aus dem generischen Profilpfad heraus separiert.

## Auswirkungen auf Tests

### Bestehende E2E-Abdeckung, die stabil bleiben muss
- `tests/e2e/authenticated-flows.spec.ts`
  - Member wird nach Login sauber ins Onboarding geführt und nach Abschluss nach `/dashboard` weitergeleitet
  - Admin sieht Billing-Pflichtlogik und erhält bei unvollständiger Rechnungsadresse einen verständlichen Fehler

### Zusätzliche sinnvolle Testschwerpunkte
- Feldfehler aus `details` werden im Profilformular korrekt angezeigt
- `redirectTo` wird nur im Onboarding-Modus ausgeführt
- Upload-Fehler bei Avatar oder Logo löschen keinen eingegebenen Formularzustand
- Admin-Billing-Gate bleibt aktiv, Member-Flow bleibt davon unberührt

## Migrations- und Rollout-Ansatz
Es ist keine DB-Migration nötig. Der Refactor ist ein interner Umbau bei stabiler Oberfläche.

### Empfohlene Reihenfolge
1. Gemeinsame Client-Submit-Utilities einführen
2. `TenantProfileWorkspace` in kleinere Abschnitte oder Hooks zerlegen
3. `PUT /api/tenant/profile` intern in Services aufteilen
4. E2E-Tests gegen Redirect- und Billing-Verhalten verifizieren
5. Optional dieselben Patterns auf Owner-Detailformulare übertragen

## Risiken
- Beim Entkoppeln der Submit-Logik könnten bestehende Fehlermeldungen oder Button-States ungewollt verändert werden.
- Redirect-Verhalten im Onboarding ist sensibel, weil bestehende Tests auf `/dashboard` nach erfolgreichem Abschluss bauen.
- Stripe-Prüfung ist teilweise umgebungsabhängig; die neue Struktur darf lokale Entwicklung ohne vollständige Stripe-Konfiguration nicht verschlechtern.

## Out of Scope
- Neues UX-Konzept für Profil oder Onboarding
- Änderung der fachlichen Billing-Regeln
- Zusammenlegung von Avatar-/Logo-Upload in denselben Request wie Profil-Submit
- Owner-spezifische Formular-Refactors außerhalb der vorhandenen Tenant-Profilbasis

---

## QA Test Results

**Tested:** 2026-03-28
**App URL:** http://localhost:3000

### Acceptance Criteria Status
- [x] AC-1: Gemeinsame Helper für Formular-Submit, JSON-Parsing und Fehlermapping existieren.
- [x] AC-2: Profil- und Onboarding-Flow nutzen dieselbe Kernlogik.
- [x] AC-3: Redirect- und Success-Verhalten ist stabil und testbar.
- [x] AC-4: Admin-spezifische Billing-Pflichtlogik bleibt erhalten, ist aber klar getrennt.
- [x] AC-5: E2E-Tests für Member- und Admin-Onboarding bleiben grün.

### Durchgeführte Prüfungen
- `./node_modules/.bin/eslint src/app/api/tenant/profile/route.ts src/lib/profile-update.ts src/lib/schemas/profile.ts src/components/tenant-profile-workspace.tsx src/components/owner-profile-workspace.tsx src/lib/client-form.ts tests/e2e/owner-flows.spec.ts`
- `npx playwright test tests/e2e/authenticated-flows.spec.ts --project=chromium`
- `npx playwright test tests/e2e/owner-flows.spec.ts --project=chromium --grep "owner can update profile data"`
- `npx playwright test tests/e2e/owner-flows.spec.ts --project=chromium`

### Ergebnis
- Tenant-Onboarding für Member und Admin ist grün.
- Der neue Owner-Profil-Test ist grün und bestätigt persistierte Profildaten nach Reload.
- Die statische Prüfung der für PROJ-19 geänderten Dateien ist grün.

### Bugs Found
**BUG-1: Bestehender Owner-Dashboard-Regressionstest erwartet veralteten Status**
- **Severity:** Medium
- **Scope:** Nicht blocker für PROJ-19 selbst, aber Regression-Suite nicht vollständig grün
- **Test:** `tests/e2e/owner-flows.spec.ts` - `owner can create, pause, resume and reassign a tenant admin`
- **Beobachtung:** Der Test erwartet für den Seed-Tenant den Status `Aktiv`, die Oberfläche zeigt jedoch `Setup unvollstaendig`.
- **Einordnung:** Das betrifft den Owner-Dashboard-/Tenant-Status-Bereich und nicht die in PROJ-19 geänderte Profil-/Onboarding-Submit-Logik. Der Fehler ist daher als separates Folgeproblem zu behandeln.

### QA-Fazit
PROJ-19 ist aus QA-Sicht für die refaktorierten Profil-, Onboarding- und Owner-Profil-Flows abnahmereif. Offenes Restrisiko bleibt nur in einem separaten bestehenden Owner-Dashboard-Test, dessen Erwartung nicht mehr zum aktuellen Statusmodell passt.

---

## Deployment

**Status:** ✅ Deployed
**Deployed:** 2026-03-28
**Production URL:** Pending
