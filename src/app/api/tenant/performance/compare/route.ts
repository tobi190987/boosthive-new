import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { requireTenantUser } from '@/lib/auth-guards'
import { requireTenantModuleAccess } from '@/lib/module-access'
import { parseCSV, applyFilters, buildLLMContext, computeKPIDeltas } from '@/lib/performance/csv-parser'
import { SYSTEM_PROMPT, buildCompareUserPrompt } from '@/lib/performance/prompts'
import { createAdminClient } from '@/lib/supabase-admin'
import type { Filters } from '@/lib/performance/types'

export const maxDuration = 60

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

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    })

    const analysis = (response.content[0] as { text: string }).text
      .replace(/\[Entfällt\]/g, '').replace(/\[entfällt\]/g, '')

    const resultMeta = {
      compare: true as const,
      platform: metaA.platform,
      a: {
        file_name: fileA.name,
        label: labelA,
        rows: filteredA.length,
        kpis: metaA.kpis,
        date_range: metaA.date_range,
      },
      b: {
        file_name: fileB.name,
        label: labelB,
        rows: filteredB.length,
        kpis: metaB.kpis,
        date_range: metaB.date_range,
      },
      deltas,
    }

    const admin = createAdminClient()
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
