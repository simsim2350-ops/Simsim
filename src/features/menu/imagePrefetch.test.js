import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const supabaseSrc = 'https://gpwwnuuicywsvmmhxngs.supabase.co/storage/v1/object/public/restaurant-media/restaurant/products/item.jpg'
// يطابق ما يمرّره ProductItem لتخطيط list: أبعاد العرض جزء لا يتجزأ من الإعداد.
const config = { widths: [128, 240, 320], sizes: '108px', quality: 72, width: '108', height: '108' }

function installFakeDom(navigatorOverrides = {}) {
  const links = []
  vi.stubGlobal('document', {
    createElement: () => ({ remove() { this._removed = true } }),
    head: { appendChild: (link) => links.push(link) },
  })
  vi.stubGlobal('navigator', navigatorOverrides)
  return links
}

describe('imagePrefetch', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('ينشئ <link rel=preload as=image> بأولوية منخفضة، بروابط WebP/srcset مطابقة تماماً لما يبنيه ResponsiveMenuImage', async () => {
    const links = installFakeDom()
    const { warmCategoryImages } = await import('./imagePrefetch')

    warmCategoryImages([{ id: 'p1', image_url: supabaseSrc }], config)

    expect(links).toHaveLength(1)
    expect(links[0].rel).toBe('preload')
    expect(links[0].as).toBe('image')
    expect(links[0].fetchPriority).toBe('low')
    expect(links[0].imageSizes).toBe('108px')
    expect(links[0].imageSrcset).toBe(
      'https://gpwwnuuicywsvmmhxngs.supabase.co/storage/v1/render/image/public/restaurant-media/restaurant/products/item.jpg?width=128&height=128&resize=cover&quality=72&format=webp 128w, '
      + 'https://gpwwnuuicywsvmmhxngs.supabase.co/storage/v1/render/image/public/restaurant-media/restaurant/products/item.jpg?width=240&height=240&resize=cover&quality=72&format=webp 240w, '
      + 'https://gpwwnuuicywsvmmhxngs.supabase.co/storage/v1/render/image/public/restaurant-media/restaurant/products/item.jpg?width=320&height=320&resize=cover&quality=72&format=webp 320w',
    )
    expect(links[0].href).toBe(
      'https://gpwwnuuicywsvmmhxngs.supabase.co/storage/v1/render/image/public/restaurant-media/restaurant/products/item.jpg?width=128&height=128&resize=cover&quality=72&format=webp',
    )
  })

  // اختبار الربط بين المُنتِج (imagePrefetch) والمستهلك (ResponsiveMenuImage):
  // لا يقارن بسلسلة ثابتة، بل بالناتج الفعلي للمكوّن نفسه — فأي تغيير مستقبلي في طريقة
  // بناء الرابط داخل ResponsiveMenuImage يُفشل هذا الاختبار بدل أن يعطّل التسخين صامتاً.
  it('يُسخّن نفس الرابط الذي يطلبه ResponsiveMenuImage فعلاً (وإلا فلا cache hit)', async () => {
    const links = installFakeDom()
    const { warmCategoryImages } = await import('./imagePrefetch')
    const { default: ResponsiveMenuImage } = await import('./ResponsiveMenuImage')

    warmCategoryImages([{ id: 'p1', image_url: supabaseSrc }], config)

    // استدعاء المكوّن كدالة للحصول على شجرة العناصر دون الحاجة إلى DOM حقيقي.
    const picture = ResponsiveMenuImage({
      src: supabaseSrc,
      widths: config.widths,
      sizes: config.sizes,
      width: config.width,
      height: config.height,
      quality: config.quality,
    })
    const source = picture.props.children[0]

    expect(source.props.srcSet).toBeTruthy()
    expect(links[0].imageSrcset).toBe(source.props.srcSet)
    expect(links[0].imageSizes).toBe(source.props.sizes)
  })

  it('يفرّغ سجل الـdedupe عند بلوغ السقف فلا ينمو بلا حد', async () => {
    const links = installFakeDom()
    const { warmCategoryImages, WARMED_LIMIT } = await import('./imagePrefetch')

    // تفريغ الطابور بمحاكاة اكتمال كل رابط، حتى لا يحجب حدُّ التزامن بقية الطلبات.
    const drain = () => { for (let i=0; i<links.length; i++) if (!links[i]._drained) { links[i]._drained = true; links[i].onload() } }
    const product = n => ({ id:'p'+n, image_url: supabaseSrc.replace('item.jpg', 'item'+n+'.jpg') })

    warmCategoryImages([product(0)], config); drain()
    const afterFirst = links.length
    expect(afterFirst).toBe(1)

    // ما دام السجل دون السقف، إعادة تسخين نفس المنتج لا تضيف شيئاً.
    warmCategoryImages([product(0)], config); drain()
    expect(links.length).toBe(afterFirst)

    // بلوغ السقف يفرّغ السجل، فيصبح المنتج الأول قابلاً للتسخين من جديد.
    warmCategoryImages(Array.from({ length: WARMED_LIMIT }, (_, i) => product(i+1)), config); drain()
    warmCategoryImages([product(0)], config); drain()
    expect(links.length).toBe(afterFirst + WARMED_LIMIT + 1)
  })

  it('يستخدم href مباشرة بلا imageSrcset لصورة خارج Supabase Storage', async () => {
    const links = installFakeDom()
    const { warmCategoryImages } = await import('./imagePrefetch')

    warmCategoryImages([{ id: 'p1', image_url: 'https://example.com/raw.jpg' }], config)

    expect(links).toHaveLength(1)
    expect(links[0].href).toBe('https://example.com/raw.jpg')
    expect(links[0].imageSrcset).toBeUndefined()
  })

  it('لا يكرر تسخين نفس المنتج مرتين (dedupe عبر استدعاءات متعددة)', async () => {
    const links = installFakeDom()
    const { warmCategoryImages } = await import('./imagePrefetch')

    const product = { id: 'p1', image_url: supabaseSrc }
    warmCategoryImages([product], config)
    warmCategoryImages([product], config)
    warmCategoryImages([product], config)

    expect(links).toHaveLength(1)
  })

  it('يتجاهل منتجاً بلا image_url دون أخطاء', async () => {
    const links = installFakeDom()
    const { warmCategoryImages } = await import('./imagePrefetch')

    warmCategoryImages([{ id: 'p1', image_url: null }], config)

    expect(links).toHaveLength(0)
  })

  it('لا يبدأ أي تسخين على اتصال بطيء (2G) أو عند تفعيل Save-Data', async () => {
    const slowLinks = installFakeDom({ connection: { effectiveType: '2g' } })
    let mod = await import('./imagePrefetch')
    mod.warmCategoryImages([{ id: 'p1', image_url: supabaseSrc }], config)
    expect(slowLinks).toHaveLength(0)

    vi.resetModules()
    const saveDataLinks = installFakeDom({ connection: { effectiveType: '4g', saveData: true } })
    mod = await import('./imagePrefetch')
    mod.warmCategoryImages([{ id: 'p2', image_url: supabaseSrc }], config)
    expect(saveDataLinks).toHaveLength(0)
  })

  it('يحدّ التزامن على اتصال 3G (حد أقصى صورتان متزامنتان) ويكمل الباقي بعد اكتمال الأولى', async () => {
    const links = installFakeDom({ connection: { effectiveType: '3g' } })
    const { warmCategoryImages } = await import('./imagePrefetch')

    warmCategoryImages(
      [
        { id: 'p1', image_url: supabaseSrc },
        { id: 'p2', image_url: supabaseSrc + '?a' },
        { id: 'p3', image_url: supabaseSrc + '?b' },
        { id: 'p4', image_url: supabaseSrc + '?c' },
      ],
      config,
    )

    // على 3G الحد الأقصى صورتان متزامنتان فقط، رغم وجود 4 صور في الطابور
    expect(links).toHaveLength(2)

    // اكتمال أول صورة يجب أن يُطلق التالية من الطابور تلقائياً
    links[0].onload()
    expect(links).toHaveLength(3)

    links[1].onerror() // فشل الطلب يجب أن يُحرّر الفتحة أيضاً، لا أن يعلّق الطابور
    expect(links).toHaveLength(4)
  })
})
