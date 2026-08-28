import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const register = readFileSync(resolve(process.cwd(), 'src/pages/Register.jsx'), 'utf8')
const registerCss = readFileSync(resolve(process.cwd(), 'src/pages/Register.css'), 'utf8')

describe('registration experience contract', () => {
  it('يستخدم تركيبًا responsive حقيقيًا بدلاً من قياس نافذة ثابت في render', () => {
    expect(registerCss).toContain('@media (max-width: 899px)')
    expect(registerCss).toContain('.register-marketing { display:none; }')
    expect(registerCss).toContain('max-width:560px')
    expect(register).not.toContain('window.innerWidth')
  })

  it('يحافظ على عناصر الإتاحة والـCTA وحالات الأخطاء في النموذج', () => {
    expect(register).toContain('htmlFor="restaurant-name"')
    expect(register).toContain('htmlFor="register-email"')
    expect(register).toContain('htmlFor="register-password"')
    expect(register).toContain('aria-invalid={Boolean(errors.email)}')
    expect(register).toContain('aria-busy={loading}')
    expect(register).toContain("loading ? 'جارٍ إنشاء مطعمك...' : 'أنشئ مطعمي مجانًا'")
  })

  it('يبقي التسجيل والتحقق بالبريد والاستئناف على نفس المسارات الآمنة', () => {
    expect(register).toContain('await signUp(')
    expect(register).toContain("navigate(`/verify-email?email=${encodeURIComponent(form.email.trim())}`")
    expect(register).toContain('await resumePendingRestaurant()')
    expect(register).toContain("navigate('/onboarding')")
    expect(register).not.toContain('window.location.reload')
  })
})
