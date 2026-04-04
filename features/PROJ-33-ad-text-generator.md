# PROJ-33: Ad Text Generator

## Metadata
- **ID:** PROJ-33
- **Status:** In Progress (Frontend fertig, Backend ausstehend)
- **Created:** 2026-04-04
- **Priority:** P2

## Overview
Ein KI-gestützter Ad-Text-Generator, der Marketing-Teams durch einen geführten Briefing-Wizard leitet und plattformspezifische Anzeigentexte für Facebook, LinkedIn, TikTok und Google Ads erstellt. Die generierten Texte halten strikt die Zeichenbegrenzungen jedes Anzeigentyps ein. Ausgabe erfolgt als kopierbare Ansicht und Excel-Download. Alle Generierungen werden gespeichert und sind Kunden zuordenbar.

## Dependencies
- Requires: PROJ-3 (User Authentication) – eingeloggte Nutzer
- Requires: PROJ-6 (Role-Based Access Control) – nur Members/Admins
- Requires: PROJ-25 (Keyword Project Management) – Modul-Access-System als Referenz
- Requires: PROJ-29 (Customer Database) – Kundenzuordnung
- Requires: PROJ-28 (Globaler Kunden-Selektor) – Kundenauswahl

## User Stories

1. **Als Member** möchte ich durch einen Wizard geführt werden, damit ich Schritt für Schritt alle nötigen Informationen für meine Ads eingebe.
2. **Als Member** möchte ich nur ein Stichwort (z. B. „Eventuri Ansaugsystem") eingeben können, damit die KI passende Texte eigenständig recherchiert und generiert.
3. **Als Member** möchte ich eine oder mehrere Plattformen auswählen, damit ich gezielt Ads für Facebook, LinkedIn, TikTok oder Google Ads erhalte.
4. **Als Member** möchte ich zwischen Social Ads, Paid Ads oder beiden wählen, damit ich die richtigen Anzeigentypen bekomme.
5. **Als Member** möchte ich 3 Varianten pro Anzeigentyp erhalten, damit ich die beste Version auswählen oder alle exportieren kann.
6. **Als Member** möchte ich jeden generierten Text direkt kopieren können, damit ich ihn schnell in die jeweilige Plattform übertragen kann.
7. **Als Member** möchte ich alle generierten Ads als Excel-Datei herunterladen, damit ich sie strukturiert weiterverarbeiten kann.
8. **Als Member** möchte ich eine Generierung einem Kunden zuordnen, damit ich die History pro Kunde einsehen kann.
9. **Als Member** möchte ich vergangene Generierungen im Archiv aufrufen, damit ich Texte nicht neu generieren muss.

## Acceptance Criteria

### Wizard-Flow
- [ ] Schritt 1: Plattformauswahl (Mehrfachauswahl: Facebook, LinkedIn, TikTok, Google Ads)
- [ ] Schritt 2: Ad-Kategorie (Social Ads, Paid Ads oder beide) – Anzeigentypen werden dynamisch je Plattform geladen
- [ ] Schritt 3: Produkt/Briefing – Pflichtfeld: Stichwort/Produktname; optional: Zielgruppe, Ziel (Awareness/Conversion/Traffic), USP, Tonalität (professionell, locker, emotional)
- [ ] Schritt 4: Kundenzuordnung (aus Customer Database, optional)
- [ ] Schritt 5: Vorschau & Generierung mit Ladeindikator

### Generierung
- [ ] KI nutzt OpenRouter API (konfiguriertes Modell im Backend)
- [ ] Bei minimalem Input (nur Stichwort) recherchiert der KI-Prompt produktspezifische Informationen und generiert passende Texte eigenständig
- [ ] Pro Anzeigentyp werden genau 3 Varianten generiert
- [ ] Alle Zeichenlimits werden vor der Ausgabe serverseitig geprüft und ggf. neu generiert
- [ ] Kein Text wird mittendrin abgeschnitten – vollständige Sätze/Aussagen stets eingehalten
- [ ] Sprache: ausschließlich Deutsch

### Zeichenlimits (vollständig implementiert)

**Facebook:**
| Anzeigentyp | Feld | Limit |
|---|---|---|
| Feed Ad | Primary Text | 125 Zeichen (empfohlen) |
| Feed Ad | Headline | 40 Zeichen |
| Feed Ad | Description | 30 Zeichen |
| Carousel Ad | Primary Text | 125 Zeichen |
| Carousel Ad | Headline (je Karte) | 40 Zeichen |
| Carousel Ad | Description (je Karte) | 20 Zeichen |
| Story Ad | Primary Text | 125 Zeichen |
| Story Ad | Headline | 40 Zeichen |
| Collection Ad | Primary Text | 125 Zeichen |
| Collection Ad | Headline | 40 Zeichen |

**LinkedIn:**
| Anzeigentyp | Feld | Limit |
|---|---|---|
| Sponsored Content | Introductory Text | 150 Zeichen (empfohlen) / 600 max |
| Sponsored Content | Headline | 70 Zeichen |
| Sponsored Content | Description | 100 Zeichen |
| Carousel Ad | Introductory Text | 255 Zeichen |
| Carousel Ad | Headline (je Karte) | 45 Zeichen |
| Text Ad | Headline | 25 Zeichen |
| Text Ad | Description | 75 Zeichen |
| Message Ad | Subject | 60 Zeichen |
| Message Ad | Body | 1500 Zeichen |
| Message Ad | CTA | 20 Zeichen |
| Dynamic Ad (Spotlight) | Headline | 50 Zeichen |
| Dynamic Ad (Spotlight) | Description | 70 Zeichen |
| Dynamic Ad (Spotlight) | CTA | 18 Zeichen |
| Video Ad | Introductory Text | 600 Zeichen |
| Video Ad | Headline | 70 Zeichen |

**TikTok:**
| Anzeigentyp | Feld | Limit |
|---|---|---|
| In-Feed Ad | Ad Text | 100 Zeichen |
| In-Feed Ad | Brand Name | 20 Zeichen |
| TopView | Ad Text | 100 Zeichen |
| TopView | Brand Name | 20 Zeichen |
| Brand Takeover | Ad Text | 100 Zeichen |
| Branded Hashtag Challenge | Hashtag | 8 Zeichen |
| Branded Hashtag Challenge | Description | 200 Zeichen |
| Spark Ad | Ad Text | 100 Zeichen |

**Google Ads:**
| Anzeigentyp | Feld | Limit |
|---|---|---|
| Responsive Search Ad | Headline (je, bis 15) | 30 Zeichen |
| Responsive Search Ad | Description (je, bis 4) | 90 Zeichen |
| Responsive Search Ad | URL-Pfad (2x) | 15 Zeichen |
| Responsive Display Ad | Short Headline (je, bis 5) | 30 Zeichen |
| Responsive Display Ad | Long Headline | 90 Zeichen |
| Responsive Display Ad | Description (je, bis 5) | 90 Zeichen |
| Responsive Display Ad | Business Name | 25 Zeichen |
| Demand Gen (Discovery) | Headline | 40 Zeichen |
| Demand Gen (Discovery) | Description | 90 Zeichen |
| Demand Gen (Discovery) | Business Name | 25 Zeichen |
| Shopping Ad | Produkttitel | 150 Zeichen |
| Shopping Ad | Beschreibung | 5000 Zeichen |
| YouTube Video Ad | Headline | 15 Zeichen |
| YouTube Video Ad | Long Headline | 90 Zeichen |
| YouTube Video Ad | Description | 70 Zeichen |
| YouTube Video Ad | CTA | 10 Zeichen |
| Performance Max | Headline (je, bis 15) | 30 Zeichen |
| Performance Max | Long Headline (je, bis 5) | 90 Zeichen |
| Performance Max | Description (je, bis 5) | 90 Zeichen |
| App Campaign | Ad Text (4x) | 25 Zeichen |

### Ausgabe & Export
- [ ] Ergebnisansicht gruppiert nach Plattform → Anzeigentyp → 3 Varianten
- [ ] Jedes Textfeld zeigt Zeichenanzahl (genutzt / max) in Echtzeit
- [ ] Kopierfunktion per Button für jedes einzelne Textfeld
- [ ] „Alle kopieren" Funktion pro Anzeigentyp (strukturiert als Text)
- [ ] Excel-Export enthält: Plattform, Anzeigentyp, Variante (1-3), alle Textfelder in separaten Spalten
- [ ] Excel-Dateiname: `ads_{produktname}_{datum}.xlsx`

### History & Kundenzuordnung
- [ ] Jede Generierung wird mit Timestamp, Briefing-Daten und Ergebnis in der Datenbank gespeichert
- [ ] History-Übersicht zeigt alle vergangenen Generierungen (neueste zuerst)
- [ ] Filterbar nach Kunde und Plattform
- [ ] Gespeicherte Generierung kann erneut geöffnet, kopiert und neu heruntergeladen werden
- [ ] Generierungen sind dem Tenant isoliert (keine Cross-Tenant-Sichtbarkeit)

## Edge Cases

1. **Nur Stichwort eingegeben:** KI muss mit minimalem Input eigenständig produktrelevante Texte generieren – Prompt muss dies explizit anweisen.
2. **Zeichenlimit-Verletzung nach Generierung:** Backend prüft jeden generierten Text; bei Überschreitung wird maximal 1x neu generiert, danach wird der Text hart bei Wortgrenze gekürzt (kein mid-sentence cut).
3. **OpenRouter API nicht verfügbar:** Fehleranzeige mit Retry-Button; keine leere oder fehlerhafte Ausgabe.
4. **Kein Kunde ausgewählt:** Generierung wird als „ohne Kundenzuordnung" gespeichert, trotzdem in der History sichtbar.
5. **Mehrere Plattformen ausgewählt:** Alle Plattformen werden sequenziell generiert; Ladeindikator zeigt Fortschritt je Plattform.
6. **TikTok-Sonderzeichen:** Emojis reduzieren das Zeichenlimit – Limit-Berechnung muss Unicode-aware sein.
7. **Google RSA mit 15 Headlines:** KI generiert alle 15 Headlines und 4 Descriptions in einem Aufruf; Validierung prüft jede einzeln.
8. **Excel-Download bei leerem Ergebnis:** Button ist deaktiviert bis Generierung erfolgreich abgeschlossen ist.
9. **Concurrent-Generierungen:** Mehrere gleichzeitige API-Aufrufe müssen korrekt dem jeweiligen Nutzer zugeordnet werden.

## UI Wireframe (konzeptionell)

```
[Wizard Schritt 1/4]
Plattformen auswählen
☑ Facebook  ☑ LinkedIn  ☐ TikTok  ☑ Google Ads
[Weiter →]

[Wizard Schritt 2/4]
Anzeigenkategorie
○ Social Ads  ○ Paid Ads  ● Beide
Anzeigentypen: [Feed Ad] [Carousel] [RSA] [Display] ...
[← Zurück] [Weiter →]

[Wizard Schritt 3/4]
Briefing
Produkt/Stichwort: [Eventuri Ansaugsystem        ] *
Zielgruppe:        [Auto-Enthusiasten, 25-45 J.  ]
Kampagnenziel:     ○ Awareness ● Conversion ○ Traffic
USP:               [Performance, Qualität, Design ]
Tonalität:         ○ Professionell ● Locker ○ Emotional
[← Zurück] [Weiter →]

[Wizard Schritt 4/4]
Kundenzuordnung (optional)
Kunde: [Autohaus Müller GmbH ▼]
[← Zurück] [Jetzt generieren ✨]

---

[Ergebnis-View]
Facebook › Feed Ad
┌─────────────────────────────────────────────┐
│ Variante 1                           [📋 Alle kopieren] │
│ Primary Text: "Mehr Power, mehr Feeling..." │ 47/125 [📋] │
│ Headline:     "Eventuri – der Unterschied"  │ 29/40  [📋] │
│ Description:  "Jetzt entdecken"             │ 15/30  [📋] │
│ Variante 2 ...                                            │
│ Variante 3 ...                                            │
└─────────────────────────────────────────────┘

[📥 Excel herunterladen]
```

## Database Schema (konzeptionell)

```sql
-- ad_generations: Speichert jede Generierung
CREATE TABLE ad_generations (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  customer_id UUID REFERENCES customers(id),  -- nullable
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  briefing JSONB NOT NULL,  -- { product, audience, goal, usp, tone, platforms, categories }
  result JSONB NOT NULL,    -- { platform: { adType: { variant: { field: text } } } }
  status TEXT DEFAULT 'completed'  -- 'pending' | 'completed' | 'failed'
);
```

## API Routes (konzeptionell)

```
POST /api/tenant/ad-generator/generate      -- Neue Generierung starten
GET  /api/tenant/ad-generator/history       -- History abrufen
GET  /api/tenant/ad-generator/[id]          -- Einzelne Generierung
GET  /api/tenant/ad-generator/[id]/export   -- Excel-Download
```

## Tech Design (Solution Architect)

### Einordnung
Folgt dem bewährten Tools-Muster der App (analog zu Content Briefs). Neue Seite unter `/tools/ad-generator`, Workspace-Komponente, API-Routen unter `/api/tenant/ad-generator/`, neue Supabase-Tabelle `ad_generations`.

### Komponenten-Struktur
```
/tools/ad-generator/page.tsx
└── AdGeneratorWorkspace              (Haupt-Container, globaler State)
    ├── [View: Wizard]
    │   ├── WizardProgress            (Schritt 1-4 Anzeige)
    │   ├── WizardStep1Platforms      (Checkboxen: Facebook, LinkedIn, TikTok, Google)
    │   ├── WizardStep2AdTypes        (Kategorie + dynamische Anzeigentypen je Plattform)
    │   ├── WizardStep3Briefing       (Produkt-Pflichtfeld + optionale Felder)
    │   ├── WizardStep4Customer       (Kunden-Dropdown aus Customer Database)
    │   └── WizardNavigation          (Zurück / Weiter / Generieren)
    │
    ├── [View: Generating]
    │   └── GeneratingProgress        (Ladeanimation + Fortschritt je Plattform)
    │
    ├── [View: Results]
    │   ├── ResultsHeader             (Briefing-Info, Neu generieren, Export)
    │   ├── PlatformSection           (je Plattform ein Block)
    │   │   └── AdTypeSection         (je Anzeigentyp ein Block)
    │   │       └── AdVariantCard × 3 (3 Varianten)
    │   │           └── AdTextField   (Text + Zeichenzähler + Kopier-Button)
    │   └── ExcelDownloadButton
    │
    └── [View: History]
        ├── HistoryFilters            (Kunde, Plattform, Datum)
        └── HistoryList → HistoryCard (klickbar → gespeicherte Generierung)
```

### Datenbank
Neue Tabelle `ad_generations`:
- `id` UUID PK
- `tenant_id` UUID (Pflicht, Row-Level Security)
- `customer_id` UUID (nullable)
- `created_by` UUID
- `created_at` Timestamp
- `briefing` JSONB (Wizard-Inputs)
- `result` JSONB (strukturiertes Ergebnis: Plattform → Anzeigentyp → Variante → Felder)
- `status` TEXT (pending / completed / failed)

**Zeichenlimit-Konfiguration:** Zentrale Datei `src/lib/ad-limits.ts` — Single Source of Truth für Frontend (Zähler) und Backend (Validierung).

### API-Routen
```
POST /api/tenant/ad-generator/generate      → OpenRouter-Aufruf + Speichern
GET  /api/tenant/ad-generator/history       → History mit Filtern
GET  /api/tenant/ad-generator/[id]          → Einzelne Generierung
GET  /api/tenant/ad-generator/[id]/export   → Excel-Download (serverseitig)
```

### Datenfluss
1. Wizard-Inputs → POST generate
2. Backend baut strukturierten Prompt (Plattform × Anzeigentyp × Limits)
3. OpenRouter gibt JSON zurück
4. Backend validiert Zeichenlimits → max. 1 Nachgenerierung, dann Kürzen an Wortgrenze
5. Ergebnis in `ad_generations` speichern → Response an Frontend
6. Frontend zeigt Ergebnis → Kopieren / Excel-Download

### Neue Pakete
- `xlsx` — Excel-Generierung serverseitig

### Navigations-Eintrag
Neuer Eintrag in `tenant-shell-navigation.tsx` unter Tools: `/tools/ad-generator`

## Out of Scope
- Direkte Integration in Facebook Ads Manager / Google Ads API (kein automatisches Veröffentlichen)
- Bild-/Video-Generierung
- A/B-Testing-Verwaltung
- Mehrsprachige Generierung (nur Deutsch in v1)
- Automatische Kosten-/Performance-Schätzung
