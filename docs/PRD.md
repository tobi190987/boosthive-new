# Product Requirements Document

## Vision
BoostHive ist eine SaaS-Plattform für Marketingagenturen, die als vollständige Whitelabel-Lösung fungiert. Jede Agentur erhält eine eigene, isolierte Arbeitsumgebung über eine individuelle Subdomain (z. B. `agentur-name.boost-hive.de`) — mit eigenem Branding, eigenem Team und strikter Datentrennung.

## Target Users

### Owner (Plattformbetreiber — du)
- Betreibt die gesamte Plattform
- Legt neue Tenants (Agenturen) an und verwaltet Subdomains
- Hat systemweiten Zugriff zur Administration

### Admin (Agentur-Inhaber / -Manager)
- Verwaltet den eigenen Tenant
- Lädt Mitarbeiter ein und vergibt Rollen
- Konfiguriert Tenant-spezifische Einstellungen

### Member (Mitarbeiter der Agentur)
- Nutzt die Tools und Funktionen innerhalb seines Tenants
- Kein Zugriff auf andere Tenants oder Admin-Bereiche

**Pain Points der Agenturen:**
- Keine einheitliche Plattform für alle Marketing-Tools
- Kein White-Label-Angebot am Markt ohne hohe Setup-Kosten
- Datenschutzbedenken bei geteilten SaaS-Tools

## Core Features (Roadmap)

| Priority | Feature | Status |
|----------|---------|--------|
| P0 (MVP) | Subdomain Routing & Tenant Resolution | Planned |
| P0 (MVP) | Tenant Provisioning | Planned |
| P0 (MVP) | User Authentication | Planned |
| P0 (MVP) | Transactional Email (Mailtrap) | Planned |
| P0 (MVP) | Password Reset Flow | Planned |
| P0 (MVP) | Role-Based Access Control | Planned |
| P0 (MVP) | Member Invitation (Admin) | Planned |
| P1 | Tenant Detail Management | Planned |
| P1 | Owner Super-Admin Dashboard | Planned |
| P1 | Tenant Dashboard Shell | Planned |
| P1 | Stripe Setup & Basis-Abo | Planned |
| P1 | Modul-Buchung & Verwaltung | Planned |
| P1 | Owner Billing-Übersicht | Planned |
| P2 | SEO Analyse Tool | Planned |
| P2 | AI Performance Analyse | Planned |
| P2 | AI Visibility Tool | Planned |
| P2 | Keyword Project Management | Planned |
| P2 | Google Search Console Integration | Planned |
| P2 | Keyword Rankings Dashboard & History | Planned |

## Success Metrics
- **Technische Stabilität:** Zero-Downtime-Deployment, nachgewiesene Datenisolation zwischen Tenants
- **Sicherheit:** Keine Cross-Tenant-Datenlecks (verifiziert durch Tests)
- **Skalierbarkeit:** Neue Tenants können innerhalb von Minuten provisioniert werden
- **E-Mail-Zuverlässigkeit:** 100% Zustellung transaktionaler E-Mails (Login, Reset)

## Constraints
- **Team:** Solo-Entwickler
- **Timeline:** 4–8 Wochen für MVP Foundation
- **Tech Stack:** Next.js 16, Supabase (PostgreSQL + Auth), Tailwind CSS + shadcn/ui, Vercel
- **E-Mail:** Mailtrap als SMTP-Relay (kein eigenständiges E-Mail-System)
- **Domain:** Wildcard-Subdomain `*.boost-hive.de` (DNS-Konfiguration erforderlich)

## Non-Goals
- Kein eigenes E-Mail-System (nur SMTP-Relay über Mailtrap)
- Kein selbst-bedienbares Stripe Customer Portal (Billing läuft über eigenes App-UI)
- Keine nativen Mobile Apps (nur Web)
- Kein öffentliches Self-Signup für Agenturen (Owner provisiert manuell)
- Keine KI-Tools in v1 (kommen nach dem Foundation-Layer)
