/**
 * PROJ-55: GET /api/tenant/exports/[id]/download
 *
 * Returns a short-lived signed URL for the export file.
 * If the file has expired (deleted from Storage), regenerates it.
 */
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireTenantUser } from '@/lib/auth-guards'
import { createAdminClient } from '@/lib/supabase-admin'
import { checkRateLimit, getClientIp, rateLimitResponse, EXPORTS_READ } from '@/lib/rate-limit'
import { regenerateExportFile } from '@/lib/export-service'

const idSchema = z.string().uuid('Ungültige Export-ID.')

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })

  const rl = checkRateLimit(`exports-read:${tenantId}:${getClientIp(request)}`, EXPORTS_READ)
  if (!rl.allowed) return rateLimitResponse(rl)

  const authResult = await requireTenantUser(tenantId)
  if ('error' in authResult) return authResult.error

  const { id } = await params
  const parsedId = idSchema.safeParse(id)
  if (!parsedId.success) {
    return NextResponse.json({ error: parsedId.error.issues[0]?.message }, { status: 400 })
  }

  const admin = createAdminClient()
  let { data: exportRecord, error } = await admin
    .from('exports')
    .select('id, tenant_id, export_type, format, customer_id, branding_source, brand_color, status, storage_path, file_name')
    .eq('id', parsedId.data)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (error) {
    console.error('[GET /exports/[id]/download] DB-Fehler:', error)
    return NextResponse.json({ error: 'Export konnte nicht geladen werden.' }, { status: 500 })
  }

  if (!exportRecord) {
    return NextResponse.json({ error: 'Export nicht gefunden.' }, { status: 404 })
  }

  if (exportRecord.status !== 'done' || !exportRecord.storage_path) {
    return NextResponse.json(
      { error: 'Datei ist noch nicht verfügbar oder die Generierung ist fehlgeschlagen.' },
      { status: 409 }
    )
  }

  // Generate a signed URL valid for 10 minutes
  const { data: signedUrlData, error: signedUrlError } = await admin.storage
    .from('exports')
    .createSignedUrl(exportRecord.storage_path, 600)

  if (signedUrlError || !signedUrlData?.signedUrl) {
    console.warn('[GET /exports/[id]/download] Signed URL fehlgeschlagen, versuche Regeneration:', signedUrlError)

    try {
      const regenerated = await regenerateExportFile(admin, exportRecord)
      if (!regenerated?.storage_path) {
        return NextResponse.json(
          { error: 'PNG-Exports können nach Ablauf aktuell nicht automatisch regeneriert werden.' },
          { status: 410 }
        )
      }

      exportRecord = {
        ...exportRecord,
        ...regenerated,
      }

      const retry = await admin.storage.from('exports').createSignedUrl(exportRecord.storage_path, 600)
      if (retry.error || !retry.data?.signedUrl) {
        return NextResponse.json(
          { error: 'Datei konnte nicht erneut bereitgestellt werden. Bitte versuche es später erneut.' },
          { status: 500 }
        )
      }

      return NextResponse.json({ url: retry.data.signedUrl, fileName: exportRecord.file_name })
    } catch (regenerationError) {
      console.error('[GET /exports/[id]/download] Regeneration fehlgeschlagen:', regenerationError)
      return NextResponse.json(
        { error: 'Datei konnte nicht automatisch neu erstellt werden.' },
        { status: 500 }
      )
    }
  }

  return NextResponse.json({ url: signedUrlData.signedUrl, fileName: exportRecord.file_name })
}
