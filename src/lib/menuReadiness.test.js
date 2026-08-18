import { describe, expect, it } from 'vitest'
import { calculateMenuReadiness, menuReadyMessage } from './menuReadiness.js'

const restaurant = { id:'r1', name:'مطعم تجريبي', is_active:true, platform_suspended:false }
const branch = { id:'b1', is_active:true, is_paused:false }
const category = { id:'c1', branch_id:'b1', is_visible:true, name:'الرئيسية' }
const product = { id:'p1', branch_id:'b1', category_id:'c1', is_available:true, price:24, name:'صنف' }

describe('calculateMenuReadiness', () => {
  it('لا يعد المنيو جاهزاً بلا فرع وقسم وصنف صالح', () => {
    const readiness = calculateMenuReadiness({ restaurant })
    expect(readiness.minimumReady).toBe(false)
    expect(readiness.nextEssential?.key).toBe('branch')
    expect(menuReadyMessage(readiness)).toContain('فرع نشط')
  })

  it('يعد المنيو جاهزاً عند وجود مطعم وفرع وقسم ظاهر وصنف متاح بسعر موجب', () => {
    const readiness = calculateMenuReadiness({ restaurant, branch, categories:[category], products:[product] })
    expect(readiness.minimumReady).toBe(true)
    expect(readiness.validProducts).toHaveLength(1)
    expect(menuReadyMessage(readiness)).toContain('جاهز للمشاركة')
  })

  it('لا يقبل صنفاً بلا سعر أو داخل قسم مخفي كأساس قابل للمشاركة', () => {
    const missingPrice = calculateMenuReadiness({ restaurant, branch, categories:[category], products:[{ ...product, price:0 }] })
    const hiddenCategory = calculateMenuReadiness({ restaurant, branch, categories:[{ ...category, is_visible:false }], products:[product] })
    expect(missingPrice.minimumReady).toBe(false)
    expect(missingPrice.nextEssential?.key).toBe('product')
    expect(hiddenCategory.minimumReady).toBe(false)
    expect(hiddenCategory.nextEssential?.key).toBe('category')
  })

  it('يبقي الشعار والصور والوصف والساعات ضمن تحسينات موصى بها لا حواجز', () => {
    const readiness = calculateMenuReadiness({ restaurant, branch, categories:[category], products:[product] })
    expect(readiness.minimumReady).toBe(true)
    expect(readiness.recommended.find(item => item.key === 'logo')?.complete).toBe(false)
    expect(readiness.recommended.find(item => item.key === 'product_images')?.complete).toBe(false)
  })
})
