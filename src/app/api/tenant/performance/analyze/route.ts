import { NextRequest, NextResponse } from 'next/server'
import { requireTenantUser } from '@/lib/auth-guards'
import { requireTenantModuleAccess } from '@/lib/module-access'
import { parseCSV, applyFilters, buildLLMContext, anonymizePiiText } from '@/lib/performance/csv-parser'
import { SYSTEM_PROMPT, CONTENT_SYSTEM_PROMPT, buildUserPrompt } from '@/lib/performance/prompts'
import { createAdminClient } from '@/lib/supabase-admin'
import { checkQuota } from '@/lib/usage-limits'
import {
  checkRateLimit,
  getClientIp,
  rateLimitResponse,
  PERFORMANCE_ANALYSIS_START,
} from '@/lib/rate-limit'
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

  const rl = checkRateLimit(`performance-analyze:${tenantId}:${getClientIp(request)}`, PERFORMANCE_ANALYSIS_START)
  if (!rl.allowed) return rateLimitResponse(rl)

  const authResult = await requireTenantUser(tenantId)
  if ('error' in authResult) return authResult.error

  const moduleAccess = await requireTenantModuleAccess(tenantId, 'ai_performance')
  if ('error' in moduleAccess) return moduleAccess.error

  const quota = await checkQuota(tenantId, 'ai_performance_analyses')
  if (!quota.allowed) {
    return NextResponse.json(
      { error: 'quota_exceeded', metric: 'ai_performance_analyses', current: quota.current, limit: quota.limit, reset_at: quota.reset_at },
      { status: 429 }
    )
  }

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
        max_tokens: 1500,
        messages: [
          { role: 'system', content: systemPrompt },
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
        type: 'analyze',
        client_label: clientLabel,
        platform: meta.platform,
        analysis,
        meta: resultMeta,
      })
      .select('id')
      .single()

    // Post-Insert-Verifikation (TOCTOU-Schutz):
    // Zähle nach dem INSERT erneut und rollback, wenn das Limit überschritten wurde.
    if (saved?.id) {
      const { count: countAfter } = await admin
        .from('performance_analyses')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .gte('created_at', quota.period_start)

      if ((countAfter ?? 0) > quota.limit) {
        await admin.from('performance_analyses').delete().eq('id', saved.id)
        return NextResponse.json(
          { error: 'quota_exceeded', metric: 'ai_performance_analyses', current: countAfter ?? quota.limit, limit: quota.limit, reset_at: quota.reset_at },
          { status: 429 }
        )
      }
    }

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
