const PUBLIC_STORAGE_PATH = '/storage/v1/object/public/'
const RENDER_STORAGE_PATH = '/storage/v1/render/image/public/'

export function isSupabasePublicStorageUrl(source) {
  try {
    const url = new URL(source)
    return url.pathname.includes(PUBLIC_STORAGE_PATH)
  } catch {
    return false
  }
}

export function createSupabaseImageTransform(source, { width, height, resize, quality = 72, format = 'webp' } = {}) {
  if (!Number.isFinite(Number(width)) || Number(width) <= 0 || !isSupabasePublicStorageUrl(source)) return source

  const normalizedHeight = Number.isFinite(Number(height)) && Number(height) > 0 ? Math.round(Number(height)) : null
  const sourceUrl = new URL(source)
  sourceUrl.pathname = sourceUrl.pathname.replace(PUBLIC_STORAGE_PATH, RENDER_STORAGE_PATH)
  sourceUrl.search = ''
  sourceUrl.searchParams.set('width', String(Math.round(Number(width))))
  if (normalizedHeight) {
    sourceUrl.searchParams.set('height', String(normalizedHeight))
    sourceUrl.searchParams.set('resize', resize || 'cover')
  }
  sourceUrl.searchParams.set('quality', String(Math.round(Number(quality))))
  sourceUrl.searchParams.set('format', format)
  return sourceUrl.toString()
}

export function createSupabaseWebpSrcSet(source, widths, quality = 72, { width: renderedWidth, height: renderedHeight } = {}) {
  const uniqueWidths = [...new Set((widths || []).map(Number).filter((width) => Number.isFinite(width) && width > 0))].sort((a, b) => a - b)
  if (!isSupabasePublicStorageUrl(source) || uniqueWidths.length === 0) return undefined

  const hasRenderedRatio = Number.isFinite(Number(renderedWidth)) && Number(renderedWidth) > 0
    && Number.isFinite(Number(renderedHeight)) && Number(renderedHeight) > 0
  const heightForWidth = (width) => hasRenderedRatio ? Math.round(width * Number(renderedHeight) / Number(renderedWidth)) : undefined

  return uniqueWidths
    .map((width) => `${createSupabaseImageTransform(source, { width, height: heightForWidth(width), resize: hasRenderedRatio ? 'cover' : undefined, quality, format: 'webp' })} ${width}w`)
    .join(', ')
}
