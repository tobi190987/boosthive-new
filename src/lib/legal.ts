export interface ImprintSection {
  title: string
  lines: string[]
}

export interface ImprintContent {
  eyebrow: string
  title: string
  description: string
  sections: ImprintSection[]
}

export interface SubprocessorEntry {
  slug: string
  name: string
  purpose: string
  serverLocation: string
  guarantee: string
  website: string
  notes?: string
}

export const imprintContent: ImprintContent = {
  eyebrow: 'Impressum',
  title: 'Angaben gemäß Paragraph 5 TMG',
  description: 'Rechtliche Pflichtangaben für BoostHive und die vorgeschalteten Informationsseiten.',
  sections: [
    {
      title: 'Anbieter',
      lines: ['Ringelsiep/Wollenweber GbR', 'Rathoffsweg 7', '44379 Dortmund'],
    },
    {
      title: 'Vertreten durch',
      lines: ['Daniel Ringelsiep', 'Tobias Wollenweber'],
    },
    {
      title: 'Kontakt',
      lines: ['Telefon: 0208 20585264', 'E-Mail: service@digitalbee.de'],
    },
    {
      title: 'Umsatzsteuer-ID',
      lines: ['Umsatzsteuer-Identifikationsnummer gemäß Paragraph 27 a Umsatzsteuergesetz: DE3121322'],
    },
    {
      title: 'EU-Streitschlichtung',
      lines: [
        'Plattform der EU-Kommission zur Online-Streitbeilegung:',
        'https://ec.europa.eu/consumers/odr/',
        'Unsere E-Mail-Adresse findest du oben im Impressum.',
      ],
    },
    {
      title: 'Verbraucherstreitbeilegung',
      lines: [
        'Wir sind nicht bereit oder verpflichtet, an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen.',
      ],
    },
  ],
}

export const SUBPROCESSOR_LAST_AUDIT_LABEL = 'April 2026'

export function getSubprocessorEntries(): SubprocessorEntry[] {
  return [
    {
      slug: 'supabase',
      name: 'Supabase, Inc.',
      purpose: 'Datenbank-Infrastruktur & Authentifizierung',
      serverLocation: 'EU (Frankfurt, DE)',
      guarantee: 'DPA + Hosting in DE (via AWS)',
      website: 'https://supabase.com',
    },
    {
      slug: 'vercel',
      name: 'Vercel Inc.',
      purpose: 'Hosting der Web-App & Edge Functions',
      serverLocation: 'EU (Frankfurt, DE)',
      guarantee: 'DPA + EU-U.S. Data Privacy Framework',
      website: 'https://vercel.com',
    },
    {
      slug: 'stripe',
      name: 'Stripe, Inc.',
      purpose: 'Abwicklung von Zahlungen & Rechnungsstellung',
      serverLocation: 'Global (USA/EU)',
      guarantee: 'DPA + EU-U.S. Data Privacy Framework',
      website: 'https://stripe.com',
    },
    {
      slug: 'anthropic',
      name: 'Anthropic, PBC',
      purpose: 'KI-Modelle zur Analyse von Marketingdaten',
      serverLocation: 'USA',
      guarantee: 'Standardvertragsklauseln (SCC)',
      website: 'https://www.anthropic.com',
    },
    {
      slug: 'openrouter',
      name: 'OpenRouter',
      purpose: 'API-Gateway für LLM-Routing',
      serverLocation: 'USA / Global',
      guarantee: 'DPA + SCC',
      website: 'https://openrouter.ai',
    },
    {
      slug: 'google',
      name: 'Google Ireland Ltd.',
      purpose: 'Google Search Console, GA4 & Ads Rohdaten',
      serverLocation: 'EU / Global',
      guarantee: 'Google Cloud DPA + SCC',
      website: 'https://developers.google.com',
    },
    {
      slug: 'meta',
      name: 'Meta Platforms Ireland Ltd.',
      purpose: 'Werbeanzeigen-Performance & Metriken',
      serverLocation: 'EU / Global',
      guarantee: 'Meta Business DPA + SCC',
      website: 'https://www.facebook.com/business',
    },
    {
      slug: 'tiktok',
      name: 'TikTok Technology Ltd.',
      purpose: 'Werbe-Performance & Kampagnendaten',
      serverLocation: 'EU (Irland)',
      guarantee: 'TikTok Privacy DPA + SCC',
      website: 'https://ads.tiktok.com',
    },
    {
      slug: 'mailtrap',
      name: 'Mailtrap (Railsware)',
      purpose: 'Versand von Reports & System-E-Mails',
      serverLocation: 'USA / EU',
      guarantee: 'EU-U.S. Data Privacy Framework',
      website: 'https://mailtrap.io',
    },
  ]
}
