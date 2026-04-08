'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  BookOpen,
  Bot,
  ChevronDown,
  ChevronRight,
  Eye,
  FileText,
  Globe,
  HelpCircle,
  Search,
  Settings2,
  Users2,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

type HelpCategory =
  | 'einstieg'
  | 'dashboard'
  | 'kunden'
  | 'seo'
  | 'ai-visibility'
  | 'ai-performance'
  | 'content'
  | 'verwaltung'
  | 'faq'

interface HelpSection {
  title: string
  paragraphs?: string[]
  bullets?: string[]
}

interface HelpArticle {
  id: string
  category: HelpCategory
  navLabel: string
  title: string
  summary: string
  sections: HelpSection[]
}

const categoryMeta: Record<
  HelpCategory,
  {
    label: string
    icon: React.ComponentType<{ className?: string }>
  }
> = {
  einstieg: { label: 'Erste Schritte', icon: HelpCircle },
  dashboard: { label: 'Dashboard', icon: BookOpen },
  kunden: { label: 'Kunden', icon: Users2 },
  seo: { label: 'SEO', icon: Globe },
  'ai-visibility': { label: 'AI Visibility', icon: Eye },
  'ai-performance': { label: 'AI Performance', icon: Bot },
  content: { label: 'Content & Freigaben', icon: FileText },
  verwaltung: { label: 'Verwaltung', icon: Settings2 },
  faq: { label: 'FAQ', icon: HelpCircle },
}

const articles: HelpArticle[] = [
  {
    id: 'intro-agency-value',
    category: 'einstieg',
    navLabel: 'Produktüberblick',
    title: 'BoostHive als Agentur-Arbeitsumgebung',
    summary:
      'BoostHive ist eine zentrale Arbeitsumgebung für Marketingagenturen. Das System bündelt Kundenverwaltung, SEO, Keyword-Monitoring, KI-Sichtbarkeit, Performance-Auswertung, Content-Produktion, Asset-Verwaltung und Freigaben in einer gemeinsamen Struktur.',
    sections: [
      {
        title: 'Ziel und Einsatzbereich',
        paragraphs: [
          'BoostHive ist dafür ausgelegt, typische Agenturprozesse in einem zusammenhängenden System abzubilden. Anstelle separater Einzeltools für Analyse, Briefing, Kampagnenbewertung, Freigaben und Dokumentation entsteht ein gemeinsamer Workspace mit klarer Kundenzuordnung.',
          'Die Plattform richtet sich insbesondere an Teams, die operative Exzellenz mit sauberem Kundenreporting verbinden möchten. Daten, Aufgaben, Inhalte und Statusinformationen werden nicht isoliert betrachtet, sondern entlang echter Arbeitsabläufe zusammengeführt.',
        ],
        bullets: [
          'Saubere Trennung und Verwaltung mehrerer Kunden innerhalb eines Agentur-Workspaces',
          'Kombination aus Analysemodulen, Produktionsmodulen und Freigabe-Workflows',
          'Bessere Nachvollziehbarkeit von Entscheidungen, Zwischenständen und Ergebnissen',
          'Stärkere Anschlussfähigkeit an Reporting, Kundenpräsentationen und interne Priorisierung',
        ],
      },
      {
        title: 'Operativer Nutzen für Agenturen',
        paragraphs: [
          'Im Agenturalltag entstehen Reibungsverluste häufig dort, wo Informationen in verschiedenen Tools, Tabellen oder Chat-Verläufen verstreut sind. BoostHive reduziert diese Brüche, indem zentrale Datenpunkte und Arbeitsstände an einem Ort zusammenlaufen.',
        ],
        bullets: [
          'Weniger Tool-Wechsel zwischen Audit, Analyse, Briefing, Produktion und Kundenabstimmung',
          'Höhere Transparenz über offene Freigaben, laufende Produktionen und abgeschlossene Inhalte',
          'Bessere Zusammenarbeit zwischen SEO, Content, Paid Media, Projektmanagement und Kundenkontakt',
          'Klarere Kommunikation im Reporting, weil technische Ergebnisse in eine verständliche Marketingsprache überführt werden',
        ],
      },
      {
        title: 'Grundprinzip der Plattform',
        paragraphs: [
          'Fast alle Module profitieren von einer sauberen Kundenzuordnung. Dadurch lassen sich Analysen, Historien, Assets, Freigaben und spätere Berichte systematisch auf denselben Kundenkontext beziehen.',
          'Für den nachhaltigen Einsatz empfiehlt es sich deshalb, Kunden- und Projektdaten früh strukturiert zu pflegen und operative Inhalte nicht losgelöst, sondern stets im passenden fachlichen und organisatorischen Zusammenhang zu bearbeiten.',
        ],
      },
    ],
  },
  {
    id: 'getting-started-checklist',
    category: 'einstieg',
    navLabel: 'Einrichtung neuer Kunden',
    title: 'Einrichtung neuer Kunden-Workspaces',
    summary:
      'Beim Start eines neuen Kunden empfiehlt sich ein geordneter Setup-Prozess. Je sauberer Stammdaten, Module und erste Analysepfade angelegt sind, desto effizienter funktionieren spätere Auswertungen, Produktionen und Freigaben.',
    sections: [
      {
        title: 'Empfohlene Reihenfolge',
        paragraphs: [
          'Die ersten Schritte im Workspace sollten nicht rein auf operative To-dos reduziert werden. Statt sofort mit Einzelanalysen oder Inhalten zu beginnen, ist es sinnvoll, zuerst die Grundlage für konsistente Arbeit und saubere Datenhaltung zu schaffen.',
        ],
        bullets: [
          'Kundenprofil anlegen und die Hauptdomain, Branche sowie Ansprechpartner hinterlegen',
          'Verfügbare Integrationen vorbereiten, insbesondere Google Search Console',
          'Unter Abrechnung prüfen, welche Module aktiv, gesperrt oder perspektivisch geplant sind',
          'Die erste SEO Analyse als Basisaudit aufsetzen',
          'Keywordranking und AI Visibility für fortlaufendes Monitoring vorbereiten',
          'Content Briefs, Anzeigen-Texte und Creatives später in Freigabe- und Produktionsprozesse überführen',
        ],
      },
      {
        title: 'Empfehlungen für einen sauberen Start',
        paragraphs: [
          'Viele spätere Rückfragen entstehen nicht durch fehlende Funktionen, sondern durch unvollständige Stammdaten oder uneinheitliche Zuordnung. Eine gute Anfangsstruktur spart deshalb dauerhaft Zeit und reduziert Abstimmungsaufwand.',
        ],
        bullets: [
          'Möglichst immer mit Kundenzuordnung arbeiten',
          'Interne Notizen früh pflegen, damit Teammitglieder Positionierung und Besonderheiten verstehen',
          'Nutzerfragen für AI Visibility realitätsnah formulieren und nicht aus internen Fachbegriffen ableiten',
          'Bereits zu Beginn definieren, welche Module tatsächlich operativ genutzt werden sollen',
        ],
      },
      {
        title: 'Typische Startkonstellation',
        paragraphs: [
          'Für viele Agenturen hat sich folgende Startkonstellation bewährt: zunächst Website-Basis mit SEO prüfen, danach organische Sichtbarkeit über Rankings beobachten und anschließend ergänzend die KI-Sichtbarkeit sowie Performance-Daten in den Blick nehmen. Produktionsthemen und Freigaben werden anschließend schrittweise in denselben Kundenkontext integriert.',
        ],
      },
    ],
  },
  {
    id: 'keyboard-shortcuts',
    category: 'einstieg',
    navLabel: 'Tastaturkürzel',
    title: 'Tastaturkürzel & Schnellnavigation',
    summary:
      'BoostHive unterstützt Tastaturkürzel für schnelleres Navigieren und Arbeiten. Die wichtigsten Shortcuts sind jederzeit über die Befehlspalette oder das Shortcut-Modal abrufbar.',
    sections: [
      {
        title: 'Shortcut-Übersicht öffnen',
        paragraphs: [
          'Drücke ? (Fragezeichen) an einer beliebigen Stelle im Workspace, um die vollständige Shortcut-Übersicht zu öffnen. Das Modal zeigt alle verfügbaren Kürzel nach Kategorie geordnet. Es schließt sich mit Escape.',
        ],
      },
      {
        title: 'Befehlspalette',
        paragraphs: [
          'Mit ⌘K (Mac) bzw. Strg+K (Windows/Linux) öffnet sich die Befehlspalette. Damit kannst du jede Seite im Workspace direkt anspringen, nach Kunden suchen oder zu einem bestimmten Content-Element navigieren — ohne die Maus zu benutzen.',
        ],
      },
      {
        title: 'Verfügbare Kürzel',
        bullets: [
          '? — Shortcut-Übersicht öffnen',
          '⌘K / Strg+K — Befehlspalette öffnen',
          'G D — Direkt zum Dashboard navigieren',
          'G C — Direkt zur Kunden-Übersicht navigieren',
          'Esc — Offene Dialoge und Modals schließen',
        ],
      },
      {
        title: 'Hinweise',
        paragraphs: [
          'Shortcuts sind nur aktiv, wenn kein Eingabefeld fokussiert ist. Beim Schreiben in einem Textfeld oder einer Suche werden Kürzel wie ? nicht ausgelöst.',
        ],
      },
    ],
  },
  {
    id: 'dashboard-metrics',
    category: 'dashboard',
    navLabel: 'Dashboard',
    title: 'Dashboard und tägliche Steuerung',
    summary:
      'Das Dashboard ist die zentrale Übersichtsseite für den täglichen Einstieg in den Workspace. Es bündelt zentrale Kennzahlen, jüngste Aktivitäten und den aktuellen Status wichtiger Arbeitsbereiche.',
    sections: [
      {
        title: 'Funktion des Dashboards',
        paragraphs: [
          'Das Dashboard dient nicht als Detailreport, sondern als Management- und Priorisierungsansicht. Es hilft dabei, schnell zu erkennen, welche Themen heute Aufmerksamkeit benötigen und wo sich im Workspace zuletzt relevante Veränderungen ergeben haben.',
        ],
      },
      {
        title: 'Wesentliche Kennzahlen',
        bullets: [
          'Offene Freigaben: Inhalte, die noch auf Kundenfeedback warten oder bei denen Änderungen angefragt wurden',
          'Content Briefs: Anzahl vorhandener Briefings im Workspace',
          'Kunden: Anzahl der angelegten Kundenprofile',
          'Ads: vorhandene Ad-Generierungen oder Asset-Historien',
        ],
      },
      {
        title: 'Praktische Nutzung im Alltag',
        paragraphs: [
          'Für Projektmanager, Teamleads und Account-Verantwortliche eignet sich das Dashboard besonders als täglicher Startpunkt. Die Übersicht unterstützt dabei, operative Aufgaben zu ordnen, auf Kundenreaktionen zu reagieren und Produktionsengpässe früh zu erkennen.',
        ],
        bullets: [
          'Priorisierung offener Freigaben und Produktionsbedarfe',
          'Schneller Überblick über jüngste Aktivitäten in Briefs, Ads oder Freigaben',
          'Kontrolle, welche Module aktiv, gesperrt oder auslaufend sind',
          'Sofortige Orientierung für interne Abstimmungen und Team-Tagesplanung',
        ],
      },
    ],
  },
  {
    id: 'customers-and-integrations',
    category: 'kunden',
    navLabel: 'Kundenverwaltung',
    title: 'Kundenverwaltung und Integrationen',
    summary:
      'Die Kundenverwaltung bildet die organisatorische Grundlage des Systems. Sie sorgt dafür, dass Analysen, Inhalte, Dokumente, Integrationen und Freigaben konsistent demselben Kunden zugeordnet werden können.',
    sections: [
      {
        title: 'Stammdaten im Kundenprofil',
        paragraphs: [
          'Im Kundenprofil werden die wichtigsten organisatorischen und fachlichen Grundlagen gepflegt. Dazu gehören nicht nur Name und Domain, sondern auch Kontextinformationen, die für Produktion, Analyse und Abstimmung relevant sind.',
        ],
        bullets: [
          'Name, Domain und Status',
          'Branche und Kontakt-E-Mail',
          'Logo für White-Label-Kontext und bessere Orientierung',
          'Interne Notizen, Dokumente und Verweise',
        ],
      },
      {
        title: 'Rolle der Kundenzuordnung',
        paragraphs: [
          'Die Kundenzuordnung ist einer der wichtigsten Strukturpunkte in BoostHive. Sie beeinflusst, wie sauber Analysen gefiltert, Historien gelesen und Freigaben zugeordnet werden können. Ohne eindeutige Zuordnung leidet langfristig die Übersichtlichkeit.',
        ],
        bullets: [
          'Bessere Filterbarkeit in Analyse- und Freigabemodulen',
          'Klare Trennung zwischen mehreren Kunden innerhalb desselben Agentur-Workspaces',
          'Sauberere Reporting-Grundlage für spätere Auswertungen',
        ],
      },
      {
        title: 'Verfügbare Integrationen',
        paragraphs: [
          'Im Kundenprofil können vorbereitete Integrationen hinterlegt werden. Diese schaffen eine technische Grundlage für spätere Auswertungen oder strukturierte Kundenarbeit, auch wenn nicht jede Integration in jedem Modul sofort sichtbar genutzt wird.',
        ],
        bullets: [
          'Google Search Console',
          'Google Ads',
          'Meta Pixel',
        ],
      },
      {
        title: 'Empfohlene Pflegepraxis',
        paragraphs: [
          'Es empfiehlt sich, pro Kunde früh die Hauptdomain und zentrale Kontextinformationen zu erfassen. Besonders wertvoll sind interne Notizen zu Positionierung, Angebotsfokus, Freigabewegen, Ansprechpartnern und branchenspezifischen Besonderheiten.',
        ],
      },
    ],
  },
  {
    id: 'seo-audit',
    category: 'seo',
    navLabel: 'SEO Analyse',
    title: 'SEO Analyse und On-Page-Prüfung',
    summary:
      'Die SEO Analyse dient der strukturierten Prüfung einzelner Seiten, mehrerer URLs oder ganzer Domains. Sie identifiziert technische und inhaltliche Optimierungspotenziale und verdichtet sie in einer priorisierbaren Übersicht.',
    sections: [
      {
        title: 'Analysearten und Einsatzszenarien',
        paragraphs: [
          'Die SEO Analyse kann für unterschiedliche Tiefenstufen verwendet werden. Damit eignet sie sich sowohl für schnelle Landingpage-Prüfungen als auch für breitere Domain-Bewertungen im Rahmen von Audits, Relaunches oder Kundenreviews.',
        ],
        bullets: [
          'Einzelne Seite für Landingpages oder zentrale URL-Prüfungen',
          'Mehrere Seiten für definierte URL-Listen',
          'Gesamte Domain für einen möglichst systematischen Crawl auf Basis der Sitemap',
        ],
      },
      {
        title: 'Geprüfte Inhalte und Signale',
        paragraphs: [
          'Das Modul konzentriert sich auf wesentliche On-Page- und Struktur-Signale, die für Auffindbarkeit, Snippet-Qualität und Seitenverständlichkeit relevant sind.',
        ],
        bullets: [
          'Title und Meta-Description',
          'H1-Struktur und Inhaltslänge',
          'Alt-Texte, Canonical und Open Graph',
          'Interne und externe Links',
          'Technische Basis-Signale und Problem-Listen je Seite',
        ],
      },
      {
        title: 'Interpretation der Ergebnisse',
        paragraphs: [
          'Die eigentliche Stärke der SEO Analyse liegt in der Priorisierung. Statt nur Fehler auszugeben, zeigt die Ansicht, welche Problemarten besonders häufig auftreten und welche Seiten den größten Handlungsbedarf haben.',
        ],
        bullets: [
          'Gesamt-Score als kompakte Qualitätskennzahl',
          'Kritische Problemfilter für häufige Schwachstellen',
          'Seitenbezogene Detailansichten zur operativen Bearbeitung',
          'Automatische Optimierungsvorschläge für einzelne Seiten',
        ],
      },
      {
        title: 'Empfohlene Nutzung im Kundenkontext',
        paragraphs: [
          'Für Kundenarbeit empfiehlt es sich, Analyseergebnisse nicht nur als Fehlerliste zu verwenden, sondern als priorisierte Maßnahmenbasis. Besonders hilfreich ist die Kombination aus Gesamtbild, Problemclustern und konkreten Handlungsschritten pro Seite.',
        ],
      },
    ],
  },
  {
    id: 'seo-competitor-comparison',
    category: 'seo',
    navLabel: 'SEO Vergleich',
    title: 'SEO Vergleich und Wettbewerbsanalyse',
    summary:
      'Der SEO Vergleich stellt die eigene Website strukturell und inhaltlich Wettbewerbern gegenüber. Ziel ist nicht nur eine Bewertung, sondern die Ableitung konkreter Lücken und Prioritäten.',
    sections: [
      {
        title: 'Verglichene Faktoren',
        paragraphs: [
          'Im Vergleichsmodus werden mehrere relevante SEO-Signale gegenübergestellt, um sichtbar zu machen, wo Wettbewerber konsistenter oder stärker aufgestellt sind.',
        ],
        bullets: [
          'Gesamt-Score',
          'Title-Länge und Meta-Description',
          'H1-Struktur',
          'Wortanzahl',
          'Alt-Text-Abdeckung',
          'Canonical, Open Graph und Schema.org',
        ],
      },
      {
        title: 'Nutzen im Agenturalltag',
        paragraphs: [
          'Im Kundenkontext ist der Vergleich häufig wirksamer als ein rein isolierter Audit. Er liefert eine nachvollziehbare Begründung dafür, warum Wettbewerber unter Umständen sichtbarer oder strukturell besser aufgestellt sind.',
        ],
        bullets: [
          'Vorbereitung von Kundenpräsentationen',
          'Argumentationshilfe für Relaunches und Optimierungsmaßnahmen',
          'Konkrete Gap Analysis mit klaren Empfehlungen',
          'Bessere Einordnung zwischen Technik-, Content- und Snippet-Themen',
        ],
      },
      {
        title: 'Empfehlung zur Ergebnisnutzung',
        paragraphs: [
          'Für gute Kundenkommunikation empfiehlt es sich, Vergleichsdaten immer mit einer klaren Priorisierung zu verbinden: Was ist die größte Lücke, welche geschäftliche Relevanz hat sie und welche Maßnahme bringt den sichtbarsten Fortschritt.',
        ],
      },
    ],
  },
  {
    id: 'keyword-ranking',
    category: 'seo',
    navLabel: 'Keywordranking',
    title: 'Keywordranking und Search-Console-Anbindung',
    summary:
      'Das Ranking-Modul bündelt Keyword-Projekte, Wettbewerber, Verlauf und Search-Console-Verknüpfung. Es dient der fortlaufenden Beobachtung organischer Sichtbarkeit und Positionsveränderungen.',
    sections: [
      {
        title: 'Projektaufbau',
        paragraphs: [
          'Jedes Keyword-Projekt bildet einen klar abgegrenzten Themenbereich ab. Dadurch lassen sich Entwicklungen besser interpretieren und Berichte sauberer strukturieren.',
        ],
        bullets: [
          'Ziel-Domain, Sprache und Land definieren',
          'Keywords und Wettbewerber hinterlegen',
          'Search Console verbinden und passende Property auswählen',
          'Optional Vorschläge für Keywords und Wettbewerber nutzen',
        ],
      },
      {
        title: 'Zentrale Kennzahlen',
        paragraphs: [
          'Die Ranking-Ansicht soll vor allem Entwicklung sichtbar machen. Deshalb sind nicht nur aktuelle Positionen relevant, sondern insbesondere ihr Verlauf und ihre Veränderung.',
        ],
        bullets: [
          'Aktuelle Position',
          'Vorherige Position',
          'Delta zur letzten Messung',
          'Ranking-Historie pro Keyword',
          'Status und Zeitpunkt des letzten erfolgreichen Laufs',
        ],
      },
      {
        title: 'Empfohlene Projektlogik',
        paragraphs: [
          'Es ist meist sinnvoller, mehrere fokussierte Ranking-Projekte pro Kunde zu pflegen statt eines einzigen großen Sammelprojekts. Das verbessert Lesbarkeit, Vergleichbarkeit und Priorisierung.',
          'Besonders bei Kunden mit verschiedenen Geschäftsfeldern, Regionen oder Produktclustern lassen sich Veränderungen so deutlich präziser erklären.',
        ],
      },
    ],
  },
  {
    id: 'ai-visibility-overview',
    category: 'ai-visibility',
    navLabel: 'AI Visibility',
    title: 'AI Visibility und Sichtbarkeit in KI-Antworten',
    summary:
      'AI Visibility misst, wie häufig und wie positiv eine Marke in Antworten von KI-Modellen erscheint. Gleichzeitig zeigt das Modul, wie sie im Vergleich zu Wettbewerbern innerhalb bestimmter Fragestellungen abschneidet.',
    sections: [
      {
        title: 'Projektaufbau und Analysebasis',
        paragraphs: [
          'Ein AI-Visibility-Projekt basiert auf einer klaren Definition von Marke, Website, Wettbewerbern und Nutzerfragen. Die Qualität dieser Eingaben beeinflusst direkt die Belastbarkeit der späteren Ergebnisse.',
        ],
        bullets: [
          'Brand-Name und optional Website festlegen',
          'Bis zu drei Wettbewerber definieren',
          'Keywords als echte Nutzerfragen formulieren',
          'KI-Modelle und Iterationen auswählen',
          'API-Call-Schätzung vor dem Start prüfen',
        ],
      },
      {
        title: 'Zentrale Kennzahlen im Report',
        paragraphs: [
          'Die Reportansicht verdichtet mehrere Antwortläufe unterschiedlicher Modelle zu einem lesbaren Gesamtbild. Dadurch wird sichtbar, ob eine Marke erwähnt wird, wie stark sie präsent ist und in welchem Ton über sie gesprochen wird.',
        ],
        bullets: [
          'Share of Model als Anteil der Markensichtbarkeit innerhalb eines Modells',
          'GEO-Score als verdichtete Kennzahl für Sichtbarkeit und Relevanz',
          'Sentiment als Einordnung positiver, neutraler oder negativer Tonalität',
          'Source Gap als Hinweis auf fehlende zitierfähige Quellen',
          'Quellenanalyse für häufig genutzte Referenzdomains',
        ],
      },
      {
        title: 'Benchmark, Matrix und Empfehlungen',
        paragraphs: [
          'Der besondere Wert des Moduls liegt im Wettbewerbsvergleich. Die Benchmark-Matrix zeigt, welche Wettbewerber in welchen Fragen dominieren und wo die eigene Marke stärker oder schwächer sichtbar ist.',
        ],
        bullets: [
          'Benchmark-Matrix pro Keyword und Wettbewerber',
          'Priorisierte Handlungsempfehlungen mit Statusverfolgung',
          'Timeline zur Beobachtung der Entwicklung über mehrere Analyseläufe',
          'Bessere Grundlage für strategische Maßnahmen im Bereich Sichtbarkeit, Content und Quellenaufbau',
        ],
      },
      {
        title: 'Hinweis zur Interpretation',
        paragraphs: [
          'Leichte Schwankungen zwischen Modellen und Iterationen sind normal, weil generative Systeme nicht immer identische Antworten erzeugen. Für belastbarere Aussagen sollten Ergebnisse deshalb nicht nur punktuell, sondern über mehrere Läufe hinweg betrachtet werden.',
        ],
      },
    ],
  },
  {
    id: 'ai-performance-guide',
    category: 'ai-performance',
    navLabel: 'AI Performance',
    title: 'AI Performance und CSV-basierte Kampagnenanalyse',
    summary:
      'AI Performance wertet Kampagnen-Daten aus CSV-Dateien aus und übersetzt Rohdaten in verständliche Insights. Ziel ist eine schnellere Beurteilung von Leistung, Effizienz und Optimierungspotenzialen.',
    sections: [
      {
        title: 'Typische Datenquellen',
        paragraphs: [
          'Das Modul ist besonders hilfreich, wenn Werbedaten bereits exportiert wurden und nun für interne Reviews, Team-Entscheidungen oder Kundenberichte aufbereitet werden sollen.',
        ],
        bullets: [
          'CSV-Exporte aus Meta, Google oder TikTok',
          'Einzelanalysen eines Datensatzes',
          'Vergleiche zwischen zwei Kampagnenphasen oder Plattformen',
          'Historische Rückblicke auf bereits geladene Analysen',
        ],
      },
      {
        title: 'Wichtige KPI-Gruppen',
        paragraphs: [
          'Je nach Quelle erkennt das System unterschiedliche KPI-Strukturen. Im Vordergrund stehen Reichweite, Effizienz, Klickqualität und Conversion-Leistung.',
        ],
        bullets: [
          'Kosten, Impressionen, Klicks und Link-Klicks',
          'Reichweite, Conversion-Rate und Conversions',
          'CTR, CPC, CPM, CPA und Frequenz',
          'Je nach Plattform zusätzlich Interaktionen, Reaktionen, Kommentare oder Saves',
        ],
      },
      {
        title: 'Nutzen für Reporting und Optimierung',
        paragraphs: [
          'AI Performance hilft besonders dann, wenn aus umfangreichen Tabellen schnell eine verständliche Aussage für Team oder Kunde werden soll. Das spart Zeit in Reviews, Status-Calls und Monatsreports.',
        ],
        bullets: [
          'Schnelle Lagebilder direkt nach einem Export aus dem Ads Manager',
          'Bessere Aufbereitung für Kundenreportings',
          'Leichteres Vergleichen von Creatives, Zielgruppen oder Zeiträumen',
          'Hilfreiche Grundlage für nächste Optimierungsschritte in Paid-Kampagnen',
        ],
      },
    ],
  },
  {
    id: 'content-and-production',
    category: 'content',
    navLabel: 'Content & Produktion',
    title: 'Content Briefs, Ad Generator und Ads Bibliothek',
    summary:
      'Diese Module verbinden strategische Vorbereitung, Textproduktion, Asset-Verwaltung und Freigabeprozesse in einem durchgängigen Arbeitsablauf.',
    sections: [
      {
        title: 'Content Briefs',
        paragraphs: [
          'Content Briefs sind für viele Agenturen der strategische Ausgangspunkt der Content-Produktion. Sie strukturieren Suchintention, Outline, Keyword-Set und inhaltliche Schwerpunkte bereits vor der eigentlichen Erstellung.',
        ],
        bullets: [
          'Suchintention, H1-Vorschläge und Meta-Descriptions',
          'Outline, Keyword-Hinweise und interne Verlinkung',
          'Export-, Druck- und Freigabe-Möglichkeiten',
        ],
      },
      {
        title: 'Ad Generator',
        paragraphs: [
          'Der Ad Generator dient als Produktionshilfe für Anzeigen-Texte. Er ist besonders nützlich, wenn schnell mehrere Hooks, Varianten oder Richtungen für Paid-Kampagnen entwickelt werden sollen.',
        ],
        bullets: [
          'Texterstellung für unterschiedliche Anzeigenformate',
          'Schnelle Variantenbildung für Paid-Social- und Search-Kampagnen',
          'Gute Grundlage für interne Abstimmung und Kundenfreigabe',
        ],
      },
      {
        title: 'Ads Bibliothek',
        paragraphs: [
          'Die Ads Bibliothek sorgt dafür, dass Bilder und Videos nicht in Einzelordnern oder Chat-Verläufen verloren gehen. Stattdessen bleiben Assets sauber kundenzugeordnet und mit relevanten Metadaten auffindbar.',
        ],
        bullets: [
          'Zentrale Ablage für Bilder und Videos',
          'Metadaten wie Format, Größe, Seitenverhältnis und Dauer',
          'Status und Notizen für Produktions- und Freigabe-Kontext',
          'Bessere Wiederverwendbarkeit freigegebener Werbemittel',
        ],
      },
    ],
  },
  {
    id: 'approvals-and-kanban',
    category: 'content',
    navLabel: 'Freigaben & Kanban',
    title: 'Freigaben und Kanban-Steuerung',
    summary:
      'Freigaben und Kanban dienen der Transparenz über Produktionsstände, Kundenfeedback und Abschlussstatus. Damit werden Inhalte nicht nur produziert, sondern auch prozessual sauber begleitet.',
    sections: [
      {
        title: 'Freigabeprozesse',
        paragraphs: [
          'Freigaben machen den Status von Inhalten transparent. Statt Feedback in E-Mails oder Messengern zu sammeln, bleibt die Historie direkt am jeweiligen Inhalt sichtbar.',
        ],
        bullets: [
          'Unterstützt Content Briefs, Ad-Texte und Ad-Creatives',
          'Zeigt Status, Feedback und Historie',
          'Erlaubt schnelle Rücksprünge in den jeweiligen Ursprungskontext',
        ],
      },
      {
        title: 'Kanban Board',
        paragraphs: [
          'Das Kanban Board verbindet verschiedene Inhaltstypen in einer gemeinsamen Produktionssicht. Das ist besonders hilfreich, wenn mehrere Teams oder Rollen parallel an denselben Kunden arbeiten.',
        ],
        bullets: [
          'Strukturiert Inhalte in offen, in Bearbeitung, Kundenreview und erledigt',
          'Hilft Teams, Produktionsvolumen und Prioritäten sichtbar zu halten',
          'Reduziert Abstimmung über externe Chat- oder PM-Tools',
          'Macht sofort sichtbar, welche Inhalte noch intern hängen oder bereits beim Kunden liegen',
        ],
      },
    ],
  },
  {
    id: 'workspace-admin',
    category: 'verwaltung',
    navLabel: 'Team, Profil und Abrechnung',
    title: 'Team, Profil, Datenschutz und Abrechnung',
    summary:
      'Im Verwaltungsbereich werden Zugänge, Markenangaben, rechtliche Funktionen und gebuchte Module gesteuert. Dieser Bereich bildet die administrative Grundlage des Workspaces.',
    sections: [
      {
        title: 'Team und Rollen',
        paragraphs: [
          'Der Teambereich ist für alle Themen rund um Zugänge und Verantwortlichkeiten gedacht. Gerade bei wachsenden Teams ist es wichtig, Einladungen, Rollen und offene Zugänge sauber zu verwalten.',
        ],
        bullets: [
          'Mitglieder einladen und offene Einladungen nachverfolgen',
          'Admins und User sauber voneinander trennen',
          'Zugriffe direkt im Tenant verwalten',
        ],
      },
      {
        title: 'Profil und Branding',
        paragraphs: [
          'Im Profilbereich werden persönliche Angaben und Workspace-nahe Stammdaten gepflegt. Dazu gehören sowohl eigene Profildaten als auch branding-relevante Angaben wie das Tenant-Logo.',
        ],
        bullets: [
          'Name, Avatar und Benachrichtigungen pflegen',
          'Tenant-Logo für White-Label-Kontext hinterlegen',
          'Abrechnungsinformationen an einer Stelle pflegen',
        ],
      },
      {
        title: 'Rechtliches und Billing',
        paragraphs: [
          'Rechtliches und Abrechnung sind bewusst nah an den administrativen Funktionen gehalten, damit Datenschutz, Nachweisbarkeit und Modulsteuerung nicht über verschiedene Stellen verteilt sind.',
        ],
        bullets: [
          'AV-Vertrag als PDF erzeugen',
          'Datenauszug exportieren und Löschungen protokollieren',
          'Gebuchte Module, Rechnungen und Zahlungsstatus einsehen',
          'Aktive, auslaufende oder gesperrte Module schnell erkennen',
        ],
      },
    ],
  },
  {
    id: 'faq-common',
    category: 'faq',
    navLabel: 'FAQ & Fehlerbehebung',
    title: 'FAQ und Fehlerbehebung',
    summary:
      'Dieser Bereich beantwortet typische Fragen zu Setup, Datenlage, Analyseergebnissen und Statusanzeigen. Er dient der schnellen fachlichen Einordnung häufiger Rückfragen im Agenturalltag.',
    sections: [
      {
        title: 'Häufige Rückfragen',
        paragraphs: [
          'Viele Fragen im operativen Alltag wiederholen sich. Häufig geht es nicht um technische Fehler, sondern um die richtige Interpretation von Ergebnissen, den Status einzelner Module oder die Voraussetzungen bestimmter Funktionen.',
        ],
        bullets: [
          'Warum zeigt mein GEO-Score 0 Prozent?',
          'Warum startet meine SEO Analyse nur für eine URL?',
          'Warum sehe ich gesperrte Module?',
          'Warum taucht ein Inhalt nicht in den Freigaben auf?',
          'Warum wirken AI-Visibility-Ergebnisse manchmal schwankend?',
        ],
      },
      {
        title: 'Schnelle Einordnung',
        bullets: [
          'Ein GEO-Score von 0 deutet meist darauf hin, dass deine Marke in den ausgewerteten Antworten nicht oder kaum vorkam',
          'Fehlt eine Sitemap, analysiert die SEO Analyse bei Domain-Checks oft nur die angegebene URL',
          'Gesperrte Module sind in der Regel nicht aktiv gebucht oder bereits ausgelaufen',
          'Inhalte erscheinen erst dann in Freigaben, wenn sie wirklich in einen Freigabeprozess übergeben wurden',
          'AI-Visibility-Ergebnisse können je nach Modell und Iteration etwas schwanken, weil generative Systeme nicht immer identische Antworten erzeugen',
        ],
      },
      {
        title: 'Empfohlene Vorgehensweise bei Unklarheiten',
        paragraphs: [
          'Vor einer technischen Fehlersuche lohnt sich fast immer zuerst eine fachliche Prüfung: Ist die Kundenzuordnung korrekt? Wurde das richtige Modul verwendet? Sind die Voraussetzungen wie Sitemap, Integrationen oder Freigabeschritt überhaupt erfüllt?',
        ],
      },
    ],
  },
]

const orderedCategories: HelpCategory[] = [
  'einstieg',
  'dashboard',
  'kunden',
  'seo',
  'ai-visibility',
  'ai-performance',
  'content',
  'verwaltung',
  'faq',
]

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function HelpCenterPage() {
  const [query, setQuery] = useState('')
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null)

  const filteredArticles = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    if (!normalizedQuery) return articles

    return articles.filter((article) => {
      const haystack = [
        article.navLabel,
        article.title,
        article.summary,
        ...article.sections.flatMap((section) => [
          section.title,
          ...(section.paragraphs ?? []),
          ...(section.bullets ?? []),
        ]),
      ]
        .join(' ')
        .toLowerCase()

      return haystack.includes(normalizedQuery)
    })
  }, [query])

  const groupedArticles = useMemo(
    () =>
      orderedCategories
        .map((category) => ({
          category,
          items: filteredArticles.filter((article) => article.category === category),
        }))
        .filter((group) => group.items.length > 0),
    [filteredArticles]
  )

  const [selectedArticleId, setSelectedArticleId] = useState(articles[0]?.id ?? '')

  useEffect(() => {
    if (!filteredArticles.some((article) => article.id === selectedArticleId)) {
      setSelectedArticleId(filteredArticles[0]?.id ?? '')
    }
  }, [filteredArticles, selectedArticleId])

  const selectedArticle =
    filteredArticles.find((article) => article.id === selectedArticleId) ??
    filteredArticles[0] ??
    null

  const selectedCategory = selectedArticle ? categoryMeta[selectedArticle.category] : null

  const selectedSectionLinks = useMemo(() => {
    if (!selectedArticle) return []
    return selectedArticle.sections.map((section) => ({
      title: section.title,
      id: `${selectedArticle.id}-${slugify(section.title)}`,
    }))
  }, [selectedArticle])

  useEffect(() => {
    setActiveSectionId(selectedSectionLinks[0]?.id ?? null)
  }, [selectedSectionLinks])

  function handleSectionJump(sectionId: string) {
    setActiveSectionId(sectionId)
    const element = document.getElementById(sectionId)
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-white px-6 py-6 shadow-sm dark:border-border dark:bg-card">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-700 dark:bg-secondary dark:text-slate-200">
              <BookOpen className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-slate-950 dark:text-slate-50">
                Dokumentation
              </h1>
              <p className="mt-1 text-sm leading-7 text-slate-500 dark:text-slate-400">
                Technische und inhaltliche Dokumentation aller Module für den Agentur-Workspace.
              </p>
            </div>
          </div>

          <div className="relative w-full max-w-md">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Themen durchsuchen"
              className="h-11 rounded-2xl border-slate-200 bg-slate-50 pl-11 dark:border-border dark:bg-secondary"
            />
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-border dark:bg-card">
        <div className="grid min-h-[760px] xl:grid-cols-[340px_minmax(0,1fr)]">
          <aside className="border-b border-slate-200 bg-slate-50/70 dark:border-border dark:bg-secondary/30 xl:border-b-0 xl:border-r">
            <div className="border-b border-slate-200 px-5 py-5 dark:border-border">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">
                Module
              </p>
            </div>

            <div className="px-3 py-4">
              <div className="space-y-5">
                {groupedArticles.map((group) => {
                  const category = categoryMeta[group.category]
                  const Icon = category.icon
                  const categoryHasSelected = group.items.some((article) => article.id === selectedArticleId)

                  return (
                    <div key={group.category}>
                      <div className="mb-2 flex items-center gap-2 px-2">
                        <Icon className="h-4 w-4 text-slate-400 dark:text-slate-500" />
                        <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                          {category.label}
                        </p>
                      </div>

                      <div className="space-y-1">
                        {group.items.map((article) => {
                          const active = article.id === selectedArticleId
                          return (
                            <div key={article.id}>
                              <button
                                type="button"
                                onClick={() => setSelectedArticleId(article.id)}
                                className={cn(
                                  'flex w-full items-start justify-between gap-3 rounded-2xl px-3 py-3 text-left text-sm transition',
                                  active
                                    ? 'bg-slate-200 text-slate-900 shadow-sm dark:bg-card dark:text-slate-50'
                                    : 'text-slate-600 hover:bg-white hover:text-slate-900 dark:text-slate-400 dark:hover:bg-card dark:hover:text-slate-100'
                                )}
                              >
                                <span className="max-w-full leading-6">{article.navLabel}</span>
                                {active ? <ChevronDown className="mt-1 h-4 w-4 shrink-0" /> : null}
                              </button>

                              {active ? (
                                <div className="ml-3 mt-1 space-y-1 border-l border-slate-200 pl-4 dark:border-border">
                                  {selectedSectionLinks.map((section) => (
                                    <button
                                      key={section.id}
                                      type="button"
                                      onClick={() => handleSectionJump(section.id)}
                                      className={cn(
                                        'flex w-full items-start gap-2 rounded-xl px-2 py-2 text-left text-xs leading-5 transition',
                                        activeSectionId === section.id
                                          ? 'bg-white text-slate-900 dark:bg-secondary dark:text-slate-100'
                                          : 'text-slate-500 hover:bg-white hover:text-slate-900 dark:text-slate-400 dark:hover:bg-card dark:hover:text-slate-100'
                                      )}
                                    >
                                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-300 dark:bg-slate-500" />
                                      <span>{section.title}</span>
                                    </button>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                          )
                        })}
                      </div>

                      {!categoryHasSelected ? null : null}
                    </div>
                  )
                })}
              </div>
            </div>
          </aside>

          <div className="min-w-0 px-6 py-6 sm:px-8 sm:py-8">
            {selectedArticle ? (
              <div className="space-y-8">
                <div className="border-b border-slate-200 pb-6 dark:border-border">
                  <div className="space-y-4">
                    <Badge
                      variant="outline"
                      className="rounded-full border-slate-200 bg-slate-50 text-slate-600 dark:border-border dark:bg-secondary dark:text-slate-300"
                    >
                      {selectedCategory?.label}
                    </Badge>
                    <h2 className="text-4xl font-bold tracking-tight text-slate-950 dark:text-slate-50">
                      {selectedArticle.title}
                    </h2>
                    <p className="max-w-4xl text-lg leading-9 text-slate-600 dark:text-slate-300">
                      {selectedArticle.summary}
                    </p>
                  </div>
                </div>

                <div className="space-y-12">
                  {selectedArticle.sections.map((section) => {
                    const sectionId = `${selectedArticle.id}-${slugify(section.title)}`

                    return (
                      <section key={section.title} id={sectionId} className="scroll-mt-24 space-y-5">
                        <div className="border-b border-slate-200 pb-3 dark:border-border">
                          <h3 className="text-2xl font-bold tracking-tight text-slate-950 dark:text-slate-50">
                            {section.title}
                          </h3>
                        </div>

                        {section.paragraphs?.map((paragraph) => (
                          <p
                            key={paragraph}
                            className="max-w-4xl text-lg leading-9 text-slate-600 dark:text-slate-300"
                          >
                            {paragraph}
                          </p>
                        ))}

                        {section.bullets?.length ? (
                          <ul className="space-y-3">
                            {section.bullets.map((bullet) => (
                              <li
                                key={bullet}
                                className="flex items-start gap-4 text-lg leading-9 text-slate-700 dark:text-slate-300"
                              >
                                <span className="mt-4 h-2 w-2 shrink-0 rounded-full bg-slate-300 dark:bg-slate-500" />
                                <span>{bullet}</span>
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </section>
                    )
                  })}
                </div>
              </div>
            ) : (
              <div className="flex min-h-[420px] items-center justify-center">
                <div className="text-center">
                  <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                    Kein Thema gefunden
                  </p>
                  <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                    Passe den Suchbegriff an, um ein Dokumentationsthema auszuwählen.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}
