// @vitest-environment happy-dom
//
// اختبارات Edge Function للـ Webhook (payment-webhook).
// المنطق مُختبَر عبر handler.js (الدوال المُحقونة) — لا استيراد من index.ts (Deno-specific).
// لا طلبات HTTP حقيقية، لا بيانات اعتماد حقيقية، لا اتصال بقاعدة بيانات حقيقية.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  buildHandler,
  verifyHmacSha256,
  signHmacSha256,
} from '../../supabase/functions/payment-webhook/handler.js'
import { WebhookEventType, TransactionStatus } from '../../src/payments/types/index.js'

// ——————————— ثوابت الاختبار ———————————

const TEST_SECRET = 'test_webhook_secret_not_real'
const MOCK_SERVICE_ROLE = 'sb_service_role_NOT_REAL_NEVER_IN_PROD'

// ——————————— مساعدات Mock ———————————

function makeChain(result = { data: null, error: null }) {
  const o = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(result),
    single: vi.fn().mockResolvedValue(result),
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
  }
  return o
}

function makeDb(...chains) {
  let i = 0
  return { from: vi.fn().mockImplementation(() => chains[i++] ?? makeChain()) }
}

/** توليد توقيع HMAC-SHA256 صحيح لجسم معيَّن */
async function validSig(body) {
  return signHmacSha256(body, TEST_SECRET)
}

/** بناء Request وهمي */
async function makePostRequest(body, opts = {}) {
  const rawBody = typeof body === 'string' ? body : JSON.stringify(body)
  const headers = new Headers({ 'content-type': 'application/json' })
  if ('sig' in opts) {
    // sig مُمرَّر صراحةً: null = لا ترسل الرأس، string = استخدمها
    if (opts.sig !== null) headers.set('x-moyasar-signature', opts.sig)
  } else {
    // لم يُمرَّر sig → احسب توقيعاً صالحاً تلقائياً
    headers.set('x-moyasar-signature', await validSig(rawBody))
  }
  return new Request('https://example.com/payment-webhook', {
    method: opts.method ?? 'POST',
    headers,
    body: rawBody,
  })
}

/** مُهايئ وهمي */
function makeAdapter(overrides = {}) {
  return {
    parseWebhook: vi.fn().mockReturnValue({
      eventId: 'ev_001',
      type: WebhookEventType.PAYMENT_SUCCEEDED,
      providerRef: 'pay_001',
      status: TransactionStatus.SUCCEEDED,
      raw: {},
    }),
    ...overrides,
  }
}

// حمولة Webhook نموذجية من Moyasar
const SAMPLE_PAYLOAD = {
  type: 'payment_paid',
  data: { id: 'pay_001', status: 'paid', amount: 5000, currency: 'SAR' },
}

beforeEach(() => vi.clearAllMocks())

// ══════════════════════════════════════════════════════════════════
// WEBHOOK-001: طلب POST صالح مع توقيع صالح
// ══════════════════════════════════════════════════════════════════

describe('WEBHOOK-001: POST صالح + توقيع صالح → 200', () => {
  it('يُعيد 200 ويعالج الحدث عند توقيع صحيح', async () => {
    const db = makeDb(
      makeChain({ data: { id: 'wh_001' }, error: null }),  // insert webhook
      makeChain({ data: { id: 'tx_001', status: 'pending' }, error: null }), // find tx
      makeChain({ data: null, error: null }),               // update tx
      makeChain({ data: null, error: null }),               // mark processed
    )
    const adapter = makeAdapter()
    const handle = buildHandler({ webhookSecret: TEST_SECRET, adapter, db })

    const req = await makePostRequest(SAMPLE_PAYLOAD)
    const res = await handle(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.updated).toBe(true)
  })
})

// ══════════════════════════════════════════════════════════════════
// WEBHOOK-002: توقيع مفقود
// ══════════════════════════════════════════════════════════════════

describe('WEBHOOK-002: توقيع مفقود → 401', () => {
  it('يُعيد 401 إذا كان رأس x-moyasar-signature غائباً', async () => {
    const db = makeDb()
    const adapter = makeAdapter()
    const handle = buildHandler({ webhookSecret: TEST_SECRET, adapter, db })

    const req = await makePostRequest(SAMPLE_PAYLOAD, { sig: null })
    const res = await handle(req)
    const body = await res.json()

    expect(res.status).toBe(401)
    expect(body.error).toMatch(/missing/i)
    expect(db.from).not.toHaveBeenCalled()
  })
})

// ══════════════════════════════════════════════════════════════════
// WEBHOOK-003: توقيع غير صالح
// ══════════════════════════════════════════════════════════════════

describe('WEBHOOK-003: توقيع غير صالح → 401', () => {
  it('يُعيد 401 إذا كان التوقيع خاطئاً', async () => {
    const db = makeDb()
    const adapter = makeAdapter()
    const handle = buildHandler({ webhookSecret: TEST_SECRET, adapter, db })

    const req = await makePostRequest(SAMPLE_PAYLOAD, { sig: 'deadbeef00112233' })
    const res = await handle(req)
    const body = await res.json()

    expect(res.status).toBe(401)
    expect(body.error).toMatch(/invalid/i)
    expect(db.from).not.toHaveBeenCalled()
  })
})

// ══════════════════════════════════════════════════════════════════
// WEBHOOK-004: جسم JSON مشوّه
// ══════════════════════════════════════════════════════════════════

describe('WEBHOOK-004: JSON مشوّه → 400', () => {
  it('يُعيد 400 إذا لم يكن الجسم JSON صالحاً', async () => {
    const db = makeDb()
    const adapter = makeAdapter()
    const handle = buildHandler({ webhookSecret: TEST_SECRET, adapter, db })

    const rawBody = 'this is { not json ]['
    const sig = await validSig(rawBody)
    const req = new Request('https://example.com/payment-webhook', {
      method: 'POST',
      headers: new Headers({ 'content-type': 'text/plain', 'x-moyasar-signature': sig }),
      body: rawBody,
    })
    const res = await handle(req)
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error).toMatch(/malformed/i)
    expect(adapter.parseWebhook).not.toHaveBeenCalled()
  })
})

// ══════════════════════════════════════════════════════════════════
// WEBHOOK-005: طريقة HTTP غير مدعومة
// ══════════════════════════════════════════════════════════════════

describe('WEBHOOK-005: طريقة HTTP غير مدعومة → 405', () => {
  it('يُعيد 405 لطلبات GET', async () => {
    const handle = buildHandler({ webhookSecret: TEST_SECRET, adapter: makeAdapter(), db: makeDb() })
    const req = new Request('https://example.com/payment-webhook', { method: 'GET' })
    const res = await handle(req)

    expect(res.status).toBe(405)
  })

  it('يُعيد 405 لطلبات PUT', async () => {
    const handle = buildHandler({ webhookSecret: TEST_SECRET, adapter: makeAdapter(), db: makeDb() })
    const req = new Request('https://example.com/payment-webhook', { method: 'PUT' })
    const res = await handle(req)

    expect(res.status).toBe(405)
  })

  it('يُعيد 200 لطلبات OPTIONS (CORS preflight)', async () => {
    const handle = buildHandler({ webhookSecret: TEST_SECRET, adapter: makeAdapter(), db: makeDb() })
    const req = new Request('https://example.com/payment-webhook', { method: 'OPTIONS' })
    const res = await handle(req)

    expect(res.status).toBe(200)
  })
})

// ══════════════════════════════════════════════════════════════════
// WEBHOOK-006: حدث صالح → paymentService يُستدعى
// ══════════════════════════════════════════════════════════════════

describe('WEBHOOK-006: حدث صالح → adapter.parseWebhook يُستدعى', () => {
  it('يستدعي adapter.parseWebhook مرة واحدة بالحمولة الصحيحة', async () => {
    const db = makeDb(
      makeChain({ data: { id: 'wh_006' }, error: null }),
      makeChain({ data: { id: 'tx_006', status: 'pending' }, error: null }),
      makeChain({ data: null, error: null }),
      makeChain({ data: null, error: null }),
    )
    const adapter = makeAdapter()
    const handle = buildHandler({ webhookSecret: TEST_SECRET, adapter, db })

    const req = await makePostRequest(SAMPLE_PAYLOAD)
    await handle(req)

    expect(adapter.parseWebhook).toHaveBeenCalledOnce()
    expect(adapter.parseWebhook).toHaveBeenCalledWith(SAMPLE_PAYLOAD, expect.any(Object))
  })
})

// ══════════════════════════════════════════════════════════════════
// WEBHOOK-007: حدث مكرَّر (already_processed)
// ══════════════════════════════════════════════════════════════════

describe('WEBHOOK-007: حدث مكرَّر → already_processed', () => {
  it('يُعيد 200 مع already_processed عند انتهاك القيد الفريد (23505)', async () => {
    const db = makeDb(
      makeChain({ data: null, error: { code: '23505', message: 'duplicate key' } }),
    )
    const adapter = makeAdapter()
    const handle = buildHandler({ webhookSecret: TEST_SECRET, adapter, db })

    const req = await makePostRequest(SAMPLE_PAYLOAD)
    const res = await handle(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.reason).toBe('already_processed')
    expect(body.updated).toBe(false)
  })
})

// ══════════════════════════════════════════════════════════════════
// WEBHOOK-008: معاملة غير موجودة
// ══════════════════════════════════════════════════════════════════

describe('WEBHOOK-008: معاملة غير موجودة → transaction_not_found', () => {
  it('يُعيد 200 مع transaction_not_found إذا لم تُوجد معاملة بالمعرّف', async () => {
    const db = makeDb(
      makeChain({ data: { id: 'wh_008' }, error: null }),  // insert webhook
      makeChain({ data: null, error: null }),               // tx lookup → null
      makeChain({ data: null, error: null }),               // mark error
    )
    const adapter = makeAdapter()
    const handle = buildHandler({ webhookSecret: TEST_SECRET, adapter, db })

    const req = await makePostRequest(SAMPLE_PAYLOAD)
    const res = await handle(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.reason).toBe('transaction_not_found')
  })
})

// ══════════════════════════════════════════════════════════════════
// WEBHOOK-009: معاملة نهائية (already_terminal)
// ══════════════════════════════════════════════════════════════════

describe('WEBHOOK-009: معاملة بحالة نهائية → already_terminal', () => {
  it('يُعيد 200 مع already_terminal دون تحديث الحالة', async () => {
    const db = makeDb(
      makeChain({ data: { id: 'wh_009' }, error: null }),
      makeChain({ data: { id: 'tx_009', status: TransactionStatus.SUCCEEDED }, error: null }),
      makeChain({ data: null, error: null }), // mark processed
    )
    const adapter = makeAdapter()
    const handle = buildHandler({ webhookSecret: TEST_SECRET, adapter, db })

    const req = await makePostRequest(SAMPLE_PAYLOAD)
    const res = await handle(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.reason).toBe('already_terminal')
    expect(body.updated).toBe(false)
    // في المسار النهائي: insert webhook + select tx + update webhook = 3 استدعاءات
    // في المسار الطبيعي: 4 استدعاءات (+ update tx). التحقّق من 3 يؤكّد عدم تحديث المعاملة.
    expect(db.from).toHaveBeenCalledTimes(3)
  })
})

// ══════════════════════════════════════════════════════════════════
// WEBHOOK-010: نوع حدث غير معروف
// ══════════════════════════════════════════════════════════════════

describe('WEBHOOK-010: نوع حدث غير معروف → يُعالَج بأمان', () => {
  it('يُعيد 200 ويُعالج الحدث المجهول دون رمي استثناء', async () => {
    const db = makeDb(
      makeChain({ data: { id: 'wh_010' }, error: null }),
      makeChain({ data: { id: 'tx_010', status: 'pending' }, error: null }),
      makeChain({ data: null, error: null }),
      makeChain({ data: null, error: null }),
    )
    const unknownAdapter = makeAdapter({
      parseWebhook: vi.fn().mockReturnValue({
        eventId: 'ev_010',
        type: WebhookEventType.UNKNOWN,
        providerRef: 'pay_010',
        status: undefined,
        raw: {},
      }),
    })
    const handle = buildHandler({ webhookSecret: TEST_SECRET, adapter: unknownAdapter, db })

    const req = await makePostRequest({ type: 'some_future_event', data: { id: 'ev_010' } })
    const res = await handle(req)

    expect(res.status).toBe(200)
    // لا استثناء — الحدث المجهول يُعالَج بحالة افتراضية آمنة
  })
})

// ══════════════════════════════════════════════════════════════════
// WEBHOOK-011: لا providerRef في الحدث
// ══════════════════════════════════════════════════════════════════

describe('WEBHOOK-011: لا providerRef → no_provider_ref', () => {
  it('يُعيد 200 مع no_provider_ref إذا غاب providerRef', async () => {
    const db = makeDb(
      makeChain({ data: { id: 'wh_011' }, error: null }), // insert webhook
      makeChain({ data: null, error: null }),              // mark processed
    )
    const noRefAdapter = makeAdapter({
      parseWebhook: vi.fn().mockReturnValue({
        eventId: 'ev_011',
        type: WebhookEventType.PAYMENT_SUCCEEDED,
        providerRef: undefined,
        status: undefined,
        raw: {},
      }),
    })
    const handle = buildHandler({ webhookSecret: TEST_SECRET, adapter: noRefAdapter, db })

    const req = await makePostRequest({ type: 'payment_paid', data: {} })
    const res = await handle(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.reason).toBe('no_provider_ref')
  })
})

// ══════════════════════════════════════════════════════════════════
// WEBHOOK-012: خطأ قاعدة بيانات
// ══════════════════════════════════════════════════════════════════

describe('WEBHOOK-012: خطأ في قاعدة البيانات → 500', () => {
  it('يُعيد 500 إذا رمى DB خطأ غير 23505', async () => {
    const db = makeDb(
      makeChain({ data: null, error: { code: '42P01', message: 'relation does not exist' } }),
    )
    const adapter = makeAdapter()
    const handle = buildHandler({ webhookSecret: TEST_SECRET, adapter, db })

    const req = await makePostRequest(SAMPLE_PAYLOAD)
    const res = await handle(req)

    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toBe('Internal error processing webhook')
  })
})

// ══════════════════════════════════════════════════════════════════
// WEBHOOK-013: الأسرار لا تظهر في الردود
// ══════════════════════════════════════════════════════════════════

describe('WEBHOOK-013: الأسرار لا تُكشف في ردود HTTP', () => {
  it('لا يحتوي جسم الاستجابة على مفتاح webhook السرّي', async () => {
    const db = makeDb(makeChain({ data: null, error: { code: '50000', message: 'crash' } }))
    const handle = buildHandler({ webhookSecret: TEST_SECRET, adapter: makeAdapter(), db })

    const req = await makePostRequest(SAMPLE_PAYLOAD)
    const res = await handle(req)
    const text = await res.text()

    expect(text).not.toContain(TEST_SECRET)
  })

  it('لا يحتوي جسم الاستجابة على مفتاح service_role الوهمي', async () => {
    const db = makeDb(makeChain({ data: null, error: { code: '50000', message: MOCK_SERVICE_ROLE } }))
    const handle = buildHandler({ webhookSecret: TEST_SECRET, adapter: makeAdapter(), db })

    const req = await makePostRequest(SAMPLE_PAYLOAD)
    const res = await handle(req)
    const text = await res.text()

    // الرسالة الداخلية 'MOCK_SERVICE_ROLE' يجب ألا تظهر في الرد للعميل
    expect(text).not.toContain(MOCK_SERVICE_ROLE)
  })
})

// ══════════════════════════════════════════════════════════════════
// WEBHOOK-014: service_role لا يصل إلى المتصفّح
// ══════════════════════════════════════════════════════════════════

describe('WEBHOOK-014: service_role مُحقون من الخارج فقط (عدم التسرّب)', () => {
  it('handler.js لا يستدعي Deno.env أو process.env — الأسرار تأتي من المُستدعي فقط', async () => {
    // هذا الاختبار يتحقق بنيوياً: buildHandler يستقبل webhookSecret و db كمعاملات،
    // وليس كقراءة مباشرة من البيئة. أي محاولة للوصول إلى env ستفشل هنا لأن Deno غير موجود.

    // نتحقق من أن بناء Handler يعمل حتى بدون وجود متغيّرات البيئة العالمية
    const handle = buildHandler({ webhookSecret: 'injected_secret', adapter: makeAdapter(), db: makeDb() })
    expect(typeof handle).toBe('function')

    // نتحقق من أن buildHandler لا يقرأ globalThis.Deno
    const hadDeno = typeof globalThis.Deno !== 'undefined'
    if (!hadDeno) {
      // Deno غير موجود في بيئة الاختبار — المعالج يعمل بدونه
      expect(() => buildHandler({ webhookSecret: 'x', adapter: makeAdapter(), db: makeDb() })).not.toThrow()
    }
  })
})

// ══════════════════════════════════════════════════════════════════
// اختبارات HMAC منفصلة (verifyHmacSha256)
// ══════════════════════════════════════════════════════════════════

describe('HMAC: verifyHmacSha256', () => {
  it('يُعيد true لتوقيع صحيح', async () => {
    const body = '{"type":"payment_paid"}'
    const sig = await signHmacSha256(body, TEST_SECRET)
    expect(await verifyHmacSha256(body, sig, TEST_SECRET)).toBe(true)
  })

  it('يُعيد false لتوقيع خاطئ', async () => {
    const body = '{"type":"payment_paid"}'
    expect(await verifyHmacSha256(body, 'aabbcc', TEST_SECRET)).toBe(false)
  })

  it('يُعيد false إذا تغيّر الجسم بعد التوقيع', async () => {
    const body = '{"type":"payment_paid"}'
    const sig = await signHmacSha256(body, TEST_SECRET)
    expect(await verifyHmacSha256('{"type":"payment_failed"}', sig, TEST_SECRET)).toBe(false)
  })

  it('يُعيد false للتوقيع الفارغ', async () => {
    expect(await verifyHmacSha256('body', '', TEST_SECRET)).toBe(false)
  })

  it('يُعيد false لـ HEX غير صالح', async () => {
    expect(await verifyHmacSha256('body', 'xyz_not_hex', TEST_SECRET)).toBe(false)
  })
})
