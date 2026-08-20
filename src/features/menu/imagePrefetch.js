import { createSupabaseImageTransform, createSupabaseWebpSrcSet, isSupabasePublicStorageUrl } from './imageTransforms'

// تسخين استباقي لصور القسم التالي (P2) عبر <link rel=preload> بأولوية منخفضة،
// بحيث يجد <img loading="lazy"> الصورة جاهزة في الـ HTTP cache عند وصول المستخدم إليها فعلياً.
// لا يمس ResponsiveMenuImage ولا آلية lazy-load الأصلية إطلاقاً.

const warmedProductIds = new Set()
const queue = []
let active = 0
const LINK_TIMEOUT_MS = 8000
// سقف سجل الـdedupe: يمنع النمو بلا حد في جلسة طويلة تتصفح عدة منيوهات.
// عند بلوغه يُفرَّغ السجل بالكامل؛ أسوأ أثر ممكن هو إعادة تسخين صورة واحدة
// موجودة أصلاً في HTTP cache، وهو أرخص من تركه ينمو بلا حد.
export const WARMED_LIMIT = 300

function getMaxConcurrent() {
  const conn = typeof navigator !== 'undefined' ? navigator.connection : null
  if (!conn) return 3 // API غير مدعومة → سلوك افتراضي آمن
  if (conn.saveData) return 0
  if (conn.effectiveType === 'slow-2g' || conn.effectiveType === '2g') return 0
  if (conn.effectiveType === '3g') return 2
  return 3
}

function pump() {
  while (active < getMaxConcurrent() && queue.length > 0) {
    const job = queue.shift()
    active++
    job(() => { active--; pump() })
  }
}

function preloadOne(product, { widths, sizes, quality, width, height }) {
  if (typeof document === 'undefined' || !product?.image_url || warmedProductIds.has(product.id)) return
  if (warmedProductIds.size >= WARMED_LIMIT) warmedProductIds.clear()
  warmedProductIds.add(product.id)

  queue.push((done) => {
    const link = document.createElement('link')
    link.rel = 'preload'
    link.as = 'image'
    link.fetchPriority = 'low'

    if (isSupabasePublicStorageUrl(product.image_url)) {
      // نفس استدعاء ResponsiveMenuImage حرفياً (بما فيه { width, height })، وإلا اختلف الرابط المُسخَّن
      // عن الرابط الذي سيطلبه <img> فيضيع الـcache hit ويُنزَّل الملف مرتين.
      const srcSet = createSupabaseWebpSrcSet(product.image_url, widths, quality, { width, height })
      if (srcSet) {
        link.imageSrcset = srcSet
        link.imageSizes = sizes
      }
      // href هو fallback لمتصفح لا يدعم imagesrcset: يطابق أصغر مرشّح في الـsrcset.
      const hasRenderedRatio = Number(width) > 0 && Number(height) > 0
      link.href = createSupabaseImageTransform(product.image_url, {
        width: widths[0],
        height: hasRenderedRatio ? Math.round(widths[0] * Number(height) / Number(width)) : undefined,
        resize: hasRenderedRatio ? 'cover' : undefined,
        quality,
      })
    } else {
      link.href = product.image_url
    }

    let settled = false
    const cleanup = () => {
      if (settled) return
      settled = true
      clearTimeout(timeoutId)
      link.remove()
      done()
    }
    link.onload = cleanup
    link.onerror = cleanup
    const timeoutId = setTimeout(cleanup, LINK_TIMEOUT_MS)
    document.head.appendChild(link)
  })
  pump()
}

// products: أول 2-4 منتجات فقط من القسم القادم (P2)، وليس القسم كاملاً
export function warmCategoryImages(products, { widths, sizes, quality, width, height }) {
  if (!Array.isArray(products) || getMaxConcurrent() === 0) return
  products.forEach(product => preloadOne(product, { widths, sizes, quality, width, height }))
}
