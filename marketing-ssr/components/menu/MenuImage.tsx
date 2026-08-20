import Image from 'next/image'

// غلاف صور المنيو فوق next/image (Phase 1، البند 11).
// يملأ الحاوية (fill + objectFit:cover) مطابقاً لسلوك ResponsiveMenuImage في SPA.
// الحاوية الأب يجب أن تكون position:relative بأبعاد محددة (كل بطاقات المنيو كذلك).
// priority فقط للصور الحرجة (الغلاف/أول صورة)، والباقي lazy تلقائياً عبر next/image.

const SUPABASE_PUBLIC = '/storage/v1/object/public/'

function isOptimizableRemote(src: string): boolean {
  try {
    const u = new URL(src)
    return u.hostname.endsWith('.supabase.co') && u.pathname.includes(SUPABASE_PUBLIC)
  } catch {
    return false
  }
}

export default function MenuImage({
  src,
  alt = '',
  sizes,
  priority = false,
}: {
  src: string
  alt?: string
  sizes: string
  priority?: boolean
}) {
  // مصادر غير مدعومة بالمُحسِّن (نطاق غير Supabase) تُعرض كـ<img> عادية لتفادي أخطاء الاستضافة.
  if (!isOptimizableRemote(src)) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={src}
        alt={alt}
        loading={priority ? 'eager' : 'lazy'}
        decoding="async"
        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
      />
    )
  }
  return (
    <Image
      src={src}
      alt={alt}
      fill
      sizes={sizes}
      priority={priority}
      style={{ objectFit: 'cover' }}
    />
  )
}
