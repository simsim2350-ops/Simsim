import { describe, expect, it } from 'vitest'
import { createSupabaseImageTransform, createSupabaseWebpSrcSet, isSupabasePublicStorageUrl } from './imageTransforms'

const source = 'https://gpwwnuuicywsvmmhxngs.supabase.co/storage/v1/object/public/restaurant-media/restaurant/products/item.jpg'

describe('imageTransforms', () => {
  it('يتعرف على روابط Supabase Storage العامة فقط', () => {
    expect(isSupabasePublicStorageUrl(source)).toBe(true)
    expect(isSupabasePublicStorageUrl('https://example.com/product.jpg')).toBe(false)
    expect(isSupabasePublicStorageUrl('not a url')).toBe(false)
  })

  it('ينتج رابط WebP محوّل بعرض وجودة محددين مع fallback المصدر الأصلي خارج المكوّن', () => {
    expect(createSupabaseImageTransform(source, { width: 240, quality: 70 })).toBe(
      'https://gpwwnuuicywsvmmhxngs.supabase.co/storage/v1/render/image/public/restaurant-media/restaurant/products/item.jpg?width=240&quality=70&format=webp',
    )
    expect(createSupabaseImageTransform('https://example.com/product.jpg', { width: 240 })).toBe('https://example.com/product.jpg')
  })

  it('ينتج srcset مرتبًا وفريدًا لصور Supabase فقط', () => {
    const srcSet = createSupabaseWebpSrcSet(source, [480, 240, 240], 72)
    expect(srcSet).toContain('width=240&quality=72&format=webp 240w')
    expect(srcSet).toContain('width=480&quality=72&format=webp 480w')
    expect(srcSet.split(', ')).toHaveLength(2)
    expect(createSupabaseWebpSrcSet('https://example.com/product.jpg', [240])).toBeUndefined()
  })

  it('يطابق نسبة المورد مع حاوية البطاقة دون تغيير أبعاد CSS المعلنة', () => {
    expect(createSupabaseImageTransform(source, { width: 240, height: 240, resize: 'cover', quality: 72 })).toBe(
      'https://gpwwnuuicywsvmmhxngs.supabase.co/storage/v1/render/image/public/restaurant-media/restaurant/products/item.jpg?width=240&height=240&resize=cover&quality=72&format=webp',
    )

    const srcSet = createSupabaseWebpSrcSet(source, [240, 480], 72, { width: 240, height: 240 })
    expect(srcSet).toContain('width=240&height=240&resize=cover&quality=72&format=webp 240w')
    expect(srcSet).toContain('width=480&height=480&resize=cover&quality=72&format=webp 480w')
  })
})
