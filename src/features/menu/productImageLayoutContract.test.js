import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const productItemPath = fileURLToPath(new URL('./ProductItem.jsx', import.meta.url))
const horizontalCardPath = fileURLToPath(new URL('./HProductCard.jsx', import.meta.url))
const productItemSource = readFileSync(productItemPath, 'utf8')
const horizontalCardSource = readFileSync(horizontalCardPath, 'utf8')

describe('عقد نسب صور Public Menu', () => {
  it('يمرر أبعاد الحاوية الأصلية لكل variant إلى ResponsiveMenuImage', () => {
    expect(productItemSource).toContain('width="104" height="104"') // circles
    expect(productItemSource).toContain('width="240" height="240"') // grid
    expect(productItemSource).toContain('width="480" height="360"') // showcase
    expect(productItemSource).toContain('width="108" height="108"') // list
    expect(horizontalCardSource).toContain('width="134" height="96"') // recommendations
  })

  it('يحافظ على حاويات التصميم الأصلية بدل اشتقاقها من srcset أو المورد الطبيعي', () => {
    expect(productItemSource).toContain("aspectRatio:'1/1'")
    expect(productItemSource).toContain("aspectRatio:'4/3'")
    expect(productItemSource).toContain("width:'108px', height:'108px'")
    expect(horizontalCardSource).toContain("height:'96px'")
  })
})
