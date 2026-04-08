# BoostHive — Claude Code Instructions

> Multi-tenant SaaS für Marketingagenturen. Next.js 16, Supabase, Tailwind + shadcn/ui, Vercel.

## Tech Stack
- **Framework:** Next.js 16 (App Router), TypeScript
- **Styling:** Tailwind CSS + shadcn/ui — NEVER recreate installed shadcn components
- **Backend:** Supabase (PostgreSQL + Auth + Storage)
- **Validation:** Zod + react-hook-form | **State:** React useState / Context API

## Project Structure
```
src/app/              Pages (Next.js App Router)
src/components/ui/    shadcn/ui components
src/hooks/            Custom React hooks
src/lib/              supabase.ts, utils.ts
features/             PROJ-X-name.md specs + INDEX.md
docs/PRD.md           Product Requirements
```

## Commands
```bash
npm run dev    # localhost:3000
npm run build  # Production build
npm run lint   # ESLint
```

## Development Workflow
1. `/requirements` → Feature spec erstellen
2. `/architecture` → Tech-Architektur (kein Code)
3. `/frontend` → UI mit shadcn/ui
4. `/backend` → API, DB, RLS
5. `/qa` → Tests + Security Audit
6. `/deploy` → Vercel Deploy

## Feature Tracking
- Alle Features in `features/INDEX.md` — **vor jeder Arbeit lesen**
- Specs: `features/PROJ-X-feature-name.md` (eine Funktion pro Datei)
- IDs sequenziell: PROJ-1, PROJ-2, ... — nächste ID aus INDEX.md prüfen
- Commits: `feat(PROJ-X): description` | Types: feat, fix, refactor, test, docs, deploy, chore

## Project Initialization Check (MANDATORY)
Vor jeder Arbeit prüfen ob `docs/PRD.md` Platzhaltertext enthält oder `features/INDEX.md` leer ist.
→ Falls nicht initialisiert: KEIN Code schreiben. User zu `/requirements` weiterleiten.
→ Falls Feature fehlt in INDEX.md: `/requirements` zuerst ausführen lassen.

## Status Updates (MANDATORY — Write-Then-Verify)
Nach jeder Feature-Arbeit Tracking-Dateien aktualisieren:
1. **Read** Spec + INDEX.md vor dem Bearbeiten
2. **Edit** mit dem Edit-Tool — nicht nur beschreiben
3. **Re-read** nach dem Bearbeiten zur Verifikation
4. Feature-Spec: Status, Implementation Notes, Abweichungen
5. INDEX.md: Status muss mit Spec übereinstimmen (Planned → In Progress → In Review → Deployed)

## File Handling
- Datei immer lesen vor dem Ändern — nie aus dem Gedächtnis annehmen
- Importpfade, Komponenten, API-Routes nie raten — verifizieren
- `git diff` prüfen um bereits geänderte Dateien zu sehen

## Human-in-the-Loop
- Vor Abschluss eines Deliverables immer Bestätigung einholen
- Klare Auswahlmöglichkeiten statt offene Fragen
- Nie automatisch zur nächsten Workflow-Phase übergehen
- Nach Skill-Abschluss: "Nächster Schritt: `/skillname` um [Aktion]"

## Product Context
@docs/PRD.md

## Feature Overview
@features/INDEX.md
