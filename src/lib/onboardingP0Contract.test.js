import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const readSource = (path) => readFileSync(resolve(process.cwd(), path), 'utf8')

const onboarding = readSource('src/pages/Onboarding.jsx')
const readinessCard = readSource('src/components/MenuReadinessCard.jsx')
const register = readSource('src/pages/Register.jsx')
const login = readSource('src/pages/Login.jsx')
const landing = readSource('src/config/landingContent.js')

describe('P0 onboarding UX contract', () => {
  it('يفصل بصريًا أساسيات المشاركة عن التحسينات الاختيارية دون استخدام نسبة الإكمال المختلطة', () => {
    expect(readinessCard).toContain('جاهزية المشاركة')
    expect(readinessCard).toContain('أساسيات جاهزية المشاركة')
    expect(readinessCard).toContain('تحسينات اختيارية')
    expect(readinessCard).toContain('منيوك جاهز للمشاركة. يمكنك إضافة التحسينات لاحقًا.')
    expect(readinessCard).not.toContain('completionPercent')

    expect(onboarding).toContain('الأساسيات ${readiness.essentialsDone}/${readiness.essentialsTotal}')
    expect(onboarding).not.toContain('completionPercent')
  })

  it('لا يطلق menu_published لمجرد إكمال الـOnboarding', () => {
    expect(onboarding).not.toContain("trackOwnerEvent('menu_published'")
    expect(onboarding).toContain('عرض ملخص الإعداد ←')
    expect(onboarding).toContain('نسخ رابط المنيو')
  })

  it('لا يترك وعودًا زمنية غير مثبتة في نقاط بداية الرحلة', () => {
    for (const source of [register, login, landing, onboarding]) {
      expect(source).not.toContain('في دقيقة')
      expect(source).not.toContain('10 د')
      expect(source).not.toContain('بدقائق')
    }
  })
})
