/**
 * PROJ-55: Export file generators
 * Serverside PDF (pdfkit) and XLSX (xlsx) generation for the Export Center.
 * Each generator receives pre-fetched data and branding config.
 */

import PDFDocument from 'pdfkit'
import * as XLSX from 'xlsx'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BrandingConfig {
  logoUrl: string | null
  accentColor: string   // hex, e.g. '#2563eb'
  tenantName: string
  customerName: string | null
}

export interface KeywordRankingRow {
  keyword: string
  position: number | null
  url: string | null
  clicks: number | null
  impressions: number | null
  trackedAt: string
}

export interface PerformanceRow {
  label: string
  value: string | number
  unit?: string
}

export interface CustomerSummaryData {
  customerName: string
  industry: string | null
  website: string | null
  keywordCount: number
  avgPosition: number | null
  topKeywords: KeywordRankingRow[]
}

// ─── XLSX generators ─────────────────────────────────────────────────────────

export function generateKeywordRankingsXlsx(
  rows: KeywordRankingRow[],
  branding: BrandingConfig
): Buffer {
  const wb = XLSX.utils.book_new()

  const sheetRows = rows.map((r) => ({
    Keyword: r.keyword,
    Position: r.position ?? 'Nicht gefunden',
    URL: r.url ?? '',
    Klicks: r.clicks ?? 0,
    Impressionen: r.impressions ?? 0,
    'Erfasst am': new Date(r.trackedAt).toLocaleDateString('de-DE'),
  }))

  const ws = XLSX.utils.json_to_sheet(sheetRows)

  // Column widths
  ws['!cols'] = [
    { wch: 40 },
    { wch: 10 },
    { wch: 55 },
    { wch: 10 },
    { wch: 14 },
    { wch: 14 },
  ]

  XLSX.utils.book_append_sheet(wb, ws, 'Keyword Rankings')

  // Metadata sheet
  const metaWs = XLSX.utils.aoa_to_sheet([
    ['Export von', branding.tenantName],
    ['Kunde', branding.customerName ?? 'Alle Kunden'],
    ['Erstellt am', new Date().toLocaleDateString('de-DE')],
    ['Zeilen', rows.length],
  ])
  XLSX.utils.book_append_sheet(wb, metaWs, 'Info')

  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' }) as Buffer
  return buf
}

export function generateGscDiscoveryXlsx(
  rows: KeywordRankingRow[],
  branding: BrandingConfig
): Buffer {
  const wb = XLSX.utils.book_new()

  const sheetRows = rows.map((r) => ({
    Keyword: r.keyword,
    'Ø Position': r.position ?? 'n/a',
    'Beste URL': r.url ?? '',
    Klicks: r.clicks ?? 0,
    Impressionen: r.impressions ?? 0,
    Datum: new Date(r.trackedAt).toLocaleDateString('de-DE'),
  }))

  const ws = XLSX.utils.json_to_sheet(sheetRows)
  ws['!cols'] = [{ wch: 45 }, { wch: 12 }, { wch: 55 }, { wch: 10 }, { wch: 14 }, { wch: 14 }]
  XLSX.utils.book_append_sheet(wb, ws, 'GSC Discovery')

  const metaWs = XLSX.utils.aoa_to_sheet([
    ['Export von', branding.tenantName],
    ['Kunde', branding.customerName ?? 'Alle Kunden'],
    ['Erstellt am', new Date().toLocaleDateString('de-DE')],
    ['Zeilen', rows.length],
  ])
  XLSX.utils.book_append_sheet(wb, metaWs, 'Info')

  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' }) as Buffer
  return buf
}

// ─── PDF generators ───────────────────────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '')
  const num = parseInt(clean, 16)
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255]
}

function buildPdfBase(
  doc: InstanceType<typeof PDFDocument>,
  title: string,
  branding: BrandingConfig
): void {
  const [r, g, b] = hexToRgb(branding.accentColor)
  const dateStr = new Date().toLocaleDateString('de-DE', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })

  // Header background bar
  doc.rect(0, 0, doc.page.width, 80).fill([r, g, b])

  // Title
  doc
    .fillColor('#ffffff')
    .fontSize(20)
    .font('Helvetica-Bold')
    .text(title, 40, 24, { width: doc.page.width - 80 })

  // Subtitle: tenant + customer
  const subtitle = branding.customerName
    ? `${branding.tenantName}  ·  ${branding.customerName}`
    : branding.tenantName
  doc.fontSize(10).font('Helvetica').text(subtitle, 40, 50)

  // Date (right-aligned in header)
  doc.fillColor('#ffffff').fontSize(9).text(dateStr, 40, 58, {
    width: doc.page.width - 80,
    align: 'right',
  })

  doc.moveDown(3)
}

function addPdfFooter(doc: InstanceType<typeof PDFDocument>, branding: BrandingConfig): void {
  const y = doc.page.height - 40
  doc
    .fontSize(8)
    .fillColor('#94a3b8')
    .font('Helvetica')
    .text(
      `Erstellt von ${branding.tenantName} via BoostHive · ${new Date().toLocaleDateString('de-DE')}`,
      40,
      y,
      { width: doc.page.width - 80, align: 'center' }
    )
}

export async function generateKeywordRankingsPdf(
  rows: KeywordRankingRow[],
  branding: BrandingConfig
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: 'A4' })
    const chunks: Buffer[] = []

    doc.on('data', (chunk: Buffer) => chunks.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    buildPdfBase(doc, 'Keyword Rankings', branding)

    const [r, g, b] = hexToRgb(branding.accentColor)

    if (rows.length === 0) {
      doc.fontSize(12).fillColor('#64748b').text('Keine Ranking-Daten verfügbar.', 40, 120)
    } else {
      // Table header
      const colX = [40, 180, 270, 360, 440]
      const headers = ['Keyword', 'Position', 'Klicks', 'Impressionen', 'Datum']

      doc.rect(40, doc.y, doc.page.width - 80, 20).fill([r, g, b])
      doc.fillColor('#ffffff').fontSize(9).font('Helvetica-Bold')
      headers.forEach((h, i) => doc.text(h, colX[i], doc.y - 17))
      doc.moveDown(0.5)

      // Rows (max 200 for PDF readability)
      const displayRows = rows.slice(0, 200)
      displayRows.forEach((row, idx) => {
        const rowY = doc.y
        if (idx % 2 === 0) {
          doc.rect(40, rowY, doc.page.width - 80, 16).fill('#f8fafc')
        }
        doc.fillColor('#0f172a').fontSize(8).font('Helvetica')
        const cols = [
          row.keyword.slice(0, 28),
          row.position != null ? String(Math.round(row.position)) : '–',
          row.clicks != null ? String(Math.round(row.clicks)) : '–',
          row.impressions != null ? String(Math.round(row.impressions)) : '–',
          new Date(row.trackedAt).toLocaleDateString('de-DE'),
        ]
        cols.forEach((c, i) => doc.text(c, colX[i], rowY + 3, { width: 110, lineBreak: false }))
        doc.moveDown(0.3)
      })

      if (rows.length > 200) {
        doc
          .moveDown(0.5)
          .fontSize(9)
          .fillColor('#64748b')
          .text(`… und ${rows.length - 200} weitere Keywords. Vollständige Daten im XLSX-Export.`)
      }
    }

    addPdfFooter(doc, branding)
    doc.end()
  })
}

export async function generateMarketingDashboardPdf(
  rows: PerformanceRow[],
  branding: BrandingConfig
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: 'A4' })
    const chunks: Buffer[] = []

    doc.on('data', (chunk: Buffer) => chunks.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    buildPdfBase(doc, 'Marketing Performance', branding)

    const [r, g, b] = hexToRgb(branding.accentColor)

    if (rows.length === 0) {
      doc.fontSize(12).fillColor('#64748b').text('Keine Performance-Daten verfügbar.', 40, 120)
    } else {
      doc.rect(40, doc.y, doc.page.width - 80, 20).fill([r, g, b])
      doc.fillColor('#ffffff').fontSize(9).font('Helvetica-Bold')
      doc.text('Kennzahl', 40, doc.y - 17)
      doc.text('Wert', 320, doc.y - 17)
      doc.moveDown(0.5)

      rows.forEach((row, idx) => {
        const rowY = doc.y
        if (idx % 2 === 0) {
          doc.rect(40, rowY, doc.page.width - 80, 16).fill('#f8fafc')
        }
        doc.fillColor('#0f172a').fontSize(9).font('Helvetica')
        doc.text(row.label, 40, rowY + 3, { width: 270, lineBreak: false })
        doc.text(
          `${row.value}${row.unit ? ` ${row.unit}` : ''}`,
          320,
          rowY + 3,
          { width: 200, lineBreak: false }
        )
        doc.moveDown(0.3)
      })
    }

    addPdfFooter(doc, branding)
    doc.end()
  })
}

export async function generateCustomerReportPdf(
  data: CustomerSummaryData,
  branding: BrandingConfig
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: 'A4' })
    const chunks: Buffer[] = []

    doc.on('data', (chunk: Buffer) => chunks.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    buildPdfBase(doc, `Monatsbericht: ${data.customerName}`, branding)

    const [r, g, b] = hexToRgb(branding.accentColor)
    const y0 = doc.y

    // Overview box
    doc.rect(40, y0, (doc.page.width - 80) / 2 - 8, 60).fill('#f8fafc')
    doc.fillColor('#64748b').fontSize(9).font('Helvetica-Bold').text('Kunde', 52, y0 + 8)
    doc.fillColor('#0f172a').fontSize(14).font('Helvetica-Bold').text(data.customerName, 52, y0 + 20)
    if (data.industry) {
      doc.fillColor('#64748b').fontSize(9).font('Helvetica').text(data.industry, 52, y0 + 40)
    }

    const midX = 40 + (doc.page.width - 80) / 2 + 8
    doc.rect(midX, y0, (doc.page.width - 80) / 2 - 8, 60).fill('#f8fafc')
    doc.fillColor('#64748b').fontSize(9).font('Helvetica-Bold').text('Keywords verfolgt', midX + 12, y0 + 8)
    doc.fillColor('#0f172a').fontSize(22).font('Helvetica-Bold').text(String(data.keywordCount), midX + 12, y0 + 18)
    if (data.avgPosition != null) {
      doc
        .fillColor('#64748b')
        .fontSize(9)
        .font('Helvetica')
        .text(`Ø Position: ${data.avgPosition.toFixed(1)}`, midX + 12, y0 + 44)
    }

    doc.moveDown(5)

    // Top Keywords
    doc
      .fontSize(11)
      .fillColor('#0f172a')
      .font('Helvetica-Bold')
      .text('Top Keywords', 40, doc.y)
    doc.moveDown(0.3)

    if (data.topKeywords.length === 0) {
      doc.fontSize(9).fillColor('#64748b').font('Helvetica').text('Keine Keyword-Daten verfügbar.')
    } else {
      const colX = [40, 200, 290, 380]
      doc.rect(40, doc.y, doc.page.width - 80, 20).fill([r, g, b])
      doc.fillColor('#ffffff').fontSize(9).font('Helvetica-Bold')
      ;['Keyword', 'Position', 'Klicks', 'Impressionen'].forEach((h, i) =>
        doc.text(h, colX[i], doc.y - 17)
      )
      doc.moveDown(0.5)

      data.topKeywords.slice(0, 20).forEach((row, idx) => {
        const rowY = doc.y
        if (idx % 2 === 0) doc.rect(40, rowY, doc.page.width - 80, 16).fill('#f8fafc')
        doc.fillColor('#0f172a').fontSize(8).font('Helvetica')
        ;[
          row.keyword.slice(0, 22),
          row.position != null ? String(Math.round(row.position)) : '–',
          row.clicks != null ? String(Math.round(row.clicks)) : '–',
          row.impressions != null ? String(Math.round(row.impressions)) : '–',
        ].forEach((c, i) => doc.text(c, colX[i], rowY + 3, { width: 140, lineBreak: false }))
        doc.moveDown(0.3)
      })
    }

    addPdfFooter(doc, branding)
    doc.end()
  })
}
