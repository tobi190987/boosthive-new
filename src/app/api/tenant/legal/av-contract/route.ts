import { NextRequest, NextResponse } from 'next/server'
import { requireTenantAdmin } from '@/lib/auth-guards'
import { createAdminClient } from '@/lib/supabase-admin'
import { recordTenantDataAuditLog } from '@/lib/tenant-data-audit'

function escapePdfString(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
}

function toPdfSafeText(value: string) {
  return value
    .replace(/[–—]/g, '-')
    .replace(/[„“”]/g, '"')
    .replace(/[‚’]/g, "'")
    .replace(/[^\x20-\xFF]/g, '?')
}

function buildSimplePdf(lines: string[]) {
  const contentLines = [
    'BT',
    '/F1 11 Tf',
    '15 TL',
    '50 800 Td',
    ...lines.map((line, index) => `${index === 0 ? '' : 'T* ' }(${escapePdfString(toPdfSafeText(line))}) Tj`),
    'ET',
  ]
  const contentStream = contentLines.join('\n')

  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n',
    '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
    `5 0 obj\n<< /Length ${Buffer.byteLength(contentStream, 'latin1')} >>\nstream\n${contentStream}\nendstream\nendobj\n`,
  ]

  let pdf = '%PDF-1.4\n'
  const offsets = [0]
  for (const obj of objects) {
    offsets.push(Buffer.byteLength(pdf, 'latin1'))
    pdf += obj
  }

  const xrefStart = Buffer.byteLength(pdf, 'latin1')
  pdf += `xref\n0 ${objects.length + 1}\n`
  pdf += '0000000000 65535 f \n'
  for (let i = 1; i <= objects.length; i++) {
    pdf += `${offsets[i].toString().padStart(10, '0')} 00000 n \n`
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`
  return Buffer.from(pdf, 'latin1')
}

export async function GET(request: NextRequest) {
  const tenantId = request.headers.get('x-tenant-id')
  if (!tenantId) return NextResponse.json({ error: 'Kein Tenant-Kontext.' }, { status: 400 })

  const authResult = await requireTenantAdmin(tenantId)
  if ('error' in authResult) return authResult.error

  const admin = createAdminClient()
  const { data: tenant, error } = await admin
    .from('tenants')
    .select('name, billing_company, billing_street, billing_zip, billing_city, billing_country')
    .eq('id', tenantId)
    .single()

  if (error || !tenant) {
    return NextResponse.json({ error: 'Tenantdaten konnten nicht geladen werden.' }, { status: 500 })
  }

  const company = (tenant.billing_company ?? tenant.name ?? 'Unbekannte Agentur').trim()
  const street = (tenant.billing_street ?? '-').trim()
  const zip = (tenant.billing_zip ?? '-').trim()
  const city = (tenant.billing_city ?? '-').trim()
  const country = (tenant.billing_country ?? 'Deutschland').trim()
  const createdAt = new Date().toLocaleDateString('de-DE')

  const pdfBuffer = buildSimplePdf([
    'AV-Vertrag (vorausgefuellt)',
    '',
    `Erstellt am: ${createdAt}`,
    '',
    'Auftraggeber (Agentur):',
    `Name/Firma: ${company}`,
    `Adresse: ${street}, ${zip} ${city}, ${country}`,
    '',
    'Hinweis:',
    'Dieses Dokument ist eine automatisch vorausgefuellte Grundlage.',
    'Bitte vor Unterzeichnung rechtlich pruefen und finalisieren.',
  ])

  await recordTenantDataAuditLog({
    tenantId,
    actorUserId: authResult.auth.userId,
    actionType: 'data_export',
    resourceType: 'av_contract_pdf',
    context: {
      company,
      billing_city: city,
      billing_country: country,
    },
  })

  const filename = `av-vertrag_${new Date().toISOString().slice(0, 10)}.pdf`
  return new NextResponse(new Uint8Array(pdfBuffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}
