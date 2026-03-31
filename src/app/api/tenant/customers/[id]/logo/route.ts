import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireTenantAdmin } from '@/lib/auth-guards'
import { createAdminClient } from '@/lib/supabase-admin'
import {
  checkRateLimit,
  getClientIp,
  rateLimitResponse,
  CUSTOMERS_WRITE,
} from '@/lib/rate-limit'

const logoUploadSchema = z.object({
  customer_id: z.string().uuid(),
})

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })

  const rl = checkRateLimit(`customers-write:${tenantId}:${getClientIp(request)}`, CUSTOMERS_WRITE)
  if (!rl.allowed) return rateLimitResponse(rl)

  const authResult = await requireTenantAdmin(tenantId)
  if ('error' in authResult) return authResult.error

  const { id } = await params

  try {
    const formData = await request.formData()
    const file = formData.get('logo') as File
    
    if (!file) {
      return NextResponse.json({ error: 'Keine Datei hochgeladen.' }, { status: 400 })
    }

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/svg+xml', 'image/webp']
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ 
        error: 'Ungültiges Dateiformat. Erlaubt: JPG, PNG, SVG, WebP.' 
      }, { status: 400 })
    }

    // Validate file size (5MB max)
    const maxSize = 5 * 1024 * 1024 // 5MB
    if (file.size > maxSize) {
      return NextResponse.json({ 
        error: 'Datei zu groß. Maximale Größe: 5MB.' 
      }, { status: 400 })
    }

    // Convert file to buffer
    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

    // Generate unique filename
    const timestamp = Date.now()
    const random = Math.random().toString(36).substring(2, 15)
    const extension = file.name.split('.').pop()
    const filename = `customer-logos/${id}/${timestamp}-${random}.${extension}`

    // Upload to Supabase Storage
    const admin = createAdminClient()
    const { data, error } = await admin.storage
      .from('customer-logos')
      .upload(filename, buffer, {
        contentType: file.type,
        upsert: true
      })

    if (error) {
      console.error('Logo upload error:', error)
      return NextResponse.json({ error: 'Fehler beim Hochladen des Logos.' }, { status: 500 })
    }

    // Get public URL
    const { data: { publicUrl } } = admin.storage
      .from('customer-logos')
      .getPublicUrl(filename)

    // Update customer with logo URL
    const { error: updateError } = await admin
      .from('customers')
      .update({ 
        logo_url: publicUrl,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .eq('tenant_id', tenantId)

    if (updateError) {
      console.error('Logo URL update error:', updateError)
      return NextResponse.json({ error: 'Fehler beim Speichern der Logo-URL.' }, { status: 500 })
    }

    return NextResponse.json({ 
      message: 'Logo erfolgreich hochgeladen.',
      logo_url: publicUrl 
    })

  } catch (error) {
    console.error('Logo upload error:', error)
    return NextResponse.json({ error: 'Interner Server-Fehler.' }, { status: 500 })
  }
}
