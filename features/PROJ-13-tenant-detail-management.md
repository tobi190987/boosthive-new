# PROJ-13: Tenant Detail Management

## Status: In Progress
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

### Neue Seiten & Routen

| Route | Typ | Beschreibung |
|-------|-----|--------------|
| `/owner/tenants/[id]` | Page (neu) | Detailseite für eine Agentur |
| `GET /api/owner/tenants/[id]` | API (neu) | Alle Felder inkl. Admin-Info abrufen |
| `PATCH /api/owner/tenants/[id]` | API (erweitern) | Basics / Billing / Kontakt / Status aktualisieren |
| `POST /api/owner/tenants/[id]/admin` | API (neu) | Admin-Wechsel als Transaktion |

### Komponenten-Struktur

```
TenantDetailPage (/owner/tenants/[id])
├── TenantDetailHeader
│   ├── Zurück-Link → /owner/tenants
│   ├── Agentur-Name (Titel)
│   └── Status-Badge (active / inactive)
│
└── Tabs (shadcn Tabs)
    ├── Tab "Allgemein"
    │   └── TenantBasicsForm
    │       ├── Feld: Agentur-Name (Pflicht, min. 2 Zeichen)
    │       ├── Feld: Subdomain-Slug (Pflicht, Format-Regex)
    │       ├── SubdomainWarningAlert (erscheint bei Slug-Änderung)
    │       └── Speichern-Button + Toast
    │
    ├── Tab "Rechnungsadresse"
    │   └── BillingAddressForm
    │       ├── Felder: Firmenname (Pflicht), Straße, PLZ, Stadt, Land
    │       ├── Feld: USt-IdNr. (optional)
    │       └── Speichern-Button + Toast
    │
    ├── Tab "Kontakt"
    │   └── ContactDetailsForm
    │       ├── Felder: Ansprechpartner, Telefon, Website (alle optional)
    │       └── Speichern-Button + Toast
    │
    └── Tab "Admin"
        ├── CurrentAdminCard (Name + E-Mail des aktuellen Admins)
        └── AssignNewAdminForm
            ├── E-Mail-Eingabe
            ├── Hinweis: "Bisheriger Admin wird zu Member"
            └── Zuweisen-Button → Einladungs-E-Mail via PROJ-4
```

### Datenmodell — neue Felder in `tenants`-Tabelle

Migration `006_tenant_details.sql` — alle Spalten `nullable`, kein Breaking Change:

**Rechnungsadresse:**
- `billing_company` (Text, optional)
- `billing_street` (Text, optional)
- `billing_zip` (Text, optional)
- `billing_city` (Text, optional)
- `billing_country` (Text, optional)
- `billing_vat_id` (Text, optional)

**Kontaktdaten:**
- `contact_person` (Text, optional)
- `contact_phone` (Text, optional)
- `contact_website` (Text, optional)

### API-Design

**GET `/api/owner/tenants/[id]`**
- Alle Tenant-Felder + Admin-Info (Join auf `tenant_members` + Auth-User)
- 404 bei unbekannter ID

**PATCH `/api/owner/tenants/[id]`** — erweitert um `type`-Feld:
- `type: "status"` → bestehender Status-Toggle
- `type: "basics"` → Name + Slug (Unique-Check auf Slug, Format-Regex)
- `type: "billing"` → Rechnungsadresse
- `type: "contact"` → Kontaktdaten
- Jeder Typ hat eigenes Zod-Schema

**POST `/api/owner/tenants/[id]/admin`**
- Input: E-Mail des neuen Admins
- Läuft als Supabase RPC (Transaktion):
  1. E-Mail bereits Member → Rolle zu `admin` hochstufen
  2. E-Mail neu → Auth-User erstellen + `tenant_members` Eintrag mit `role=admin`
  3. Bisherigen Admin → `role=member`
  4. Einladungs-E-Mail senden
- 409 wenn E-Mail in anderem Tenant als Admin bereits existiert

### Tech-Entscheidungen

| Entscheidung | Begründung |
|---|---|
| Tabs statt separate Seiten | Alle Agentur-Daten auf einen Blick, kein unnötiges Navigieren |
| Separate POST-Route für Admin-Wechsel | Komplexe Transaktion (2 DB-Writes + E-Mail) gehört nicht in PATCH |
| Supabase RPC für Admin-Wechsel | Atomarität garantiert — entweder alles oder nichts |
| `type`-Feld im PATCH-Body | Klare Trennung der Update-Operationen ohne neue Routen |

### Abhängigkeiten

Keine neuen Pakete nötig — alles bereits installiert:
- `react-hook-form` + `zod` (Formulare & Validierung)
- shadcn/ui: `Tabs`, `Form`, `Input`, `Alert`, `Badge`, `Card`, `Separator`, `Sonner` (alle vorhanden)

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
