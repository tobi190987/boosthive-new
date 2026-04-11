# PROJ-55: Reporting & Export Center

## Status: In Review
**Created:** 2026-04-11
**Last Updated:** 2026-04-11

## Implementation Notes
- Migration 043 erstellt `exports`-Tabelle (RLS), Storage-Bucket `exports` (privat) und `brand_color` auf `customers`
- `pdfkit@0.18.0` installiert für serverseitige PDF-Generierung
- `src/lib/export-generators.ts` — PDF + XLSX Generator-Logik (pdfkit + xlsx)
- API-Routen: `GET/POST /api/tenant/exports`, `GET /[id]/download`, `POST /[id]/upload` (PNG), `POST /[id]/email`
- E-Mail-Template `src/emails/export-delivery.ts` + `sendExportDelivery` in `email.ts` mit Attachment-Support
- PNG-Export: clientseitig via `html-to-image`, Upload-Endpunkt `/[id]/upload`
- Download über Signed URLs (10 min Ablauf) aus privatem Supabase Storage Bucket
- Leere-Daten-Prüfung: 409-Response mit `message`, Frontend zeigt Bestätigungs-Dialog
- Kunden-Kontext: `customer_id = null` → Alle Kunden; gesetzt → Kunden-gefilterte Daten
- Branding: Logo (tenant oder customer, Fallback auf tenant) + Hex-Farbe in PDF-Header

## Dependencies
- Requires: PROJ-3 (User Authentication) — Login-Pflicht für alle Exports
- Requires: PROJ-6 (Role-Based Access Control) — Admin + Member dürfen exportieren
- Requires: PROJ-28 (Globaler Kunden-Selektor) — Kunden-Kontext beim Export wählbar
- Requires: PROJ-29 (Customer Database) — Kunden-Logo und Kundenfarbe abrufbar
- Requires: PROJ-27 (Keyword Rankings Dashboard) — Datenquelle für Rankings-Export
- Requires: PROJ-49 (Marketing Performance Dashboard) — Datenquelle für Dashboard-Export
- Requires: PROJ-32 (GSC Discovery View) — Datenquelle für GSC-Export
- Requires: PROJ-13 (Tenant Detail Management) — Tenant-Logo und Branding-Daten

## Overview
Ein zentrales Export-Center, über das Admins und Members Daten aus verschiedenen Modulen als **PDF**, **PNG** oder **XLSX** exportieren können. Jeder Export ist konfigurierbar (Kunden-Kontext, Branding) und wird in einem Export-Verlauf gespeichert. Ein optionaler E-Mail-Versand an den Kunden ist ebenfalls möglich.

---

## User Stories

### Export erstellen
- Als Member möchte ich im Export-Center einen neuen Export erstellen, damit ich Kunden professionelle Berichte liefern kann.
- Als Admin möchte ich den Kunden-Kontext beim Export wählen (alle oder einzelner Kunde), damit Berichte zielgenau sind.
- Als Member möchte ich das Branding des Exports konfigurieren (Tenant-Logo oder Kunden-Logo + Farbe), damit White-Label-Berichte mit Kunden-CI aussehen.

### Export-Inhalte
- Als Member möchte ich Keyword-Rankings als XLSX oder PDF exportieren, damit ich dem Kunden Ranking-Entwicklungen zeigen kann.
- Als Member möchte ich das Marketing-Performance-Dashboard als PDF oder PNG exportieren, damit Kunden ihre Performance-Daten auf einen Blick sehen.
- Als Member möchte ich GSC-Discovery-Daten als XLSX exportieren, damit weitere Analysen in Excel möglich sind.
- Als Member möchte ich einen kundenbezogenen Zusammenfassungsbericht als PDF erzeugen, damit ich monatliche Reports für Kunden erstellen kann.

### Export-Verlauf & Versand
- Als Member möchte ich frühere Exports im Verlauf sehen und erneut herunterladen, damit ich keine Berichte neu generieren muss.
- Als Member möchte ich einen fertiggestellten Export per E-Mail an den Kunden senden, damit der Versand direkt aus BoostHive möglich ist.

---

## Acceptance Criteria

### Export-Center Seite
- [ ] Export-Center ist über die Sidebar erreichbar (Route: `/dashboard/exports`)
- [ ] Seite zeigt eine Liste aller verfügbaren Export-Typen (Keyword Rankings, Marketing Dashboard, GSC Discovery, Kundenbericht)
- [ ] Jeder Export-Typ zeigt: Name, Beschreibung, unterstützte Formate, Vorschau-Icon

### Export-Konfiguration (Modal/Wizard)
- [ ] Beim Start eines Exports öffnet sich ein Konfigurations-Dialog
- [ ] Nutzer kann den Kunden-Kontext wählen: „Aktueller Kunde" oder „Alle Kunden"
- [ ] Nutzer kann Branding wählen: Tenant-Logo **oder** Kunden-Logo
- [ ] Nutzer kann eine Farbe definieren (Color-Picker): Agenturfarbe oder Kundenfarbe
- [ ] Nutzer kann das Export-Format wählen (je nach Export-Typ: PDF / PNG / XLSX)
- [ ] „Exportieren"-Button startet die Generierung

### Leere-Daten-Handling
- [ ] Wenn für den gewählten Kunden/Zeitraum keine Daten vorhanden sind, erscheint eine Warnung mit Hinweis auf fehlende Daten
- [ ] Nutzer kann nach Bestätigung trotzdem exportieren (Export zeigt „Keine Daten verfügbar")
- [ ] Warnung muss explizit bestätigt werden, bevor der Export gestartet wird

### Export-Generierung
- [ ] Während der Generierung wird ein Lade-Indikator angezeigt
- [ ] PDF-Exports enthalten: Header mit Logo + Farbe, Titel, Datum, Kunden-/Tenantname, Datentabellen/Charts, Footer
- [ ] PNG-Exports enthalten: Screenshot des jeweiligen Chart-Bereichs mit Branding-Header
- [ ] XLSX-Exports enthalten: Rohdaten in strukturierten Sheets, keine Branding-Elemente
- [ ] Exports werden nach der Generierung automatisch heruntergeladen

### Export-Verlauf
- [ ] Abgeschlossene Exports werden im Verlauf gespeichert (Tabelle mit: Typ, Format, Kunden-Kontext, Datum, Branding-Info, Download-Link)
- [ ] Verlauf zeigt die letzten 50 Exports des Tenants
- [ ] Jeder Verlaufs-Eintrag hat einen „Erneut herunterladen"-Button (Datei muss re-generiert oder gecacht sein)
- [ ] Verlauf zeigt Status: Generierung läuft / Fertig / Fehlgeschlagen

### E-Mail-Versand
- [ ] Nach erfolgreichem Export erscheint eine Option „Per E-Mail senden"
- [ ] Nutzer kann eine E-Mail-Adresse eingeben (pre-filled mit Kunden-E-Mail wenn Kunde ausgewählt)
- [ ] Nutzer kann optional eine kurze Nachricht hinzufügen
- [ ] E-Mail enthält die Export-Datei als Anhang und eine vordefinierte Betreff-Zeile
- [ ] E-Mail-Versand nutzt die bestehende Mailtrap-Integration (PROJ-4)
- [ ] Versand-Bestätigung wird im Verlaufs-Eintrag vermerkt

### Berechtigungen
- [ ] Nur eingeloggte Member und Admins können Exports erstellen und den Verlauf einsehen
- [ ] Exports sind Tenant-isoliert (kein Cross-Tenant-Zugriff)
- [ ] Unauthentifizierte Zugriffe auf Export-Dateien sind nicht möglich

---

## Edge Cases

- **Kein Kunde ausgewählt (globaler Kontext):** Export läuft über alle Kunden des Tenants; Dateiname enthält Tenant-Name
- **Kunden-Logo nicht vorhanden:** Wenn Branding = Kunden-Logo gewählt, aber kein Logo hinterlegt → Fallback auf Tenant-Logo, Nutzer wird im Dialog informiert
- **Sehr große Datensätze (z.B. 10.000+ Keywords):** XLSX-Export läuft serverseitig mit Timeout-Handling; Nutzer erhält Hinweis bei langer Generierung
- **PDF-Generierung schlägt fehl:** Fehlerstatus im Verlauf, Nutzer kann Export neu starten
- **E-Mail-Versand schlägt fehl:** Fehlermeldung im Dialog, Export selbst bleibt im Verlauf verfügbar
- **Verlaufs-Datei nicht mehr verfügbar (abgelaufen):** „Erneut herunterladen" re-generiert den Export statt aus Cache zu laden
- **Gleichzeitige Exports:** Mehrere Exports können parallel angestoßen werden; jeder hat einen eigenen Verlaufs-Eintrag

---

## Technical Requirements

- **Performance:** PDF-/PNG-Generierung < 10 Sekunden, XLSX < 5 Sekunden
- **PDF-Generierung:** Serverside via Puppeteer oder `@react-pdf/renderer` (entschieden in `/architecture`)
- **XLSX-Generierung:** Serverside via `exceljs` oder `xlsx`
- **Datei-Speicherung:** Generierte Dateien in Supabase Storage (Bucket: `exports`), TTL 30 Tage
- **Security:** Signed URLs für Download-Links (keine öffentlichen Bucket-URLs)
- **E-Mail:** Nutzung der bestehenden Mailtrap-Integration aus PROJ-4
- **Tenant-Isolation:** RLS auf `exports`-Tabelle, alle Queries müssen `tenant_id` filtern
- **Browser-Support:** Chrome, Firefox, Safari

---

## Tech Design (Solution Architect)

### Komponenten-Struktur

```
Export Center Page  (/dashboard/exports)
+-- Export-Typ-Karten (Grid, 4 Karten)
|   +-- ExportTypeCard
|       - Icon, Name, Beschreibung
|       - Unterstützte Formate als Badges
|       - "Export starten"-Button
|
+-- Export-Verlauf (Tabelle, letzte 50)
|   +-- ExportHistoryRow
|       - Typ, Format, Kunden-Kontext, Datum
|       - Status-Badge (Läuft / Fertig / Fehlgeschlagen)
|       - Herunterladen-Button
|       - "Per E-Mail senden"-Button
|
+-- ExportConfigModal (öffnet beim "Export starten")
|   +-- Schritt 1: Format-Auswahl (PDF / PNG / XLSX)
|   +-- Schritt 2: Kunden-Kontext (Aktueller Kunde / Alle)
|   +-- Schritt 3: Branding-Konfiguration
|   |       - Logo-Auswahl (Tenant-Logo oder Kunden-Logo)
|   |       - Color-Picker (Agenturfarbe / Kundenfarbe)
|   +-- Schritt 4: Leere-Daten-Warnung (wenn zutreffend) + Bestätigung
|   +-- Generierungs-Indikator (Ladeanimation)
|
+-- EmailSendModal
    - E-Mail-Adresse (pre-filled aus Kunden-Daten)
    - Optionale Nachricht
    - Senden-Button
```

### Datenhaltung

**Neue DB-Tabelle: `exports`**

Jeder Export-Job speichert:
- Eindeutige ID + Tenant (Datenisolation)
- Erstellt von (User-ID)
- Export-Typ: `keyword_rankings` | `marketing_dashboard` | `gsc_discovery` | `customer_report`
- Format: `pdf` | `png` | `xlsx`
- Kunden-Kontext: Kunden-ID (nullable — null = alle Kunden des Tenants)
- Branding: Logo-Quelle (`tenant` | `customer`) + Hex-Farbe
- Status: `pending` → `generating` → `done` | `failed`
- Speicherpfad in Supabase Storage + Dateiname
- Fehlermeldung (nullable, bei Status `failed`)
- E-Mail-Versand: Zeitstempel + Adresse (nullable)
- Ablauf-Datum: `created_at + 30 Tage`

**Supabase Storage Bucket: `exports` (privat, kein öffentlicher Zugriff)**

- Dateistruktur: `exports/{tenant-id}/{export-id}/{dateiname}`
- Download nur über Signed URLs (24h Ablauf)
- Physische Dateien werden nach 30 Tagen gelöscht

### API-Routen

```
POST /api/tenant/exports
    → Export-Job anlegen (Status: pending)
    → Leere-Daten-Check → Warnsignal wenn keine Daten
    → Datei generieren → in Supabase Storage ablegen
    → Status "done" setzen → Signed URL zurückgeben

GET /api/tenant/exports
    → Letzte 50 Exports des Tenants

GET /api/tenant/exports/[id]/download
    → Datei in Storage vorhanden? → Signed URL generieren
    → Datei fehlt (abgelaufen)? → Datei neu generieren

POST /api/tenant/exports/[id]/email
    → Export-Datei aus Storage laden
    → Über bestehende Mailtrap-Integration versenden (PROJ-4)
    → Versand-Zeitstempel im Verlaufs-Eintrag speichern
```

### Generierungs-Strategie nach Format

| Format | Strategie | Export-Typen |
|--------|-----------|-------------|
| XLSX | Serverseitig (`xlsx`-Paket — bereits installiert) | Keyword Rankings, GSC Discovery |
| PDF | Serverseitig (`pdfkit`) | Alle 4 Typen |
| PNG | Clientseitig (`html-to-image`) → Upload zu Storage | Marketing Dashboard |

**PDF-Aufbau:** Header (Logo + Akzentfarbe), Titel, Datum + Kundenname, Datentabellen/Charts, Footer

**PNG-Workflow:** Browser rendert Chart-Bereich → `html-to-image` erstellt Bild → Upload-Endpunkt schreibt in Storage → Export-Verlauf verknüpft Datei

### Branding-System

```
Konfigurierbar beim Export:
1. Logo-Quelle:
   - "Tenant-Logo" → aus Tenant-Einstellungen (PROJ-13)
   - "Kunden-Logo" → aus Customer Database (PROJ-29)
   - Fallback: Tenant-Logo wenn Kunden-Logo fehlt

2. Akzentfarbe (Color-Picker):
   - Vorschlag: gespeicherte Agenturfarbe oder Kundenfarbe
   - Neues Feld `brand_color` in customers-Tabelle
```

### Technische Entscheidungen

| Entscheidung | Gewählt | Warum |
|---|---|---|
| PDF-Library | `pdfkit` | Läuft in Vercel Serverless, kein Browser nötig, kleines Bundle |
| XLSX-Library | `xlsx` (bereits installiert) | Bewährtes Pattern im Ad-Generator |
| PNG-Capture | `html-to-image` (clientseitig) | Kein Screenshot-Dienst nötig, nutzt Browser-DOM direkt |
| Datei-Storage | Supabase Storage | Bereits im Stack, RLS-kompatibel, Signed URLs |
| Export-Status | Supabase DB (synchron) | Ausreichend für Anforderungen, keine Job-Queue nötig |

### Neue Pakete

- `pdfkit` — Serverseitige PDF-Generierung
- `@types/pdfkit` — TypeScript-Typen für pdfkit
- `html-to-image` — Clientseitiger DOM-Screenshot zu PNG

## Implementation Notes

### Frontend (2026-04-11)
- Neue Route `/exports` unter `src/app/(tenant)/exports/page.tsx` + `loading.tsx`
- Hauptkomponente `src/components/exports-workspace.tsx` (Client Component)
  - Grid mit 4 Export-Typ-Karten (Keyword Rankings, Marketing Dashboard, GSC Discovery, Kundenbericht)
  - Export-Verlaufs-Tabelle mit Status-Badges, Download- und E-Mail-Aktionen
  - `ExportConfigModal`: Wizard mit Format-Select, Kunden-Kontext (RadioGroup), Branding-Konfig (Logo-Source + Color-Picker), Leere-Daten-Warnung mit Bestätigungs-Checkbox
  - `ExportEmailModal`: Versand per E-Mail mit Validierung + Optional-Nachricht
  - Loading-, Empty- und Error-State für Historie mit Retry-Button
- Sidebar: Neuer Top-Level-Eintrag "Export Center" (Download-Icon) in `tenant-shell-navigation.tsx`, direkt unter Dashboard (sichtbar für Admins + Members)
- API-Aufrufe gegen geplante Endpunkte `/api/tenant/exports` (GET/POST), `/api/tenant/exports/[id]/download`, `/api/tenant/exports/[id]/email` — noch Backend-Arbeit. 404-Fallback zeigt leeren Verlauf, 409-Response triggert Leere-Daten-Warnung.
- Nutzt vorhandene Shell-Infrastruktur: `useActiveCustomer()` für Kundenkontext, `useToast()` für Feedback, shadcn Primitives (Card, Dialog, Badge, Table, RadioGroup, Select, Alert, Skeleton, Textarea, Button)
- Kein Custom-UI — nur shadcn-Kompositionen; alles Tailwind-basiert; Dark-Mode-kompatibel.

### Offene Punkte für Backend
- `exports`-Tabelle + RLS-Policies
- Supabase Storage Bucket `exports` mit Signed URLs
- Serverseitige PDF-Generierung via `pdfkit`, XLSX via bestehendem `xlsx`-Paket, PNG-Upload-Endpoint (`html-to-image` clientseitig)
- Mailtrap-Versand-Integration (PROJ-4)
- `brand_color` und ggf. `logo_url` Feld in `customers`-Tabelle

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
