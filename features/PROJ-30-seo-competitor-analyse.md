# PROJ-30: SEO Competitor Analyse

## Status: In Review
**Created:** 2026-03-30
**Last Updated:** 2026-03-31

## Dependencies
- Requires: PROJ-10 (SEO Analyse Tool) — bestehende Analyse-Engine wird wiederverwendet
- Requires: PROJ-9 (Tenant Dashboard Shell) — UI-Rahmen
- Requires: PROJ-6 (Role-Based Access Control) — Member/Admin-Zugriff
- Requires: PROJ-15 (Modul-Buchung) — Modul muss gebucht sein

## User Stories
- Als Member möchte ich meine eigene URL und bis zu 3 Konkurrenz-URLs gleichzeitig analysieren lassen, damit ich direkte Vergleichswerte habe.
- Als Member möchte ich eine Side-by-Side-Tabelle sehen, die zeigt wo Wettbewerber besser abschneiden als ich.
- Als Member möchte ich eine automatische Lückenanalyse erhalten, die mir die wichtigsten Verbesserungspotenziale gegenüber dem besten Wettbewerber aufzeigt.
- Als Member möchte ich eine Vergleichsanalyse speichern und später erneut aufrufen können.
- Als Admin möchte ich alle Vergleichsanalysen meines Tenants im Verlauf einsehen.

## Acceptance Criteria
- [ ] Eingabe: 1 eigene URL (Pflicht) + 1–3 Wettbewerber-URLs (mind. 1 Pflicht)
- [ ] Alle URLs werden mit der bestehenden SEO-Analyse-Engine analysiert (kein separater Crawler)
- [ ] Ergebnis: Side-by-Side-Vergleichstabelle mit folgenden Metriken pro URL:
  - Title-Tag (Länge, Keyword-Präsenz)
  - Meta-Description (Länge, Vorhanden/Fehlend)
  - H1-Count und Inhalt
  - Score (0–100)
  - Wortanzahl
  - Alt-Text-Abdeckung (%)
  - Interne Links / Externe Links
  - Canonical vorhanden (ja/nein)
  - Open Graph Tags (ja/nein)
  - Schema.org Markup (ja/nein)
- [ ] Jede Metrik zeigt visuell an, ob die eigene URL besser / gleich / schlechter als jeder Wettbewerber ist (Grün / Gelb / Rot)
- [ ] Lückenanalyse: Automatisch generierte Liste der Top-5-Punkte wo die eigene URL schlechter als der beste Wettbewerber ist, mit konkreter Handlungsempfehlung
- [ ] Gesamtsieger-Anzeige: Welche URL hat den höchsten SEO-Score
- [ ] Vergleich wird als eigener Analyse-Typ in der DB gespeichert (Tenant-isoliert)
- [ ] Vergleichsanalysen erscheinen in einem eigenen Verlauf "Vergleiche" (getrennt von Einzel-Analysen)
- [ ] Analyse-Laufzeit: Alle URLs werden parallel analysiert (nicht sequenziell)

## Edge Cases
- Eine der Wettbewerber-URLs ist nicht erreichbar → Diese URL wird mit Score 0 und Fehlerstatus angezeigt, Analyse der anderen läuft weiter
- Eigene URL und Wettbewerber-URL identisch → Validierungsfehler "Duplikat-URL"
- Alle URLs nicht erreichbar → Fehlermeldung, Analyse wird nicht gespeichert
- Analyse-Dauer > 30s (viele Seiten) → Loading-Indicator mit URL-by-URL-Fortschritt
- URL hinter Login / Paywall → Hinweis "Seite nicht öffentlich zugänglich", Score 0 für diese URL
- Sehr große Seite (> 2 MB HTML) → URL analysieren aber mit Hinweis "Seite sehr groß — Ergebnisse möglicherweise unvollständig"

## Technical Requirements
- Wiederverwendung der bestehenden SEO-Analyse-Logik aus `/lib/seo-analysis` — kein Duplizieren
- Parallele Analyse aller URLs via `Promise.all`
- Neuer Analyse-Typ `comparison` in der `seo_analyses`-Tabelle (oder separate Tabelle — entscheidung in /architecture)
- Neue API-Route: `POST /api/tenant/seo/compare` — nimmt `{ ownUrl, competitorUrls[] }` entgegen
- Ergebnisse mit `tenant_id` gespeichert (RLS)
- Modul-Zugriffsprüfung: selbes Modul wie PROJ-10 (`seo_analysis`) oder eigenes Modul (entscheidung in /architecture)

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

### Komponenten-Struktur

```
SEO Workspace (bestehend — neue Tab wird hinzugefügt)
+-- Tab "Analyse" (bestehend, unverändert)
+-- Tab "Vergleich" (neu)
    +-- CompareForm
    |   +-- OwnUrlInput (Pflichtfeld, eigene URL)
    |   +-- CompetitorUrlList (1–3 Felder, dynamisch — "+ Wettbewerber hinzufügen")
    |   +-- AnalyzeButton
    +-- CompareResultView (erscheint nach Analyse)
    |   +-- WinnerBadge ("Beste URL: example.com — Score 84")
    |   +-- ComparisonTable (Side-by-Side, 1 Spalte pro URL)
    |   |   +-- MetricRow × 10 (Grün/Gelb/Rot je nach Rang)
    |   |       Metriken: Score, Title, Meta-Description, H1,
    |   |       Wortanzahl, Alt-Text %, Int. Links, Ext. Links,
    |   |       Canonical, OG Tags, Schema.org
    |   +-- GapAnalysis (Top-5 Lücken mit konkreter Empfehlung)
    |   +-- SaveButton / bereits gespeichert Hinweis
    +-- CompareHistoryList (bisherige Vergleiche des Tenants)
        +-- CompareHistoryRow (eigene URL, Datum, Anzahl Wettbewerber)
            → Klick öffnet CompareResultView im Lesemodus
```

### Datenmodell

**Neue Tabelle: `seo_comparisons`**

Gespeichert werden:
- ID, Tenant-ID (RLS), Customer-ID (optional)
- Eigene URL
- Wettbewerber-URLs (Liste mit 1–3 Einträgen)
- Analyse-Ergebnisse (alle URLs vollständig als JSON gespeichert)
- Erstellt von (User-ID), Erstellungsdatum

> Entscheidung: **Separate Tabelle** statt Erweiterung der bestehenden `seo_analyses` — vermeidet Bruch der bestehenden Queries und hält die Datenmodelle sauber getrennt.

**Keine Status-Spalte nötig:** Die Analyse läuft synchron (alle URLs parallel, sofortiges Ergebnis) — kein Pending/Running/Done-Workflow erforderlich.

### API-Routen (neu)

```
POST /api/tenant/seo/compare       → Analyse starten + speichern, Ergebnis sofort zurück
GET  /api/tenant/seo/compare       → Liste aller Vergleichsanalysen des Tenants
GET  /api/tenant/seo/compare/[id]  → Einzelner Vergleich (für Verlauf-Ansicht)
DELETE /api/tenant/seo/compare/[id] → Vergleich löschen
```

### Ablauf einer Analyse

```
Browser
  ↓ POST /api/tenant/seo/compare { ownUrl, competitorUrls[] }
Next.js API Route
  ↓ Alle URLs gleichzeitig mit bestehender seo-analysis-Engine analysieren
    (Promise.all — parallele Verarbeitung, kein separater Worker)
  ↓ Ergebnis in seo_comparisons speichern
  ↑ Vollständiges Ergebnis sofort zurückgeben
Browser
  ↑ Zeigt CompareResultView ohne Polling
```

### Tech-Entscheidungen

| Entscheidung | Warum |
|---|---|
| Synchron (kein Worker) | Analyse dauert 5–15s, passt in einen API-Request (maxDuration = 300 bereits gesetzt) — kein Mehraufwand durch Worker-Infrastruktur |
| Bestehende seo-analysis-Lib | Kein Duplizieren von Crawler-Logik — DRY-Prinzip |
| Gleiches Modul `seo_analyse` | Feature ist eine Erweiterung des SEO-Tools, kein eigenständiges Modul — kein Extra-Buchungsaufwand für Tenants |
| Separate Tabelle | Verhindert, dass bestehende Einzel-Analyse-Queries durch neuen `type`-Filter überall angepasst werden müssen |
| Grün/Gelb/Rot-Vergleich | Jede Metrik wird relativ zum besten Wettbewerber bewertet (nicht absolut), damit der Nutzer sofort sieht wo er zurückliegt |

### Abhängigkeiten (neue Packages)

Keine — bestehende Infrastruktur wird vollständig wiederverwendet.

## QA Test Results

**Tested:** 2026-03-31
**App URL:** http://localhost:3000
**Tester:** QA Engineer (AI)

### Acceptance Criteria Status

#### AC-1: Eingabe: 1 eigene URL (Pflicht) + 1-3 Wettbewerber-URLs (mind. 1 Pflicht)
- [x] Eigene URL ist Pflichtfeld -- client-side Validierung in `handleSubmit` prueft `trimmedOwn`
- [x] Mindestens 1 Wettbewerber-URL ist Pflichtfeld -- server validiert `rawCompetitors.length === 0`
- [x] Maximal 3 Wettbewerber-URLs erlaubt -- server validiert `rawCompetitors.length > 3`
- [x] UI erlaubt dynamisches Hinzufuegen/Entfernen von Wettbewerber-Feldern (1-3)
- [x] "+ Wettbewerber hinzufuegen" Button verschwindet bei 3 Feldern
- **PASS**

#### AC-2: Alle URLs werden mit bestehender SEO-Analyse-Engine analysiert
- [x] `analyzeSingleUrl` nutzt `fetchPage` und `buildPageAnalysis` aus `@/lib/seo-analysis`
- [x] Kein separater Crawler implementiert -- DRY-Prinzip eingehalten
- **PASS**

#### AC-3: Side-by-Side-Vergleichstabelle mit allen geforderten Metriken
- [x] Title-Tag (Laenge angezeigt)
- [ ] BUG: Title-Tag "Keyword-Praesenz" wird nicht angezeigt -- nur Zeichenlaenge wird gezeigt (siehe BUG-1)
- [x] Meta-Description (Laenge, Vorhanden/Fehlend)
- [x] H1-Count und Inhalt (Anzahl + erster H1-Text abgekuerzt)
- [x] Score (0-100)
- [x] Wortanzahl
- [x] Alt-Text-Abdeckung (%)
- [x] Interne Links
- [x] Externe Links
- [x] Canonical (Ja/Nein)
- [x] Open Graph Tags (Ja/Nein)
- [x] Schema.org Markup (Ja/Nein)
- **PARTIAL PASS** (Keyword-Praesenz fehlt)

#### AC-4: Visuelle Anzeige besser/gleich/schlechter (Gruen/Gelb/Rot)
- [x] `rankValues` und `rankBooleans` Funktionen berechnen Raenge korrekt
- [x] Gruen (best), Gelb/Amber (middle), Rot (worst) Farbcodierung vorhanden
- [x] Tied-best fuer gleiche Werte (neutral Grau)
- [x] `RankIcon` zeigt CheckCircle/XCircle/MinusCircle passend
- [ ] BUG: Externe Links werden nie gerankt -- `getRank` gibt immer `'tied-best'` zurueck (siehe BUG-2)
- **PARTIAL PASS**

#### AC-5: Lueckenanalyse (Top-5 Punkte mit Handlungsempfehlung)
- [x] `computeGapAnalysis` generiert automatisch Luecken fuer: Score, Title, Meta, H1, Wortanzahl, Alt-Text, OG Tags, Schema.org, Canonical
- [x] Maximal 5 Luecken via `.slice(0, 5)`
- [x] Jede Luecke zeigt eigenen Wert, besten Wettbewerber-Wert und konkrete Empfehlung
- [x] Bei keinen Luecken: positive Nachricht "Keine kritischen Luecken gefunden"
- **PASS**

#### AC-6: Gesamtsieger-Anzeige
- [x] `winnerIdx` berechnet URL mit hoechstem Score
- [x] Winner-Badge zeigt Hostname und Score an
- **PASS**

#### AC-7: Vergleich wird als eigener Analyse-Typ in DB gespeichert (Tenant-isoliert)
- [x] Separate Tabelle `seo_comparisons` mit `tenant_id` FK
- [x] RLS aktiviert mit Policy fuer SELECT basierend auf `tenant_members`
- [x] INSERT/UPDATE/DELETE Policies blockiert (nur via Admin-Client)
- [x] API nutzt `createAdminClient()` fuer DB-Zugriff
- [x] API filtert immer nach `.eq('tenant_id', tenantId)`
- **PASS**

#### AC-8: Eigener Verlauf "Vergleiche" (getrennt von Einzel-Analysen)
- [x] Separate `seo_comparisons` Tabelle -- getrennt von `seo_analyses`
- [x] GET `/api/tenant/seo/compare` liefert eigene Verlaufsliste
- [x] UI zeigt `CompareHistoryList` mit Click-to-open Funktion
- [x] Tab "Vergleich" getrennt von Tab "Analyse" in der Workspace
- **PASS**

#### AC-9: Parallele Analyse aller URLs
- [x] `Promise.all(allUrls.map(analyzeSingleUrl))` -- parallele Ausfuehrung
- **PASS**

### Edge Cases Status

#### EC-1: Wettbewerber-URL nicht erreichbar
- [x] `analyzeSingleUrl` gibt Score 0 und Error-String zurueck bei fehlgeschlagener Verbindung
- [x] Analyse der anderen URLs laeuft weiter (Promise.all mit individueller Fehlerbehandlung)
- [x] Ergebnis wird trotzdem gespeichert (nur wenn nicht ALLE fehlschlagen)
- **PASS**

#### EC-2: Duplikat-URL (eigene = Wettbewerber)
- [x] Server prueft via `uniqueUrls.size !== allUrls.length` und gibt Fehler 400 zurueck
- [x] Fehlermeldung: "Duplikat-URL erkannt. Bitte unterschiedliche URLs verwenden."
- **PASS**

#### EC-3: Alle URLs nicht erreichbar
- [x] `allErrors` Check: `pageResults.every((p) => p.error)`
- [x] Fehlermeldung 422: "Keine der URLs konnte erreicht werden. Analyse wird nicht gespeichert."
- **PASS**

#### EC-4: Analyse-Dauer > 30s -- Loading-Indicator mit URL-by-URL-Fortschritt
- [ ] BUG: Loading-Indicator zeigt keinen URL-by-URL-Fortschritt -- nur eine generische Spinner-Animation mit Text "Alle URLs werden parallel analysiert" (siehe BUG-3)
- **FAIL**

#### EC-5: URL hinter Login/Paywall
- [x] `fetchPage` gibt HTTP-Status-Fehler zurueck (z.B. 403 "Zugriff verweigert")
- [ ] BUG: Kein spezifischer Hinweis "Seite nicht oeffentlich zugaenglich" -- stattdessen generische HTTP-Fehlermeldung (siehe BUG-4)
- **PARTIAL PASS**

#### EC-6: Sehr grosse Seite (> 2 MB HTML)
- [ ] BUG: Keine Pruefung auf HTML-Groesse und kein Hinweis "Seite sehr gross" implementiert (siehe BUG-5)
- **FAIL**

### Security Audit Results

#### Authentication & Authorization
- [x] `requireTenantUser(tenantId)` wird in allen Endpunkten aufgerufen (POST, GET, GET [id], DELETE)
- [x] `requireTenantModuleAccess(tenantId, 'seo_analyse')` wird in allen Endpunkten geprueft
- [x] Tenant-Isolation: Alle DB-Queries filtern nach `tenant_id`
- [x] RLS auf `seo_comparisons` aktiviert -- SELECT nur fuer aktive Tenant-Mitglieder
- [x] INSERT/UPDATE/DELETE via RLS blockiert (nur Admin-Client)

#### Input Validation
- [x] `normalizeInputUrl` sanitisiert URLs und erzwingt http/https Protokoll
- [ ] BUG-SECURITY: Keine Zod-Validierung auf Server-Seite -- `request.json()` wird ohne Schema-Validierung geparst. Projektregeln verlangen "Validate ALL user input on the server side with Zod" (siehe BUG-6)
- [ ] BUG-SECURITY: Keine SSRF-Protection -- `fetchPage` akzeptiert beliebige URLs inkl. interner Netzwerk-Adressen (localhost, 127.0.0.1, 169.254.x.x, 10.x.x.x, 192.168.x.x, 172.16-31.x.x, file://, etc.). Ein Angreifer kann den Server dazu bringen, interne Dienste zu scannen (siehe BUG-7)
- [ ] BUG-SECURITY: Kein UUID-Format-Check auf dem `[id]` Parameter in GET/DELETE /api/tenant/seo/compare/[id] -- beliebige Strings werden an die DB weitergegeben (siehe BUG-8)

#### Rate Limiting
- [ ] BUG-SECURITY: Kein Rate-Limiting auf POST /api/tenant/seo/compare -- ein Angreifer kann unbegrenzt teure Analyse-Requests ausloesen, was zu hohem Ressourcenverbrauch fuehrt (outbound HTTP-Anfragen) (siehe BUG-9)

#### Data Exposure
- [x] API-Responses enthalten keine sensiblen Daten (nur Analyse-Ergebnisse)
- [x] `created_by` User-ID wird nicht in GET-Responses zurueckgegeben
- [x] Keine Secrets in Frontend-Code

#### DELETE-Endpoint
- [x] DELETE filtert korrekt nach `tenant_id` -- Cross-Tenant-Loeschung nicht moeglich
- [ ] BUG: DELETE gibt `{ success: true }` auch zurueck wenn die ID nicht existiert (kein "not found" Check) -- nicht sicherheitsrelevant, aber inkonsistentes API-Verhalten (siehe BUG-10)

### Cross-Browser Testing
- Statische Code-Analyse: Keine browser-spezifischen APIs verwendet. Standard React + Tailwind CSS.
- [x] Keine CSS-Features die inkompatibel waeren (Flexbox, Grid, overflow-x-auto alle breit unterstuetzt)
- [x] `toLocaleString('de-DE')` fuer Datumsformatierung -- funktioniert in allen modernen Browsern

### Responsive Testing
- [x] Desktop (1440px): Tabelle mit overflow-x-auto falls noetig
- [ ] BUG: Mobile (375px): Side-by-Side-Tabelle mit 4 Spalten (Metrik + eigene + 3 Wettbewerber) ist auf 375px Breite extrem eng -- `max-w-[130px]` auf Hostnamen fuehrt zu abgeschnittenen Werten, und die Metrik-Spalte hat nur `w-36` (siehe BUG-11)
- [x] Tablet (768px): Akzeptabel mit horizontalem Scroll

### Bugs Found

#### BUG-1: Title-Tag "Keyword-Praesenz" fehlt in Vergleichstabelle
- **Severity:** Low
- **Steps to Reproduce:**
  1. Starte einen Vergleich mit zwei URLs
  2. Sieh dir die Title-Tag Zeile in der Vergleichstabelle an
  3. Erwartet: Anzeige von Laenge UND Keyword-Praesenz
  4. Tatsaechlich: Nur Zeichenlaenge wird angezeigt (z.B. "45 Z.")
- **Priority:** Nice to have -- Keyword-Praesenz war in den AC spezifiziert, ist aber ohne Kontext (welches Keyword?) schwierig umzusetzen

#### BUG-2: Externe Links werden nie gerankt
- **Severity:** Low
- **Steps to Reproduce:**
  1. Starte einen Vergleich wo URLs unterschiedlich viele externe Links haben
  2. Sieh dir die "Externe Links" Zeile in der Tabelle an
  3. Erwartet: Farbcodierung basierend auf Anzahl (mehr = besser oder schlechter)
  4. Tatsaechlich: Alle Zellen sind immer neutral-grau (tied-best) -- Code: `getRank: (i) => 'tied-best'`
- **Priority:** Nice to have -- bewusste Entscheidung? Mehr externe Links sind nicht zwangslaeufig besser

#### BUG-3: Loading-Indicator zeigt keinen URL-by-URL-Fortschritt
- **Severity:** Low
- **Steps to Reproduce:**
  1. Starte einen Vergleich mit 4 URLs
  2. Beobachte den Loading-Screen
  3. Erwartet: Fortschrittsanzeige pro URL (welche schon fertig sind)
  4. Tatsaechlich: Nur generischer Spinner mit "Alle URLs werden parallel analysiert"
- **Note:** Da die Analyse synchron in einem einzigen Request laeuft (Promise.all), ist URL-by-URL-Fortschritt ohne Streaming/Polling nicht moeglich. Entweder AC anpassen oder auf Server-Sent Events umstellen.
- **Priority:** Nice to have

#### BUG-4: Kein spezifischer Hinweis "Seite nicht oeffentlich zugaenglich" fuer Paywall-URLs
- **Severity:** Low
- **Steps to Reproduce:**
  1. Gib eine URL ein die hinter einem Login liegt (HTTP 403)
  2. Erwartet: Hinweis "Seite nicht oeffentlich zugaenglich"
  3. Tatsaechlich: Generische Meldung "Zugriff verweigert (403)"
- **Priority:** Nice to have

#### BUG-5: Keine Pruefung auf HTML-Groesse (> 2 MB)
- **Severity:** Low
- **Steps to Reproduce:**
  1. Analysiere eine Seite mit sehr grossem HTML (> 2 MB)
  2. Erwartet: Hinweis "Seite sehr gross -- Ergebnisse moeglicherweise unvollstaendig"
  3. Tatsaechlich: Kein Hinweis, Analyse laeuft ohne Warnung
- **Priority:** Nice to have

#### BUG-6: Keine Zod-Validierung auf Server-Seite
- **Severity:** Medium
- **Steps to Reproduce:**
  1. Sende einen POST an /api/tenant/seo/compare mit unerwarteten Feldern oder falsch typisierten Werten
  2. Erwartet: Zod-Schema lehnt ungueltige Payloads ab
  3. Tatsaechlich: `request.json()` wird direkt geparst, nur manuelle Checks auf `ownUrl` und `competitorUrls`
- **Note:** Verletzt die Projektregel in `.claude/rules/security.md`: "Validate ALL user input on the server side with Zod"
- **Priority:** Fix before deployment

#### BUG-7: SSRF-Vulnerability -- Keine Blockierung interner Netzwerk-Adressen
- **Severity:** Critical
- **Steps to Reproduce:**
  1. Sende POST an /api/tenant/seo/compare mit `ownUrl: "http://169.254.169.254/latest/meta-data/"` (AWS metadata endpoint)
  2. Oder: `ownUrl: "http://localhost:3000/api/tenant/seo/compare"` (interner Service-Scan)
  3. Oder: `ownUrl: "http://10.0.0.1/"` (internes Netzwerk)
  4. Erwartet: URL wird abgelehnt
  5. Tatsaechlich: Server fuehrt HTTP-Request an die interne Adresse aus und gibt das Ergebnis zurueck
- **Note:** `normalizeInputUrl` prueft nur auf http/https Protokoll, blockiert aber keine privaten/reservierten IP-Bereiche. Dies ist auch im bestehenden PROJ-10 SEO-Analyse-Tool ein Problem, da `fetchPage` dort genauso genutzt wird.
- **Priority:** Fix before deployment (Critical)

#### BUG-8: Kein UUID-Format-Check auf [id] Parameter
- **Severity:** Low
- **Steps to Reproduce:**
  1. Sende GET /api/tenant/seo/compare/not-a-uuid
  2. Erwartet: 400 Bad Request mit "Ungueltiges Format"
  3. Tatsaechlich: Query wird an Supabase weitergegeben, gibt 404 zurueck (da kein Match) -- funktional kein Problem, aber unsauber
- **Priority:** Nice to have

#### BUG-9: Kein Rate-Limiting auf POST-Endpunkt
- **Severity:** High
- **Steps to Reproduce:**
  1. Sende 100 POST-Requests in schneller Folge an /api/tenant/seo/compare
  2. Erwartet: Ab einer bestimmten Anzahl werden Requests abgelehnt (429)
  3. Tatsaechlich: Alle Requests werden ausgefuehrt -- jeder loest 2-4 ausgehende HTTP-Requests aus
- **Note:** Kein Rate-Limiting existiert auch auf dem bestehenden SEO-Analyse-Endpunkt (PROJ-10). Beide Endpunkte sollten Rate-Limiting erhalten.
- **Priority:** Fix before deployment

#### BUG-10: DELETE gibt Success zurueck bei nicht-existierender ID
- **Severity:** Low
- **Steps to Reproduce:**
  1. Sende DELETE /api/tenant/seo/compare/00000000-0000-0000-0000-000000000000
  2. Erwartet: 404 "Vergleich nicht gefunden"
  3. Tatsaechlich: 200 `{ success: true }`
- **Priority:** Nice to have

#### BUG-11: Mobile-Darstellung der Vergleichstabelle (375px)
- **Severity:** Medium
- **Steps to Reproduce:**
  1. Oeffne einen Vergleich mit 3 Wettbewerbern auf einem 375px breiten Geraet
  2. Erwartet: Tabelle ist lesbar (ggf. mit horizontalem Scroll)
  3. Tatsaechlich: Tabelle hat 5 Spalten auf 375px, Hostnamen auf `max-w-[130px]` abgeschnitten, Metrik-Werte in Badges kaum lesbar
- **Priority:** Fix in next sprint

### Additional Findings

#### FINDING-1: Module Access ist im Dev-Modus deaktiviert
- Die Funktion `requireTenantModuleAccess` gibt in Zeile 22 immer `{ granted: true }` zurueck (Code nach dem `return` ist unreachable). Dies ist absichtlich fuer die Entwicklung, MUSS aber vor Production-Deployment geaendert werden. Ist kein Bug von PROJ-30, aber relevant fuer Security.

#### FINDING-2: customer_id wird nicht validiert
- Der `customerId` Parameter im POST-Request wird als beliebiger String akzeptiert und direkt in die DB geschrieben. Wenn die `customers`-Tabelle eine FK-Constraint hat, fangen Postgres-Fehler das ab. Ansonsten koennten ungueltige Customer-IDs gespeichert werden. Da die Migration eine FK-Reference hat (`REFERENCES customers(id) ON DELETE SET NULL`), ist dies durch die DB abgesichert.

### Summary
- **Acceptance Criteria:** 7/9 passed, 2 partial pass (AC-3 fehlt Keyword-Praesenz, AC-4 Externe Links nicht gerankt)
- **Edge Cases:** 3/6 passed, 1 partial pass (EC-5), 2 failed (EC-4, EC-6)
- **Bugs Found:** 11 total (1 critical, 1 high, 2 medium, 7 low)
- **Security:** Issues found -- SSRF-Vulnerability (Critical), fehlendes Rate-Limiting (High), fehlende Zod-Validierung (Medium)
- **Production Ready:** NO
- **Recommendation:** BUG-7 (SSRF) und BUG-9 (Rate-Limiting) muessen vor Deployment behoben werden. BUG-6 (Zod-Validierung) sollte ebenfalls vor Deployment geloest werden. BUG-7 betrifft auch PROJ-10 und sollte zentral in `fetchPage` geloest werden.

## Deployment
_To be added by /deploy_
