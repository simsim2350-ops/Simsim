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

export function createSupabaseImageTransform(source, { width, quality = 72, format = 'webp' } = {}) {
  if (!Number.isFinite(Number(width)) || Number(width) <= 0 || !isSupabasePublicStorageUrl(source)) return source

  const sourceUrl = new URL(source)
  sourceUrl.pathname = sourceUrl.pathname.replace(PUBLIC_STORAGE_PATH, RENDER_STORAGE_PATH)
  sourceUrl.search = ''
  sourceUrl.searchParams.set('width', String(Math.round(Number(width))))
  sourceUrl.searchParams.set('quality', String(Math.round(Number(quality))))
  sourceUrl.searchParams.set('format', format)
  return sourceUrl.toString()
}

export function createSupabaseWebpSrcSet(source, widths, quality = 72) {
  const uniqueWidths = [...new Set((widths || []).map(Number).filter((width) => Number.isFinite(width) && width > 0))].sort((a, b) => a - b)
  if (!isSupabasePublicStorageUrl(source) || uniqueWidths.length === 0) return undefined

  return uniqueWidths
    .map((width) => `${createSupabaseImageTransform(source, { width, quality, format: 'webp' })} ${width}w`)
    .join(', ')
}
