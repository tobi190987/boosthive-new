import { NextRequest, NextResponse } from 'next/server'
import { requireTenantUser } from '@/lib/auth-guards'
import { requireTenantModuleAccess } from '@/lib/module-access'
import {
  parseCSV,
  applyFilters,
  buildLLMContext,
  computeKPIDeltas,
  anonymizePiiText,
} from '@/lib/performance/csv-parser'
import { SYSTEM_PROMPT, buildCompareUserPrompt } from '@/lib/performance/prompts'
import { createAdminClient } from '@/lib/supabase-admin'
import type { Filters } from '@/lib/performance/types'

export const maxDuration = 60

async function validateCustomerId(
  tenantId: string,
  customerId: string | null | undefined,
  admin: ReturnType<typeof createAdminClient>
) {
  if (!customerId) return null

  const { data: customer } = await admin
    .from('customers')
    .select('id')
    .eq('id', customerId)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  return customer
}

export async function POST(request: NextRequest) {
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })

  const authResult = await requireTenantUser(tenantId)
  if ('error' in authResult) return authResult.error

  const moduleAccess = await requireTenantModuleAccess(tenantId, 'ai_performance')
  if ('error' in moduleAccess) return moduleAccess.error

  try {
    const formData = await request.formData()
    const fileA = formData.get('fileA') as File | null
    const fileB = formData.get('fileB') as File | null
    if (!fileA || !fileB) {
      return NextResponse.json({ error: 'Beide Dateien sind erforderlich' }, { status: 400 })
    }

    const labelA = String(formData.get('labelA') ?? 'Zeitraum A')
    const labelB = String(formData.get('labelB') ?? 'Zeitraum B')
    const clientLabel = String(formData.get('client_label') ?? '').trim() || null
    const customerId = String(formData.get('customer_id') ?? '').trim() || null

    const defaultFilters: Filters = { active_only: false, campaigns: [] }

    const contentA = await fileA.text()
    const contentB = await fileB.text()

    const { rows: rowsA, meta: metaA } = parseCSV(contentA)
    const { rows: rowsB, meta: metaB } = parseCSV(contentB)

    const { rows: filteredA } = applyFilters(rowsA, defaultFilters, metaA.entity_column)
    const { rows: filteredB } = applyFilters(rowsB, defaultFilters, metaB.entity_column)

    if (!filteredA.length || !filteredB.length) {
      return NextResponse.json({ error: 'Eine oder beide Dateien enthalten keine verwertbaren Daten.' }, { status: 400 })
    }

    const tableA = buildLLMContext(filteredA, metaA)
    const tableB = buildLLMContext(filteredB, metaB)
    const deltas = computeKPIDeltas(metaA.kpis, metaB.kpis)

    const userPrompt = buildCompareUserPrompt({
      platformA: metaA.platform,
      entityLabelA: metaA.entity_label,
      kpisA: metaA.kpis as unknown as Record<string, number | null>,
      tableA,
      dateRangeA: metaA.date_range,
      labelA,
      platformB: metaB.platform,
      entityLabelB: metaB.entity_label,
      kpisB: metaB.kpis as unknown as Record<string, number | null>,
      tableB,
      dateRangeB: metaB.date_range,
      labelB,
      deltas,
    })

    const apiKey = process.env.OPENROUTER_API_KEY
    if (!apiKey) return NextResponse.json({ error: 'OPENROUTER_API_KEY nicht konfiguriert.' }, { status: 500 })

    const model = process.env.AI_PERFORMANCE_MODEL ?? 'anthropic/claude-sonnet-4-5'
    const orResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://boost-hive.de',
        'X-Title': 'BoostHive',
      },
      body: JSON.stringify({
        model,
        max_tokens: 2000,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
      }),
    })

    if (!orResponse.ok) {
      const err = await orResponse.text().catch(() => '')
      throw new Error(`OpenRouter API Fehler ${orResponse.status}: ${err.slice(0, 200)}`)
    }

    const orData = (await orResponse.json()) as { choices?: Array<{ message?: { content?: string } }> }
    const rawText = orData.choices?.[0]?.message?.content ?? ''
    if (!rawText) throw new Error('Leere Antwort von OpenRouter.')

    const analysis = anonymizePiiText(
      rawText
        .replace(/\[Entfällt\]/g, '')
        .replace(/\[entfällt\]/g, '')
    )

    const resultMeta = {
      compare: true as const,
      platform: metaA.platform,
      a: {
        file_name: anonymizePiiText(fileA.name),
        label: labelA,
        rows: filteredA.length,
        kpis: metaA.kpis,
        date_range: metaA.date_range,
      },
      b: {
        file_name: anonymizePiiText(fileB.name),
        label: labelB,
        rows: filteredB.length,
        kpis: metaB.kpis,
        date_range: metaB.date_range,
      },
      deltas,
    }

    const admin = createAdminClient()
    if (customerId) {
      const customer = await validateCustomerId(tenantId, customerId, admin)
      if (!customer) {
        return NextResponse.json({ error: 'Kunde nicht gefunden.' }, { status: 404 })
      }
    }

    const { data: saved } = await admin
      .from('performance_analyses')
      .insert({
        tenant_id: tenantId,
        created_by: authResult.auth.userId,
        customer_id: customerId,
        type: 'compare',
        client_label: clientLabel,
        platform: metaA.platform,
        analysis,
        meta: resultMeta,
      })
      .select('id')
      .single()

    return NextResponse.json({
      id: saved?.id ?? null,
      client_label: clientLabel,
      analysis,
      meta: resultMeta,
    })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Claude API Fehler' }, { status: 500 })
  }
}
