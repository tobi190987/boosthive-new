// ─── Ad Text Generator: Plattform- & Zeichenlimit-Konfiguration ─────────────
// Single Source of Truth für Frontend (Zeichenzähler) und Backend (Validierung)

export type PlatformId = 'facebook' | 'linkedin' | 'tiktok' | 'google'
export type AdCategory = 'social' | 'paid'

export interface AdFieldConfig {
  name: string
  label: string
  limit: number
  required: boolean
  /** If set, this field appears N times (e.g. 15 headlines for RSA) */
  multiple?: number
}

export interface AdTypeConfig {
  id: string
  label: string
  category: AdCategory
  fields: AdFieldConfig[]
}

export interface PlatformConfig {
  id: PlatformId
  label: string
  adTypes: AdTypeConfig[]
}

// ─── Facebook ────────────────────────────────────────────────────────────────

const facebook: PlatformConfig = {
  id: 'facebook',
  label: 'Facebook',
  adTypes: [
    {
      id: 'fb_feed',
      label: 'Feed Ad',
      category: 'social',
      fields: [
        { name: 'primaryText', label: 'Primary Text', limit: 125, required: true },
        { name: 'headline', label: 'Headline', limit: 40, required: true },
        { name: 'description', label: 'Description', limit: 30, required: true },
      ],
    },
    {
      id: 'fb_carousel',
      label: 'Carousel Ad',
      category: 'social',
      fields: [
        { name: 'primaryText', label: 'Primary Text', limit: 125, required: true },
        { name: 'headline', label: 'Headline (je Karte)', limit: 40, required: true },
        { name: 'description', label: 'Description (je Karte)', limit: 20, required: true },
      ],
    },
    {
      id: 'fb_story',
      label: 'Story Ad',
      category: 'social',
      fields: [
        { name: 'primaryText', label: 'Primary Text', limit: 125, required: true },
        { name: 'headline', label: 'Headline', limit: 40, required: true },
      ],
    },
    {
      id: 'fb_collection',
      label: 'Collection Ad',
      category: 'social',
      fields: [
        { name: 'primaryText', label: 'Primary Text', limit: 125, required: true },
        { name: 'headline', label: 'Headline', limit: 40, required: true },
      ],
    },
  ],
}

// ─── LinkedIn ────────────────────────────────────────────────────────────────

const linkedin: PlatformConfig = {
  id: 'linkedin',
  label: 'LinkedIn',
  adTypes: [
    {
      id: 'li_sponsored',
      label: 'Sponsored Content',
      category: 'paid',
      fields: [
        { name: 'introductoryText', label: 'Introductory Text', limit: 150, required: true },
        { name: 'headline', label: 'Headline', limit: 70, required: true },
        { name: 'description', label: 'Description', limit: 100, required: true },
      ],
    },
    {
      id: 'li_carousel',
      label: 'Carousel Ad',
      category: 'paid',
      fields: [
        { name: 'introductoryText', label: 'Introductory Text', limit: 255, required: true },
        { name: 'headline', label: 'Headline (je Karte)', limit: 45, required: true },
      ],
    },
    {
      id: 'li_text',
      label: 'Text Ad',
      category: 'paid',
      fields: [
        { name: 'headline', label: 'Headline', limit: 25, required: true },
        { name: 'description', label: 'Description', limit: 75, required: true },
      ],
    },
    {
      id: 'li_message',
      label: 'Message Ad',
      category: 'paid',
      fields: [
        { name: 'subject', label: 'Subject', limit: 60, required: true },
        { name: 'body', label: 'Body', limit: 1500, required: true },
        { name: 'cta', label: 'CTA', limit: 20, required: true },
      ],
    },
    {
      id: 'li_dynamic',
      label: 'Dynamic Ad (Spotlight)',
      category: 'paid',
      fields: [
        { name: 'headline', label: 'Headline', limit: 50, required: true },
        { name: 'description', label: 'Description', limit: 70, required: true },
        { name: 'cta', label: 'CTA', limit: 18, required: true },
      ],
    },
    {
      id: 'li_video',
      label: 'Video Ad',
      category: 'paid',
      fields: [
        { name: 'introductoryText', label: 'Introductory Text', limit: 600, required: true },
        { name: 'headline', label: 'Headline', limit: 70, required: true },
      ],
    },
  ],
}

// ─── TikTok ──────────────────────────────────────────────────────────────────

const tiktok: PlatformConfig = {
  id: 'tiktok',
  label: 'TikTok',
  adTypes: [
    {
      id: 'tt_infeed',
      label: 'In-Feed Ad',
      category: 'social',
      fields: [
        { name: 'adText', label: 'Ad Text', limit: 100, required: true },
        { name: 'brandName', label: 'Brand Name', limit: 20, required: true },
      ],
    },
    {
      id: 'tt_topview',
      label: 'TopView',
      category: 'social',
      fields: [
        { name: 'adText', label: 'Ad Text', limit: 100, required: true },
        { name: 'brandName', label: 'Brand Name', limit: 20, required: true },
      ],
    },
    {
      id: 'tt_takeover',
      label: 'Brand Takeover',
      category: 'social',
      fields: [
        { name: 'adText', label: 'Ad Text', limit: 100, required: true },
      ],
    },
    {
      id: 'tt_hashtag',
      label: 'Branded Hashtag Challenge',
      category: 'social',
      fields: [
        { name: 'hashtag', label: 'Hashtag', limit: 8, required: true },
        { name: 'description', label: 'Description', limit: 200, required: true },
      ],
    },
    {
      id: 'tt_spark',
      label: 'Spark Ad',
      category: 'social',
      fields: [
        { name: 'adText', label: 'Ad Text', limit: 100, required: true },
      ],
    },
  ],
}

// ─── Google Ads ──────────────────────────────────────────────────────────────

const google: PlatformConfig = {
  id: 'google',
  label: 'Google Ads',
  adTypes: [
    {
      id: 'g_rsa',
      label: 'Responsive Search Ad',
      category: 'paid',
      fields: [
        { name: 'headlines', label: 'Headline', limit: 30, required: true, multiple: 15 },
        { name: 'descriptions', label: 'Description', limit: 90, required: true, multiple: 4 },
        { name: 'urlPath1', label: 'URL-Pfad 1', limit: 15, required: false },
        { name: 'urlPath2', label: 'URL-Pfad 2', limit: 15, required: false },
      ],
    },
    {
      id: 'g_rda',
      label: 'Responsive Display Ad',
      category: 'paid',
      fields: [
        { name: 'shortHeadlines', label: 'Short Headline', limit: 30, required: true, multiple: 5 },
        { name: 'longHeadline', label: 'Long Headline', limit: 90, required: true },
        { name: 'descriptions', label: 'Description', limit: 90, required: true, multiple: 5 },
        { name: 'businessName', label: 'Business Name', limit: 25, required: true },
      ],
    },
    {
      id: 'g_demandgen',
      label: 'Demand Gen',
      category: 'paid',
      fields: [
        { name: 'headline', label: 'Headline', limit: 40, required: true },
        { name: 'description', label: 'Description', limit: 90, required: true },
        { name: 'businessName', label: 'Business Name', limit: 25, required: true },
      ],
    },
    {
      id: 'g_shopping',
      label: 'Shopping Ad',
      category: 'paid',
      fields: [
        { name: 'productTitle', label: 'Produkttitel', limit: 150, required: true },
        { name: 'description', label: 'Beschreibung', limit: 5000, required: true },
      ],
    },
    {
      id: 'g_youtube',
      label: 'YouTube Video Ad',
      category: 'paid',
      fields: [
        { name: 'headline', label: 'Headline', limit: 15, required: true },
        { name: 'longHeadline', label: 'Long Headline', limit: 90, required: true },
        { name: 'description', label: 'Description', limit: 70, required: true },
        { name: 'cta', label: 'CTA', limit: 10, required: true },
      ],
    },
    {
      id: 'g_pmax',
      label: 'Performance Max',
      category: 'paid',
      fields: [
        { name: 'headlines', label: 'Headline', limit: 30, required: true, multiple: 15 },
        { name: 'longHeadlines', label: 'Long Headline', limit: 90, required: true, multiple: 5 },
        { name: 'descriptions', label: 'Description', limit: 90, required: true, multiple: 5 },
      ],
    },
    {
      id: 'g_app',
      label: 'App Campaign',
      category: 'paid',
      fields: [
        { name: 'adTexts', label: 'Ad Text', limit: 25, required: true, multiple: 4 },
      ],
    },
  ],
}

// ─── Export ──────────────────────────────────────────────────────────────────

export const AD_PLATFORMS: PlatformConfig[] = [facebook, linkedin, tiktok, google]

export const AD_PLATFORMS_MAP: Record<PlatformId, PlatformConfig> = {
  facebook,
  linkedin,
  tiktok,
  google,
}

/** Get all ad types for given platforms, optionally filtered by category */
export function getAdTypesForPlatforms(
  platformIds: PlatformId[],
  categoryFilter?: 'social' | 'paid' | 'both'
): { platform: PlatformConfig; adType: AdTypeConfig }[] {
  const result: { platform: PlatformConfig; adType: AdTypeConfig }[] = []

  for (const pid of platformIds) {
    const platform = AD_PLATFORMS_MAP[pid]
    if (!platform) continue

    for (const adType of platform.adTypes) {
      if (
        !categoryFilter ||
        categoryFilter === 'both' ||
        adType.category === categoryFilter
      ) {
        result.push({ platform, adType })
      }
    }
  }

  return result
}
