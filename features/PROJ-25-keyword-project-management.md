# PROJ-25: Keyword Project Management

## Status: In Progress
**Created:** 2026-03-28
**Last Updated:** 2026-03-28

## Dependencies
- Requires: PROJ-3 (User Authentication) — eingeloggter Nutzer
- Requires: PROJ-6 (Role-Based Access Control) — nur Admin/Member des Tenants
- Requires: PROJ-9 (Tenant Dashboard Shell) — UI-Rahmen

## User Stories
- Als Admin möchte ich ein Keyword-Projekt für einen Kunden anlegen (mit Domain, Zielsprache, Zielregion), damit ich das Tracking gezielt konfigurieren kann.
- Als Member möchte ich Keywords zu einem Projekt hinzufügen, damit sie beim nächsten Tracking-Lauf abgefragt werden.
- Als Member möchte ich Wettbewerber-Domains zu einem Projekt hinterlegen, damit deren Rankings für dieselben Keywords verglichen werden können.
- Als Member möchte ich Keywords und Wettbewerber bearbeiten und löschen können, um die Liste aktuell zu halten.
- Als Admin möchte ich mehrere Projekte pro Tenant verwalten (z. B. ein Projekt pro Endkunde), damit verschiedene Kampagnen getrennt bleiben.

## Acceptance Criteria
- [ ] Admin kann ein Keyword-Projekt anlegen mit: Name, Ziel-Domain, Sprache (z. B. `de`), Land/Region (z. B. `DE`)
- [ ] Bis zu 5 Projekte pro Tenant (MVP-Limit, erweiterbar über Modul-Konfiguration)
- [ ] Einem Projekt können beliebig viele Keywords hinzugefügt werden (MVP-Limit: 50)
- [ ] Einem Projekt können bis zu 5 Wettbewerber-Domains hinzugefügt werden
- [ ] Keywords und Wettbewerber können einzeln gelöscht werden
- [ ] Projekte können umbenannt oder deaktiviert werden
- [ ] Jedes Projekt zeigt eine Übersicht: Anzahl Keywords, Wettbewerber, letzter Tracking-Lauf
- [ ] Daten sind strikt Tenant-isoliert (kein Cross-Tenant-Zugriff)

## Edge Cases
- Duplikat-Keyword im selben Projekt → Fehlermeldung, kein doppelter Eintrag
- Domain ohne `https://`-Prefix eingegeben → automatisch normalisieren oder Fehler
- Projekt-Limit erreicht → klare Fehlermeldung mit Hinweis auf Upgrade
- Keyword-Limit (50) erreicht → klare Fehlermeldung
- Wettbewerber-Domain identisch mit Ziel-Domain → Fehlermeldung
- Projekt wird gelöscht → alle Keywords, Wettbewerber und historischen Ranking-Daten werden mitgelöscht (Cascade)

## Technical Requirements
- Security: RLS-Policy stellt sicher, dass nur Mitglieder des eigenen Tenants Lese-/Schreibzugriff haben
- Performance: Projekt-Übersicht lädt in < 500ms
- Validierung: Domain-Format (valide URL/Hostname), Sprachcode (ISO 639-1), Ländercode (ISO 3166-1 alpha-2)

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

### Komponentenstruktur

```
Keyword Projects Workspace (neue Seite: /tools/keywords)
+-- Projekt-Übersicht (Liste als Cards)
|   +-- Projekt-Card
|       +-- Name, Ziel-Domain, Sprache/Region
|       +-- Metriken: # Keywords, # Wettbewerber, letzter Lauf
|       +-- Aktionen: Öffnen, Umbenennen, Deaktivieren
+-- "Neues Projekt" Button (nur Admin)
+-- Limit-Hinweis (z. B. "3/5 Projekte genutzt")
+-- Leer-Zustand: Erste-Schritte-Karte

Projekt-Detail View (öffnet bei Klick auf Card)
+-- Header: Projektname + Domain + Zurück-Link
+-- Tabs
|   +-- Keywords-Tab
|   |   +-- Keyword-Liste (Tabelle mit Löschen-Button)
|   |   +-- Keyword hinzufügen (Inline-Input + Button)
|   |   +-- Limit-Hinweis ("42/50 Keywords")
|   +-- Wettbewerber-Tab
|   |   +-- Wettbewerber-Liste (Tabelle mit Löschen-Button)
|   |   +-- Domain hinzufügen (Inline-Input + Button)
|   |   +-- Limit-Hinweis ("2/5 Wettbewerber")
|   +-- Einstellungen-Tab
|       +-- Projekt umbenennen
|       +-- Sprache / Region ändern
|       +-- Projekt deaktivieren / löschen
+-- Dialog: Projekt erstellen
+-- Dialog: Projekt löschen (Bestätigung mit Cascade-Warnung)
```

### Datenmodell

**Tabelle: `keyword_projects`**
- `id` — Eindeutige ID
- `tenant_id` — Zugehöriger Tenant (Datenisolation)
- `name` — Projektname (z. B. "Kunde Müller GmbH")
- `target_domain` — Ziel-Domain (normalisiert, z. B. `muellermbh.de`)
- `language_code` — ISO 639-1, z. B. `de`
- `country_code` — ISO 3166-1 alpha-2, z. B. `DE`
- `status` — `active` oder `inactive`
- `created_at` — Erstellungsdatum

**Tabelle: `keywords`**
- `id`, `project_id`, `tenant_id`, `keyword`, `created_at`
- Unique Constraint: `(project_id, keyword)` — kein Duplikat

**Tabelle: `competitor_domains`**
- `id`, `project_id`, `tenant_id`, `domain`, `created_at`
- Unique Constraint: `(project_id, domain)`

Cascade Delete: Projekt löschen → Keywords + Wettbewerber werden automatisch mitgelöscht.

### API-Routen

| Route | Methode | Zweck |
|-------|---------|-------|
| `/api/tenant/keywords/projects` | GET | Alle Projekte des Tenants |
| `/api/tenant/keywords/projects` | POST | Neues Projekt anlegen |
| `/api/tenant/keywords/projects/[id]` | GET | Einzelprojekt mit Counts |
| `/api/tenant/keywords/projects/[id]` | PATCH | Umbenennen / Status ändern |
| `/api/tenant/keywords/projects/[id]` | DELETE | Projekt + Cascade löschen |
| `/api/tenant/keywords/projects/[id]/keywords` | GET | Keywords laden |
| `/api/tenant/keywords/projects/[id]/keywords` | POST | Keyword hinzufügen |
| `/api/tenant/keywords/projects/[id]/keywords/[kwId]` | DELETE | Keyword löschen |
| `/api/tenant/keywords/projects/[id]/competitors` | GET | Wettbewerber laden |
| `/api/tenant/keywords/projects/[id]/competitors` | POST | Wettbewerber hinzufügen |
| `/api/tenant/keywords/projects/[id]/competitors/[cId]` | DELETE | Wettbewerber löschen |

### Technische Entscheidungen

- **Eigene DB-Tabellen** — persistente Datenhaltung, kein localStorage
- **Tenant-ID in allen Tabellen** — RLS-Policies brauchen direkten Zugriff für Datenisolation
- **`tenant-tools-workspace.tsx` erweitern** — bestehende Tools-Navigation wird genutzt
- **Modul-Buchung prüfen** — Zugang ist an gebuchtes Modul geknüpft (PROJ-15)
- **Limits serverseitig enforced** — 5 Projekte, 50 Keywords, 5 Wettbewerber (API-seitig geprüft)
- **Domain-Normalisierung** — `https://` und trailing slashes vor dem Speichern entfernen
- **Keine neuen npm-Pakete** — alle UI-Komponenten (Dialog, Table, Tabs, Input, Badge) bereits installiert

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
