import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { requireTenantUser } from '@/lib/auth-guards'
import { requireTenantModuleAccess } from '@/lib/module-access'
import { parseCSV, applyFilters, buildLLMContext } from '@/lib/performance/csv-parser'
import { SYSTEM_PROMPT, CONTENT_SYSTEM_PROMPT, buildUserPrompt } from '@/lib/performance/prompts'
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
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'Keine Datei gefunden' }, { status: 400 })

    const clientLabel = String(formData.get('client_label') ?? '').trim() || null
    const customerId = String(formData.get('customer_id') ?? '').trim() || null

    const content = await file.text()
    const { rows, meta } = parseCSV(content)

    let filters: Filters = { active_only: false, campaigns: [] }
    const filtersStr = formData.get('filters')
    if (filtersStr) {
      try { filters = JSON.parse(String(filtersStr)) } catch { /* ignore */ }
    }

    const { rows: filteredRows, applied } = applyFilters(rows, filters, meta.entity_column)
    if (!filteredRows.length) {
      return NextResponse.json({ error: 'Nach der Filterung sind keine Daten übrig.' }, { status: 400 })
    }

    const tableText = buildLLMContext(filteredRows, meta)
    const systemPrompt = meta.data_kind === 'content' ? CONTENT_SYSTEM_PROMPT : SYSTEM_PROMPT

    const userPrompt = buildUserPrompt({
      platform: meta.platform,
      entityLabel: meta.entity_label,
      entityCount: meta.campaigns_total,
      kpis: meta.kpis as unknown as Record<string, number | null>,
      tableText,
      dateRange: meta.date_range,
    })

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    })

    const analysis = (response.content[0] as { text: string }).text
      .replace(/\[Entfällt\]/g, '').replace(/\[entfällt\]/g, '')

    const resultMeta = {
      rows: filteredRows.length,
      columns: meta.columns,
      platform: meta.platform,
      analysis_level: meta.analysis_level,
      entity_label: meta.entity_label,
      entity_column: meta.entity_column,
      kpis: meta.kpis,
      date_range: meta.date_range,
      filters_applied: applied,
    }

    const admin = createAdminClient()
    const { data: saved } = await admin
      .from('performance_analyses')
      .insert({
        tenant_id: tenantId,
        created_by: authResult.auth.userId,
        customer_id: customerId,
        type: 'analyze',
        client_label: clientLabel,
        platform: meta.platform,
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
