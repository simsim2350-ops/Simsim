// ============================================================================
// نقل مطابق لآلية صور المنيو في التطبيق الحالي (src/features/menu/imageTransforms.js).
// نفس المنطق تمامًا: تحويل رابط Supabase Storage العام إلى رابط render/image مع WebP،
// حتى يطابق منيو المعاينة SSR روابط الصور نفسها التي ينتجها الإنتاج (نفس كاش الـCDN).
// لا تغيير في السلوك — إعادة كتابة TypeScript فقط لبيئة Next.js.
// ============================================================================

const PUBLIC_STORAGE_PATH = '/storage/v1/object/public/'
const RENDER_STORAGE_PATH = '/storage/v1/render/image/public/'

export function isSupabasePublicStorageUrl(source: string): boolean {
  try {
    const url = new URL(source)
    return url.pathname.includes(PUBLIC_STORAGE_PATH)
  } catch {
    return false
  }
}

type TransformOptions = {
  width: number
  height?: number | null
  resize?: string
  quality?: number
  format?: string
}

export function createSupabaseImageTransform(
  source: string,
  { width, height, resize, quality = 72, format = 'webp' }: TransformOptions,
): string {
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

export function createSupabaseWebpSrcSet(
  source: string,
  widths: number[],
  quality = 72,
  { width: renderedWidth, height: renderedHeight }: { width?: number | string; height?: number | string } = {},
): string | undefined {
  const uniqueWidths = [...new Set((widths || []).map(Number).filter((width) => Number.isFinite(width) && width > 0))].sort((a, b) => a - b)
  if (!isSupabasePublicStorageUrl(source) || uniqueWidths.length === 0) return undefined

  const hasRenderedRatio = Number.isFinite(Number(renderedWidth)) && Number(renderedWidth) > 0
    && Number.isFinite(Number(renderedHeight)) && Number(renderedHeight) > 0
  const heightForWidth = (width: number) => hasRenderedRatio ? Math.round(width * Number(renderedHeight) / Number(renderedWidth)) : undefined

  return uniqueWidths
    .map((width) => `${createSupabaseImageTransform(source, { width, height: heightForWidth(width), resize: hasRenderedRatio ? 'cover' : undefined, quality, format: 'webp' })} ${width}w`)
    .join(', ')
}
