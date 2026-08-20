import type { CSSProperties } from 'react'
import { createSupabaseWebpSrcSet } from '@/lib/menu/image-transforms'

// مكوّن صورة منيو خادمي — مطابق لسلوك ResponsiveMenuImage في الإنتاج:
// <picture> بـ WebP srcset من تحويل Supabase render، مع الأصل كـ fallback.
// Server Component خالص (لا "use client"). STEP 12.
export default function MenuImage({
  src,
  alt = '',
  widths,
  sizes,
  width,
  height,
  quality = 72,
  priority = false,
  style,
}: {
  src: string
  alt?: string
  widths: number[]
  sizes?: string
  width: string | number
  height: string | number
  quality?: number
  priority?: boolean
  style?: CSSProperties
}) {
  const srcSet = createSupabaseWebpSrcSet(src, widths, quality, { width, height })
  const img = (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      width={width}
      height={height}
      loading={priority ? 'eager' : 'lazy'}
      fetchPriority={priority ? 'high' : 'auto'}
      decoding="async"
      style={style}
    />
  )

  if (!srcSet) return img

  return (
    <picture style={{ display: 'block', width: '100%', height: '100%' }}>
      <source type="image/webp" srcSet={srcSet} sizes={sizes} />
      {img}
    </picture>
  )
}
