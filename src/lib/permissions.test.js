// اختبار منطق صلاحيات الموظفين + أدوار M7 (canAccess) — دوال نقيّة
import { describe, it, expect } from 'vitest'
import { canAccess, ROLE_PRESETS, MEMBER_ROLES, OWNER_ONLY } from './permissions.js'

const owner = { isOwner: true }
const member = (over = {}) => ({ isOwner: false, allowedPages: ['orders', 'menu'], branchScope: 'all', role: 'staff', ...over })

describe('canAccess — الأساس (غير متأثّر بـM7)', () => {
  it('المالك يصل لكل شيء', () => {
    expect(canAccess('settings', owner)).toBe(true)
    expect(canAccess('orders', owner)).toBe(true)
  })
  it('OWNER_ONLY ممنوعة على الموظف', () => {
    expect(canAccess('settings', member())).toBe(false)
    expect(canAccess('billing', member())).toBe(false)
  })
  it('allowed_pages تحكم الوصول', () => {
    expect(canAccess('orders', member())).toBe(true)
    expect(canAccess('analytics', member())).toBe(false)
  })
  it('الصفحة المشتركة تُمنع لموظف مقيّد بفرع', () => {
    expect(canAccess('menu', member({ allowedPages: ['menu'], branchScope: 'branch-x' }))).toBe(false)
  })
})

describe('canAccess — أدوار M7 (required_permissions)', () => {
  const caps = (req) => ({ orders: { required_permissions: req } })
  it('قدرة بلا قيود = مسموح (fail-open)', () => {
    expect(canAccess('orders', member({ capabilities: caps([]) }))).toBe(true)
    expect(canAccess('orders', member({ capabilities: {} }))).toBe(true)
    expect(canAccess('orders', member({ capabilities: undefined }))).toBe(true)
  })
  it('قدرة تتطلب دوراً لا يملكه الموظف = ممنوع', () => {
    expect(canAccess('orders', member({ role: 'cashier', capabilities: caps(['manager']) }))).toBe(false)
  })
  it('قدرة تتطلب دور الموظف = مسموح', () => {
    expect(canAccess('orders', member({ role: 'manager', capabilities: caps(['manager']) }))).toBe(true)
  })
  it('required_permissions=[owner] يمنع كل الموظفين (لا أحد دوره owner)', () => {
    expect(canAccess('orders', member({ role: 'manager', capabilities: caps(['owner']) }))).toBe(false)
  })
  it('المالك يتجاوز required_permissions', () => {
    expect(canAccess('orders', { isOwner: true, capabilities: caps(['manager']) })).toBe(true)
  })
})

describe('OWNER_ONLY مُشتقّ من الـManifest (Suggestion 3 — توحيد)', () => {
  it('يطابق الصفحات الخمس الحصرية (required_permissions=[owner])', () => {
    expect([...OWNER_ONLY].sort()).toEqual(['billing', 'dashboard', 'marketing', 'settings', 'staff'])
  })
  it('كل صفحة owner-only ممنوعة على أي موظف', () => {
    for (const p of OWNER_ONLY) expect(canAccess(p, member({ allowedPages: ['all'] }))).toBe(false)
  })
})

describe('ROLE_PRESETS', () => {
  it('لكل دور قالب معرّف', () => {
    for (const r of MEMBER_ROLES) expect(Array.isArray(ROLE_PRESETS[r])).toBe(true)
  })
  it('الكاشير يملك صلاحيات التشغيل الأساسية والموظف يبدأ بالطلبات', () => {
    expect(ROLE_PRESETS.cashier).toEqual(['orders', 'tables', 'qr'])
    expect(ROLE_PRESETS.staff).toEqual(['orders'])
  })
  it('المدير يستعمل all مع استمرار canAccess في منع OWNER_ONLY', () => {
    expect(ROLE_PRESETS.manager).toEqual(['all'])
    for (const p of ['settings', 'staff', 'billing', 'dashboard', 'marketing'])
      expect(canAccess(p, member({ allowedPages: ROLE_PRESETS.manager, role: 'manager' }))).toBe(false)
  })
})
