# PROJ-5: Password Reset Flow

## Status: Deployed
**Created:** 2026-03-26
**Last Updated:** 2026-03-27

## Dependencies
- Requires: PROJ-3 (User Authentication) — User-Kontext und Session-Handling
- Requires: PROJ-4 (Transactional Email) — Reset-E-Mail versenden

## User Stories
- Als User möchte ich auf der Login-Seite "Passwort vergessen" klicken und meine E-Mail eingeben können.
- Als User möchte ich eine E-Mail mit einem sicheren Reset-Link erhalten, über den ich mein Passwort neu setzen kann.
- Als User möchte ich nach dem erfolgreichen Passwort-Reset automatisch eingeloggt und auf mein Dashboard weitergeleitet werden.
- Als System möchte ich sicherstellen, dass ein Reset-Token nur einmal verwendet werden kann.
- Als System möchte ich abgelaufene oder bereits verwendete Reset-Tokens ablehnen.

## Acceptance Criteria
- [ ] "Passwort vergessen"-Link auf der Login-Seite sichtbar
- [ ] Formular: Eingabe der E-Mail-Adresse, Submit-Button
- [ ] Bei Submit: E-Mail wird gesendet WENN User im aktuellen Tenant existiert
- [ ] Bei Submit: Immer gleiche Success-Message (auch wenn E-Mail nicht existiert — kein User-Enumeration)
- [ ] Reset-Token: kryptografisch zufällig, einmalig, 1 Stunde gültig
- [ ] Reset-Link enthält Token und Tenant-Subdomain: `agentur-x.boost-hive.de/reset-password?token=...`
- [ ] Reset-Seite: Formular für neues Passwort + Bestätigung
- [ ] Passwort-Validierung: min. 8 Zeichen, Bestätigungsfeld muss übereinstimmen
- [ ] Nach erfolgreichem Reset: Token invalidiert, User eingeloggt, Redirect auf Dashboard
- [ ] Abgelaufener/ungültiger Token → Fehlermeldung mit Link zurück zu "Passwort vergessen"

## Edge Cases
- User fordert mehrfach Reset an → Letzter Token invalidiert alle vorherigen
- Reset-Link wird in neuem Browser-Tab geöffnet → Funktioniert unabhängig von vorheriger Session
- User ist schon eingeloggt und ruft Reset-Link auf → Token trotzdem verarbeiten, Session erneuern
- Reset-Link nach 1 Stunde → "Link abgelaufen" mit Möglichkeit, neuen anzufordern
- Falscher Tenant im Reset-Link (Token für Tenant A, aber Aufruf auf Tenant B) → Ablehnen

## Technical Requirements
- Security: Token wird gehasht in DB gespeichert (nicht Plaintext)
- Security: Kein Hinweis ob E-Mail existiert (Anti-Enumeration)
- Security: HTTPS-only für Reset-Links in Produktion

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

### Überblick
Diese Funktion ergänzt den bestehenden Login-Prozess um einen sicheren Self-Service-Weg zum Zurücksetzen des Passworts. Der Ablauf startet auf der Tenant-Login-Seite, versendet eine Reset-E-Mail über den bereits geplanten Transaktions-E-Mail-Service und endet auf einer separaten Reset-Seite, auf der das neue Passwort gesetzt wird.

Da der Link tenant-spezifisch sein muss und Tokens nur einmal genutzt werden dürfen, braucht PROJ-5 sowohl neue UI-Bausteine als auch einen kleinen Backend-Ablauf zur Token-Verwaltung und Session-Erneuerung.

### Komponentenstruktur

```text
Tenant Login Page
+-- Existing Login Form
|   +-- "Passwort vergessen?" Link

Forgot Password Page
+-- Page Header
+-- Short Explanation Text
+-- Email Input Form
+-- Submit Button
+-- Generic Success Message

Password Reset Page
+-- Token Validation State
|   +-- Valid Token -> Reset Form
|   +-- Invalid/Expired Token -> Error State
+-- New Password Input
+-- Confirm Password Input
+-- Submit Button
+-- Link back to Forgot Password flow

Backend Services
+-- Reset Request Endpoint
+-- Reset Completion Endpoint
+-- Password Reset Email Sender
+-- Token Store / Invalidation Logic
```

### Datenmodell

Zusätzlich zur bestehenden User- und Tenant-Struktur braucht diese Funktion einen Datensatz für Passwort-Reset-Anfragen.

Jeder Reset-Datensatz enthält:
- Eine eindeutige ID
- Die Referenz auf den betroffenen User
- Die Referenz auf den Tenant
- Einen gehashten Reset-Token
- Ein Ablaufdatum (1 Stunde)
- Einen Status für "aktiv", "verwendet" oder "ungültig"
- Zeitstempel für Erstellung und Verwendung

Wichtige Regel:
- Pro User und Tenant darf immer nur der neueste aktive Reset gelten. Eine neue Anfrage entwertet alle älteren offenen Tokens.

### Nutzerfluss

1. Der User klickt auf "Passwort vergessen?" auf seiner Tenant-Login-Seite.
2. Er gibt seine E-Mail-Adresse ein.
3. Das System zeigt immer dieselbe neutrale Erfolgsnachricht, unabhängig davon, ob ein Konto existiert.
4. Wenn ein passender User im aktuellen Tenant existiert, erstellt das Backend einen neuen Reset-Datensatz und verschickt eine E-Mail mit tenant-spezifischem Link.
5. Der User öffnet den Link und landet auf der Reset-Seite seines Tenants.
6. Das System prüft, ob Token, Tenant und Gültigkeitszeit zusammenpassen.
7. Der User vergibt ein neues Passwort und bestätigt es.
8. Nach Erfolg wird das Token sofort entwertet, die Session neu aufgebaut und der User auf sein Dashboard weitergeleitet.

### Tenant-Verhalten

- Der Reset-Link bleibt immer an die Tenant-Subdomain gebunden.
- Ein Token ist nur auf genau dem Tenant gültig, auf dem es erzeugt wurde.
- Dadurch bleibt die bereits vorhandene Tenant-Isolation aus PROJ-1 und PROJ-3 auch im Recovery-Fall erhalten.

### Tech-Entscheidungen

| Entscheidung | Gewählt | Warum |
|---|---|---|
| Einstiegspunkt | Link direkt auf der bestehenden Login-Seite | Erwartbares Muster, keine zusätzliche Navigation nötig |
| Reset-Speicherung | Serverseitiger Token-Datensatz mit Hash | Verhindert Missbrauch bei Datenleck, weil kein Klartext-Token gespeichert wird |
| Erfolgsmeldung | Immer gleiche Antwort bei Anforderung | Verhindert User-Enumeration |
| Tenant-Bindung | Token wird mit Tenant verknüpft | Schützt vor Cross-Tenant-Reset und falschen Subdomains |
| Login nach Reset | Automatische Session-Erneuerung | Entspricht dem gewünschten nahtlosen Nutzererlebnis |
| Fehlerzustände | Eigene UI für abgelaufen/ungültig | Macht Probleme verständlich und führt den User zurück in den Flow |

### Betroffene Bereiche

- Bestehende Login-Seite bekommt den zusätzlichen Link "Passwort vergessen?"
- Neue Seite für Reset-Anforderung im Tenant-Kontext
- Neue Seite für Passwort-Neuvergabe im Tenant-Kontext
- Neue Backend-Endpunkte für Anfordern und Abschließen des Resets
- Anbindung an den E-Mail-Service aus PROJ-4
- Erweiterung des Session-Flows aus PROJ-3 für automatisches Einloggen nach erfolgreichem Reset

### Abhängigkeiten

Keine neue Produkt- oder UI-Bibliothek zwingend erforderlich.

Voraussichtlich genutzt werden nur bereits vorhandene Bausteine plus:
- Bestehende Formular- und Input-Komponenten aus dem aktuellen Frontend
- Bereits geplanter Mail-Service aus PROJ-4 für `sendPasswordReset`
- Bestehende Auth- und Session-Infrastruktur aus PROJ-3

### Offene Betriebsregeln

- Mehrfache Anfragen in kurzer Zeit sollen nur den neuesten Link gültig lassen.
- Ein abgelaufener oder bereits genutzter Link soll keinen technischen Fehler zeigen, sondern eine verständliche Rückführung zur Anforderungsseite.
- Der Versand der Reset-Mail darf die Benutzeroberfläche nicht unnötig blockieren.
- In Produktion dürfen Reset-Links nur auf HTTPS-Ziele zeigen.

## QA Test Results
### QA Run
- Date: 2026-03-27
- Scope: Re-run after bug fixes, code review, reset-flow review, build verification
- Constraints: Kein echter Browser-/Supabase-End-to-End-Test in dieser Session; Bewertung basiert auf Codepfaden, Specs und lokalem Build

### Acceptance Criteria Review
- PASS: "Passwort vergessen?"-Link ist auf der Login-Seite sichtbar
- PASS: Formular fuer E-Mail + Submit-Button ist vorhanden
- PASS: Bei bestehendem User im aktuellen Tenant wird serverseitig ein Reset-Datensatz erstellt und ein Mailversand angestossen
- PASS: Die Rueckmeldung bei der Anforderung ist immer generisch und leakt keine User-Existenz
- PASS: Reset-Token werden kryptografisch zufaellig erzeugt, gehasht gespeichert und auf 1 Stunde TTL gesetzt
- PASS: Reset-Link nutzt Tenant-Subdomain und Token-Query-Param
- PASS: Reset-Seite mit Passwort- und Bestaetigungsfeld ist vorhanden
- PASS: Passwort-Validierung mit min. 8 Zeichen und Matching-Bestaetigung ist implementiert
- PASS: Nach erfolgreichem Reset nutzt das Frontend den Redirect des Backends und leitet auf `/dashboard`
- PASS: Ungueltige oder abgelaufene Tokens werden serverseitig abgelehnt und im UI mit Rueckweg zur Forgot-Password-Seite dargestellt

### Findings
- No blocking defects found in the current implementation.

### Additional Notes
- `npm run build` war erfolgreich.
- `npm run lint` ist weiterhin projektweit defekt und konnte fuer diese QA nicht als Signal genutzt werden.

### Production Readiness
- Decision: READY
- Reason: Keine Critical- oder High-Bugs offen; verbleibend nur Testing-Gap beim echten Browser-/Supabase-End-to-End-Test sowie die separate Lint-Fehlkonfiguration ausserhalb des Features

## Deployment

### Deployed: 2026-03-27
### Commit: `4156417`
### Production URL: `https://boost-hive.de`

### Notes
- Deploy erfolgte zusammen mit PROJ-4.
- Produktive Funktion braucht die zugehoerigen Mail- und Supabase-Umgebungsvariablen.
