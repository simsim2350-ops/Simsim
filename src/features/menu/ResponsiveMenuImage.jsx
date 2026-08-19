import { createSupabaseWebpSrcSet } from './imageTransforms'

// مكوّن صور المنيو العام: لا يغيّر المصدر إن لم يكن Storage عامًا مدعومًا،
// ويستخدم WebP المحوّل من Supabase فقط عبر <source> مع JPEG الأصلي كـfallback.
export default function ResponsiveMenuImage({
  src,
  alt = '',
  widths,
  sizes,
  width,
  height,
  quality = 72,
  priority = false,
  style,
  ...rest
}) {
  const srcSet = createSupabaseWebpSrcSet(src, widths, quality)
  const image = (
    <img
      src={src}
      alt={alt}
      width={width}
      height={height}
      loading={priority ? 'eager' : 'lazy'}
      fetchPriority={priority ? 'high' : 'auto'}
      decoding="async"
      style={style}
      {...rest}
    />
  )

  if (!srcSet) return image

  return (
    <picture style={{ display: 'block', width: '100%', height: '100%' }}>
      <source type="image/webp" srcSet={srcSet} sizes={sizes} />
      {image}
    </picture>
  )
}
