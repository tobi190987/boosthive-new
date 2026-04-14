# PROJ-70: Landing Page Startseite (Root Domain)

## Status: Deployed
**Created:** 2026-04-14
**Last Updated:** 2026-04-14

## Dependencies
- Requires: PROJ-1 (Subdomain Routing & Tenant Resolution) — Seitenaufruf auf root-Domain (kein Tenant) löst die Landing Page aus
- Requires: PROJ-14 (Stripe Basis-Abo) — Pricing-Daten werden aus Stripe geladen
- Requires: PROJ-3 (User Authentication) — bestehende `/access`-Passwortschutz-Seite bleibt erhalten

## Kontext & Ziel

Die Root-Domain `boost-hive.de` ist aktuell hinter einem Preview-Passwortschutz (`/access`) verborgen. Nach Eingabe des Passworts soll der Nutzer auf eine vollwertige **Marketing-Landingpage** weitergeleitet werden.

**Flow:**  
`boost-hive.de` → `/access` (Passwortschutz, temporär) → `/` (Landing Page)

Die Landingpage richtet sich ausschließlich an **Marketingagenturen** als potenzielle Kunden. Es gibt keinen Login-Button oder ähnliche Funktionen, da der Agentur-Zugang jeweils über die tenant-spezifische Subdomain erfolgt.

---

## User Stories

- Als **Marketingagentur-Inhaber**, der BoostHive evaluiert, möchte ich auf der Startseite sofort verstehen, welches Problem das Tool löst und warum es sich von generischen SaaS-Tools unterscheidet.
- Als **interessierter Besucher** möchte ich eine klare Übersicht der verfügbaren Module sehen, damit ich einschätzen kann, ob BoostHive meinen Agentur-Alltag abbilden kann.
- Als **Entscheider** möchte ich das Pricing-Modell transparent einsehen (Basis-Plan + zubuchbare Module), damit ich eine Budgetabschätzung vornehmen kann.
- Als **Agentur-Inhaber** möchte ich eine Demo anfragen oder Kontakt aufnehmen können, ohne mich zuerst registrieren zu müssen.
- Als **Plattform-Betreiber** möchte ich, dass die Landingpage kein Login-/Registrierungsformular enthält, da Agentur-Zugänge manuell provisioniert werden.

---

## Seitenaufbau & Sektionen

### 1. Header (minimal)
- Logo (BoostHive) links
- Kein Login-Button, kein Registrierungslink
- Optional: Anker-Links zu Sektionen (z. B. "Features", "Pricing")

### 2. Hero-Sektion
- Prägnante Hauptüberschrift: Nutzenversprechen für Agenturen (kein generisches "Welcome")
- Subtext (1–2 Sätze): Was BoostHive konkret liefert
- Primärer CTA: **"Demo anfragen"** → scrollt zu Kontaktsektion oder öffnet Kontakt-Mail
- Sekundärer CTA: Anker-Link zu Features oder Pricing
- Visuelle Unterstützung (Grafik/Screenshot/Illustration), kein leerer Whitespace

### 3. Value Props / Vorteile-Sektion
- 3–4 differenzierende Merkmale (keine Feature-Liste, sondern Nutzen-Aussagen):
  1. **White-Label statt Shared-SaaS** — Jede Agentur bekommt ihre eigene Subdomain mit eigenem Branding, isoliertem Datenraum und eigenem Team-Login.
  2. **Alles in einer Plattform** — SEO, AI Visibility, Rankings, Ads, Content, Freigaben: kein Tool-Wechsel mehr.
  3. **Skalierbar ohne Overhead** — Neue Kunden, neue Agentur-Workspaces — Provisionierung in Minuten statt Tagen.
  4. **Modularer Aufbau, klare Kosten** — Basis-Plan + nur die Module, die gebraucht werden.

### 4. Feature-Übersicht
- Strukturierte Darstellung der Kern-Module (mit Icon und Kurzbeschreibung):
  - SEO Analyse & Competitor Analyse
  - AI Visibility Analytics
  - Keyword Rankings & GSC Integration
  - Marketing Performance Dashboard (GA4, Google Ads, Meta, TikTok)
  - Content Brief Generator & Ad Text Generator
  - Client Approval Hub (Freigabe-Workflow)
  - Customer Database (CRM)
  - Brand Intelligence (Google Trends, Mentions)
- Darstellung: Icon-Karten in Grid (nicht als einfache Liste)

### 5. Pricing-Sektion
- Modell: **Basis-Plan** (monatlich) + **zubuchbare Module**
- Preise werden live aus Stripe/Datenbank geladen (bestehende `getMarketingPrices()`-Funktion)
- Basis-Plan-Karte: Preis prominent, enthaltene Leistungen als Chips/Bullets
- Modul-Liste: Name, Kurzbeschreibung, Preis pro Intervall
- Hinweis: "Preise auf Anfrage / Demo" als Fallback wenn Stripe-Preise nicht öffentlich verfügbar

### 6. Kontakt / Demo-CTA-Sektion
- Headline: "Demo anfragen" oder "BoostHive kennenlernen"
- Kurze Beschreibung: Provisionierung läuft manuell — kein Self-Service
- CTA-Button: `mailto:`-Link oder definierter Kontaktweg (vom Betreiber festzulegen)
- Kein Registrierungsformular

### 7. Footer
- Links: Impressum, Datenschutz
- Copyright

---

## Design-Vorgaben

- **Stil:** Dark / Modern — dunkler Hintergrund (slate-950/midnight), Akzentfarbe Teal/Cyan (`#0f766e`)
- **Typografie:** Große, klare Headings; ausreichend Zeilenabstand
- **Layout:** Vollbreite-Sektionen, zentrierter Content-Wrapper (max-w-7xl)
- **Komponenten:** shadcn/ui-Primitives; bestehende `FeatureCard`-Komponente kann übernommen/angepasst werden
- **Responsivität:** Mobile (375px), Tablet (768px), Desktop (1440px)

---

## Acceptance Criteria

- [ ] Die Root-Domain (`/`) zeigt die Landingpage im Dark/Modern-Stil
- [ ] Header enthält **keinen** Login-Button, kein Agentur-Login, kein Owner-Login
- [ ] Hero-Sektion hat eine klare Hauptüberschrift mit Agenturen als Zielgruppe
- [ ] Hero-CTA "Demo anfragen" führt zu einem definierten Kontaktweg (scrollt oder öffnet Mailto)
- [ ] Value Props-Sektion zeigt 3–4 differenzierende Nutzen-Aussagen mit Icons
- [ ] Feature-Übersicht zeigt alle Kern-Module als Icon-Karten im Grid
- [ ] Pricing-Sektion lädt Preise aus Stripe (Basis-Plan + Module)
- [ ] Pricing-Sektion zeigt Fallback-Text wenn keine Preise geladen werden können
- [ ] Kontakt/Demo-CTA-Sektion enthält kein Registrierungsformular
- [ ] Footer enthält Links zu Impressum und Datenschutz
- [ ] Alle Sektionen sind mobil-responsive
- [ ] Wenn Tenant-Kontext vorhanden → Redirect zu `/login` (bestehende Logik unverändert)
- [ ] `/access`-Passwortschutz-Flow bleibt unverändert (nur die Seite dahinter ändert sich)

---

## Edge Cases

- **Stripe nicht verfügbar:** Pricing-Sektion zeigt Fallback-Text "Preise auf Anfrage" statt leerer Seite
- **Keine Stripe-Module konfiguriert:** Nur Basis-Plan-Karte wird angezeigt, Modul-Bereich bleibt aus
- **Tenant-Subdomain ruft Root-Domain auf:** Redirect zu `/login` des Tenants (bestehende Logik)
- **Dark/Light-Mode:** Seite nutzt das globale Dark-Mode-System; Design ist primär für Dark optimiert
- **CTA-Kontaktweg:** Wenn kein `mailto`-Link konfiguriert, Fallback auf einfachen Hinweistext

---

## Was sich an bestehenden Komponenten ändert

Die bestehende `MarketingPages`-Komponente (`src/components/marketing-pages.tsx`) wird überarbeitet:

| Bereich | Aktuelle Logik | Neue Logik (home mode) |
|---------|---------------|----------------------|
| Header | Login-Buttons (Agentur, Owner, Vorschau) | Nur Logo + optionale Anker-Links |
| Hero CTA | "Plattform ansehen" → `/login` | "Demo anfragen" → Kontaktsektion |
| Sekundär-CTA | "Vorschau-Zugang" | "Features entdecken" (Anker) |
| Neue Sektion | — | Value Props / Vorteile |
| Feature-Übersicht | `FeatureGroups` (3 Gruppen à 4 Items) | Kompaktere Darstellung aller Module |
| Pricing | Vorhanden und korrekt | Beibehalten, ggf. visuell verfeinern |
| Abschluss-CTA | "Jetzt einloggen" | "Demo anfragen" |

---

## Technical Requirements

- Performance: Seite soll Core Web Vitals bestehen (LCP < 2.5s)
- SSR: Pricing-Daten werden serverseitig geladen (`getMarketingPrices()`)
- Kein zusätzliches Client-Side-Fetching nötig
- Keine neuen API-Routes erforderlich

---

## Tech Design (Solution Architect)

**Implementierung direkt im Frontend (kein separater Architecture-Step nötig):**

- **Entry-Point:** `src/app/page.tsx` bleibt unverändert — ruft `<MarketingPages mode="home" tenant={null} pricing={...} />` auf
- **Komponente:** In `src/components/marketing-pages.tsx` neuer Zweig `RootHome` für `mode === 'home' && !tenant`
- **Rendering-Logik:**
  - `mode === 'home' && !tenant` → Neue Dark-Modern Landing Page (`RootHome`)
  - Alle anderen Modi (access, tenant-home) behalten bestehende Komponenten
- **Sub-Komponenten:** `RootHeader`, `RootHero`, `ValueProps`, `ModulesGrid`, `RootPricing`, `RootContactCta`, `RootFooter`
- **Kontaktweg:** `mailto:hello@boost-hive.de` (Konstante `CONTACT_MAIL`, bei Bedarf anpassbar)
- **Pricing:** Nutzt bestehende `getMarketingPrices()` → Array wird per Props weitergereicht
- **Fallback:** Leeres `pricing`-Array zeigt "Preise auf Anfrage"-Block

## Implementation Notes

- `RootHome` ist vollständig Dark-Mode (slate-950 Hintergrund, Teal/Cyan Akzent `#0f766e`)
- Header: Nur Logo + Anker-Links (Features/Pricing/Kontakt), kein Login-Button
- Hero: 2-Spalten-Layout mit Workspace-Visualisierung rechts (auf Mobile einspaltig)
- Value Props: 4 Nutzen-Karten im Grid (md:2 / xl:4 Spalten)
- Module-Grid: 9 Kern-Module als Icon-Karten (md:2 / lg:3 Spalten)
- Pricing: Basis-Plan + Modul-Liste, Fallback "Preise auf Anfrage" wenn Array leer
- Footer: Impressum + Datenschutz Links
- Alle CTAs verwenden entweder Anker-Links (`#contact`) oder `mailto:`
- Bestehende `/access`-Flow bleibt komplett unverändert
- Tenant-Subdomain-Aufrufe: `page.tsx` redirected weiterhin zu `/login` (unverändert)

## QA Test Results

**QA-Datum:** 2026-04-14
**Getestet von:** QA Agent (Static Code Review + Architektur-Analyse)
**Methode:** Statischer Review der Implementierung in `src/app/page.tsx` und `src/components/marketing-pages.tsx`, Spec-Abgleich, Security-Audit, TypeScript/Lint-Check
**Scope:** PROJ-70 Root-Domain Landingpage

### Acceptance Criteria

| # | Kriterium | Status | Kommentar |
|---|-----------|--------|-----------|
| 1 | Root (`/`) zeigt Landingpage im Dark/Modern-Stil | PASS | `RootHome` rendert mit `bg-slate-950`, Teal/Cyan Akzent `#0f766e`, Gradient-Backdrop |
| 2 | Header OHNE Login-Button (kein Agentur-/Owner-Login) | PASS | `RootHeader` enthält nur Logo + 3 Anker-Links (Features, Pricing, Kontakt). Alter `Header` mit Login-Buttons wird bei `mode==='home' && !tenant` nicht mehr ausgeführt (früher Return auf Zeile 1061) |
| 3 | Hero mit klarer Hauptüberschrift für Agenturen-Zielgruppe | PASS | "Eine Plattform. Dein Branding. Dein Agentur-Workspace." + Subtext sprechen Agenturen an |
| 4 | Hero-CTA "Demo anfragen" führt zu definiertem Kontaktweg | PASS | `href="#contact"` scrollt zu `<section id="contact">`, das den `mailto:`-CTA enthält |
| 5 | Value Props 3-4 Nutzen-Aussagen mit Icons | PASS | Exakt 4 Value Props (White-Label, Alles in einer Plattform, Skalierbar, Modular), alle mit lucide-Icons |
| 6 | Feature-Übersicht als Icon-Karten im Grid | PASS | 9 Module in `md:grid-cols-2 lg:grid-cols-3`, jedes mit Icon + Title + Copy |
| 7 | Pricing lädt Preise aus Stripe (Basis + Module) | PASS | `getMarketingPrices()` wird in `page.tsx` SSR-geladen und an `RootPricing` weitergereicht; `basePlan = pricing[0]`, `modules = pricing.slice(1)` |
| 8 | Pricing Fallback wenn keine Preise verfügbar | PASS | `!hasPricing` → Fallback-Block "Preise auf Anfrage" mit Demo-CTA (Zeile 911-924) |
| 9 | Kontakt/Demo-CTA OHNE Registrierungsformular | PASS | `RootContactCta` enthält nur `mailto:`-Link, keine Form-Elemente |
| 10 | Footer mit Impressum & Datenschutz | PASS | Links zu `/impressum` und `/datenschutz` vorhanden; beide Routen existieren unter `src/app/impressum/page.tsx` und `src/app/datenschutz/page.tsx` |
| 11 | Alle Sektionen responsive | PASS | Tailwind Breakpoints konsistent verwendet: Hero `lg:grid-cols-[1.1fr_0.9fr]`, Value Props `md:grid-cols-2 xl:grid-cols-4`, Modules `md:grid-cols-2 lg:grid-cols-3`, Header `md:flex` Nav. Kein horizontales Overflow erkennbar |
| 12 | Tenant-Kontext → Redirect zu `/login` | PASS | `page.tsx` Zeile 9-11: `if (tenant) redirect('/login')` — unverändert |
| 13 | `/access`-Passwortschutz-Flow unverändert | PASS | `src/app/access/page.tsx` nutzt weiterhin `PreviewAccessForm`, keine Änderungen |

**Resultat:** 13 / 13 PASS

### Edge Cases

| Case | Status | Kommentar |
|------|--------|-----------|
| Stripe nicht verfügbar (Empty Array) | PASS | `!hasPricing` Fallback greift |
| Keine Stripe-Module konfiguriert (nur Basis) | PASS | `modules.length === 0` → "Weitere Module werden individuell konfiguriert" (Zeile 958-961) |
| Tenant-Subdomain auf Root | PASS | Redirect zu `/login` greift vor Render |
| CTA ohne `mailto`-Konfiguration | N/A | `CONTACT_MAIL` ist hardcoded als Konstante — kein unkonfigurierter Zustand möglich |
| Dark-Mode | PASS | `RootHome` ist primär für Dark gebaut (explizit `bg-slate-950`), ignoriert globalen Light-Mode bewusst gemäß Spec |

### Security Audit (Red-Team)

| Check | Status | Kommentar |
|-------|--------|-----------|
| Auth-Bypass über Landingpage | PASS | Seite ist öffentlich — enthält keine auth-gated Daten. `getMarketingPrices()` nutzt Admin-Client aber liefert nur Public-Pricing |
| Sensible Daten in Response | PASS | Pricing-Items enthalten nur public Felder (code, name, description, amount, currency, interval). Keine Tenant-/User-IDs geleakt |
| XSS über Pricing-Daten | PASS | Alle dynamischen Werte (`name`, `description`) werden als React-Text gerendert, kein `dangerouslySetInnerHTML` |
| CSRF | N/A | Seite ist GET-only, keine Formulare |
| Open Redirect | PASS | Nur statische Anker-Links und hardcoded `mailto:` |
| Secrets in Code | PASS | `CONTACT_MAIL` ist keine Geheimnis; Stripe-Keys werden serverseitig über ENV geladen |
| Rate Limiting | INFO | SSR-Rendering ohne User-Eingaben — kein Angriffsvektor via Form/API |
| Cross-Tenant-Leak | PASS | Keine tenant-spezifischen Daten auf der Root-Seite |

**Security-Resultat:** Keine Findings.

### Bugs / Findings

| # | Severity | Beschreibung | Fundstelle |
|---|----------|--------------|------------|
| 1 | LOW | `returnTo`-Prop wird in `MarketingPagesProps` weiterhin deklariert (Zeile 38) und an die Legacy-Komponente `AccessPanel` weitergereicht, für `RootHome` aber ignoriert. Kein funktionaler Impact, nur leichte API-Inkonsistenz. | `src/components/marketing-pages.tsx:38,1059,1072` |
| 2 | LOW | Hero-Mock-Karte zeigt "Rollen: 3 — Admin · Member · Client", aber laut PRD sind es Owner / Admin / Member (Client ist Read-Only-Portal-User, PROJ-62). Marketing-Abweichung gegenüber Rollen-Modell. | `src/components/marketing-pages.tsx:823-826` |
| 3 | LOW | Hero-Mock-Karte zeigt "Module 12+" — kein klarer Bezug zur tatsächlichen Modul-Anzahl (9 gelistet). Rein Marketing-Wording, aber leicht irreführend wenn Nutzer zählt. | `src/components/marketing-pages.tsx:818-821` |
| 4 | LOW | Nav-Links im Header (Features/Pricing/Kontakt) sind `hidden md:flex` — auf Mobile (375px) fehlt jede Navigation zu den Ankern. User muss scrollen. Nicht kritisch, aber Mobile-UX-Gap. | `src/components/marketing-pages.tsx:748` |
| 5 | INFO | `RootHome` setzt `min-h-screen` und ein absolut positioniertes Radial-Gradient-Div, aber der Elternknoten hat `overflow-hidden` nicht gesetzt. Das Gradient könnte auf sehr kleinen Viewports horizontales Overflow erzeugen. Nicht reproduziert, nur als Hinweis. | `src/components/marketing-pages.tsx:1044-1045` |
| 6 | INFO | Keine explizite `aria-label`-Attribute auf den CTA-Anchors ("Demo anfragen"), Screen-Reader bekommen nur den Text. Text ist aber aussagekräftig — kein Blocker. | mehrere Stellen |

**Keine Critical / High / Medium Bugs.**

### Regression Check (verwandte Deployed Features)

- **PROJ-1 (Subdomain Routing):** Redirect-Logik in `page.tsx` unverändert, Tenant-Kontext weiterhin berücksichtigt.
- **PROJ-3 (User Authentication):** `/access`-Flow und `/login`-Flow nicht berührt.
- **PROJ-14 (Stripe Basis-Abo):** `getMarketingPrices()` wird weiterhin so genutzt wie vorher (SSR).
- **Tenant-Home-Rendering:** Für `tenant !== null` wird weiterhin die alte `MarketingPages`-Logik (Zeile 1065-1082) ausgeführt → keine Regression für Tenant-Seiten.

### Cross-Browser / Responsive

Hinweis: Browser-seitige Tests wurden in diesem QA-Lauf nicht ausgeführt (statischer Review). Basierend auf verwendeten Tailwind-Klassen und shadcn-kompatiblen Primitives ist kompatibles Verhalten bei Chrome/Firefox/Safari zu erwarten. Empfehlung: manueller Smoke-Test auf 375 / 768 / 1440 px in Chrome und Safari vor Deploy.

### Lint / TypeScript

- `npx tsc --noEmit`: keine Fehler
- `npm run lint`: keine neuen Fehler in `marketing-pages.tsx` oder `page.tsx` (bestehende Errors in `use-media-query.ts` und `active-customer-context.tsx` sind vorbestanden und NICHT Teil von PROJ-70)

### Produktions-Empfehlung

**READY FOR DEPLOYMENT**

Alle 13 Acceptance Criteria bestanden, keine Critical/High/Medium-Bugs, Security-Audit ohne Findings. Die 4 LOW-Issues und 2 INFO-Hinweise sind Polish-Kandidaten und kein Deployment-Blocker.

**Empfohlene nächste Schritte:**
1. Optional: LOW-Findings #1-#4 adressieren (insb. #2 "Client" vs. "Member" in Hero-Mock)
2. Manueller Browser-Smoke-Test auf 375/768/1440 px
3. `/deploy` ausführen

### Offene Fragen an User

Welche der LOW-Findings möchtest du vor Deployment beheben lassen?
- a) Alle (#1-#4)
- b) Nur #2 (Rollen-Inkonsistenz)
- c) Keine — direkt deployen


## Deployment
_To be added by /deploy_
