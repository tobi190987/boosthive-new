/**
 * PROJ-55: Export file generators
 * Serverside PDF (pdfkit) and XLSX (xlsx) generation for the Export Center.
 * Each generator receives pre-fetched data and branding config.
 */

import PDFDocument from 'pdfkit'
import * as XLSX from 'xlsx'
import fs from 'fs'
import path from 'path'
import { loadPdfLogoAsset, renderPdfHeaderLogo } from '@/lib/export-pdf-branding'

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

export interface TimeSeriesPoint {
  label: string
  value: number
}

export interface MarketingDashboardChart {
  title: string
  series: TimeSeriesPoint[]
  strokeColor?: string
}

export interface MarketingDashboardExportData {
  rows: PerformanceRow[]
  charts: MarketingDashboardChart[]
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

let cachedPdfFontPath: string | null | undefined
const PDF_FONT_REGULAR = 'ExportSans'
const PDF_FONT_BOLD = 'ExportSansBold'

function resolvePdfFontPath(): string | null {
  if (cachedPdfFontPath !== undefined) return cachedPdfFontPath

  const candidate = path.join(process.cwd(), 'public/fonts/noto-sans-regular.ttf')
  cachedPdfFontPath = fs.existsSync(candidate) ? candidate : null

  return cachedPdfFontPath
}

function applyPdfFont(
  doc: InstanceType<typeof PDFDocument>,
  variant: 'regular' | 'bold' = 'regular'
): InstanceType<typeof PDFDocument> {
  const fontPath = resolvePdfFontPath()
  if (fontPath) {
    return doc.font(variant === 'bold' ? PDF_FONT_BOLD : PDF_FONT_REGULAR)
  }

  throw new Error('PDF-Schriftdatei konnte nicht geladen werden.')
}

function createPdfDocument(): InstanceType<typeof PDFDocument> {
  const fontPath = resolvePdfFontPath()
  if (!fontPath) {
    throw new Error('PDF-Schriftdatei konnte nicht geladen werden.')
  }

  const doc = new PDFDocument({
    margin: 40,
    size: 'A4',
    font: fontPath,
  })
  doc.registerFont(PDF_FONT_REGULAR, fontPath)
  doc.registerFont(PDF_FONT_BOLD, fontPath)
  doc.font(PDF_FONT_REGULAR)
  return doc
}

function buildPdfBase(
  doc: InstanceType<typeof PDFDocument>,
  title: string,
  branding: BrandingConfig,
  logoBuffer: Buffer | null
): void {
  const [r, g, b] = hexToRgb(branding.accentColor)
  const dateStr = new Date().toLocaleDateString('de-DE', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })

  // Header background bar
  doc.rect(0, 0, doc.page.width, 80).fill([r, g, b])

  const hasLogo = renderPdfHeaderLogo(doc, logoBuffer)
  const titleX = hasLogo ? 108 : 40

  // Title
  doc.fillColor('#ffffff').fontSize(20)
  applyPdfFont(doc, 'bold')
  doc.text(title, titleX, 24, { width: doc.page.width - titleX - 40 })

  // Subtitle: tenant + customer
  const subtitle = branding.customerName
    ? `${branding.tenantName}  ·  ${branding.customerName}`
    : branding.tenantName
  doc.fontSize(10)
  applyPdfFont(doc, 'regular')
  doc.text(subtitle, titleX, 50)

  // Date (right-aligned in header)
  doc.fillColor('#ffffff').fontSize(9)
  applyPdfFont(doc, 'regular')
  doc.text(dateStr, 40, 58, {
    width: doc.page.width - 80,
    align: 'right',
  })

  doc.moveDown(3)
}

function drawKeywordTableHeader(
  doc: InstanceType<typeof PDFDocument>,
  y: number,
  color: [number, number, number]
) {
  const colX = [40, 200, 292, 372, 468]
  const headers = ['Keyword', 'Position', 'Klicks', 'Impressionen', 'Datum']

  doc.rect(40, y, doc.page.width - 80, 22).fill(color)
  doc.fillColor('#ffffff').fontSize(9)
  applyPdfFont(doc, 'bold')
  headers.forEach((header, index) => {
    doc.text(header, colX[index], y + 6, {
      width: index === 0 ? 148 : 84,
      lineBreak: false,
    })
  })
}

export async function generateKeywordRankingsPdf(
  rows: KeywordRankingRow[],
  branding: BrandingConfig
): Promise<Buffer> {
  const logoBuffer = await loadPdfLogoAsset(branding.logoUrl)

  return new Promise((resolve, reject) => {
    const doc = createPdfDocument()
    const chunks: Buffer[] = []

    doc.on('data', (chunk: Buffer) => chunks.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    buildPdfBase(doc, 'Keyword Rankings', branding, logoBuffer)

    const [r, g, b] = hexToRgb(branding.accentColor)
    const headerColor: [number, number, number] = [r, g, b]
    const colX = [40, 200, 292, 372, 468]
    const maxRows = rows.slice(0, 200)
    const topY = 120
    const rowHeight = 18
    const pageBottom = doc.page.height - 56
    let currentY = topY

    if (rows.length === 0) {
      doc.fontSize(12).fillColor('#64748b')
      applyPdfFont(doc, 'regular')
      doc.text('Keine Ranking-Daten verfügbar.', 40, 120)
    } else {
      drawKeywordTableHeader(doc, currentY, headerColor)
      currentY += 26

      maxRows.forEach((row, idx) => {
        if (currentY + rowHeight > pageBottom) {
          doc.addPage()
          buildPdfBase(doc, 'Keyword Rankings', branding, logoBuffer)
          currentY = topY
          drawKeywordTableHeader(doc, currentY, headerColor)
          currentY += 26
        }

        if (idx % 2 === 0) {
          doc.rect(40, currentY, doc.page.width - 80, rowHeight).fill('#f8fafc')
        }

        doc.fillColor('#0f172a').fontSize(8)
        applyPdfFont(doc, 'regular')
        const cols = [
          row.keyword.slice(0, 28),
          row.position != null ? String(Math.round(row.position)) : '–',
          row.clicks != null ? String(Math.round(row.clicks)) : '–',
          row.impressions != null ? String(Math.round(row.impressions)) : '–',
          new Date(row.trackedAt).toLocaleDateString('de-DE'),
        ]
        cols.forEach((value, index) => {
          doc.text(value, colX[index], currentY + 4, {
            width: index === 0 ? 148 : 84,
            lineBreak: false,
          })
        })
        currentY += rowHeight
      })

      if (rows.length > 200) {
        if (currentY + 22 > pageBottom) {
          doc.addPage()
          buildPdfBase(doc, 'Keyword Rankings', branding, logoBuffer)
          currentY = topY
        }
        doc.fontSize(9).fillColor('#64748b')
        applyPdfFont(doc, 'regular')
        doc.text(
          `… und ${rows.length - 200} weitere Keywords. Vollständige Daten im XLSX-Export.`,
          40,
          currentY + 8
        )
      }
    }

    doc.end()
  })
}

export async function generateMarketingDashboardPdf(
  data: MarketingDashboardExportData,
  branding: BrandingConfig
): Promise<Buffer> {
  const logoBuffer = await loadPdfLogoAsset(branding.logoUrl)

  return new Promise((resolve, reject) => {
    const doc = createPdfDocument()
    const chunks: Buffer[] = []

    doc.on('data', (chunk: Buffer) => chunks.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    buildPdfBase(doc, 'Marketing Performance', branding, logoBuffer)

    const [r, g, b] = hexToRgb(branding.accentColor)
    const rows = data.rows

    if (rows.length === 0) {
      doc.fontSize(12).fillColor('#64748b')
      applyPdfFont(doc, 'regular')
      doc.text('Keine Performance-Daten verfügbar.', 40, 120)
    } else {
      const headerY = doc.y
      doc.rect(40, headerY, doc.page.width - 80, 20).fill([r, g, b])
      doc.fillColor('#ffffff').fontSize(9)
      applyPdfFont(doc, 'bold')
      doc.text('Kennzahl', 40, headerY + 5, { width: 270, lineBreak: false })
      doc.text('Wert', 320, headerY + 5, { width: 200, lineBreak: false })
      doc.y = headerY + 24
      doc.moveDown(0.5)

      rows.forEach((row, idx) => {
        const rowY = doc.y
        if (idx % 2 === 0) {
          doc.rect(40, rowY, doc.page.width - 80, 16).fill('#f8fafc')
        }
        doc.fillColor('#0f172a').fontSize(9)
        applyPdfFont(doc, 'regular')
        doc.text(row.label, 40, rowY + 3, { width: 270, lineBreak: false })
        doc.text(
          `${row.value}${row.unit ? ` ${row.unit}` : ''}`,
          320,
          rowY + 3,
          { width: 200, lineBreak: false }
        )
        doc.moveDown(0.3)
      })

      const charts = data.charts.filter((chart) => chart.series.length > 1)
      if (charts.length > 0) {
        doc.moveDown(2)
        doc.fontSize(11).fillColor('#0f172a')
        applyPdfFont(doc, 'bold')
        doc.text('Zeitverläufe', 40, doc.y)
        doc.moveDown(0.4)

        charts.forEach((chart) => {
          const chartHeight = 140
          const chartWidth = doc.page.width - 80
          const chartX = 40
          const chartY = doc.y

          if (chartY + chartHeight + 36 > doc.page.height - 40) {
            doc.addPage()
            buildPdfBase(doc, 'Marketing Performance', branding, logoBuffer)
          }

          drawTimeSeriesChart(doc, {
            x: chartX,
            y: doc.y,
            width: chartWidth,
            height: chartHeight,
            title: chart.title,
            series: chart.series,
            strokeColor: chart.strokeColor ?? branding.accentColor,
          })

          doc.y += chartHeight + 20
        })
      }
    }

    doc.end()
  })
}

export async function generateCustomerReportPdf(
  data: CustomerSummaryData,
  branding: BrandingConfig
): Promise<Buffer> {
  const logoBuffer = await loadPdfLogoAsset(branding.logoUrl)

  return new Promise((resolve, reject) => {
    const doc = createPdfDocument()
    const chunks: Buffer[] = []

    doc.on('data', (chunk: Buffer) => chunks.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    buildPdfBase(doc, `Monatsbericht: ${data.customerName}`, branding, logoBuffer)

    const [r, g, b] = hexToRgb(branding.accentColor)
    const y0 = doc.y

    // Overview box
    doc.rect(40, y0, (doc.page.width - 80) / 2 - 8, 60).fill('#f8fafc')
    doc.fillColor('#64748b').fontSize(9)
    applyPdfFont(doc, 'bold')
    doc.text('Kunde', 52, y0 + 8)
    doc.fillColor('#0f172a').fontSize(14)
    applyPdfFont(doc, 'bold')
    doc.text(data.customerName, 52, y0 + 20)

    const midX = 40 + (doc.page.width - 80) / 2 + 8
    doc.rect(midX, y0, (doc.page.width - 80) / 2 - 8, 60).fill('#f8fafc')
    doc.fillColor('#64748b').fontSize(9)
    applyPdfFont(doc, 'bold')
    doc.text('Keywords verfolgt', midX + 12, y0 + 8)
    doc.fillColor('#0f172a').fontSize(22)
    applyPdfFont(doc, 'bold')
    doc.text(String(data.keywordCount), midX + 12, y0 + 18)
    if (data.avgPosition != null) {
      doc.fillColor('#64748b').fontSize(9)
      applyPdfFont(doc, 'regular')
      doc.text(`Ø Position: ${data.avgPosition.toFixed(1)}`, midX + 12, y0 + 44)
    }

    doc.moveDown(5)

    // Top Keywords
    doc.fontSize(11).fillColor('#0f172a')
    applyPdfFont(doc, 'bold')
    doc.text('Top Keywords', 40, doc.y)
    doc.moveDown(0.3)

    if (data.topKeywords.length === 0) {
      doc.fontSize(9).fillColor('#64748b')
      applyPdfFont(doc, 'regular')
      doc.text('Keine Keyword-Daten verfügbar.')
    } else {
      const colX = [40, 200, 290, 380]
      const headerY = doc.y
      doc.rect(40, headerY, doc.page.width - 80, 20).fill([r, g, b])
      doc.fillColor('#ffffff').fontSize(9)
      applyPdfFont(doc, 'bold')
      ;['Keyword', 'Position', 'Klicks', 'Impressionen'].forEach((h, i) => {
        doc.text(h, colX[i], headerY + 5, { width: 140, lineBreak: false })
      })
      doc.y = headerY + 24
      doc.moveDown(0.5)

      data.topKeywords.slice(0, 20).forEach((row, idx) => {
        const rowY = doc.y
        if (idx % 2 === 0) doc.rect(40, rowY, doc.page.width - 80, 16).fill('#f8fafc')
        doc.fillColor('#0f172a').fontSize(8)
        applyPdfFont(doc, 'regular')
        ;[
          row.keyword.slice(0, 22),
          row.position != null ? String(Math.round(row.position)) : '–',
          row.clicks != null ? String(Math.round(row.clicks)) : '–',
          row.impressions != null ? String(Math.round(row.impressions)) : '–',
        ].forEach((c, i) => doc.text(c, colX[i], rowY + 3, { width: 140, lineBreak: false }))
        doc.moveDown(0.3)
      })
    }

    doc.end()
  })
}

function drawTimeSeriesChart(
  doc: InstanceType<typeof PDFDocument>,
  options: {
    x: number
    y: number
    width: number
    height: number
    title: string
    series: TimeSeriesPoint[]
    strokeColor: string
  }
) {
  const { x, y, width, height, title, series, strokeColor } = options
  const [r, g, b] = hexToRgb(strokeColor)
  const padding = { top: 30, right: 40, bottom: 34, left: 48 }
  const chartLeft = x + padding.left
  const chartTop = y + padding.top
  const chartWidth = width - padding.left - padding.right
  const chartHeight = height - padding.top - padding.bottom
  const values = series.map((point) => point.value)
  const minValue = Math.min(...values)
  const maxValue = Math.max(...values)
  const valueRange = maxValue - minValue || 1
  const yTickValues = [maxValue, minValue + valueRange / 2, minValue]

  doc.roundedRect(x, y, width, height, 16).fill('#f8fafc')
  doc.fillColor('#0f172a').fontSize(10)
  applyPdfFont(doc, 'bold')
  doc.text(title, x + 16, y + 10, {
    width: width - 32,
    lineBreak: false,
  })

  doc.strokeColor('#e2e8f0').lineWidth(1)
  yTickValues.forEach((tickValue, line) => {
    const normalized =
      valueRange === 0 ? 0.5 : (tickValue - minValue) / valueRange
    const lineY = chartTop + chartHeight - normalized * chartHeight
    doc.moveTo(chartLeft, lineY).lineTo(chartLeft + chartWidth, lineY).stroke()
  })

  doc.strokeColor('#cbd5e1').lineWidth(1)
  doc.moveTo(chartLeft, chartTop).lineTo(chartLeft, chartTop + chartHeight).stroke()
  doc.moveTo(chartLeft, chartTop + chartHeight)
    .lineTo(chartLeft + chartWidth, chartTop + chartHeight)
    .stroke()

  doc.strokeColor([r, g, b]).lineWidth(2)
  series.forEach((point, index) => {
    const ratio = series.length === 1 ? 0 : index / (series.length - 1)
    const pointX = chartLeft + chartWidth * ratio
    const pointY = chartTop + chartHeight - ((point.value - minValue) / valueRange) * chartHeight

    if (index === 0) {
      doc.moveTo(pointX, pointY)
    } else {
      doc.lineTo(pointX, pointY)
    }
  })
  doc.stroke()

  doc.fillColor([r, g, b])
  series.forEach((point, index) => {
    const ratio = series.length === 1 ? 0 : index / (series.length - 1)
    const pointX = chartLeft + chartWidth * ratio
    const pointY = chartTop + chartHeight - ((point.value - minValue) / valueRange) * chartHeight
    doc.circle(pointX, pointY, 2.5).fill()
  })

  doc.fillColor('#64748b').fontSize(8)
  applyPdfFont(doc, 'regular')
  yTickValues.forEach((tickValue) => {
    const normalized =
      valueRange === 0 ? 0.5 : (tickValue - minValue) / valueRange
    const labelY = chartTop + chartHeight - normalized * chartHeight - 4
    doc.text(formatChartValue(tickValue), x + 6, labelY, {
      width: padding.left - 12,
      align: 'right',
      lineBreak: false,
    })
  })

  const labelIndexes = [0, Math.floor((series.length - 1) / 2), series.length - 1]
  Array.from(new Set(labelIndexes)).forEach((index) => {
    const ratio = series.length === 1 ? 0 : index / (series.length - 1)
    const pointX = chartLeft + chartWidth * ratio
    const label = series[index]?.label ?? ''
    const isFirst = index === 0
    const isLast = index === series.length - 1
    const labelWidth = 52
    const labelX = isFirst ? chartLeft : isLast ? chartLeft + chartWidth - labelWidth : pointX - labelWidth / 2
    doc.text(label, labelX, chartTop + chartHeight + 6, {
      width: labelWidth,
      align: isFirst ? 'left' : isLast ? 'right' : 'center',
      lineBreak: false,
    })
  })
}

function formatChartValue(value: number): string {
  return new Intl.NumberFormat('de-DE', {
    maximumFractionDigits: value >= 100 ? 0 : 1,
  }).format(value)
}
