// TASK-PAY-3.6A-1b.1 — اختبارات وحدة src/payments/checkoutBinding.js (تكامل السلة/الدفع)
// أداة نقيّة بالكامل — كل اختبار هنا بلا شبكة، بلا قاعدة بيانات، بلا حالة مشتركة بين الاختبارات.
import { describe, it, expect } from 'vitest'
import { canonicalizeCheckout, computeCheckoutFingerprint, buildCheckoutSnapshot } from '../../src/payments/checkoutBinding.js'

const RID_A = '11111111-1111-4111-8111-111111111111'
const RID_B = '22222222-2222-4222-8222-222222222222'
const BID_A = '33333333-3333-4333-8333-333333333333'
const BID_B = '44444444-4444-4444-8444-444444444444'
const PID_A = '55555555-5555-4555-8555-555555555555'
const PID_B = '66666666-6666-4666-8666-666666666666'

function baseInput(overrides = {}) {
  return {
    restaurant_id: RID_A,
    branch_id: BID_A,
    type: 'dine_in',
    items: [{ product_id: PID_A, quantity: 1, options: [] }],
    coupon_code: null,
    ...overrides,
  }
}

// ══════════════════════════════════════════════════════════════════
// CANON-001..010: قواعد التطبيع الأساسية
// ══════════════════════════════════════════════════════════════════

describe('CANON-001: UUID normalization (lowercase)', () => {
  it('يُطبِّع restaurant_id/branch_id/product_id لحروف صغيرة', () => {
    const c = canonicalizeCheckout(baseInput({
      restaurant_id: RID_A.toUpperCase(),
      branch_id: BID_A.toUpperCase(),
      items: [{ product_id: PID_A.toUpperCase(), quantity: 1 }],
    }))
    expect(c.restaurant_id).toBe(RID_A.toLowerCase())
    expect(c.branch_id).toBe(BID_A.toLowerCase())
    expect(c.items[0].product_id).toBe(PID_A.toLowerCase())
  })
})

describe('CANON-002: type — لا تطبيع صامت لقيمة غير معروفة', () => {
  it('يقبل بالضبط dine_in/takeaway/delivery', () => {
    for (const t of ['dine_in', 'takeaway', 'delivery']) {
      expect(() => canonicalizeCheckout(baseInput({ type: t }))).not.toThrow()
    }
  })
  it('يرفض قيمة غير معروفة بفشل حتمي صريح (لا تطبيع)', () => {
    expect(() => canonicalizeCheckout(baseInput({ type: 'Dine_In' }))).toThrow(TypeError)
    expect(() => canonicalizeCheckout(baseInput({ type: 'pickup' }))).toThrow(TypeError)
  })
})

describe('CANON-003: quantity — عدد صحيح فقط، ضمن 1-99 (نفس نطاق create_order)', () => {
  it('يقبل 1 و99', () => {
    expect(() => canonicalizeCheckout(baseInput({ items: [{ product_id: PID_A, quantity: 1 }] }))).not.toThrow()
    expect(() => canonicalizeCheckout(baseInput({ items: [{ product_id: PID_A, quantity: 99 }] }))).not.toThrow()
  })
  it('يرفض 0 و100 (خارج النطاق الحالي لـcreate_order)', () => {
    expect(() => canonicalizeCheckout(baseInput({ items: [{ product_id: PID_A, quantity: 0 }] }))).toThrow(TypeError)
    expect(() => canonicalizeCheckout(baseInput({ items: [{ product_id: PID_A, quantity: 100 }] }))).toThrow(TypeError)
  })
})

describe('CANON-004: options → optionsKey مُرتَّبة أبجدياً (نمط useCart.js)', () => {
  it('groupName:choiceName مُرتَّبة ومفصولة بـ|', () => {
    const c = canonicalizeCheckout(baseInput({
      items: [{
        product_id: PID_A, quantity: 1,
        options: [{ groupName: 'Size', choiceName: 'Large' }, { groupName: 'Ice', choiceName: 'Less' }],
      }],
    }))
    expect(c.items[0].optionsKey).toBe('Ice:Less|Size:Large')
  })
})

describe('CANON-005: coupon — نفس تطبيع create_order (upper/trim)، فارغ يصبح null', () => {
  it('يقص المسافات ويكبّر الأحرف', () => {
    const c = canonicalizeCheckout(baseInput({ coupon_code: '  save10  ' }))
    expect(c.coupon_code).toBe('SAVE10')
  })
  it('نص فارغ/مسافات فقط يصبح null', () => {
    expect(canonicalizeCheckout(baseInput({ coupon_code: '   ' })).coupon_code).toBeNull()
    expect(canonicalizeCheckout(baseInput({ coupon_code: '' })).coupon_code).toBeNull()
  })
  it('null/undefined يبقى null', () => {
    expect(canonicalizeCheckout(baseInput({ coupon_code: null })).coupon_code).toBeNull()
    expect(canonicalizeCheckout(baseInput({ coupon_code: undefined })).coupon_code).toBeNull()
  })
})

// ══════════════════════════════════════════════════════════════════
// VALID-001..014: فشل حتمي صريح لكل مُدخل غير سليم (لا إصلاح صامت)
// ══════════════════════════════════════════════════════════════════

describe('VALID: مُدخلات غير سليمة يجب أن تفشل صراحةً', () => {
  it('VALID-001: restaurant_id مفقود', () => {
    expect(() => canonicalizeCheckout(baseInput({ restaurant_id: undefined }))).toThrow(TypeError)
  })
  it('VALID-002: branch_id مفقود', () => {
    expect(() => canonicalizeCheckout(baseInput({ branch_id: undefined }))).toThrow(TypeError)
  })
  it('VALID-003: UUID غير صالح', () => {
    expect(() => canonicalizeCheckout(baseInput({ restaurant_id: 'not-a-uuid' }))).toThrow(TypeError)
  })
  it('VALID-004: type مفقود', () => {
    expect(() => canonicalizeCheckout(baseInput({ type: undefined }))).toThrow(TypeError)
  })
  it('VALID-005: type غير صالح', () => {
    expect(() => canonicalizeCheckout(baseInput({ type: 'invalid_type' }))).toThrow(TypeError)
  })
  it('VALID-006: items مفقودة', () => {
    expect(() => canonicalizeCheckout(baseInput({ items: undefined }))).toThrow(TypeError)
  })
  it('VALID-006b: items مصفوفة فارغة', () => {
    expect(() => canonicalizeCheckout(baseInput({ items: [] }))).toThrow(TypeError)
  })
  it('VALID-007: product_id غير صالح', () => {
    expect(() => canonicalizeCheckout(baseInput({ items: [{ product_id: 'nope', quantity: 1 }] }))).toThrow(TypeError)
  })
  it('VALID-008: quantity غير صالحة (0)', () => {
    expect(() => canonicalizeCheckout(baseInput({ items: [{ product_id: PID_A, quantity: 0 }] }))).toThrow(TypeError)
  })
  it('VALID-009: quantity كنص', () => {
    expect(() => canonicalizeCheckout(baseInput({ items: [{ product_id: PID_A, quantity: '2' }] }))).toThrow(TypeError)
  })
  it('VALID-010: quantity كسرية (decimal)', () => {
    expect(() => canonicalizeCheckout(baseInput({ items: [{ product_id: PID_A, quantity: 2.5 }] }))).toThrow(TypeError)
  })
  it('VALID-010b: quantity كـNaN/Infinity/null', () => {
    expect(() => canonicalizeCheckout(baseInput({ items: [{ product_id: PID_A, quantity: NaN }] }))).toThrow(TypeError)
    expect(() => canonicalizeCheckout(baseInput({ items: [{ product_id: PID_A, quantity: Infinity }] }))).toThrow(TypeError)
    expect(() => canonicalizeCheckout(baseInput({ items: [{ product_id: PID_A, quantity: null }] }))).toThrow(TypeError)
  })
  it('VALID-011: options مشوَّهة (ليست مصفوفة)', () => {
    expect(() => canonicalizeCheckout(baseInput({
      items: [{ product_id: PID_A, quantity: 1, options: 'not-an-array' }],
    }))).toThrow(TypeError)
  })
  it('VALID-012: groupName مفقود', () => {
    expect(() => canonicalizeCheckout(baseInput({
      items: [{ product_id: PID_A, quantity: 1, options: [{ choiceName: 'Large' }] }],
    }))).toThrow(TypeError)
  })
  it('VALID-013: choiceName مفقود', () => {
    expect(() => canonicalizeCheckout(baseInput({
      items: [{ product_id: PID_A, quantity: 1, options: [{ groupName: 'Size' }] }],
    }))).toThrow(TypeError)
  })
  it('VALID-014: coupon_code من نوع غير صالح (رقم بدل نص)', () => {
    expect(() => canonicalizeCheckout(baseInput({ coupon_code: 12345 }))).toThrow(TypeError)
  })
})

// ══════════════════════════════════════════════════════════════════
// EQUIV-001..018: تكافؤ/اختلاف البصمة (fingerprint) — الاختبارات الـ18 المطلوبة صراحةً
// ══════════════════════════════════════════════════════════════════

describe('EQUIV: تكافؤ واختلاف البصمة', () => {
  it('EQUIV-01: نفس السلة → نفس البصمة', async () => {
    const f1 = await computeCheckoutFingerprint(baseInput())
    const f2 = await computeCheckoutFingerprint(baseInput())
    expect(f1).toBe(f2)
  })

  it('EQUIV-02: ترتيب المنتجات [A,B] مقابل [B,A] → نفس البصمة', async () => {
    const cartAB = baseInput({ items: [{ product_id: PID_A, quantity: 1 }, { product_id: PID_B, quantity: 2 }] })
    const cartBA = baseInput({ items: [{ product_id: PID_B, quantity: 2 }, { product_id: PID_A, quantity: 1 }] })
    expect(await computeCheckoutFingerprint(cartAB)).toBe(await computeCheckoutFingerprint(cartBA))
  })

  it('EQUIV-03: ترتيب الخيارات → نفس البصمة', async () => {
    const cart1 = baseInput({
      items: [{ product_id: PID_A, quantity: 1, options: [{ groupName: 'Size', choiceName: 'Large' }, { groupName: 'Ice', choiceName: 'Less' }] }],
    })
    const cart2 = baseInput({
      items: [{ product_id: PID_A, quantity: 1, options: [{ groupName: 'Ice', choiceName: 'Less' }, { groupName: 'Size', choiceName: 'Large' }] }],
    })
    expect(await computeCheckoutFingerprint(cart1)).toBe(await computeCheckoutFingerprint(cart2))
  })

  it('EQUIV-04: تغيّر حالة الأحرف في UUID → نفس البصمة', async () => {
    const lower = baseInput()
    const upper = baseInput({
      restaurant_id: RID_A.toUpperCase(),
      branch_id: BID_A.toUpperCase(),
      items: [{ product_id: PID_A.toUpperCase(), quantity: 1 }],
    })
    expect(await computeCheckoutFingerprint(lower)).toBe(await computeCheckoutFingerprint(upper))
  })

  it('EQUIV-05: حالة أحرف/مسافات الكوبون مُطبَّعة → نفس البصمة', async () => {
    const a = baseInput({ coupon_code: 'save10' })
    const b = baseInput({ coupon_code: '  SAVE10  ' })
    expect(await computeCheckoutFingerprint(a)).toBe(await computeCheckoutFingerprint(b))
  })

  it('EQUIV-06: منتج مختلف → بصمة مختلفة', async () => {
    const a = baseInput({ items: [{ product_id: PID_A, quantity: 1 }] })
    const b = baseInput({ items: [{ product_id: PID_B, quantity: 1 }] })
    expect(await computeCheckoutFingerprint(a)).not.toBe(await computeCheckoutFingerprint(b))
  })

  it('EQUIV-07: كمية مختلفة → بصمة مختلفة', async () => {
    const a = baseInput({ items: [{ product_id: PID_A, quantity: 1 }] })
    const b = baseInput({ items: [{ product_id: PID_A, quantity: 2 }] })
    expect(await computeCheckoutFingerprint(a)).not.toBe(await computeCheckoutFingerprint(b))
  })

  it('EQUIV-08: خيار مختلف → بصمة مختلفة', async () => {
    const a = baseInput({ items: [{ product_id: PID_A, quantity: 1, options: [{ groupName: 'Size', choiceName: 'Large' }] }] })
    const b = baseInput({ items: [{ product_id: PID_A, quantity: 1, options: [{ groupName: 'Size', choiceName: 'Small' }] }] })
    expect(await computeCheckoutFingerprint(a)).not.toBe(await computeCheckoutFingerprint(b))
  })

  it('EQUIV-09: كوبون مختلف → بصمة مختلفة', async () => {
    const a = baseInput({ coupon_code: 'SAVE10' })
    const b = baseInput({ coupon_code: 'SAVE20' })
    const c = baseInput({ coupon_code: null })
    expect(await computeCheckoutFingerprint(a)).not.toBe(await computeCheckoutFingerprint(b))
    expect(await computeCheckoutFingerprint(a)).not.toBe(await computeCheckoutFingerprint(c))
  })

  it('EQUIV-10: مطعم مختلف → بصمة مختلفة', async () => {
    const a = baseInput({ restaurant_id: RID_A })
    const b = baseInput({ restaurant_id: RID_B })
    expect(await computeCheckoutFingerprint(a)).not.toBe(await computeCheckoutFingerprint(b))
  })

  it('EQUIV-11: فرع مختلف → بصمة مختلفة', async () => {
    const a = baseInput({ branch_id: BID_A })
    const b = baseInput({ branch_id: BID_B })
    expect(await computeCheckoutFingerprint(a)).not.toBe(await computeCheckoutFingerprint(b))
  })

  it('EQUIV-12: نوع طلب مختلف → بصمة مختلفة', async () => {
    const a = baseInput({ type: 'dine_in' })
    const b = baseInput({ type: 'delivery' })
    expect(await computeCheckoutFingerprint(a)).not.toBe(await computeCheckoutFingerprint(b))
  })

  it('EQUIV-13: أسطر منتج مكرَّرة تبقى مُمثَّلة على حدة (لا دمج)', async () => {
    const duplicated = baseInput({ items: [{ product_id: PID_A, quantity: 1 }, { product_id: PID_A, quantity: 1 }] })
    const merged = baseInput({ items: [{ product_id: PID_A, quantity: 2 }] })
    const c1 = canonicalizeCheckout(duplicated)
    const c2 = canonicalizeCheckout(merged)
    expect(c1.items).toHaveLength(2) // لم يُدمَج السطران
    expect(c2.items).toHaveLength(1)
    // وبالتبعية، البصمتان مختلفتان (تمثيلان مختلفان رغم تساوي الكمية الإجمالية)
    expect(await computeCheckoutFingerprint(duplicated)).not.toBe(await computeCheckoutFingerprint(merged))
  })

  it('EQUIV-14: تغيّر notes → نفس البصمة (notes خارج نطاق البصمة عمداً)', async () => {
    const a = baseInput({ items: [{ product_id: PID_A, quantity: 1, notes: 'بدون بصل' }] })
    const b = baseInput({ items: [{ product_id: PID_A, quantity: 1, notes: 'إضافي جبنة' }] })
    expect(await computeCheckoutFingerprint(a)).toBe(await computeCheckoutFingerprint(b))
  })

  it('EQUIV-15: تغيّر اسم العميل → نفس البصمة', async () => {
    const a = { ...baseInput(), customer_name: 'أحمد' }
    const b = { ...baseInput(), customer_name: 'سالم' }
    expect(await computeCheckoutFingerprint(a)).toBe(await computeCheckoutFingerprint(b))
  })

  it('EQUIV-16: تغيّر عنوان التوصيل → نفس البصمة', async () => {
    const a = { ...baseInput(), delivery_address: 'شارع 1' }
    const b = { ...baseInput(), delivery_address: 'شارع 2' }
    expect(await computeCheckoutFingerprint(a)).toBe(await computeCheckoutFingerprint(b))
  })

  it('EQUIV-17: تغيّر p_client_total → نفس البصمة', async () => {
    const a = { ...baseInput(), p_client_total: 50 }
    const b = { ...baseInput(), p_client_total: 999 }
    expect(await computeCheckoutFingerprint(a)).toBe(await computeCheckoutFingerprint(b))
  })

  it('EQUIV-18: تغيّر الإجمالي المحسوب خادمياً (total) → نفس البصمة', async () => {
    const a = { ...baseInput(), total: 50, subtotal: 43.48, tax: 6.52, delivery_fee: 0, currency: 'SAR' }
    const b = { ...baseInput(), total: 999, subtotal: 869.57, tax: 130.43, delivery_fee: 0, currency: 'SAR' }
    expect(await computeCheckoutFingerprint(a)).toBe(await computeCheckoutFingerprint(b))
    // يثبت أن البصمة تمثّل هوية السلة/الدفع، لا السعر ولا بيانات العميل — بالضبط ما يطلبه التدقيق
  })
})

// ══════════════════════════════════════════════════════════════════
// DETERM-001: حتمية كاملة — بلا عشوائية، بلا طابع زمني
// ══════════════════════════════════════════════════════════════════

describe('DETERM-001: نفس المُدخل الأساسي مكرَّراً 100 مرة → 100 بصمة متطابقة', () => {
  it('لا عشوائية، لا معرّف مُولَّد، لا اعتماد على البيئة', async () => {
    const input = baseInput({
      items: [
        { product_id: PID_A, quantity: 3, options: [{ groupName: 'Size', choiceName: 'Large' }] },
        { product_id: PID_B, quantity: 1 },
      ],
      coupon_code: 'save10',
    })
    const fingerprints = await Promise.all(Array.from({ length: 100 }, () => computeCheckoutFingerprint(input)))
    const unique = new Set(fingerprints)
    expect(unique.size).toBe(1)
    expect(fingerprints[0]).toMatch(/^[0-9a-f]{64}$/) // SHA-256 hex صغير الحروف، 64 حرفاً
  })
})

// ══════════════════════════════════════════════════════════════════
// PURITY-001: لا اعتماد على مصادر خارجية (فحص ثابت — لا شبكة/قاعدة بيانات في الوحدة)
// ══════════════════════════════════════════════════════════════════

describe('PURITY-001: الوحدة نقيّة بالكامل', () => {
  it('canonicalizeCheckout متزامنة (Sync) — لا وعد (Promise)، بلا انتظار I/O', () => {
    const result = canonicalizeCheckout(baseInput())
    expect(result).not.toBeInstanceOf(Promise)
  })
  it('لا استيراد لأي عميل Supabase أو مزوّد دفع داخل هذا الملف', async () => {
    const src = await import('node:fs').then((fs) => fs.readFileSync(new URL('../../src/payments/checkoutBinding.js', import.meta.url), 'utf8'))
    expect(src).not.toMatch(/supabase|moyasar|fetch\(|XMLHttpRequest/i)
  })
  it('لا Date.now() داخل الملف (quoted_at مُدخَل صريح من المستدعي — Option A)', async () => {
    const src = await import('node:fs').then((fs) => fs.readFileSync(new URL('../../src/payments/checkoutBinding.js', import.meta.url), 'utf8'))
    expect(src).not.toMatch(/Date\.now\(\)/)
  })
})

// ══════════════════════════════════════════════════════════════════
// TASK-PAY-3.6A-1b.2 — buildCheckoutSnapshot
// ══════════════════════════════════════════════════════════════════

const QUOTED_AT = '2026-08-26T12:00:00.000Z'
const QUOTED_AT_2 = '2026-08-26T12:05:00.000Z'
const CURRENCY = 'SAR'

function validCheckoutInput(overrides = {}) {
  return {
    restaurant_id: RID_A,
    branch_id: BID_A,
    type: 'dine_in',
    items: [{ product_id: PID_A, quantity: 2, options: [{ groupName: 'Size', choiceName: 'Large' }], notes: 'بدون بصل' }],
    coupon_code: 'SAVE10',
    ...overrides,
  }
}

function validDryRunResult(overrides = {}) {
  return {
    id: null,
    order_number: null,
    access_token: null,
    subtotal: 17.39,
    tax: 2.61,
    delivery_fee: 0,
    total: 20.0,
    price_changed: false,
    price_changes: [],
    ...overrides,
  }
}

function buildParams(overrides = {}) {
  return {
    checkoutInput: validCheckoutInput(),
    dryRunResult: validDryRunResult(),
    currency: CURRENCY,
    quotedAt: QUOTED_AT,
    ...overrides,
  }
}

describe('SNAP-01: مُدخل صالح + نتيجة dry-run صالحة → لقطة صالحة', () => {
  it('يبني لقطة تحتوي كل الحقول المطلوبة', async () => {
    const snap = await buildCheckoutSnapshot(buildParams())
    expect(snap).toMatchObject({
      restaurant_id: RID_A,
      branch_id: BID_A,
      type: 'dine_in',
      coupon_code: 'SAVE10',
      subtotal: 17.39,
      tax: 2.61,
      delivery_fee: 0,
      total: 20.0,
      currency: 'SAR',
      quoted_at: QUOTED_AT,
    })
    expect(snap.items).toEqual([{ product_id: PID_A, quantity: 2, options: [{ groupName: 'Size', choiceName: 'Large' }] }])
    expect(typeof snap.fingerprint).toBe('string')
    expect(snap.fingerprint).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('SNAP-02: بصمة اللقطة تطابق computeCheckoutFingerprint(checkoutInput)', () => {
  it('نفس القيمة تماماً', async () => {
    const params = buildParams()
    const snap = await buildCheckoutSnapshot(params)
    const direct = await computeCheckoutFingerprint(params.checkoutInput)
    expect(snap.fingerprint).toBe(direct)
  })
})

describe('SNAP-03..06: subtotal/tax/delivery_fee/total تُنسَخ حرفياً من dry-run دون أي حساب', () => {
  it('SNAP-03: subtotal مطابق تماماً', async () => {
    const snap = await buildCheckoutSnapshot(buildParams({ dryRunResult: validDryRunResult({ subtotal: 43.48 }) }))
    expect(snap.subtotal).toBe(43.48)
  })
  it('SNAP-04: tax مطابق تماماً', async () => {
    const snap = await buildCheckoutSnapshot(buildParams({ dryRunResult: validDryRunResult({ tax: 6.52 }) }))
    expect(snap.tax).toBe(6.52)
  })
  it('SNAP-05: delivery_fee مطابق تماماً', async () => {
    const snap = await buildCheckoutSnapshot(buildParams({ dryRunResult: validDryRunResult({ delivery_fee: 15 }) }))
    expect(snap.delivery_fee).toBe(15)
  })
  it('SNAP-06: total مطابق تماماً', async () => {
    const snap = await buildCheckoutSnapshot(buildParams({ dryRunResult: validDryRunResult({ total: 999.99 }) }))
    expect(snap.total).toBe(999.99)
  })
  it('SNAP-06b: يقبل قيماً رقمية كنصوص (نمط PostgREST/create_order القائم) وينسخها حرفياً بلا تحويل', async () => {
    const snap = await buildCheckoutSnapshot(buildParams({
      dryRunResult: validDryRunResult({ subtotal: '17.39', tax: '2.61', delivery_fee: '0', total: '20.00' }),
    }))
    // نسخ حرفي — القيمة النصية تبقى نصية، لا يُحوَّلها الباني إلى رقم JS
    expect(snap.subtotal).toBe('17.39')
    expect(snap.total).toBe('20.00')
  })
})

describe('SNAP-07: الباني لا يعيد حساب الإجماليات إطلاقاً — حتى لو كانت غير متسقة حسابياً', () => {
  it('subtotal + tax + delivery_fee ≠ total عمداً — يُنسَخ كما هو دون تصحيح', async () => {
    // subtotal(10) + tax(1) + delivery_fee(1) = 12، لكن total المُرسَل = 999 — الباني لا يتحقق من
    // الاتساق الحسابي ولا يُعيد احتسابه؛ ينسخ فقط. (سلامة الاتساق هذه مسؤولية create_order الخادمي.)
    const snap = await buildCheckoutSnapshot(buildParams({
      dryRunResult: validDryRunResult({ subtotal: 10, tax: 1, delivery_fee: 1, total: 999 }),
    }))
    expect(snap.total).toBe(999) // ليس 12 — إثبات مباشر أنه لا يُعاد حسابه
  })
})

describe('SNAP-08..12: نتيجة dry-run ناقصة/غير صالحة → رفض', () => {
  it('SNAP-08: subtotal مفقود', async () => {
    const dr = validDryRunResult(); delete dr.subtotal
    await expect(buildCheckoutSnapshot(buildParams({ dryRunResult: dr }))).rejects.toThrow(TypeError)
  })
  it('SNAP-09: tax مفقود', async () => {
    const dr = validDryRunResult(); delete dr.tax
    await expect(buildCheckoutSnapshot(buildParams({ dryRunResult: dr }))).rejects.toThrow(TypeError)
  })
  it('SNAP-10: delivery_fee مفقود', async () => {
    const dr = validDryRunResult(); delete dr.delivery_fee
    await expect(buildCheckoutSnapshot(buildParams({ dryRunResult: dr }))).rejects.toThrow(TypeError)
  })
  it('SNAP-11: total مفقود', async () => {
    const dr = validDryRunResult(); delete dr.total
    await expect(buildCheckoutSnapshot(buildParams({ dryRunResult: dr }))).rejects.toThrow(TypeError)
  })
  it('SNAP-12: قيمة رقمية غير صالحة (نص غير رقمي / NaN / Infinity)', async () => {
    await expect(buildCheckoutSnapshot(buildParams({ dryRunResult: validDryRunResult({ total: 'abc' }) }))).rejects.toThrow(TypeError)
    await expect(buildCheckoutSnapshot(buildParams({ dryRunResult: validDryRunResult({ total: NaN }) }))).rejects.toThrow(TypeError)
    await expect(buildCheckoutSnapshot(buildParams({ dryRunResult: validDryRunResult({ total: Infinity }) }))).rejects.toThrow(TypeError)
  })
})

describe('SNAP-13..17: checkoutInput غير سليم → رفض متّسق مع أداة التطبيع (لا يُعاد تنفيذ التحقق)', () => {
  it('SNAP-13: restaurant_id مفقود', async () => {
    await expect(buildCheckoutSnapshot(buildParams({ checkoutInput: validCheckoutInput({ restaurant_id: undefined }) }))).rejects.toThrow(TypeError)
  })
  it('SNAP-14: branch_id مفقود', async () => {
    await expect(buildCheckoutSnapshot(buildParams({ checkoutInput: validCheckoutInput({ branch_id: undefined }) }))).rejects.toThrow(TypeError)
  })
  it('SNAP-15: type مفقود', async () => {
    await expect(buildCheckoutSnapshot(buildParams({ checkoutInput: validCheckoutInput({ type: undefined }) }))).rejects.toThrow(TypeError)
  })
  it('SNAP-16: items مفقودة', async () => {
    await expect(buildCheckoutSnapshot(buildParams({ checkoutInput: validCheckoutInput({ items: undefined }) }))).rejects.toThrow(TypeError)
  })
  it('SNAP-17: كوبون من نوع غير صالح — نفس رسالة/سلوك canonicalizeCheckout تماماً', async () => {
    let fromBuilder, fromCanon
    try { await buildCheckoutSnapshot(buildParams({ checkoutInput: validCheckoutInput({ coupon_code: 12345 }) })) } catch (e) { fromBuilder = e.message }
    try { canonicalizeCheckout(validCheckoutInput({ coupon_code: 12345 })) } catch (e) { fromCanon = e.message }
    expect(fromBuilder).toBe(fromCanon)
  })
})

describe('SNAP-18: حقول PII مُستبعَدة (لا تُقرأ ولا تظهر في اللقطة)', () => {
  it('customer_name/customer_phone/delivery_address/table_number لا تظهر حتى لو أُرسِلت', async () => {
    const snap = await buildCheckoutSnapshot(buildParams({
      checkoutInput: {
        ...validCheckoutInput(),
        customer_name: 'أحمد',
        customer_phone: '512345678',
        delivery_address: 'شارع الملك',
        table_number: 'T5',
      },
    }))
    const json = JSON.stringify(snap)
    expect(json).not.toMatch(/أحمد|512345678|شارع الملك|T5/)
    expect(snap.customer_name).toBeUndefined()
    expect(snap.customer_phone).toBeUndefined()
    expect(snap.delivery_address).toBeUndefined()
    expect(snap.table_number).toBeUndefined()
  })
  it('notes غير مُدرَجة في اللقطة (غير ضرورية لإعادة بناء create_order، ونص حر قد يحمل PII عرضية)', async () => {
    const snap = await buildCheckoutSnapshot(buildParams())
    expect(JSON.stringify(snap)).not.toMatch(/بدون بصل/)
    expect(snap.items[0].notes).toBeUndefined()
  })
})

describe('SNAP-19: p_client_total مُستبعَد', () => {
  it('لا يظهر في اللقطة حتى لو أُرسِل ضمن checkoutInput', async () => {
    const snap = await buildCheckoutSnapshot(buildParams({
      checkoutInput: { ...validCheckoutInput(), p_client_total: 12345 },
    }))
    expect(snap.p_client_total).toBeUndefined()
    expect(JSON.stringify(snap)).not.toMatch(/12345/)
  })
})

describe('SNAP-20: العملة لا يمكن أن تُشتقّ من مُدخل العميل', () => {
  it('currency في checkoutInput/dryRunResult (إن وُجدت خطأً) لا تُستخدَم — القيمة الوحيدة المعتمدة هي مُعامل currency الصريح', async () => {
    const snap = await buildCheckoutSnapshot(buildParams({
      checkoutInput: { ...validCheckoutInput(), currency: 'USD' }, // لو تسرّبت من العميل خطأً
      dryRunResult: { ...validDryRunResult(), currency: 'EGP' }, // dry-run الحالي لا يُرجعها أصلاً، لكن حتى لو فعل
      currency: 'SAR',
    }))
    expect(snap.currency).toBe('SAR')
  })
  it('currency غائبة أو غير نصية من طبقة التنسيق → رفض (لا افتراض صامت)', async () => {
    await expect(buildCheckoutSnapshot(buildParams({ currency: undefined }))).rejects.toThrow(TypeError)
    await expect(buildCheckoutSnapshot(buildParams({ currency: '' }))).rejects.toThrow(TypeError)
    await expect(buildCheckoutSnapshot(buildParams({ currency: 123 }))).rejects.toThrow(TypeError)
  })
})

describe('SNAP-21: quoted_at مُدخَل صريح إلزامي (لا Date.now() داخلي)', () => {
  it('يُقبَل عند تمريره صراحةً', async () => {
    const snap = await buildCheckoutSnapshot(buildParams({ quotedAt: QUOTED_AT }))
    expect(snap.quoted_at).toBe(QUOTED_AT)
  })
  it('غيابه → رفض (لا قيمة افتراضية مُختلَقة داخلياً)', async () => {
    await expect(buildCheckoutSnapshot(buildParams({ quotedAt: undefined }))).rejects.toThrow(TypeError)
  })
})

describe('SNAP-22: quoted_at غير صالح → رفض', () => {
  it('نص غير قابل للتحليل كتاريخ', async () => {
    await expect(buildCheckoutSnapshot(buildParams({ quotedAt: 'not-a-date' }))).rejects.toThrow(TypeError)
  })
  it('كائن Date بدل نص ISO', async () => {
    await expect(buildCheckoutSnapshot(buildParams({ quotedAt: new Date() }))).rejects.toThrow(TypeError)
  })
  it('نص تاريخ صالح لكن ليس بصيغة ISO الدقيقة المطابقة لـtoISOString()', async () => {
    await expect(buildCheckoutSnapshot(buildParams({ quotedAt: '2026-08-26' }))).rejects.toThrow(TypeError)
  })
})

describe('SNAP-23: عدم التحوّر (Immutability) — المُدخلات تبقى دون تغيير', () => {
  it('checkoutInput و dryRunResult (بما فيها المصفوفات المتداخلة) لا تتغيّر بعد الاستدعاء', async () => {
    const checkoutInput = validCheckoutInput()
    const dryRunResult = validDryRunResult()
    const checkoutBefore = JSON.parse(JSON.stringify(checkoutInput))
    const dryRunBefore = JSON.parse(JSON.stringify(dryRunResult))

    await buildCheckoutSnapshot({ checkoutInput, dryRunResult, currency: CURRENCY, quotedAt: QUOTED_AT })

    expect(checkoutInput).toEqual(checkoutBefore)
    expect(dryRunResult).toEqual(dryRunBefore)
    // نفس مرجع مصفوفة options الأصلية لم يُعدَّل داخل مكانه (in-place)
    expect(checkoutInput.items[0].options).toEqual(checkoutBefore.items[0].options)
  })

  it('اللقطة المُعادة كائن جديد مستقل — تعديلها لا يمسّ checkoutInput الأصلي', async () => {
    const checkoutInput = validCheckoutInput()
    const snap = await buildCheckoutSnapshot({ checkoutInput, dryRunResult: validDryRunResult(), currency: CURRENCY, quotedAt: QUOTED_AT })
    snap.items[0].quantity = 999
    snap.items.push({ product_id: PID_B, quantity: 1, options: [] })
    expect(checkoutInput.items[0].quantity).toBe(2)
    expect(checkoutInput.items).toHaveLength(1)
  })
})

describe('SNAP-24: نفس المُدخل + نفس quoted_at → لقطة مطابقة تماماً', () => {
  it('لقطتان مبنيتان من مُدخلات مطابقة متطابقتان حقلاً بحقل', async () => {
    const s1 = await buildCheckoutSnapshot(buildParams())
    const s2 = await buildCheckoutSnapshot(buildParams())
    expect(s1).toEqual(s2)
  })
})

describe('SNAP-25: نفس السلة بـquoted_at مختلف → يتغيّر quoted_at فقط', () => {
  it('كل الحقول الأخرى (بما فيها fingerprint) تبقى متطابقة', async () => {
    const s1 = await buildCheckoutSnapshot(buildParams({ quotedAt: QUOTED_AT }))
    const s2 = await buildCheckoutSnapshot(buildParams({ quotedAt: QUOTED_AT_2 }))
    expect(s1.quoted_at).toBe(QUOTED_AT)
    expect(s2.quoted_at).toBe(QUOTED_AT_2)
    expect(s1.quoted_at).not.toBe(s2.quoted_at)
    const { quoted_at: q1, ...rest1 } = s1
    const { quoted_at: q2, ...rest2 } = s2
    expect(rest1).toEqual(rest2)
  })
})
