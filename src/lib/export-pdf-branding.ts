import PDFDocument from 'pdfkit'

export async function loadPdfLogoAsset(logoUrl: string | null) {
  if (!logoUrl) return null

  try {
    const response = await fetch(logoUrl)
    if (!response.ok) return null

    const contentType = response.headers.get('content-type')?.toLowerCase() ?? ''
    if (!contentType.includes('png') && !contentType.includes('jpeg') && !contentType.includes('jpg')) {
      return null
    }

    const buffer = Buffer.from(await response.arrayBuffer())
    return buffer.length > 0 ? buffer : null
  } catch (error) {
    console.warn('[export-pdf-branding] Logo konnte nicht geladen werden:', error)
    return null
  }
}

export function renderPdfHeaderLogo(
  doc: InstanceType<typeof PDFDocument>,
  logoBuffer: Buffer | null
) {
  if (!logoBuffer) return false

  try {
    doc.image(logoBuffer, 40, 16, {
      fit: [52, 52],
      valign: 'center',
    })
    return true
  } catch (error) {
    console.warn('[export-pdf-branding] Logo konnte nicht in PDF gerendert werden:', error)
    return false
  }
}
