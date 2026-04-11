# PROJ-65: Globale Suche (Cmd+K)

## Overview
Eine systemweite Schnellsuche über alle Inhalte des Tenants — Kunden, Keywords, Content Briefs, Ad Texte, Freigaben, Zeiteinträge und Navigationspunkte. Erreichbar via Cmd+K (Mac) / Ctrl+K (Windows) als Command-Palette. Für Agenturen mit 20+ Kunden essenziell, um ohne Navigation direkt zu finden was gesucht wird.

## User Stories

### Als Agentur-Mitarbeiter möchte ich
- **STORY-1:** Mit Cmd+K sofort eine Suchpalette öffnen können und durch Tippen eines Namens direkt zu einem Kunden springen, ohne die Navigation zu benutzen
- **STORY-2:** Nicht nur Kunden suchen, sondern auch Keywords, Briefs, Ad-Texte und Seiten — alles in einer Suche
- **STORY-3:** Häufig genutzte Aktionen (z. B. „Neuer Kunde", „Brief erstellen") über die Palette starten können, ohne zur Seite navigieren zu müssen

### Als Agentur-Admin möchte ich
- **STORY-4:** Auch nach Kunden-Status, Modul oder Integration filtern können, um schnell eine bestimmte Teilmenge zu finden

## Acceptance Criteria

### AC-1: Öffnen & Schließen
- **GIVEN** ich bin irgendwo im Dashboard
- **WHEN** ich Cmd+K (Mac) oder Ctrl+K (Windows) drücke
- **THEN** öffnet sich eine modale Suchpalette (zentriert, Backdrop)
- **AND** der Fokus liegt sofort im Suchfeld
- **AND** Escape oder Klick außerhalb schließt die Palette

### AC-2: Kunden-Suche
- **GIVEN** ich tippe einen Kundennamen in die Palette
- **WHEN** Treffer gefunden werden
- **THEN** erscheinen Kunden-Ergebnisse mit Logo, Name und Status-Badge
- **AND** Enter oder Klick navigiert direkt zum Kunden-Dashboard (Kunden wird im Selektor gesetzt)

### AC-3: Inhalts-Suche
- **GIVEN** ich tippe einen Begriff
- **WHEN** Treffer in verschiedenen Bereichen gefunden werden
- **THEN** erscheinen Ergebnisse gruppiert nach Typ: Kunden | Keywords | Content Briefs | Ad Texte | Freigaben
- **AND** jedes Ergebnis zeigt einen kurzen Kontext-Snippet
- **AND** Enter navigiert direkt zur Detailansicht des Eintrags

### AC-4: Navigations-Shortcuts
- **GIVEN** ich tippe einen Navigations-Begriff (z. B. „Einstellungen", „Billing", „Kalender")
- **WHEN** eine passende Seite gefunden wird
- **THEN** erscheint die Seite als Ergebnis mit einem „→"-Icon
- **AND** Enter navigiert direkt zur Seite

### AC-5: Schnell-Aktionen
- **GIVEN** ich tippe „neu" oder „erstellen"
- **WHEN** passende Aktionen vorhanden sind
- **THEN** erscheinen Quick-Actions: „Neuer Kunde anlegen", „Neuen Brief erstellen", „Zeit erfassen"
- **AND** Enter führt die Aktion aus (öffnet entsprechendes Modal oder navigiert zur Seite)

### AC-6: Tastaturnavigation
- **GIVEN** die Suchpalette ist offen
- **WHEN** ich Pfeil-oben/unten drücke
- **THEN** navigiere ich durch die Ergebnisliste
- **AND** das aktuell fokussierte Element ist hervorgehoben
- **AND** Enter öffnet das fokussierte Ergebnis

### AC-7: Leerer Zustand / Keine Treffer
- **GIVEN** ich tippe etwas das keine Treffer hat
- **WHEN** die Suche abgeschlossen ist
- **THEN** erscheint: „Keine Ergebnisse für ‚[Begriff]'" mit Vorschlag „Neuen Kunden anlegen?" falls der Begriff wie ein Name aussieht

## Edge Cases

### EC-1: Suchindex veraltet
- **WHEN** ein neuer Kunde oder Brief angelegt wurde und die Suche ihn noch nicht kennt
- **THEN** erscheint er innerhalb von <5 Sekunden in den Suchergebnissen (kein statischer Index, direkte DB-Abfrage)

### EC-2: Zu viele Ergebnisse
- **WHEN** ein sehr generischer Begriff eingegeben wird (z. B. „a")
- **THEN** werden maximal 5 Ergebnisse pro Kategorie angezeigt
- **AND** ein „Alle anzeigen →"-Link führt zur gefilterten Übersichtsseite

### EC-3: Sonderzeichen in Suchanfragen
- **WHEN** der User Sonderzeichen tippt (z. B. `%`, `'`, `"`)
- **THEN** werden diese sicher behandelt (kein SQL Injection, korrektes Escaping)
- **AND** die Suche liefert trotzdem sinnvolle Ergebnisse oder leer

### EC-4: Mobile / kein Tastatur-Shortcut
- **WHEN** der User auf einem Touch-Gerät ist
- **THEN** ist die Suche über ein Suche-Icon in der Navigation erreichbar
- **AND** Cmd+K-Hinweis wird nur auf Desktop angezeigt

### EC-5: Zugriffsrechte
- **WHEN** ein Member (nicht Admin) sucht
- **THEN** erscheinen in den Ergebnissen nur Inhalte, auf die er Zugriff hat (keine Admin-only Bereiche wie Billing)

## Technical Requirements

### Suchabfrage-Strategie
- Direkte PostgreSQL Full-Text-Search (`to_tsvector` / `to_tsquery`) für Text-Inhalte
- Für Kunden, Keywords, Briefs, Ads: je eine Query mit `ILIKE '%term%'` oder FTS
- Ergebnisse werden client-seitig gecacht (React Query, 30s TTL)
- Debounce: 200ms nach letztem Tastendruck

### Neue Komponente
- `src/components/global-search.tsx` — CommandPalette-Komponente (shadcn/ui `Command` als Basis)
- Eingebunden in `tenant-shell-navigation.tsx` (immer verfügbar)
- Keyboard-Shortcut-Handler via `useEffect` + `keydown` Event

### API Endpoint
- `GET /api/tenant/search?q=term&limit=5` — Multi-Entity-Suche
  - Gibt zurück: `{ customers: [], keywords: [], briefs: [], ads: [], pages: [], actions: [] }`
  - Alle Queries laufen parallel (Promise.all)
  - Max. Antwortzeit: <300ms

### Gesuchte Entitäten
| Typ | Felder | Ziel-Route |
|-----|--------|-----------|
| Kunden | name, website_url | `/dashboard` + Kunden-Selektor |
| Keywords | keyword, project_name | `/tools/keywords/[project_id]` |
| Content Briefs | keyword, status | `/tools/content-briefs/[id]` |
| Ad Texte | headline, platform | `/tools/ad-generator/[id]` |
| Freigaben | title, status | `/tools/approvals/[id]` |
| Seiten (statisch) | label, route | direkte Navigation |
| Aktionen (statisch) | label, action | Modal öffnen / Route |

## Dependencies
- **PROJ-44:** Keyboard Shortcuts — bestehender Shortcut-Handler als Basis nutzen
- **PROJ-29:** Customer Database — Kunden-Suche
- **PROJ-25:** Keyword Projects — Keyword-Suche
- **PROJ-31:** Content Brief Generator — Brief-Suche
- **PROJ-33:** Ad Text Generator — Ad-Suche
- shadcn/ui `Command` Komponente (bereits installiert via cmdk)

## Success Metrics
- >60% der aktiven User nutzen Cmd+K mindestens einmal pro Woche
- Durchschnittliche Zeit „Intent → Navigation" sinkt von Ø 8s auf <2s
- >30% aller Navigationsaktionen laufen über die Suchpalette

## Non-Goals
- Keine Volltext-Suche in Datei-Inhalten (PDFs, Uploads)
- Keine KI-gestützte semantische Suche
- Kein Suchverlauf (Datenschutz)
- Keine cross-tenant Suche

## Status
- **Status:** Planned
- **Created:** 2026-04-11
