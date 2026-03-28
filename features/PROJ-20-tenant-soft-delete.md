# PROJ-20: Tenant Soft Delete

## Status: Deployed
**Created:** 2026-03-28
**Last Updated:** 2026-03-28

## Dependencies
- Requires: PROJ-8 (Owner Super-Admin Dashboard)
- Requires: PROJ-13 (Tenant Detail Management)
- Recommended: PROJ-17 (Owner Audit Log)

## Overview
Tenants sollen standardmäßig nicht sofort hart gelöscht, sondern archiviert werden. Das reduziert Betriebsrisiko, erleichtert Support und schützt vor versehentlichem Datenverlust.

## User Stories
- Als Owner möchte ich einen Tenant sicher archivieren können.
- Als Support möchte ich einen versehentlich entfernten Tenant wiederherstellen können.
- Als Plattformbetreiber möchte ich echte Löschungen nur bewusst und nachvollziehbar durchführen.

## Acceptance Criteria
- [x] Tenants können archiviert statt sofort gelöscht werden.
- [x] Archivierte Tenants erscheinen standardmäßig nicht in normalen Listen.
- [x] Owner kann archivierte Tenants filtern und wiederherstellen.
- [x] Harte Löschung ist nur noch ein separater, expliziter Schritt.
- [x] Audit-Log erfasst Archivierung, Wiederherstellung und endgültige Löschung.

## Edge Cases
- Archivierter Tenant mit aktiver Subscription
- Archivierter Tenant mit offenen Einladungen oder Reset-Tokens
- Wiederherstellung eines Tenants mit kollidierenden Slugs oder E-Mails

## Technical Requirements
- `archived_at` oder `deleted_at` auf `tenants`
- Query-Filter in Owner-APIs
- UI-Filter und Actions im Owner-Bereich
- Schutz vor Login für archivierte Tenants

## Implementation Notes
- Kein automatisches Entfernen von Auth-Usern beim Archivieren
- Harte Löschung später über separaten Maintenance-Flow

---

## Tech Design (Solution Architect)

### Zielbild
Soft Delete wird als klarer Archivierungszustand für Tenants eingeführt. Ein Tenant bleibt dabei technisch vorhanden, verschwindet aber aus den Standard-Ansichten, kann keine normale Nutzung mehr starten und lässt sich gezielt wiederherstellen. Die endgültige Löschung bleibt ein separater, deutlich restriktiver Flow.

### Bausteine
Owner Tenant Liste
+-- Standardansicht "Aktive Tenants"
+-- Filter "Archiviert"
+-- Such- und Statusfilter
+-- Tabellenzeilen mit Archivierungsstatus

Owner Tenant Detail
+-- Tenant-Stammdaten
+-- Status- und Archivierungsbereich
+-- Aktion "Archivieren"
+-- Aktion "Wiederherstellen"
+-- Hinweisbereich für Billing, Mitglieder und offene Einladungen
+-- Audit-Historie

Owner APIs
+-- Tenant-Liste mit Standardfilter ohne archivierte Tenants
+-- Tenant-Detail mit Archivierungsmetadaten
+-- Aktion "Archivieren"
+-- Aktion "Wiederherstellen"
+-- Später optional: separater Hard-Delete-Maintenance-Flow

Zentrale Tenant-Zugriffslogik
+-- Tenant-Auflösung über Subdomain
+-- Statusentscheidung für Login und geschützte Bereiche
+-- Schutz für archivierte Tenants in Proxy, Auth und API-Gates

### Datenmodell
Zusätzlich zum bestehenden Tenant-Datensatz werden Archivierungsinformationen gespeichert:

- `archived_at`: Zeitpunkt der Archivierung
- `archived_by`: referenziert den auslösenden Owner
- `archive_reason`: optionaler fachlicher Grund oder Freitext
- optional `restored_at` und `restored_by` für klarere Nachvollziehbarkeit, falls Wiederherstellungen nicht nur im Audit-Log stehen sollen

Fachlich gilt:

- Ein Tenant ist "aktiv sichtbar", wenn kein Archivierungszeitpunkt gesetzt ist.
- Ein Tenant ist "archiviert", wenn `archived_at` gesetzt ist.
- Archivierung ist unabhängig vom bestehenden fachlichen Statusmodell wie `active`, `inactive` oder `billing_blocked`.

Dadurch bleibt das aktuelle Statusmodell für operative Sperren nutzbar, während Archivierung einen separaten Lebenszyklus beschreibt.

### Fachliche Regeln
- Archivierte Tenants erscheinen standardmäßig nicht in Owner-Listen.
- Owner können explizit nach archivierten Tenants filtern.
- Archivierte Tenants dürfen keine normale App-Nutzung mehr starten.
- Bereits bestehende Sessions verlieren den Zugriff spätestens beim nächsten geschützten Request.
- Wiederherstellung macht den Tenant wieder sichtbar, ohne Stammdaten, Mitglieder oder Historie zu verlieren.
- Harte Löschung ist nicht Teil des normalen Owner-Alltags und wird bewusst getrennt gehalten.

### Nutzerfluss
1. Owner öffnet einen Tenant im Owner-Bereich.
2. Owner archiviert den Tenant über eine explizite Aktion mit Sicherheitsabfrage.
3. Das System speichert Archivierungsmetadaten und schreibt ein Audit-Ereignis.
4. Der Tenant verschwindet aus Standardlisten und wird auf seiner Subdomain blockiert.
5. Bei Bedarf filtert der Owner nach archivierten Tenants und stellt den Tenant wieder her.
6. Das System entfernt die Archivierungsmarkierung, schreibt erneut ein Audit-Ereignis und gibt den Tenant wieder für normale Nutzung frei.

### Auswirkungen auf bestehende Bereiche

#### Owner-Listen und Detailseiten
- Listen bekommen einen Standardfilter "ohne archivierte Tenants".
- Detailseiten bleiben für Owner erreichbar, auch wenn der Tenant archiviert ist.
- Die UI zeigt klar an, ob ein Tenant archiviert ist und wann die Archivierung erfolgte.

#### Tenant-Zugriff und Login
- Die bestehende zentrale Tenant-Statuslogik wird um einen Archivierungs-Block ergänzt.
- Login, geschützte Seiten und tenant-spezifische APIs behandeln archivierte Tenants wie einen harten Zugriffsstopp.
- Öffentliche Sonderflüsse wie Passwort-Reset oder Invite-Annahme müssen bewusst entschieden werden. Empfehlung: bei archivierten Tenants ebenfalls blockieren, damit kein "halboffener" Reaktivierungspfad entsteht.

#### Billing
- Eine aktive Subscription verhindert die Archivierung nicht automatisch, erzeugt aber einen deutlichen Owner-Hinweis.
- Billing-Daten bleiben erhalten, damit Wiederherstellung ohne Datenverlust möglich ist.
- Falls später eine echte Kündigungslogik gewünscht ist, sollte sie als separater Billing-Flow modelliert werden, nicht als Nebeneffekt der Archivierung.

#### Einladungen und Reset-Tokens
- Offene Einladungen und Reset-Flows sollen nach Archivierung nicht mehr erfolgreich abgeschlossen werden.
- Bestehende Daten müssen nicht sofort physisch gelöscht werden; entscheidend ist, dass nachgelagerte Flows den archivierten Tenant erkennen und abbrechen.

### API- und Verantwortungsmodell
- Bestehende Owner-Tenant-Endpunkte bleiben der zentrale Einstiegspunkt.
- Für Archivieren und Wiederherstellen wird je eine klare, zustandsändernde Owner-Aktion ergänzt.
- Listen- und Detail-Endpunkte liefern Archivierungsmetadaten mit aus.
- Tenant-seitige APIs müssen archivierte Tenants früh ablehnen, auch wenn eine gültige Session vorhanden ist.

### Audit und Nachvollziehbarkeit
Folgende Ereignisse sollen im Owner-Audit-Log erscheinen:

- Tenant archiviert
- Tenant wiederhergestellt
- Tenant endgültig gelöscht

Zusätzlich sinnvoll im Kontext:

- auslösender Owner
- Tenant-ID und Tenant-Slug
- Zeitstempel
- optionaler Archivierungsgrund
- optional Hinweis, ob eine aktive Subscription oder offene Einladungen vorhanden waren

### Entscheidungen
- Archivierung wird als eigener Lebenszyklus neben dem Statusmodell umgesetzt, nicht als weiterer Wert im bestehenden `status`.
- Das reduziert Risiko für Seiteneffekte in bereits vorhandener Statuslogik.
- Owner-Detailseiten bleiben für Support und Wiederherstellung erreichbar.
- Harte Löschung bleibt bewusst außerhalb des Standardflows, damit versehentliche Datenverluste vermieden werden.

### Abhängigkeiten
- Keine neue Produktfläche außerhalb des bestehenden Owner-Bereichs nötig
- Nutzung der bestehenden Tenant-Statuslogik als zentrale Access-Gate-Basis
- Nutzung des bestehenden Owner-Audit-Logs für Nachvollziehbarkeit
- Voraussichtlich keine neuen externen Packages notwendig

### Offene Punkte für Umsetzung
- Soll Archivierung aktive Stripe-Abos nur markieren oder zusätzlich einen manuellen Billing-Task erzeugen?
- Soll der Archivierungsgrund verpflichtend oder optional sein?
- Soll Wiederherstellung immer den alten Slug behalten oder bei Kollisionen einen manuellen Klärungsdialog erzwingen?

### Empfehlung für die Umsetzung
Die Umsetzung sollte in drei Schritten erfolgen:

1. Datenmodell und Owner-Filter ergänzen
2. Zugriffsschutz für archivierte Tenants zentral in Proxy, Auth und Tenant-APIs verankern
3. Audit, Wiederherstellung und UX-Hinweise für Billing, Einladungen und Sonderfälle abrunden

---

## QA Test Results

**Tested:** 2026-03-28
**Status:** Ready mit Rest-Risiken ausserhalb von PROJ-20

### Acceptance Criteria Status
- [x] Tenants können archiviert statt sofort gelöscht werden.
- [x] Archivierte Tenants erscheinen standardmäßig nicht in normalen Listen.
- [x] Owner kann archivierte Tenants filtern und wiederherstellen.
- [x] Harte Löschung ist nur noch ein separater, expliziter Schritt.
- [x] Audit-Log erfasst Archivierung, Wiederherstellung und endgültige Löschung.

### Findings
- Keine offenen PROJ-20-spezifischen Findings nach der Nachprüfung.

### Test Notes
- Code Review der Soft-Delete-Flows in Owner-API, Proxy, Tenant-Guards und Owner-UI erneut durchgeführt.
- Nachprüfung des früheren Delete-Audit-Bugs: Hard Delete schreibt den Audit-Eintrag jetzt ohne FK auf einen bereits gelöschten Tenant und legt stattdessen `deletedTenantId`, `tenantName` und `tenantSlug` im Kontext ab.
- `npx tsc --noEmit` geprüft: keine neuen `PROJ-20`-Fehler, aber weiterhin bestehende Fremdfehler in `tests/e2e/password-reset.spec.ts`.
- `npx playwright test tests/e2e/tenant-status.spec.ts` bleibt als vollständiger End-to-End-Beleg lokal blockiert, weil das bestehende E2E-Seeding aktuell an einer `platform_admins`-/`users`-Foreign-Key-Konstellation scheitert.

### Recommendation
- PROJ-20 ist aus QA-Sicht freigabefähig.
- Für höhere Sicherheit vor Deployment wäre zusätzlich sinnvoll, das bestehende E2E-Seeding zu reparieren und den Tenant-Status-Spec danach einmal vollständig grün laufen zu lassen.

---

## Deployment

**Status:** ✅ Deployed
**Deployed:** 2026-03-28
