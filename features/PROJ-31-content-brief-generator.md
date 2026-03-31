# PROJ-31: Content Brief Generator

## Status: In Progress
**Created:** 2026-03-30
**Last Updated:** 2026-03-31

### Frontend Implementation Notes (2026-03-31)
- Created `src/components/content-briefs-workspace.tsx` — Full workspace with list view, detail view, create dialog (2-step), delete confirmation
- Created `src/app/tools/content-briefs/page.tsx` — Page with module access gate (content_briefs module)
- Added navigation entry in `src/components/tenant-shell-navigation.tsx` with FileText icon
- Features: Customer-scoped briefs, keyword import from PROJ-25 projects, status polling (3s), Markdown export, browser print for PDF, copyable text for H1/meta descriptions
- States: Loading skeletons, empty state, generating animation, error/failed state with retry, no-customer-selected gate
- Responsive design with grid layout (1-2-3 columns), dark mode support throughout

## Dependencies
- Requires: PROJ-9 (Tenant Dashboard Shell) — UI-Rahmen
- Requires: PROJ-6 (Role-Based Access Control) — Member/Admin-Zugriff
- Requires: PROJ-15 (Modul-Buchung) — Modul muss gebucht sein
- Optional: PROJ-25 (Keyword Project Management) — Keywords können aus bestehenden Projekten importiert werden

## User Stories
- Als Member möchte ich ein Keyword eingeben und ein strukturiertes Content-Briefing von der KI generieren lassen, damit ich oder mein Texter sofort loslegen kann.
- Als Member möchte ich beim Erstellen eines Briefs optional auf Keywords aus meinen bestehenden Keyword-Projekten zurückgreifen, statt alles manuell einzugeben.
- Als Member möchte ich die Suchintention (informational / navigational / transactional / commercial) des Keywords im Brief sehen, damit der Inhalt den Nutzererwartungen entspricht.
- Als Member möchte ich eine empfohlene Content-Gliederung (H1, H2s, H3s) erhalten, damit der Artikel von Anfang an SEO-optimiert strukturiert ist.
- Als Member möchte ich eine Liste verwandter Keywords und LSI-Begriffe im Brief haben, damit der Inhalt thematische Tiefe zeigt.
- Als Member möchte ich generierte Briefs speichern, umbenennen und erneut aufrufen können.
- Als Admin möchte ich alle Briefs meines Tenants einsehen und verwalten.

## Acceptance Criteria
- [ ] Eingabe-Formular mit: Haupt-Keyword (Pflicht), Ziel-URL (optional — für Wettbewerber-Gap), Zielsprache (Default: Deutsch), Tonalität (informativ / werblich / neutral), Wortanzahl-Ziel (500 / 1000 / 1500 / 2000+)
- [ ] Optional: Keyword aus bestehendem Keyword-Projekt auswählen (Dropdown mit Projekten + Keywords des Tenants)
- [ ] KI-generierter Brief enthält folgende Sektionen:
  - **Suchintention:** Klassifikation (informational / navigational / transactional / commercial) mit Begründung
  - **Empfohlener H1-Titel:** 2–3 Varianten
  - **Meta-Description-Vorschlag:** 1–2 Varianten (150–160 Zeichen)
  - **Gliederung:** H2/H3-Struktur mit kurzen Beschreibungen was in jedem Abschnitt behandelt werden soll
  - **Kern-Keywords:** Hauptkeyword + 5–10 verwandte Keywords / LSI-Begriffe mit empfohlener Häufigkeit
  - **Wettbewerber-Hinweise:** Falls Ziel-URL angegeben, kurzer Hinweis was Wettbewerber thematisch abdecken (basierend auf SEO-Analyse der Ziel-URL)
  - **Interne Verlinkungsvorschläge:** Platzhalter / Hinweis (ohne automatische Link-Erkennung in v1)
  - **Call-to-Action Empfehlung:** Passend zur Tonalität
- [ ] Brief wird als strukturiertes Objekt (JSON) und als lesbarer Text dargestellt
- [ ] Brief kann als Markdown oder PDF exportiert werden
- [ ] Brief wird gespeichert (Tenant-isoliert) und ist unter "Meine Briefs" abrufbar
- [ ] Generierungsstatus: Pending / Generating / Done / Failed
- [ ] Jeder Brief zeigt: Haupt-Keyword, Erstellungsdatum, Wortanzahl-Ziel, Sprache

## Edge Cases
- Keyword zu allgemein (< 2 Zeichen) → Validierungsfehler
- Keyword in Sprache, die nicht der Zielsprache entspricht → KI trotzdem auf Zielsprache antworten lassen, kein Fehler
- KI-API nicht erreichbar → Status "Failed", Retry-Option, kein Silent Fail
- Ziel-URL nicht erreichbar (für Wettbewerber-Gap) → Wettbewerber-Sektion wird übersprungen, Rest des Briefs wird trotzdem generiert, Hinweis "URL nicht erreichbar"
- Doppeltes Keyword / Brief bereits vorhanden → kein Block, neuer Brief wird trotzdem generiert (Nutzer kann mehrere Varianten erstellen)
- Nutzer löscht Brief → sofort und unwiderruflich (kein Soft-Delete nötig)
- Tenant ohne gebuchtes Modul → 403, Hinweis auf Modul-Buchung

## Technical Requirements
- KI-Integration über OpenRouter (gleicher Provider wie AI Visibility und Performance) — Modell: claude-3.5-sonnet oder gpt-4o (konfigurierbar per Env-Variable)
- Neues DB-Table: `content_briefs` mit `tenant_id` (RLS), `keyword`, `brief_json`, `status`, `created_by`, Timestamps
- API-Routen:
  - `POST /api/tenant/content/briefs` — Brief generieren (async, fire-and-forget Worker)
  - `GET /api/tenant/content/briefs` — Liste aller Briefs des Tenants
  - `GET /api/tenant/content/briefs/[id]` — Einzelner Brief
  - `DELETE /api/tenant/content/briefs/[id]` — Brief löschen
  - `GET /api/tenant/content/briefs/[id]/status` — Generierungsstatus (Polling)
- Generierung läuft asynchron (analog zu AI Performance / Visibility Worker-Pattern)
- Export als Markdown: clientseitig aus `brief_json` rendern
- Export als PDF: server-side oder clientseitig (Entscheidung in /architecture)
- Neues Modul in der Module-Tabelle: `content_briefs`

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

### Komponenten-Struktur

```
/tools/content-briefs (neue Seite)
+-- BriefListView (Startansicht)
|   +-- BriefCard × n (Keyword, Sprache, Datum, Status-Badge)
|   +-- CreateBriefButton → CreateBriefDialog (2 Steps)
|   +-- EmptyState (wenn noch keine Briefs vorhanden)
+-- CreateBriefDialog
|   +-- Step 1: Keyword-Eingabe
|   |   +-- ManualKeywordInput (Freitexteingabe)
|   |   +-- ODER: KeywordProjectSelector
|   |       (Dropdown: Projekt wählen → Keyword aus Projekt wählen)
|   +-- Step 2: Optionen
|       +-- LanguageSelect (Deutsch, Englisch, weitere)
|       +-- ToneSelect (informativ / werblich / neutral)
|       +-- WordCountSelect (500 / 1000 / 1500 / 2000+)
|       +-- TargetUrlInput (optional, für Wettbewerber-Gap)
|       +-- GenerateButton "Brief erstellen"
+-- BriefDetailView (geöffneter Brief)
    +-- StatusBadge (Generating / Done / Failed)
    +-- GeneratingState (Ladeanimation + "KI arbeitet...")
    +-- BriefContent (sichtbar wenn Status = done)
    |   +-- SearchIntentSection (Klassifikation + Begründung)
    |   +-- H1TitlesSection (2–3 Titel-Varianten)
    |   +-- MetaDescSection (1–2 Meta-Descriptions)
    |   +-- OutlineSection (H2/H3-Gliederung als verschachtelbare Liste)
    |   +-- KeywordsSection (Haupt-KW + LSI-Liste mit Häufigkeiten)
    |   +-- CompetitorHintsSection (nur wenn Ziel-URL angegeben)
    |   +-- CTASection
    +-- ExportBar
    |   +-- DownloadMarkdownButton
    |   +-- PrintPDFButton (Browser-Print)
    +-- RetryButton (nur wenn Status = failed)
    +-- DeleteButton
```

### Datenmodell

**Neue Tabelle: `content_briefs`**

Gespeichert werden:
- ID, Tenant-ID (RLS), Customer-ID (optional)
- Haupt-Keyword
- Sprache (z.B. `de`)
- Tonalität (`informativ` / `werblich` / `neutral`)
- Wortanzahl-Ziel (Zahl)
- Ziel-URL (optional, für Wettbewerber-Hinweise)
- Status: `pending` → `generating` → `done` / `failed`
- Brief-Inhalt (vollständige KI-Antwort als JSON)
- Fehlermeldung (bei Status `failed`)
- Erstellt von (User-ID), Erstellungsdatum, Aktualisierungsdatum

**Struktur des gespeicherten Brief-JSONs:**

```
{
  search_intent: { type, reasoning },
  h1_titles: [string, string, string],
  meta_descriptions: [string, string],
  outline: [ { h2: string, description: string, h3s: [...] } ],
  keywords: [ { term: string, frequency: string } ],
  competitor_hints: string | null,
  cta_recommendation: string
}
```

### API-Routen (neu)

```
POST   /api/tenant/content/briefs           → Brief-Job anlegen + Worker triggern
GET    /api/tenant/content/briefs           → Liste aller Briefs des Tenants
GET    /api/tenant/content/briefs/[id]      → Einzelner Brief (inkl. brief_json wenn done)
DELETE /api/tenant/content/briefs/[id]      → Brief löschen
GET    /api/tenant/content/briefs/[id]/status → Polling-Endpoint (Status + ggf. Fehler)
POST   /api/tenant/content/worker           → Interner Worker (absicherung via Secret-Header)
```

### Ablauf der Brief-Generierung

```
Browser
  ↓ POST /api/tenant/content/briefs { keyword, language, tone, wordCount, targetUrl }
Next.js API Route
  ↓ Schreibt content_briefs-Record mit Status "pending" in DB
  ↓ Feuert Worker-Aufruf asynchron (fire-and-forget)
  ↑ Gibt Brief-ID sofort zurück
Browser (Polling alle 3s)
  ↓ GET /api/tenant/content/briefs/[id]/status
  ↑ Gibt aktuellen Status zurück
  ↑ Polling stoppt bei "done" oder "failed"

Worker (läuft im Hintergrund)
  ↓ Setzt Status auf "generating"
  ↓ Optional: Ziel-URL mit bestehender seo-analysis-Engine crawlen (für Wettbewerber-Hints)
  ↓ Baut strukturierten Prompt auf (Keyword + Optionen + ggf. Seiteninhalte)
  ↓ Sendet Request an OpenRouter (claude-3.5-sonnet oder gpt-4o, via ENV konfigurierbar)
  ↓ Parst JSON-Antwort in Brief-Datenstruktur
  ↓ Schreibt brief_json in DB, setzt Status auf "done" (oder "failed")
```

### Export

| Format | Ansatz |
|---|---|
| Markdown | Clientseitig: brief_json → Markdown-String rendern, als `.md`-Datei herunterladen (kein Package nötig) |
| PDF | Browser-Print (`window.print()`) mit CSS-optimierter Druckansicht — kein extra PDF-Package in v1 |

### Tech-Entscheidungen

| Entscheidung | Warum |
|---|---|
| Async Worker (wie AI Visibility) | KI-Generierung dauert 10–30s — synchroner API-Call würde im Browser-Timeout laufen |
| OpenRouter (bestehend) | Selber Stack wie AI Visibility + Performance — kein neuer API-Anbieter |
| `openai`-Package (bestehend) | OpenRouter ist OpenAI-kompatibel — kein neues Package |
| Neues Modul `content_briefs` | Eigenständiges Feature mit separatem Wert, sollte unabhängig buchbar sein |
| Browser-Print für PDF | Einfachstes Vorgehen für v1 — kein serverseitiger PDF-Renderer nötig, kein `puppeteer` oder `jsPDF`-Overhead |
| Optional Keyword-Import aus PROJ-25 | Verhindert Doppelarbeit für Nutzer — bestehende Keyword-Daten werden sinnvoll weitergenutzt |

### Abhängigkeiten (neue Packages)

Keine — bestehende Infrastruktur (`openai`-Package via OpenRouter, `seo-analysis`-Lib) wird vollständig wiederverwendet.

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
