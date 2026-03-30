import { NextRequest, NextResponse } from 'next/server'
import { requireTenantUser } from '@/lib/auth-guards'
import { requireTenantModuleAccess } from '@/lib/module-access'

interface SuggestionPayload {
  url: string
  title: string
  metaDescription: string
  h1s: string[]
  wordCount: number
  issues: string[]
}

interface SuggestionResult {
  summary: string
  improvedTitle: string
  improvedMetaDescription: string
  improvedH1: string
  contentIdeas: string[]
  source: 'anthropic' | 'fallback'
  debug?: string
}

function extractJsonObject(raw: string) {
  const trimmed = raw.trim()

  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    return trimmed
  }

  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim()
  }

  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start >= 0 && end > start) {
    return trimmed.slice(start, end + 1)
  }

  throw new Error('Kein parsebares JSON in der Claude-Antwort gefunden.')
}

function buildFallbackSuggestions(input: SuggestionPayload) {
  const host = (() => {
    try {
      return new URL(input.url).hostname.replace(/^www\./, '')
    } catch {
      return 'deine Seite'
    }
  })()

  const topicBase = input.h1s[0] || input.title || host
  const improvedTitle = input.title
    ? `${topicBase} | ${host}`
    : `${topicBase} professionell erklärt | ${host}`
  const improvedMeta = input.metaDescription
    ? `${input.metaDescription.slice(0, 130).trim()} Jetzt die Seite optimieren und klare Vorteile für Besucher herausstellen.`
    : `${topicBase} klar, verständlich und suchmaschinenfreundlich aufbereitet. Entdecke Leistungen, Nutzen und nächste Schritte auf einen Blick.`
  const improvedH1 = input.h1s[0] || `${topicBase} verständlich erklärt`

  const actionPlan = [
    'Title auf 50 bis 60 Zeichen bringen und das zentrale Keyword weiter nach vorne ziehen.',
    'Meta-Description mit klarem Nutzenversprechen und Handlungsimpuls formulieren.',
    'Eine eindeutige H1 verwenden und Zwischenüberschriften stärker auf Suchintention ausrichten.',
    input.wordCount < 300
      ? 'Den Hauptinhalt ausbauen und mindestens einen kompakten Abschnitt zu Nutzen, Ablauf oder FAQ ergänzen.'
      : 'Den Hauptinhalt mit konkreteren Aussagen, Belegen oder FAQs weiter schärfen.',
  ]

  return {
    summary: `Auf Basis der erkannten Probleme wurden konkrete Textvorschläge für Title, Meta-Description und H1 erstellt.`,
    improvedTitle,
    improvedMetaDescription: improvedMeta.slice(0, 160),
    improvedH1,
    contentIdeas: actionPlan,
    source: 'fallback',
  } satisfies SuggestionResult
}

async function generateWithClaude(input: SuggestionPayload) {
  const apiKey = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY
  if (!apiKey) return null

  const modelCandidates = [
    process.env.ANTHROPIC_SEO_MODEL,
    process.env.CLAUDE_MODEL,
    'claude-haiku-4-5-20251001',
    'claude-sonnet-4-6',
  ].filter(Boolean) as string[]
  const prompt = [
    'Analysiere genau diese einzelne Seite und leite aus den konkreten Problemen individuelle Verbesserungsvorschläge ab.',
    'Die Vorschläge müssen sich sichtbar von anderen Seiten unterscheiden und auf die aktuelle URL, den aktuellen Title, die aktuelle Meta-Description, die H1 und die gefundenen Probleme eingehen.',
    'Antworte nur mit JSON.',
    `URL: ${input.url}`,
    `Aktueller Title: ${input.title || 'nicht vorhanden'}`,
    `Aktuelle Meta-Description: ${input.metaDescription || 'nicht vorhanden'}`,
    `Aktuelle H1: ${input.h1s.join(' | ') || 'nicht vorhanden'}`,
    `Wortanzahl: ${input.wordCount}`,
    `Probleme: ${input.issues.join(' | ') || 'keine'}`,
    '',
    'JSON-Schema:',
    '{',
    '  "summary": "1-2 Sätze mit Bezug auf die konkreten Probleme dieser Seite",',
    '  "improvedTitle": "maximal 60 Zeichen",',
    '  "improvedMetaDescription": "maximal 160 Zeichen",',
    '  "improvedH1": "eine präzise H1",',
    '  "contentIdeas": ["3 bis 5 konkrete deutsche Handlungsempfehlungen"]',
    '}',
  ].join('\n')

  const errors: string[] = []

  for (const model of modelCandidates) {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        system:
          'Du bist ein präziser SEO-Copywriter. Antworte ausschließlich mit validem JSON ohne Markdown, ohne Codeblock und ohne zusätzliche Erklärungen.',
        max_tokens: 700,
        temperature: 0.2,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      }),
    })

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '')
      errors.push(`${model}: ${errorBody || response.statusText}`)
      continue
    }

    const data = (await response.json()) as {
      content?: Array<
        | {
            type: 'text'
            text: string
          }
        | { type: string }
      >
    }

    const text = data.content?.find((item) => item.type === 'text')
    if (!text || !('text' in text)) {
      errors.push(`${model}: Leere KI-Antwort erhalten.`)
      continue
    }

    return {
      ...(JSON.parse(extractJsonObject(text.text)) as {
        summary: string
        improvedTitle: string
        improvedMetaDescription: string
        improvedH1: string
        contentIdeas: string[]
      }),
      source: 'anthropic' as const,
    } satisfies SuggestionResult
  }

  throw new Error(`Claude-Request fehlgeschlagen. Versuchte Modelle: ${errors.join(' || ')}`)
}

export async function POST(request: NextRequest) {
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) {
    return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })
  }

  const authResult = await requireTenantUser(tenantId)
  if ('error' in authResult) return authResult.error

  const moduleAccess = await requireTenantModuleAccess(tenantId, 'seo_analyse')
  if ('error' in moduleAccess) return moduleAccess.error

  let body: SuggestionPayload
  try {
    body = (await request.json()) as SuggestionPayload
  } catch {
    return NextResponse.json({ error: 'Ungültige Eingabedaten.' }, { status: 400 })
  }

  if (!body.url || !Array.isArray(body.issues) || body.issues.length === 0) {
    return NextResponse.json({ error: 'Für diese Seite liegen keine Probleme vor.' }, { status: 400 })
  }

  try {
    const aiResult = await generateWithClaude(body)
    return NextResponse.json(aiResult ?? buildFallbackSuggestions(body))
  } catch (error) {
    console.error('[seo/page-actions] Claude generation failed', error)
    const fallback = buildFallbackSuggestions(body)
    return NextResponse.json({
      ...fallback,
      debug: error instanceof Error ? error.message : 'Unbekannter Claude-Fehler',
    } satisfies SuggestionResult)
  }
}
