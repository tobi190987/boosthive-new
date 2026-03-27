# PROJ-13: Tenant Detail Management

## Status: In Review
**Created:** 2026-03-27
**Last Updated:** 2026-03-27

## Dependencies
- Requires: PROJ-2 (Tenant Provisioning) — erweitert das Tenant-Datenmodell und die Owner-Agenturen-Übersicht
- Requires: PROJ-3 (User Authentication) — für Auth-Guards auf den Detail-Routen
- Soft: PROJ-4 (Transactional Email) — bei neuem Admin-User wird Einladungs-E-Mail benötigt

## User Stories
- Als Owner möchte ich in der Agenturen-Übersicht auf einen Agentur-Namen klicken, um zur Detailseite dieser Agentur zu gelangen.
- Als Owner möchte ich den Namen und die Subdomain einer Agentur nachträglich ändern können, damit ich Fehler bei der Erstellung korrigieren kann.
- Als Owner möchte ich die Rechnungsadresse einer Agentur pflegen können (Firmenname, Straße, PLZ, Stadt, Land, USt-IdNr.), damit Buchhaltungsdaten zentral hinterlegt sind.
- Als Owner möchte ich die Kontaktdaten einer Agentur einsehen und bearbeiten können (Telefon, Website, Ansprechpartner), damit ich die Agentur schnell erreichen kann.
- Als Owner möchte ich einen neuen Admin-User für eine Agentur anlegen können, der den bisherigen Admin als Hauptverantwortlichen ablöst.
- Als Owner möchte ich auf der Detailseite sehen, wer aktuell Admin der Agentur ist (Name/E-Mail).

## Acceptance Criteria
- [ ] Klick auf einen Agentur-Namen in der Tabelle `/owner/tenants` navigiert zu `/owner/tenants/[id]`
- [ ] Detailseite zeigt alle aktuellen Daten der Agentur (Name, Subdomain, Status, Erstellt am, Admin, Rechnungsadresse, Kontaktdaten)
- [ ] Owner kann Agentur-Name bearbeiten (Pflichtfeld, min. 2 Zeichen)
- [ ] Owner kann Subdomain-Slug bearbeiten — Unique-Constraint und Format-Validierung gelten weiterhin (wie bei PROJ-2)
- [ ] Subdomain-Änderung zeigt eine Warnung: "Die URL der Agentur ändert sich. Bestehende Bookmarks werden ungültig."
- [ ] Owner kann Rechnungsadresse speichern: Firmenname, Straße + Nr., PLZ, Stadt, Land (alle optional außer Firmenname), ggf. USt-IdNr.
- [ ] Owner kann Kontaktdaten speichern: Ansprechpartner (Name), Telefon, Website (alle optional)
- [ ] Owner kann neuen Admin-User anlegen: E-Mail-Eingabe → neuer Supabase-Auth-User wird erstellt, erhält `role = admin` in `tenant_members`, bekommt Einladungs-E-Mail (via PROJ-4)
- [ ] Beim Anlegen eines neuen Admins behält der bisherige Admin seinen `tenant_members`-Eintrag, aber seine Rolle wechselt zu `member`
- [ ] Alle Felder werden per Formular mit Inline-Validierung bearbeitet (Zod + react-hook-form)
- [ ] Erfolgreiche Speicherungen zeigen eine Toast-Bestätigung
- [ ] Fehler (z.B. Subdomain vergeben) werden als Inline-Fehler angezeigt

## Edge Cases
- Subdomain bereits von anderer Agentur belegt → 409-Fehler mit Hinweis, Formular bleibt offen
- Subdomain ist eine reservierte Subdomain (www, api, admin, etc.) → Inline-Validierungsfehler
- Neuer Admin-E-Mail existiert bereits als User in einem anderen Tenant → Warnung oder Fehler (abhängig von Implementierung in PROJ-2/PROJ-4)
- Neuer Admin-E-Mail ist identisch mit einem bestehenden Member dieses Tenants → Rolle wird auf `admin` hochgestuft (kein neuer Auth-User nötig)
- Bisheriger Admin hat keine anderen Mitglieder mehr (nach Rollenwechsel zu `member` ist er allein) → kein Problem, bleibt als Member bestehen
- Agentur-ID in der URL existiert nicht → 404-Seite
- Owner versucht, einen inaktiven Tenant zu bearbeiten → erlaubt (Daten können trotzdem gepflegt werden)
- Leeres Formular (nur Pflichtfelder gefüllt, Rechnungsadresse/Kontakt komplett leer) → valide, optionale Felder können leer bleiben

## Technical Requirements
- Security: Alle Routen nur für authentifizierte Owner erreichbar (via `requireOwner()`)
- Atomarität: Beim Admin-Wechsel (neuer User + Rollentausch) muss beides in einer Transaktion passieren
- Subdomain-Änderung: Unique-Constraint und Format-Regex aus PROJ-2 gelten unverändert
- Neue DB-Spalten: `tenants`-Tabelle um Rechnungsadresse- und Kontaktfelder erweitern (Migration)
- API: Neue GET- und PATCH-Routen für `/api/owner/tenants/[id]` (PATCH ist bereits für Status-Toggle vorhanden — erweitern oder ergänzen)

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

### Zielbild

PROJ-13 erweitert die bestehende Owner-Agenturen-Übersicht aus PROJ-8 von einer Listenansicht zu einer echten Pflegeoberfläche. Der Owner bleibt dabei immer im Owner-Kontext auf der Root-Domain. Es gibt bewusst keine Session-Impersonation und keinen Sprung in geschützte Tenant-Routen.

### Neue Seiten & Routen

| Route | Typ | Zweck |
|-------|-----|-------|
| `/owner/tenants/[id]` | Page (neu) | Detailseite für eine Agentur mit Bearbeitungsformularen |
| `GET /api/owner/tenants/[id]` | API (neu) | Lädt Tenant-Stammdaten plus aktuellen Admin |
| `PATCH /api/owner/tenants/[id]` | API (erweitert) | Speichert Status, Basisdaten, Rechnungsadresse oder Kontaktdaten |
| `POST /api/owner/tenants/[id]/admin` | API (neu) | Führt den Admin-Wechsel als separaten Owner-Flow aus |

### Komponenten-Struktur

```
Owner Tenant List (/owner/tenants)
+-- Tenant table
|   +-- Tenant name as link
|   +-- Status action
|   +-- Existing filters / pagination

Tenant Detail Page (/owner/tenants/[id])
+-- Header
|   +-- Back link to /owner/tenants
|   +-- Tenant name
|   +-- Status badge
|   +-- Created date / tenant ID meta
|
+-- Tabs
|   +-- Allgemein
|   |   +-- Name field
|   |   +-- Subdomain field
|   |   +-- URL change warning
|   |   +-- Save action
|   |
|   +-- Rechnungsadresse
|   |   +-- Company
|   |   +-- Street
|   |   +-- ZIP
|   |   +-- City
|   |   +-- Country
|   |   +-- VAT ID
|   |   +-- Save action
|   |
|   +-- Kontakt
|   |   +-- Contact person
|   |   +-- Phone
|   |   +-- Website
|   |   +-- Save action
|   |
|   +-- Admin
|       +-- Current admin card
|       +-- New admin email form
|       +-- Hint that previous admin becomes member
|       +-- Submit action
|
+-- Toast feedback / inline validation states
```

### Datenmodell

Bestehende Tabellen bleiben erhalten. PROJ-13 erweitert nur die `tenants`-Tabelle um optionale Detailfelder, damit die Agentur-Stammdaten zentral gespeichert werden.

Neue optionale Felder auf `tenants`:
- `billing_company`
- `billing_street`
- `billing_zip`
- `billing_city`
- `billing_country`
- `billing_vat_id`
- `contact_person`
- `contact_phone`
- `contact_website`

Zusätzlich nutzt die Detailansicht vorhandene Daten aus:
- `tenants`: Name, Slug, Status, Erstellungsdatum
- `tenant_members`: aktueller Admin des Tenants
- `auth.users`: E-Mail des aktuellen Admins

### API-Design

**GET `/api/owner/tenants/[id]`**
- Nutzt dieselbe Owner-Autorisierung wie die bestehende Owner-API (`requireOwner()`).
- Liefert ein vollständiges Detailobjekt für genau einen Tenant.
- Enthält neben den Stammdaten auch genau einen "aktuellen Admin" für die Anzeige im UI.
- Gibt `404` zurück, wenn die Tenant-ID unbekannt ist.

**PATCH `/api/owner/tenants/[id]`**
- Die bestehende Status-Route wird nicht ersetzt, sondern sinnvoll erweitert.
- Der Request enthält einen kleinen Operationstyp, damit ein Endpunkt mehrere klar getrennte Formular-Speicherungen bedienen kann.
- Unterstützte Speicherfälle:
  - Status ändern
  - Basisdaten ändern (Name, Slug)
  - Rechnungsadresse ändern
  - Kontaktdaten ändern
- Jedes Formular bekommt eigene Validierungsregeln, damit Inline-Fehler präzise bleiben.
- Die Slug-Prüfung nutzt dieselben Regeln wie PROJ-2: reservierte Namen, Formatregeln und Eindeutigkeit.

**POST `/api/owner/tenants/[id]/admin`**
- Bleibt absichtlich ein separater Endpunkt, weil dieser Ablauf deutlich komplexer ist als normales Formularspeichern.
- Verantwortet genau einen fachlichen Vorgang: "Diesen Tenant einem neuen Haupt-Admin zuweisen".
- Erwartetes Verhalten:
  - Wenn die E-Mail bereits aktives Mitglied im Tenant ist, wird diese Person zu `admin`.
  - Wenn die E-Mail noch kein Mitglied im Tenant ist, wird ein Benutzerzugang vorbereitet und dem Tenant als `admin` zugeordnet.
  - Der bisherige Admin wird im selben Vorgang zu `member`.
  - Die Einladungs-/Setup-Mail wird im Anschluss über die vorhandene Mail-Infrastruktur ausgelöst.

### Admin-Wechsel als Datenfluss

1. Owner öffnet den Tab "Admin" auf der Detailseite.
2. Owner gibt die E-Mail des neuen Haupt-Admins ein.
3. Das System prüft, ob die Person bereits im Tenant existiert oder neu angelegt werden muss.
4. Die Rollenänderung läuft als atomarer Backend-Vorgang, damit nie zwei teilweise widersprüchliche Admin-Zustände entstehen.
5. Nach erfolgreichem Wechsel zeigt die Oberfläche den neuen Admin sofort an.
6. Die Mail an den neuen Admin wird über den bestehenden E-Mail-Flow versendet.

### Validierung & Fehlerverhalten

- Formularfehler bleiben direkt im jeweiligen Tab sichtbar.
- Slug-Konflikte werden als `409` an das Formular zurückgegeben.
- Reservierte Subdomains werden schon vor dem Speichern abgefangen.
- Eine unbekannte Tenant-ID führt auf eine 404-Seite statt auf eine leere Ansicht.
- Optionale Felder dürfen leer bleiben; nur die jeweiligen Pflichtfelder werden erzwungen.

### Sicherheit

- Alle Owner-Routen bleiben mit `requireOwner()` geschützt.
- Die Detailansicht liest und schreibt ausschließlich über dedizierte Owner-APIs.
- Es gibt keine Übernahme einer Tenant-Session und keine Nutzung von `/dashboard` im Tenant-Kontext.
- Der Admin-Wechsel braucht einen atomaren Backend-Schritt, damit Rechtewechsel und Benutzerzuordnung konsistent bleiben.

### Tech-Entscheidungen

| Entscheidung | Warum das für dieses Projekt passt |
|---|---|
| Detailseite unter `/owner/tenants/[id]` | Baut direkt auf PROJ-8 auf und ergänzt die bestehende Owner-Navigation statt einen neuen Bereich einzuführen |
| Tabs statt mehrere Unterseiten | Owner können Stammdaten, Kontakt und Admin-Kontext an einem Ort pflegen |
| Erweiterung der vorhandenen PATCH-Route | Hält die API kompakt und kompatibel mit dem bereits existierenden Status-Update |
| Separater Endpoint für Admin-Wechsel | Trennt einfachen Formular-Content von einem risikoreicheren Rollenwechsel |
| Atomarer Backend-Flow für Admin-Wechsel | Verhindert Zwischenzustände wie "neuer Admin gesetzt, alter Admin aber noch nicht zurückgestuft" |
| Wiederverwendung der bestehenden Mail-Infrastruktur | Senkt Implementierungsaufwand und hält Einladungs-/Setup-Mails konsistent zu PROJ-4 und PROJ-7 |

### Abhängigkeiten

Keine neuen Pakete erforderlich. Die bestehende Basis reicht aus:
- `react-hook-form` und `zod` für Formulare und Inline-Validierung
- vorhandene shadcn/ui-Bausteine für Tabs, Formulare, Hinweise, Karten und Toasts

## QA Test Results

**Tested:** 2026-03-27
**App URL:** http://localhost:3000
**Tester:** QA Engineer (AI)

### Test Scope

Geprueft wurden Code-Review, API-/Flow-Validierung und ein erfolgreicher Produktions-Build. Ein echter Browser-Durchlauf fuer Chrome, Firefox, Safari sowie Responsive-Checks auf 375px / 768px / 1440px konnte in dieser Session nicht ausgefuehrt werden.

### Acceptance Criteria Status

#### AC-1: Klick auf einen Agentur-Namen navigiert zur Detailseite
- [x] Tenant-Namen in den Owner-Tabellen verlinken auf `/owner/tenants/[id]`.

#### AC-2: Detailseite zeigt alle aktuellen Daten der Agentur
- [x] API liefert Name, Slug, Status, Erstelldatum sowie Billing-/Kontaktfelder.
- [x] API liefert aktuellen Admin fuer die Anzeige im UI.
- [x] Unbekannte Tenant-IDs werden jetzt serverseitig auf eine echte 404-Seite geleitet.

#### AC-3: Owner kann Agentur-Name bearbeiten
- [x] Pflichtfeld mit Mindestlaenge ist in Frontend und Backend validiert.

#### AC-4: Owner kann Subdomain-Slug bearbeiten
- [x] Format- und Reserved-Slug-Validierung wird wiederverwendet.
- [x] Duplicate-Slug wird serverseitig mit `409` beantwortet.

#### AC-5: Warnung bei Subdomain-Aenderung
- [x] Warnhinweis wird angezeigt, sobald der Slug vom Originalwert abweicht.

#### AC-6: Rechnungsadresse speichern
- [x] Alle geforderten Felder sind vorhanden.
- [x] Billing-Validierung verhindert Zusatzfelder ohne Firmenname.

#### AC-7: Kontaktdaten speichern
- [x] Ansprechpartner, Telefon und Website sind vorhanden.
- [x] Website wird server- und clientseitig validiert.

#### AC-8: Neuer Admin-User kann angelegt werden
- [x] Neuer User kann fuer unbekannte E-Mail angelegt werden.
- [x] Rollenwechsel laeuft ueber separaten Owner-Endpoint.
- [x] Bestehende aktive Mitglieder werden nur hochgestuft und nicht mehr durch einen unnoetigen Setup-/Recovery-Flow geschickt.

#### AC-9: Bisheriger Admin bleibt erhalten und wird zu Member
- [x] Der Rollenwechsel wird im RPC atomar als Admin-zu-Member-Umschaltung modelliert.

#### AC-10: Inline-Validierung via Zod + react-hook-form
- [x] Frontend-Formulare sind mit `react-hook-form` und Zod aufgebaut.
- [x] API-Fehler koennen auf Feldniveau zurueck ins Formular gespielt werden.

#### AC-11: Erfolgreiche Speicherungen zeigen Toast-Bestaetigung
- [x] Globaler Toaster ist eingebunden.
- [x] Speichern und Admin-Zuweisung triggern Toasts im UI.

#### AC-12: Fehler werden als Inline-Fehler angezeigt
- [x] API liefert `details` fuer Feldfehler.
- [x] Slug-Konflikte und Validierungsfehler bleiben im Formular sichtbar.

### Edge Cases Status

#### EC-1: Subdomain bereits vergeben
- [x] Server liefert `409` mit passender Fehlermeldung.

#### EC-2: Reservierte Subdomain
- [x] Frontend- und Backend-Validierung blockieren reservierte Slugs.

#### EC-3: Neuer Admin existiert bereits in anderem Tenant
- [x] Endpoint blockiert diesen Fall mit `409`.

#### EC-4: Neuer Admin ist bereits Member dieses Tenants
- [x] Bereits vorhandene Mitglieder werden ohne zusaetzlichen Welcome-/Recovery-Flow hochgestuft.

#### EC-5: Bisheriger Admin bleibt als Member bestehen
- [x] RPC stuft vorherige Admins auf `member` zurueck.

#### EC-6: Agentur-ID existiert nicht
- [x] Route rendert jetzt eine echte 404-Seite.

#### EC-7: Inaktiver Tenant bleibt bearbeitbar
- [x] API schreibt unabhaengig vom Tenant-Status.

#### EC-8: Leere optionale Formulare
- [x] Billing- und Kontaktfelder koennen leer gespeichert werden, solange die Pflichtlogik eingehalten wird.

### Security Audit Results
- [x] Owner-APIs sind ueber `requireOwner()` abgesichert.
- [x] Detailansicht bleibt im Owner-Kontext und fuehrt keine Tenant-Impersonation ein.
- [x] Slug-Validierung reduziert offensichtliche Input-Missbraeuche.
- [ ] Nicht vollstaendig verifiziert: Rate Limiting und echte Browser-Netzwerkpruefung wurden in dieser Session nicht ausgefuehrt.

### Bugs Found
- Keine offenen funktionalen Bugs aus dem letzten QA-Lauf.

### Summary
- **Acceptance Criteria:** 12/12 bestanden
- **Bugs Found:** 0 offen
- **Security:** Grundlegend in Ordnung, aber ohne vollstaendigen Browser-/Rate-Limit-Test
- **Production Ready:** YES
- **Recommendation:** Bereit fuer den naechsten Schritt `/deploy`, sofern die Migration angewendet wurde und du noch einen echten Browser-Smoke-Test machen willst.

## Deployment
_To be added by /deploy_
