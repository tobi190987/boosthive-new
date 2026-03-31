import { NextRequest, NextResponse } from 'next/server'
import { requireTenantUser } from '@/lib/auth-guards'
import { createAdminClient } from '@/lib/supabase-admin'
import {
  checkRateLimit,
  getClientIp,
  rateLimitResponse,
  CUSTOMERS_WRITE,
} from '@/lib/rate-limit'

const ALLOWED_TYPES: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/msword': 'doc',
  'application/vnd.ms-excel': 'xls',
  'text/csv': 'csv',
  'text/plain': 'txt',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  // Browser-Inkonsistenzen
  'application/octet-stream': 'bin',
  'application/csv': 'csv',
  'application/x-csv': 'csv',
}

// Extension-Fallback falls Browser falschen MIME-Typ sendet
const ALLOWED_EXTENSIONS: Record<string, string> = {
  pdf: 'pdf', docx: 'docx', doc: 'doc', xlsx: 'xlsx', xls: 'xls',
  csv: 'csv', txt: 'txt', jpg: 'jpg', jpeg: 'jpg', png: 'png', webp: 'webp',
}

const MAX_SIZE = 20 * 1024 * 1024 // 20MB

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })

  const rl = checkRateLimit(`customers-write:${tenantId}:${getClientIp(request)}`, CUSTOMERS_WRITE)
  if (!rl.allowed) return rateLimitResponse(rl)

  const authResult = await requireTenantUser(tenantId)
  if ('error' in authResult) return authResult.error

  const { id } = await params

  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    const title = (formData.get('title') as string | null)?.trim() || null
    const description = (formData.get('description') as string | null)?.trim() || null

    if (!file) {
      return NextResponse.json({ error: 'Keine Datei hochgeladen.' }, { status: 400 })
    }

    const fileExt = file.name.split('.').pop()?.toLowerCase() ?? ''
    const extAllowed = ALLOWED_EXTENSIONS[fileExt]
    if (!ALLOWED_TYPES[file.type] && !extAllowed) {
      return NextResponse.json({
        error: `Ungültiges Dateiformat (${file.type || fileExt}). Erlaubt: PDF, Word, Excel, CSV, TXT, JPG, PNG, WebP.`,
      }, { status: 400 })
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: 'Datei zu groß. Maximale Größe: 20 MB.' }, { status: 400 })
    }

    const admin = createAdminClient()

    // Verify customer belongs to tenant
    const { data: customer, error: customerError } = await admin
      .from('customers')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('id', id)
      .is('deleted_at', null)
      .single()

    if (customerError || !customer) {
      return NextResponse.json({ error: 'Kunde nicht gefunden.' }, { status: 404 })
    }

    // Upload file to Supabase Storage
    const timestamp = Date.now()
    const random = Math.random().toString(36).substring(2, 10)
    const ext = ALLOWED_TYPES[file.type] ?? extAllowed ?? 'bin'
    const storagePath = `${tenantId}/${id}/${timestamp}-${random}.${ext}`

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

    const { error: uploadError } = await admin.storage
      .from('customer-documents')
      .upload(storagePath, buffer, {
        contentType: file.type,
        upsert: false,
      })

    if (uploadError) {
      console.error('Document upload error:', uploadError)
      return NextResponse.json({ error: 'Fehler beim Hochladen der Datei.' }, { status: 500 })
    }

    const { data: { publicUrl } } = admin.storage
      .from('customer-documents')
      .getPublicUrl(storagePath)

    // Create document record
    const documentTitle = title || file.name
    const { data, error: insertError } = await admin
      .from('customer_documents')
      .insert({
        customer_id: id,
        title: documentTitle.substring(0, 200),
        url: publicUrl,
        description: description?.substring(0, 1000) || null,
        doc_type: 'file',
        file_name: file.name.substring(0, 500),
      })
      .select('id, title, url, description, doc_type, file_name, created_at, updated_at')
      .single()

    if (insertError) {
      console.error('Document insert error:', insertError)
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }

    return NextResponse.json({ document: data }, { status: 201 })
  } catch (error) {
    console.error('Document upload error:', error)
    return NextResponse.json({ error: 'Interner Server-Fehler.' }, { status: 500 })
  }
}
