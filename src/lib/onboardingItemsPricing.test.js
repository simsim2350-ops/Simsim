import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const onboardingPath = path.resolve(process.cwd(), 'src/pages/Onboarding.jsx')
const onboarding = fs.readFileSync(onboardingPath, 'utf8')

describe('عقد أسعار وأصناف Onboarding', () => {
  it('يبقي القوالب اقتراحات أسماء وأيقونات بلا أسعار رقمية', () => {
    const templatesBlock = onboarding.slice(onboarding.indexOf('const TEMPLATES = {'), onboarding.indexOf('const TYPES = ['))
    expect(onboarding).toContain('لا تحمل هذه القوالب أسعارًا')
    expect(templatesBlock).not.toMatch(/price:\s*\d/)
  })

  it('لا يعرض أو يستعمل سعر القالب كبديل عن سعر المطعم الحقيقي', () => {
    expect(onboarding).toContain("const getItemPrice = (category, item) => itemPrices[categoryItemKey(category, item)] ?? ''")
    expect(onboarding).not.toContain('getItemPrice = (category, item) => itemPrices[categoryItemKey(category, item)] ?? item.price')
    expect(onboarding).not.toContain('price: item.price')
  })

  it('يوقف إنشاء المنيو إذا لم يختر المالك صنفًا أو لم يدخل سعرًا صريحًا', () => {
    expect(onboarding).toContain('if (selectedCandidates.length === 0)')
    expect(onboarding).toContain('اختر صنفًا واحدًا على الأقل قبل إنشاء المنيو.')
    expect(onboarding).toContain('const candidatesMissingPrice = selectedCandidates.filter')
    expect(onboarding).toContain('أدخل السعر الحقيقي لكل صنف محدد قبل إنشاء المنيو.')
    expect(onboarding).toContain("price: Number(String(getItemPrice(category, item)).trim().replace('٫', '.').replace(',', '.'))")
  })

  it('يحافظ على الاختيار المحلي ويتيح التحديد الجماعي وإضافة صنف مخصص', () => {
    expect(onboarding).toContain('const itemsSelectionInitialized = useRef(false)')
    expect(onboarding).toContain('const setCategorySelection = (category, shouldSelect)')
    expect(onboarding).toContain('تحديد الكل')
    expect(onboarding).toContain('إلغاء الكل')
    expect(onboarding).toContain('const addCustomItem = () =>')
    expect(onboarding).toContain('أدخل السعر الحقيقي للصنف المخصص قبل إضافته.')
    expect(onboarding).toContain('إضافة صنف مخصص')
  })

  it('يوضح للمستخدم أن القوالب ليست منيو المطعم الحالي ويعرض عدادًا حيًا مفهوماً', () => {
    expect(onboarding).toContain('هذه أصناف مقترحة وليست منيو مطعمك الحالي.')
    expect(onboarding).toContain('إنشاء المنيو — ${selectedItemCount} صنف')
    expect(onboarding).toContain('اختيار الأصناف ← مراجعة الأسعار ← إنشاء المنيو')
  })
})
