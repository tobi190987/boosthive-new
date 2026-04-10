export const CUSTOMER_INDUSTRIES = [
  'E-Commerce & Retail (Fokus: Direktverkauf, ROAS, Produkte)',
  'Health & Wellness (Ärzte, Pharma, Fitness, Supplements)',
  'Real Estate & Construction (Immobilien, Handwerk, Bau)',
  'Professional Services (Beratung, Agenturen, Recht, Finanzen – B2B Fokus)',
  'SaaS & Technology (Software, IT-Services, Startups)',
  'Education & Coaching (Online-Kurse, Weiterbildung, Schulen)',
  'Automotive (Autohäuser, Werkstätten, Mobilität)',
  'Gastronomy & Tourism (Hotels, Restaurants, Reiseanbieter)',
  'Industrial & Manufacturing (Schwerindustrie, Maschinenbau – oft klassisches B2B)',
  'Beauty & Lifestyle (Kosmetik, Mode, Schmuck)',
  'Home & Garden (Möbel, Gartenbau, Interior)',
  'Non-Profit & Public (Vereine, Behörden, NGOs)',
] as const

export type CustomerIndustry = (typeof CUSTOMER_INDUSTRIES)[number]

export const CUSTOMER_INDUSTRY_ERROR_MESSAGE = 'Bitte wähle eine gültige Branche aus.'

export function isCustomerIndustry(value: string | null | undefined): value is CustomerIndustry {
  return typeof value === 'string' && CUSTOMER_INDUSTRIES.includes(value as CustomerIndustry)
}

